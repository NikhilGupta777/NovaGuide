import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAllArticles, useCategories } from "@/hooks/useDatabase";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen, Plus, Edit, Trash2, Eye, Bot, LogOut, FileText,
  LayoutDashboard, Loader2, CheckCircle, Clock, AlertCircle,
  ChevronDown, Search, Rocket, Mail, Users, Shield, Wrench
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import AIAgentPanel from "@/components/AIAgentPanel";
import ContentAuditTab from "@/components/ContentAuditTab";
import NightlyBuilderTab from "@/components/NightlyBuilderTab";

type DbArticle = Tables<"articles">;

type TabType = "articles" | "agent" | "messages" | "subscribers" | "audit" | "nightly";

const AdminDashboard = () => {
  const { user, isAdmin, loading: authLoading, signOut } = useAuth();
  const { articles, loading: articlesLoading, refetch } = useAllArticles();
  const { categories } = useCategories();
  const [activeTab, setActiveTab] = useState<TabType>("articles");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [messages, setMessages] = useState<any[]>([]);
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [subscribersLoading, setSubscribersLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  // Fetch messages when tab is active
  useEffect(() => {
    if (activeTab === "messages" && isAdmin) {
      setMessagesLoading(true);
      supabase.from("contact_submissions").select("*").order("created_at", { ascending: false }).then(({ data }) => {
        if (data) setMessages(data);
        setMessagesLoading(false);
      });
    }
  }, [activeTab, isAdmin]);

  // Fetch subscribers when tab is active
  useEffect(() => {
    if (activeTab === "subscribers" && isAdmin) {
      setSubscribersLoading(true);
      supabase.from("email_subscribers").select("*").order("subscribed_at", { ascending: false }).then(({ data }) => {
        if (data) setSubscribers(data);
        setSubscribersLoading(false);
      });
    }
  }, [activeTab, isAdmin]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
          <p className="text-muted-foreground mb-4">You don't have admin permissions.</p>
          <Link to="/" className="text-primary hover:underline">Go back home</Link>
        </div>
      </div>
    );
  }

  const filteredArticles = articles.filter((a) => {
    const matchesSearch = a.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || a.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this article?")) return;
    const { error } = await supabase.from("articles").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: "Failed to delete article.", variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: "Article removed." });
      refetch();
    }
  };

  const handleTogglePublish = async (article: DbArticle) => {
    const newStatus = article.status === "published" ? "draft" : "published";
    const update: Record<string, unknown> = { status: newStatus };
    if (newStatus === "published") update.published_at = new Date().toISOString();

    const { error } = await supabase.from("articles").update(update).eq("id", article.id);
    if (error) {
      toast({ title: "Error", description: "Failed to update status.", variant: "destructive" });
    } else {
      toast({ title: "Updated", description: `Article ${newStatus === "published" ? "published" : "unpublished"}.` });
      refetch();
    }
  };

  const unpublishedCount = articles.filter((a) => a.status !== "published").length;

  const handlePublishAll = async () => {
    const toPublish = articles.filter((a) => a.status !== "published");
    if (toPublish.length === 0) {
      toast({ title: "Nothing to publish", description: "All articles are already live." });
      return;
    }
    if (!confirm(`Are you sure you want to publish all ${toPublish.length} unpublished article(s)?`)) return;

    const ids = toPublish.map((a) => a.id);
    const { error } = await supabase
      .from("articles")
      .update({ status: "published", published_at: new Date().toISOString() })
      .in("id", ids);

    if (error) {
      toast({ title: "Error", description: "Failed to publish articles.", variant: "destructive" });
    } else {
      toast({ title: "All Published! 🚀", description: `${toPublish.length} article(s) are now live.` });
      refetch();
    }
  };

  const handleMarkRead = async (id: string) => {
    await supabase.from("contact_submissions").update({ read: true }).eq("id", id);
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, read: true } : m));
  };

  const stats = {
    total: articles.length,
    published: articles.filter((a) => a.status === "published").length,
    drafts: articles.filter((a) => a.status === "draft").length,
    needsReview: articles.filter((a) => a.status === "needs_review").length,
    aiGenerated: articles.filter((a) => a.ai_generated).length,
  };

  const tabs: { id: TabType; label: string; icon: any }[] = [
    { id: "articles", label: "Articles", icon: LayoutDashboard },
    { id: "agent", label: "AI Agent", icon: Bot },
    { id: "messages", label: "Messages", icon: Mail },
    { id: "subscribers", label: "Subscribers", icon: Users },
    { id: "audit", label: "Content Audit", icon: Shield },
    { id: "nightly", label: "Nightly Builder", icon: Wrench },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <BookOpen className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-foreground">Admin</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">View Site →</Link>
            <button onClick={signOut} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <LogOut className="h-4 w-4" />Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="container py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Articles", value: stats.total, icon: FileText, color: "text-primary" },
            { label: "Published", value: stats.published, icon: CheckCircle, color: "text-cat-howto" },
            { label: "Drafts", value: stats.drafts, icon: Clock, color: "text-cat-account" },
            { label: "AI Generated", value: stats.aiGenerated, icon: Bot, color: "text-cat-tablet" },
          ].map((stat) => (
            <div key={stat.label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="h-4 w-4 inline mr-1.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Articles Tab */}
        {activeTab === "articles" && (
          <div>
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input type="text" placeholder="Search articles..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2 rounded-lg border border-input bg-background text-foreground text-sm outline-none" />
              </div>
              <div className="relative">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-input bg-background text-foreground text-sm outline-none">
                  <option value="all">All Status</option>
                  <option value="published">Published</option>
                  <option value="draft">Drafts</option>
                  <option value="needs_review">Needs Review</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
              {unpublishedCount > 0 && (
                <button onClick={handlePublishAll} className="flex items-center gap-2 px-4 py-2 bg-cat-howto text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                  <Rocket className="h-4 w-4" />Publish All ({unpublishedCount})
                </button>
              )}
              <button onClick={() => navigate("/admin/editor")} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                <Plus className="h-4 w-4" />New Article
              </button>
            </div>

            {articlesLoading ? (
              <div className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></div>
            ) : filteredArticles.length === 0 ? (
              <div className="text-center py-12 bg-muted/50 rounded-xl">
                <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No articles found.</p>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Title</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Category</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden sm:table-cell">Views</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredArticles.map((article) => {
                        const cat = categories.find((c) => c.id === article.category_id);
                        return (
                          <tr key={article.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                            <td className="py-3 px-4">
                              <p className="font-medium text-foreground truncate max-w-xs">{article.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{article.slug}</p>
                            </td>
                            <td className="py-3 px-4 hidden md:table-cell text-muted-foreground">{cat?.name || "—"}</td>
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                article.status === "published" ? "bg-cat-howto/10 text-cat-howto"
                                  : article.status === "needs_review" ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400"
                                  : "bg-cat-account/10 text-cat-account"
                              }`}>
                                {article.status === "needs_review" ? "needs review" : article.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 hidden sm:table-cell text-muted-foreground text-xs">
                              {(article as any).view_count || 0}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => handleTogglePublish(article)} title={article.status === "published" ? "Unpublish" : "Go Live"} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                                  {article.status === "published" ? <Clock className="h-4 w-4 text-muted-foreground" /> : <CheckCircle className="h-4 w-4 text-cat-howto" />}
                                </button>
                                <button onClick={() => navigate(`/admin/editor/${article.id}`)} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                                  <Edit className="h-4 w-4 text-muted-foreground" />
                                </button>
                                <Link to={`/article/${article.slug}`} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                </Link>
                                <button onClick={() => handleDelete(article.id)} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "agent" && <AIAgentPanel />}

        {/* Messages Tab */}
        {activeTab === "messages" && (
          <div>
            <h2 className="text-lg font-bold text-foreground mb-4">Contact Submissions</h2>
            {messagesLoading ? (
              <div className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></div>
            ) : messages.length === 0 ? (
              <div className="text-center py-12 bg-muted/50 rounded-xl">
                <Mail className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No messages yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div key={msg.id} className={`bg-card border rounded-xl p-5 ${msg.read ? "border-border" : "border-primary/30 bg-primary/5"}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold text-foreground text-sm">{msg.subject}</h3>
                        <p className="text-xs text-muted-foreground">{msg.name} · {msg.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{new Date(msg.created_at).toLocaleDateString()}</span>
                        {!msg.read && (
                          <button onClick={() => handleMarkRead(msg.id)} className="text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20">
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{msg.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Subscribers Tab */}
        {activeTab === "subscribers" && (
          <div>
            <h2 className="text-lg font-bold text-foreground mb-4">Email Subscribers ({subscribers.length})</h2>
            {subscribersLoading ? (
              <div className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></div>
            ) : subscribers.length === 0 ? (
              <div className="text-center py-12 bg-muted/50 rounded-xl">
                <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No subscribers yet.</p>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Email</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Subscribed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscribers.map((sub) => (
                      <tr key={sub.id} className="border-b border-border last:border-0">
                        <td className="py-3 px-4 text-foreground">{sub.email}</td>
                        <td className="py-3 px-4 text-muted-foreground text-xs">{new Date(sub.subscribed_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "audit" && <ContentAuditTab />}
        {activeTab === "nightly" && <NightlyBuilderTab />}
      </div>
    </div>
  );
};

export default AdminDashboard;
