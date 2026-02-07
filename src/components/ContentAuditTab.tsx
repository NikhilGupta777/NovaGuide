import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Search, Play, RefreshCw, CheckCircle2, AlertTriangle,
  Info, XCircle, ChevronRight, FileText, Wrench, Eye
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

type AuditRun = {
  id: string;
  status: string;
  total_articles_scanned: number;
  total_issues_found: number;
  auto_fixes_applied: number;
  duplicates_found: number;
  articles_set_to_draft: number;
  error_message: string | null;
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
};

export default function ContentAuditTab() {
  const { toast } = useToast();
  const [runs, setRuns] = useState<AuditRun[]>([]);
  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [autoFix, setAutoFix] = useState(true);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");

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
      .order("severity", { ascending: true })
      .order("created_at", { ascending: false });
    if (data) setFindings(data as unknown as AuditFinding[]);
  }, []);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  useEffect(() => {
    if (selectedRunId) fetchFindings(selectedRunId);
  }, [selectedRunId, fetchFindings]);

  // Poll for active runs
  useEffect(() => {
    const activeRun = runs.find(r => r.status === "scanning" || r.status === "pending");
    if (!activeRun) return;
    const interval = setInterval(() => {
      fetchRuns();
      if (selectedRunId) fetchFindings(selectedRunId);
    }, 5000);
    return () => clearInterval(interval);
  }, [runs, fetchRuns, fetchFindings, selectedRunId]);

  const handleRunAudit = async () => {
    setTriggering(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-content-audit", {
        body: { autoFix },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Content Audit Started", description: "Scanning all articles in background..." });
      setTimeout(() => fetchRuns(), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start audit";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setTriggering(false);
    }
  };

  const isRunning = runs.some(r => r.status === "scanning" || r.status === "pending");
  const selectedRun = runs.find(r => r.id === selectedRunId);

  const filteredFindings = findings.filter(f => {
    if (filterType !== "all" && f.issue_type !== filterType) return false;
    if (filterSeverity !== "all" && f.severity !== filterSeverity) return false;
    return true;
  });

  const issueTypes = [...new Set(findings.map(f => f.issue_type))];

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
          Can auto-fix minor issues and set duplicates to draft.
        </p>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
            <div>
              <p className="text-sm font-medium text-foreground">Auto-Fix Minor Issues</p>
              <p className="text-xs text-muted-foreground">Automatically fix grammar and wording issues</p>
            </div>
            <Switch checked={autoFix} onCheckedChange={setAutoFix} disabled={isRunning} />
          </div>

          <button
            onClick={handleRunAudit}
            disabled={triggering || isRunning}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {triggering || isRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {isRunning ? "Scanning..." : "Starting..."}
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
              {selectedRun.status === "scanning" ? "Audit In Progress..." : "Audit Results"}
            </h3>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                selectedRun.status === "completed" ? "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950" :
                selectedRun.status === "scanning" ? "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950" :
                selectedRun.status === "failed" ? "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950" :
                "text-muted-foreground bg-muted"
              }`}>
                {selectedRun.status}
              </span>
              <button onClick={() => { fetchRuns(); if (selectedRunId) fetchFindings(selectedRunId); }}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

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
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground text-sm">Findings ({filteredFindings.length})</h3>
            <div className="flex gap-2">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-2 py-1 rounded-md border border-input bg-background text-foreground text-xs"
              >
                <option value="all">All Types</option>
                {issueTypes.map(t => (
                  <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>
                ))}
              </select>
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="px-2 py-1 rounded-md border border-input bg-background text-foreground text-xs"
              >
                <option value="all">All Severity</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
            </div>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {filteredFindings.map((finding) => {
              const style = SEVERITY_STYLES[finding.severity] || SEVERITY_STYLES.info;
              const Icon = style.icon;
              return (
                <div key={finding.id} className={`p-3 rounded-lg border border-border ${style.bg}`}>
                  <div className="flex items-start gap-2">
                    <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${style.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-medium ${style.color}`}>
                          {TYPE_LABELS[finding.issue_type] || finding.issue_type}
                        </span>
                        {finding.auto_fixed && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                            ✓ Auto-fixed
                          </span>
                        )}
                        {finding.status === "resolved" && !finding.auto_fixed && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                            Resolved
                          </span>
                        )}
                      </div>
                      {finding.article_title && (
                        <p className="text-xs font-medium text-foreground mt-1 truncate">
                          📄 {finding.article_title}
                        </p>
                      )}
                      <p className="text-xs text-foreground/80 mt-1">{finding.description}</p>
                      {finding.suggestion && (
                        <p className="text-xs text-muted-foreground mt-1">
                          💡 {finding.suggestion}
                        </p>
                      )}
                      {finding.fix_applied && (
                        <p className="text-xs text-emerald-600 mt-1">
                          ✅ Fix: {finding.fix_applied}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Previous Runs */}
      {runs.length > 1 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-foreground text-sm mb-3">Previous Audits</h3>
          <div className="space-y-2">
            {runs.map((run) => (
              <button
                key={run.id}
                onClick={() => setSelectedRunId(run.id)}
                className={`w-full text-left p-3 rounded-lg border transition-all hover:border-primary/30 ${
                  selectedRunId === run.id ? "border-primary bg-primary/5" : "border-border bg-muted/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-foreground">
                    {new Date(run.created_at).toLocaleString()}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    run.status === "completed" ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950" :
                    run.status === "failed" ? "text-red-600 bg-red-50 dark:bg-red-950" :
                    "text-muted-foreground bg-muted"
                  }`}>
                    {run.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                  <span>{run.total_articles_scanned} scanned</span>
                  <span>{run.total_issues_found} issues</span>
                  <span>{run.auto_fixes_applied} fixed</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
