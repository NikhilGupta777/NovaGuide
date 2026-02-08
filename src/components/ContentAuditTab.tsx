import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Search, Play, RefreshCw, CheckCircle2, AlertTriangle,
  Info, XCircle, Wrench
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";

type AuditRun = {
  id: string;
  status: string;
  total_articles_scanned: number;
  total_issues_found: number;
  auto_fixes_applied: number;
  duplicates_found: number;
  articles_set_to_draft: number;
  error_message: string | null;
  fix_all_status: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

type AuditFinding = {
  id: string;
  run_id: string;
  article_id: string | null;
  article_title: string | null;
  issue_type: string;
  severity: string;
  description: string;
  suggestion: string | null;
  auto_fixed: boolean;
  fix_applied: string | null;
  related_article_id: string | null;
  related_article_title: string | null;
  status: string;
  created_at: string;
};

const SEVERITY_STYLES: Record<string, { icon: typeof AlertTriangle; color: string; bg: string }> = {
  critical: { icon: XCircle, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950" },
  warning: { icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950" },
  info: { icon: Info, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950" },
};

const TYPE_LABELS: Record<string, string> = {
  duplicate: "Duplicate",
  grammar: "Grammar",
  wording: "Wording",
  seo: "SEO",
  factual: "Factual",
  quality: "Quality",
  formatting: "Formatting",
  auto_fix: "Auto-Fixed",
  auto_action: "Auto-Action",
  scan_complete: "Clean",
  scan_error: "Scan Error",
};

export default function ContentAuditTab() {
  const { toast } = useToast();
  const [runs, setRuns] = useState<AuditRun[]>([]);
  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [autoFix, setAutoFix] = useState(true);
  const [autoFixAll, setAutoFixAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [applyingFix, setApplyingFix] = useState<string | null>(null);
  const [fixingAll, setFixingAll] = useState(false);
  const [totalArticles, setTotalArticles] = useState(0);

  const fetchRuns = useCallback(async () => {
    const { data } = await supabase
      .from("content_audit_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) {
      setRuns(data as unknown as AuditRun[]);
      if (!selectedRunId && data.length > 0) {
        setSelectedRunId(data[0].id);
      }
    }
    setLoading(false);
  }, [selectedRunId]);

  const fetchFindings = useCallback(async (runId: string) => {
    const { data } = await supabase
      .from("content_audit_findings")
      .select("*")
      .eq("run_id", runId)
      .not("issue_type", "eq", "scan_complete")
      .order("severity", { ascending: true })
      .order("created_at", { ascending: false });
    if (data) setFindings(data as unknown as AuditFinding[]);
  }, []);

  const fetchTotalArticles = useCallback(async () => {
    const { count } = await supabase.from("articles").select("*", { count: "exact", head: true });
    if (count !== null) setTotalArticles(count);
  }, []);

  // Initial load
  useEffect(() => {
    const init = async () => {
      await fetchTotalArticles();
      await fetchRuns();
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedRunId) fetchFindings(selectedRunId);
  }, [selectedRunId, fetchFindings]);

  // ── Poll for active runs (scanning or fixing) ──────────────────
  useEffect(() => {
    const activeRun = runs.find(r =>
      r.status === "scanning" || r.status === "pending" ||
      r.fix_all_status === "fixing"
    );
    if (!activeRun) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("content_audit_runs")
        .select("*")
        .eq("id", activeRun.id)
        .single();

      if (data) {
        const updated = data as unknown as AuditRun;
        setRuns(prev => prev.map(r => r.id === updated.id ? updated : r));

        // Scan completed
        if (updated.status === "completed" && activeRun.status !== "completed") {
          toast({ title: "Content Audit Complete", description: `Scanned ${updated.total_articles_scanned} articles, found ${updated.total_issues_found} issues.` });
          if (selectedRunId === updated.id) fetchFindings(updated.id);

          // Auto fix-all after scan if enabled
          if (autoFixAll) {
            setFixingAll(true);
            supabase.functions.invoke("ai-content-audit", {
              body: { action: "fix_all", runId: updated.id },
            }).catch(err => console.error("Fix all trigger failed:", err));
          }
        }

        // Scan failed
        if (updated.status === "failed" && activeRun.status !== "failed") {
          toast({ title: "Audit Failed", description: updated.error_message || "Unknown error", variant: "destructive" });
        }

        // Fix all completed
        if (updated.fix_all_status === "fixed" && activeRun.fix_all_status !== "fixed") {
          toast({ title: "Fix All Complete", description: "All fixable issues have been processed." });
          setFixingAll(false);
          if (selectedRunId === updated.id) fetchFindings(updated.id);
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [runs, toast, selectedRunId, fetchFindings, autoFixAll]);

  // Detect if we should show fixing state on mount
  useEffect(() => {
    const fixingRun = runs.find(r => r.fix_all_status === "fixing");
    if (fixingRun) setFixingAll(true);
  }, [runs]);

  // ── Fire-and-forget: Start scan ────────────────────────────────
  const handleRunAudit = async () => {
    setTriggering(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-content-audit", {
        body: { autoFix },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const runId = data?.runId;
      if (runId) {
        setSelectedRunId(runId);
        toast({ title: "Audit Started", description: "Running in background — you can navigate away safely." });
      }
      await fetchRuns();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start audit";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setTriggering(false);
    }
  };

  // ── Fire-and-forget: Fix All ───────────────────────────────────
  const handleFixAll = async () => {
    if (!selectedRunId) return;
    const fixable = findings.filter(f => f.status !== "resolved" && f.article_id && f.suggestion);
    if (fixable.length === 0) {
      toast({ title: "Nothing to Fix", description: "No fixable findings found." });
      return;
    }
    setFixingAll(true);
    try {
      const { error } = await supabase.functions.invoke("ai-content-audit", {
        body: { action: "fix_all", runId: selectedRunId },
      });
      if (error) throw error;
      toast({ title: "Fix All Started", description: "Running in background — you can navigate away safely." });
      await fetchRuns();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Fix all failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
      setFixingAll(false);
    }
  };

  const handleApplyFix = async (findingId: string) => {
    setApplyingFix(findingId);
    try {
      const { data, error } = await supabase.functions.invoke("ai-content-audit", {
        body: { action: "apply_fix", findingId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Fix Applied", description: data.description || "Article updated successfully." });
      if (selectedRunId) fetchFindings(selectedRunId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to apply fix";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setApplyingFix(null);
    }
  };

  const isRunning = triggering || runs.some(r => r.status === "scanning" || r.status === "pending");
  const selectedRun = runs.find(r => r.id === selectedRunId);

  const filteredFindings = findings.filter(f => {
    if (filterType !== "all" && f.issue_type !== filterType) return false;
    if (filterSeverity !== "all" && f.severity !== filterSeverity) return false;
    return true;
  });

  const issueTypes = [...new Set(findings.map(f => f.issue_type))];
  const progressPercent = selectedRun && totalArticles > 0
    ? Math.round((selectedRun.total_articles_scanned / totalArticles) * 100)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Search className="h-5 w-5 text-emerald-500" />
          <h3 className="font-semibold text-foreground">AI Content Audit</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Scans all articles for duplicates, grammar issues, poor wording, SEO problems, and more. 
          Runs fully in the background — you can close the browser and come back later.
        </p>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
            <div>
              <p className="text-sm font-medium text-foreground">Auto-Fix Minor Issues</p>
              <p className="text-xs text-muted-foreground">Automatically fix grammar and wording issues during scan</p>
            </div>
            <Switch checked={autoFix} onCheckedChange={setAutoFix} disabled={isRunning} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
            <div>
              <p className="text-sm font-medium text-foreground">Fix All After Scan</p>
              <p className="text-xs text-muted-foreground">Automatically fix all remaining issues after audit completes</p>
            </div>
            <Switch checked={autoFixAll} onCheckedChange={setAutoFixAll} disabled={isRunning} />
          </div>

          <button
            onClick={handleRunAudit}
            disabled={triggering || isRunning || fixingAll}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {triggering ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : isRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Scanning in background...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run Content Audit
              </>
            )}
          </button>
        </div>
      </div>

      {/* Last Run Summary */}
      {selectedRun && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground text-sm">
              {selectedRun.status === "scanning" ? "Audit In Progress..." : 
               selectedRun.status === "completed" ? "Audit Results" : 
               "Audit " + selectedRun.status}
              {selectedRun.fix_all_status === "fixing" && " (Fixing All...)"}
            </h3>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                selectedRun.status === "completed" ? "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950" :
                selectedRun.status === "scanning" ? "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950" :
                selectedRun.status === "failed" ? "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950" :
                "text-muted-foreground bg-muted"
              }`}>
                {selectedRun.fix_all_status === "fixing" ? "fixing all" : selectedRun.status}
              </span>
              <button onClick={() => { fetchRuns(); if (selectedRunId) fetchFindings(selectedRunId); }}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Progress bar for scanning */}
          {selectedRun.status === "scanning" && totalArticles > 0 && (
            <div className="mb-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{selectedRun.total_articles_scanned} / {totalArticles} articles</span>
                <span>{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-lg font-bold text-foreground">{selectedRun.total_articles_scanned}</p>
              <p className="text-[10px] text-muted-foreground">Scanned</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-lg font-bold text-foreground">{selectedRun.total_issues_found}</p>
              <p className="text-[10px] text-muted-foreground">Issues</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-red-50 dark:bg-red-950">
              <p className="text-lg font-bold text-red-600">{selectedRun.duplicates_found}</p>
              <p className="text-[10px] text-muted-foreground">Duplicates</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950">
              <p className="text-lg font-bold text-emerald-600">{selectedRun.auto_fixes_applied}</p>
              <p className="text-[10px] text-muted-foreground">Auto-Fixed</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-amber-50 dark:bg-amber-950">
              <p className="text-lg font-bold text-amber-600">{selectedRun.articles_set_to_draft}</p>
              <p className="text-[10px] text-muted-foreground">Set to Draft</p>
            </div>
          </div>

          {selectedRun.error_message && (
            <div className="mt-2 p-2 rounded-lg bg-destructive/10 text-destructive text-xs">
              {selectedRun.error_message}
            </div>
          )}
        </div>
      )}

      {/* Findings */}
      {findings.length > 0 && (
      <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="font-semibold text-foreground text-sm">Findings ({filteredFindings.length})</h3>
            <div className="flex gap-2 items-center flex-wrap">
              {/* Fix All button */}
              {findings.some(f => f.status !== "resolved" && f.article_id && f.suggestion) && (
                <button
                  onClick={handleFixAll}
                  disabled={fixingAll || isRunning}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  {fixingAll ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Fixing in background...
                    </>
                  ) : (
                    <>
                      <Wrench className="h-3.5 w-3.5" />
                      Fix All Issues
                    </>
                  )}
                </button>
              )}

              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="text-xs border border-input rounded-lg px-2 py-1.5 bg-background text-foreground"
              >
                <option value="all">All Types</option>
                {issueTypes.map(t => (
                  <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>
                ))}
              </select>

              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="text-xs border border-input rounded-lg px-2 py-1.5 bg-background text-foreground"
              >
                <option value="all">All Severity</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
            </div>
          </div>

          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {filteredFindings.map((finding) => {
              const style = SEVERITY_STYLES[finding.severity] || SEVERITY_STYLES.info;
              const Icon = style.icon;

              return (
                <div key={finding.id} className={`${style.bg} border border-border/50 rounded-lg p-4`}>
                  <div className="flex items-start gap-2">
                    <Icon className={`h-4 w-4 mt-0.5 ${style.color} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-xs font-semibold ${style.color}`}>
                          {TYPE_LABELS[finding.issue_type] || finding.issue_type}
                        </span>
                        {finding.auto_fixed && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-0.5">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Auto-fixed
                          </span>
                        )}
                        {finding.status === "resolved" && !finding.auto_fixed && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 font-medium">
                            Resolved
                          </span>
                        )}
                      </div>

                      {finding.article_title && (
                        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                          <span className="inline-block w-3 h-3 rounded bg-muted" />
                          {finding.article_title}
                        </p>
                      )}

                      <p className="text-sm text-foreground leading-relaxed">{finding.description}</p>

                      {finding.suggestion && (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          💡 {finding.suggestion}
                        </p>
                      )}

                      {finding.fix_applied && (
                        <p className="text-xs mt-1.5 text-emerald-700 dark:text-emerald-300">
                          ✅ Fix: {finding.fix_applied}
                        </p>
                      )}

                      {finding.related_article_title && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Related: {finding.related_article_title}
                        </p>
                      )}

                      {/* Show apply fix button for unresolved findings with suggestions */}
                      {finding.status !== "resolved" && finding.article_id && finding.suggestion && (
                        <button
                          onClick={() => handleApplyFix(finding.id)}
                          disabled={applyingFix === finding.id}
                          className="mt-2 flex items-center gap-1.5 px-3 py-1 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {applyingFix === finding.id ? (
                            <><Loader2 className="h-3 w-3 animate-spin" /> Applying...</>
                          ) : (
                            <><Wrench className="h-3 w-3" /> Apply Fix</>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
