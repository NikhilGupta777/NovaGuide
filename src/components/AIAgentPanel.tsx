import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCategories, useAllArticles } from "@/hooks/useDatabase";
import {
  Bot, Loader2, Sparkles, Search as SearchIcon, Play, Zap, CheckCircle2,
  FileText, Clock, AlertTriangle, Lightbulb, Rocket, RefreshCw, ArrowRight,
  TrendingUp, Target, ChevronRight, Eye, Star
} from "lucide-react";

type DiscoveredTopic = {
  topic: string;
  category_id: string;
  priority: "high" | "medium" | "low";
  reasoning: string;
  search_keywords?: string[];
};

type PipelineRun = {
  id: string;
  topic: string;
  mode: string;
  status: string;
  current_step: number;
  total_steps: number;
  research_notes: string | null;
  generated_outline: string | null;
  article_id: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  token_usage: Record<string, unknown> | null;
};

const PIPELINE_STEPS = [
  { key: "researching", label: "Deep Research", icon: SearchIcon, description: "Analyzing topic, gathering insights" },
  { key: "outlining", label: "Outline", icon: FileText, description: "Structuring content flow" },
  { key: "writing", label: "Writing", icon: Sparkles, description: "Generating article content" },
  { key: "optimizing", label: "SEO & Quality", icon: Target, description: "Optimizing for search & readability" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "text-muted-foreground bg-muted",
  researching: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950",
  outlining: "text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950",
  writing: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950",
  optimizing: "text-teal-600 bg-teal-50 dark:text-teal-400 dark:bg-teal-950",
  completed: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950",
  failed: "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950",
};

export default function AIAgentPanel() {
  const { categories } = useCategories();
  const { refetch: refetchArticles } = useAllArticles();
  const { toast } = useToast();

  // State
  const [activeMode, setActiveMode] = useState<"generate" | "discover" | "batch">("generate");
  const [topic, setTopic] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [generating, setGenerating] = useState(false);

  // Discovery
  const [discoveredTopics, setDiscoveredTopics] = useState<DiscoveredTopic[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoverCount, setDiscoverCount] = useState(5);

  // Batch
  const [batchQueue, setBatchQueue] = useState<DiscoveredTopic[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);

  // Pipeline runs
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<PipelineRun | null>(null);
  const [pollingRunId, setPollingRunId] = useState<string | null>(null);

  // Load recent pipeline runs
  const fetchRuns = useCallback(async () => {
    const { data } = await supabase
      .from("agent_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setRuns(data as unknown as PipelineRun[]);
  }, []);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  // Poll for active run status
  useEffect(() => {
    if (!pollingRunId) return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("agent_runs")
        .select("*")
        .eq("id", pollingRunId)
        .single();
      if (data) {
        const run = data as unknown as PipelineRun;
        setSelectedRun(run);
        setRuns(prev => prev.map(r => r.id === run.id ? run : r));
        if (run.status === "completed" || run.status === "failed") {
          setPollingRunId(null);
          clearInterval(interval);
        }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [pollingRunId]);

  // Generate single article
  const handleGenerate = async (topicText?: string, catId?: string) => {
    const t = topicText || topic.trim();
    if (!t) {
      toast({ title: "Error", description: "Enter a topic.", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-agent", {
        body: { topic: t, categoryId: catId || categoryId || undefined, mode: "manual" },
      });
      if (error) throw error;

      toast({ title: "Article Generated!", description: `"${data.title}" saved as draft.` });
      setTopic("");
      setPollingRunId(data._run_id);
      refetchArticles();
      fetchRuns();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  // Discover topics
  const handleDiscover = async () => {
    setDiscovering(true);
    setDiscoveredTopics([]);
    try {
      const { data, error } = await supabase.functions.invoke("ai-auto-discover", {
        body: { count: discoverCount, targetCategories: [] },
      });
      if (error) throw error;
      setDiscoveredTopics(data.topics || []);
      toast({ title: "Topics Discovered!", description: `Found ${data.topics?.length || 0} trending topics.` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Discovery failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setDiscovering(false);
    }
  };

  // Batch generate
  const handleBatchGenerate = async () => {
    if (batchQueue.length === 0) {
      toast({ title: "Error", description: "Add topics to the batch queue first.", variant: "destructive" });
      return;
    }
    setBatchRunning(true);
    setBatchProgress(0);
    for (let i = 0; i < batchQueue.length; i++) {
      const item = batchQueue[i];
      setBatchProgress(i + 1);
      try {
        await supabase.functions.invoke("ai-agent", {
          body: { topic: item.topic, categoryId: item.category_id, mode: "batch" },
        });
      } catch (err) {
        console.error(`Batch item ${i} failed:`, err);
      }
      // Small delay between requests to avoid rate limits
      if (i < batchQueue.length - 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    toast({ title: "Batch Complete!", description: `Generated ${batchQueue.length} articles as drafts.` });
    setBatchQueue([]);
    setBatchRunning(false);
    setBatchProgress(0);
    refetchArticles();
    fetchRuns();
  };

  const addToQueue = (topic: DiscoveredTopic) => {
    if (!batchQueue.find(t => t.topic === topic.topic)) {
      setBatchQueue(prev => [...prev, topic]);
    }
  };

  const removeFromQueue = (topicText: string) => {
    setBatchQueue(prev => prev.filter(t => t.topic !== topicText));
  };

  const priorityBadge = (p: string) => {
    const colors: Record<string, string> = {
      high: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
      medium: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
      low: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    };
    return colors[p] || colors.medium;
  };

  return (
    <div className="space-y-6">
      {/* Mode Selector */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: "generate" as const, label: "Generate Article", icon: Sparkles },
          { key: "discover" as const, label: "Discover Topics", icon: Lightbulb },
          { key: "batch" as const, label: "Batch Generate", icon: Rocket },
        ].map(mode => (
          <button
            key={mode.key}
            onClick={() => setActiveMode(mode.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeMode === mode.key
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <mode.icon className="h-4 w-4" />
            {mode.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Panel - Controls */}
        <div className="lg:col-span-2 space-y-4">
          {/* Generate Mode */}
          {activeMode === "generate" && (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-foreground">Full Pipeline Generation</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Enter a topic — the AI will research deeply, create an outline, write the article, and optimize for SEO. Saved as draft.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Topic / Question</label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !generating && handleGenerate()}
                    placeholder="e.g., How to transfer WhatsApp chats to a new phone"
                    className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-ring"
                    disabled={generating}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Category (optional)</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm outline-none"
                    disabled={generating}
                  >
                    <option value="">Auto-detect category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => handleGenerate()}
                  disabled={generating || !topic.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {generating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Running Pipeline...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Run Full Pipeline
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Discover Mode */}
          {activeMode === "discover" && (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="h-5 w-5 text-amber-500" />
                <h3 className="font-semibold text-foreground">Auto-Discover Topics</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                AI analyzes trending tech problems, search demand, and your existing content gaps to find the best topics to write about.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Number of topics</label>
                  <select
                    value={discoverCount}
                    onChange={(e) => setDiscoverCount(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm outline-none"
                    disabled={discovering}
                  >
                    {[3, 5, 8, 10].map(n => (
                      <option key={n} value={n}>{n} topics</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleDiscover}
                  disabled={discovering}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors disabled:opacity-50"
                >
                  {discovering ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Discovering...
                    </>
                  ) : (
                    <>
                      <TrendingUp className="h-4 w-4" />
                      Discover Trending Topics
                    </>
                  )}
                </button>
              </div>

              {/* Discovered Topics */}
              {discoveredTopics.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-foreground">Discovered Topics</h4>
                    <button
                      onClick={() => {
                        discoveredTopics.forEach(addToQueue);
                        setActiveMode("batch");
                        toast({ title: "Added to batch queue", description: `${discoveredTopics.length} topics ready for batch generation.` });
                      }}
                      className="text-xs text-primary hover:underline"
                    >
                      Add all to batch →
                    </button>
                  </div>
                  {discoveredTopics.map((t, i) => (
                    <div key={i} className="p-3 rounded-lg bg-muted/50 border border-border">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{t.topic}</p>
                          <p className="text-xs text-muted-foreground mt-1">{t.reasoning}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityBadge(t.priority)}`}>
                              {t.priority}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {categories.find(c => c.id === t.category_id)?.name || "Auto"}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleGenerate(t.topic, t.category_id)}
                            disabled={generating}
                            className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors"
                            title="Generate now"
                          >
                            <Zap className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => addToQueue(t)}
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors"
                            title="Add to batch queue"
                          >
                            <ArrowRight className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Batch Mode */}
          {activeMode === "batch" && (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Rocket className="h-5 w-5 text-purple-500" />
                <h3 className="font-semibold text-foreground">Batch Generation</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Queue multiple topics and generate them all at once. All articles are saved as drafts — nothing goes live until you publish.
              </p>

              {batchQueue.length === 0 ? (
                <div className="text-center py-6 bg-muted/30 rounded-lg">
                  <Rocket className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Queue is empty.</p>
                  <button
                    onClick={() => setActiveMode("discover")}
                    className="text-xs text-primary hover:underline mt-1"
                  >
                    Discover topics first →
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {batchQueue.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 border border-border">
                      <span className="text-xs font-mono text-muted-foreground w-5">{i + 1}</span>
                      <p className="text-sm text-foreground flex-1 truncate">{item.topic}</p>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${priorityBadge(item.priority)}`}>
                        {item.priority}
                      </span>
                      <button
                        onClick={() => removeFromQueue(item.topic)}
                        className="text-muted-foreground hover:text-destructive p-1"
                        disabled={batchRunning}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {batchRunning && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-muted-foreground">Generating...</span>
                    <span className="font-medium text-foreground">{batchProgress} / {batchQueue.length}</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${(batchProgress / batchQueue.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                onClick={handleBatchGenerate}
                disabled={batchRunning || batchQueue.length === 0}
                className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50"
              >
                {batchRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating {batchProgress}/{batchQueue.length}...
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4" />
                    Generate All ({batchQueue.length} articles)
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Right Panel - Pipeline Runs & Activity */}
        <div className="lg:col-span-3 space-y-4">
          {/* Active Pipeline Visualization */}
          {selectedRun && (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground text-sm">Pipeline: {selectedRun.topic}</h3>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[selectedRun.status] || STATUS_COLORS.pending}`}>
                  {selectedRun.status}
                </span>
              </div>

              {/* Step Progress */}
              <div className="flex items-center gap-1 mb-5">
                {PIPELINE_STEPS.map((step, i) => {
                  const stepIndex = PIPELINE_STEPS.findIndex(s => s.key === selectedRun.status);
                  const isCompleted = selectedRun.status === "completed" || i < stepIndex;
                  const isActive = step.key === selectedRun.status;
                  const isFailed = selectedRun.status === "failed" && i === stepIndex;

                  return (
                    <div key={step.key} className="flex items-center flex-1">
                      <div className={`flex flex-col items-center flex-1 ${i > 0 ? 'ml-1' : ''}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 transition-all ${
                          isCompleted ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400" :
                          isActive ? "bg-primary/10 text-primary ring-2 ring-primary/30" :
                          isFailed ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {isCompleted ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : isActive ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : isFailed ? (
                            <AlertTriangle className="h-3.5 w-3.5" />
                          ) : (
                            <step.icon className="h-3.5 w-3.5" />
                          )}
                        </div>
                        <span className={`text-[10px] text-center leading-tight ${
                          isActive ? "text-primary font-medium" : "text-muted-foreground"
                        }`}>
                          {step.label}
                        </span>
                      </div>
                      {i < PIPELINE_STEPS.length - 1 && (
                        <div className={`h-0.5 w-4 mt-[-12px] ${
                          isCompleted ? "bg-emerald-300 dark:bg-emerald-700" : "bg-border"
                        }`} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Research Notes Preview */}
              {selectedRun.research_notes && (
                <details className="group">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
                    Research Notes
                  </summary>
                  <div className="mt-2 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground max-h-48 overflow-y-auto whitespace-pre-wrap">
                    {selectedRun.research_notes}
                  </div>
                </details>
              )}

              {/* Outline Preview */}
              {selectedRun.generated_outline && (
                <details className="group mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
                    Generated Outline
                  </summary>
                  <div className="mt-2 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground max-h-48 overflow-y-auto whitespace-pre-wrap">
                    {selectedRun.generated_outline}
                  </div>
                </details>
              )}

              {/* Quality Score */}
              {selectedRun.status === "completed" && selectedRun.token_usage && (
                <div className="mt-3 flex items-center gap-3">
                  {(selectedRun.token_usage as Record<string, unknown>).quality_score && (
                    <div className="flex items-center gap-1.5">
                      <Star className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-xs font-medium text-foreground">
                        Quality: {String((selectedRun.token_usage as Record<string, unknown>).quality_score)}/10
                      </span>
                    </div>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {selectedRun.completed_at && `Completed ${new Date(selectedRun.completed_at).toLocaleTimeString()}`}
                  </span>
                </div>
              )}

              {selectedRun.error_message && (
                <div className="mt-3 p-3 rounded-lg bg-destructive/10 text-destructive text-xs">
                  {selectedRun.error_message}
                </div>
              )}
            </div>
          )}

          {/* Recent Pipeline Runs */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Pipeline History</h3>
              <button onClick={fetchRuns} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>

            {runs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No pipeline runs yet. Generate your first article!</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {runs.map((run) => (
                  <button
                    key={run.id}
                    onClick={() => setSelectedRun(run)}
                    className={`w-full text-left p-3 rounded-lg border transition-all hover:border-primary/30 ${
                      selectedRun?.id === run.id ? "border-primary bg-primary/5" : "border-border bg-muted/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground truncate max-w-[70%]">{run.topic}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[run.status] || STATUS_COLORS.pending}`}>
                        {run.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(run.started_at).toLocaleString()}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Step {run.current_step}/{run.total_steps}
                      </span>
                      {run.mode !== "manual" && (
                        <span className="text-[10px] text-primary font-medium">{run.mode}</span>
                      )}
                      {run.status === "completed" && (
                        <Eye className="h-3 w-3 text-muted-foreground ml-auto" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
