import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Moon, StopCircle, Play, RefreshCw, CheckCircle2,
  AlertTriangle, Clock, ChevronRight, Zap, Settings2
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

type NightlySettings = {
  id: string;
  enabled: boolean;
  topics_per_category: number;
  auto_publish_min_quality: number;
  auto_publish_min_factual: number;
  allow_category_creation: boolean;
  stop_requested: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
};

type NightlyRun = {
  id: string;
  status: string;
  batch_number: number;
  total_categories_processed: number;
  categories_created: number;
  total_topics_found: number;
  total_after_dedup: number;
  articles_generated: number;
  articles_published: number;
  articles_failed: number;
  details: Record<string, unknown>;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

type QueueStats = {
  batch1_pending: number;
  batch2_pending: number;
  batch3_pending: number;
  total_completed: number;
};

const RUN_STATUS_COLORS: Record<string, string> = {
  pending: "text-muted-foreground bg-muted",
  researching: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950",
  generating: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950",
  completed: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950",
  failed: "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950",
  stopped: "text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950",
};

export default function NightlyBuilderTab() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<NightlySettings | null>(null);
  const [runs, setRuns] = useState<NightlyRun[]>([]);
  const [queueStats, setQueueStats] = useState<QueueStats>({ batch1_pending: 0, batch2_pending: 0, batch3_pending: 0, total_completed: 0 });
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase
      .from("nightly_builder_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (data) {
      setSettings(data as unknown as NightlySettings);
    }
  }, []);

  const fetchRuns = useCallback(async () => {
    const { data } = await supabase
      .from("nightly_builder_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) setRuns(data as unknown as NightlyRun[]);
  }, []);

  const fetchQueueStats = useCallback(async () => {
    const today = new Date().toISOString().split("T")[0];

    const [b1, b2, b3, completed] = await Promise.all([
      supabase.from("nightly_builder_queue").select("*", { count: "exact", head: true }).eq("run_date", today).eq("batch_number", 1).eq("status", "pending"),
      supabase.from("nightly_builder_queue").select("*", { count: "exact", head: true }).eq("run_date", today).eq("batch_number", 2).eq("status", "pending"),
      supabase.from("nightly_builder_queue").select("*", { count: "exact", head: true }).eq("run_date", today).eq("batch_number", 3).eq("status", "pending"),
      supabase.from("nightly_builder_queue").select("*", { count: "exact", head: true }).eq("run_date", today).eq("status", "completed"),
    ]);

    setQueueStats({
      batch1_pending: b1.count || 0,
      batch2_pending: b2.count || 0,
      batch3_pending: b3.count || 0,
      total_completed: completed.count || 0,
    });
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchRuns();
    fetchQueueStats();
  }, [fetchSettings, fetchRuns, fetchQueueStats]);

  // Poll for active runs
  useEffect(() => {
    const activeRun = runs.find(r => r.status === "researching" || r.status === "generating" || r.status === "pending");
    if (!activeRun) return;

    const interval = setInterval(() => {
      fetchRuns();
      fetchQueueStats();
    }, 10000);
    return () => clearInterval(interval);
  }, [runs, fetchRuns, fetchQueueStats]);

  const saveSettings = async (updates: Partial<NightlySettings>) => {
    setSaving(true);
    try {
      if (settings) {
        await supabase.from("nightly_builder_settings").update(updates).eq("id", settings.id);
      } else {
        await supabase.from("nightly_builder_settings").insert(updates);
      }
      await fetchSettings();
      toast({ title: "Settings Saved", description: "Nightly builder settings updated." });
    } catch (err) {
      console.error("Save nightly settings error:", err);
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRunNow = async (batch = 1) => {
    setTriggering(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-nightly-builder", {
        body: { batch },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Nightly Builder Started", description: `Batch ${batch} is running in the background.` });
      setTimeout(() => { fetchRuns(); fetchQueueStats(); }, 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to trigger nightly builder";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setTriggering(false);
    }
  };

  const handleStop = async () => {
    await saveSettings({ stop_requested: true });
    toast({ title: "Stop Requested", description: "The builder will stop after the current article finishes." });
  };

  const isRunning = runs.some(r => r.status === "researching" || r.status === "generating");
  const lastRun = runs[0];

  return (
    <div className="space-y-4">
      {/* Configuration Card */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Moon className="h-5 w-5 text-indigo-500" />
          <h3 className="font-semibold text-foreground">Nightly Content Builder</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Uses Gemini Deep Research to find 30-100+ common questions per category from the entire web, then generates all articles autonomously overnight with auto-publish.
        </p>

        <div className="space-y-5">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Enable Nightly Builder</p>
              <p className="text-xs text-muted-foreground">Runs at 12:00 AM IST daily (with overflow at 12 PM & 6 PM)</p>
            </div>
            <Switch
              checked={settings?.enabled || false}
              onCheckedChange={(checked) => saveSettings({ enabled: checked })}
              disabled={saving}
            />
          </div>

          {/* Topics per category */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-foreground">Topics per category</label>
              <span className="text-sm font-mono text-primary">{settings?.topics_per_category || 50}</span>
            </div>
            <Slider
              value={[settings?.topics_per_category || 50]}
              onValueChange={([val]) => saveSettings({ topics_per_category: val })}
              min={30}
              max={100}
              step={10}
              disabled={saving}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>30</span>
              <span>100</span>
            </div>
          </div>

          {/* Auto-publish quality threshold */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-foreground">Auto-publish quality threshold</label>
              <span className="text-sm font-mono text-primary">{settings?.auto_publish_min_quality || 7}/10</span>
            </div>
            <Slider
              value={[settings?.auto_publish_min_quality || 7]}
              onValueChange={([val]) => saveSettings({ auto_publish_min_quality: val })}
              min={5}
              max={10}
              step={1}
              disabled={saving}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>5</span>
              <span>10</span>
            </div>
          </div>

          {/* Auto-publish factual threshold */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-foreground">Auto-publish factual threshold</label>
              <span className="text-sm font-mono text-primary">{settings?.auto_publish_min_factual || 7}/10</span>
            </div>
            <Slider
              value={[settings?.auto_publish_min_factual || 7]}
              onValueChange={([val]) => saveSettings({ auto_publish_min_factual: val })}
              min={5}
              max={10}
              step={1}
              disabled={saving}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>5</span>
              <span>10</span>
            </div>
          </div>

          {/* Allow category creation */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Allow AI to create new categories</p>
              <p className="text-xs text-muted-foreground">AI will identify missing categories and create them</p>
            </div>
            <Switch
              checked={settings?.allow_category_creation ?? true}
              onCheckedChange={(checked) => saveSettings({ allow_category_creation: checked })}
              disabled={saving}
            />
          </div>

          {/* Status Info */}
          <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Status</span>
              <span className={`font-medium ${
                isRunning ? "text-amber-600" :
                settings?.enabled ? "text-emerald-600" : "text-muted-foreground"
              }`}>
                {isRunning ? "● Running" : settings?.enabled ? "● Scheduled" : "○ Disabled"}
              </span>
            </div>
            {settings?.last_run_at && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Last run</span>
                <span className="text-foreground">
                  {new Date(settings.last_run_at).toLocaleString()}
                </span>
              </div>
            )}
            {/* Queue stats */}
            {(queueStats.batch1_pending + queueStats.batch2_pending + queueStats.batch3_pending > 0) && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Queue pending</span>
                <span className="text-foreground">
                  B1: {queueStats.batch1_pending} · B2: {queueStats.batch2_pending} · B3: {queueStats.batch3_pending}
                </span>
              </div>
            )}
            {queueStats.total_completed > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Completed today</span>
                <span className="text-emerald-600 font-medium">{queueStats.total_completed} articles</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => handleRunNow(1)}
              disabled={triggering || isRunning}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {triggering ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run Now
                </>
              )}
            </button>
            {isRunning && (
              <button
                onClick={handleStop}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <StopCircle className="h-4 w-4" />
                Stop
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Last Run Summary */}
      {lastRun && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground text-sm">Last Run Summary</h3>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${RUN_STATUS_COLORS[lastRun.status] || RUN_STATUS_COLORS.pending}`}>
              {lastRun.status}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-lg font-bold text-foreground">{lastRun.total_topics_found}</p>
              <p className="text-[10px] text-muted-foreground">Topics Found</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-lg font-bold text-foreground">{lastRun.articles_generated}</p>
              <p className="text-[10px] text-muted-foreground">Generated</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950">
              <p className="text-lg font-bold text-emerald-600">{lastRun.articles_published}</p>
              <p className="text-[10px] text-muted-foreground">Published</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-lg font-bold text-foreground">{lastRun.articles_failed}</p>
              <p className="text-[10px] text-muted-foreground">Failed</p>
            </div>
          </div>
          {lastRun.categories_created > 0 && (
            <p className="text-xs text-primary mt-2">
              ✨ {lastRun.categories_created} new categories created by AI
            </p>
          )}
          {lastRun.error_message && (
            <div className="mt-2 p-2 rounded-lg bg-destructive/10 text-destructive text-xs">
              {lastRun.error_message}
            </div>
          )}
        </div>
      )}

      {/* Recent Runs */}
      {runs.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground text-sm">Recent Runs</h3>
            <button onClick={() => { fetchRuns(); fetchQueueStats(); }} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-2">
            {runs.map((run) => (
              <div key={run.id} className="border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                  className="w-full text-left p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expandedRun === run.id ? "rotate-90" : ""}`} />
                      <span className="text-xs text-muted-foreground">
                        Batch {run.batch_number} · {new Date(run.started_at).toLocaleString()}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${RUN_STATUS_COLORS[run.status] || RUN_STATUS_COLORS.pending}`}>
                      {run.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 ml-5">
                    <span className="text-[10px] text-muted-foreground">
                      {run.total_topics_found} topics → {run.articles_generated} articles → {run.articles_published} published
                    </span>
                  </div>
                </button>

                {expandedRun === run.id && (
                  <div className="px-3 pb-3 border-t border-border">
                    <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Categories processed</span>
                        <span className="text-foreground">{run.total_categories_processed}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Categories created</span>
                        <span className="text-foreground">{run.categories_created}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Topics found</span>
                        <span className="text-foreground">{run.total_topics_found}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">After dedup</span>
                        <span className="text-foreground">{run.total_after_dedup}</span>
                      </div>
                    </div>

                    {/* Per-category details */}
                    {run.details && Object.keys(run.details).length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase">Per-Category Breakdown</p>
                        {Object.entries(run.details).map(([catName, detail]) => {
                          const d = detail as Record<string, unknown>;
                          return (
                            <div key={catName} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/30">
                              <span className="text-foreground">{catName}</span>
                              <span className="text-muted-foreground">
                                {d.error ? (
                                  <span className="text-destructive">Error</span>
                                ) : (
                                  <>
                                    {String(d.topics_found || 0)} topics
                                    {d.new_category && <span className="text-primary ml-1">✨ new</span>}
                                  </>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {run.error_message && (
                      <div className="mt-2 p-2 rounded bg-destructive/10 text-destructive text-xs">
                        {run.error_message}
                      </div>
                    )}

                    {run.completed_at && (
                      <p className="text-[10px] text-muted-foreground mt-2">
                        Duration: {Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 60000)} min
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
