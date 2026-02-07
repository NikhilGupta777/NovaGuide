import { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCategories } from "@/hooks/useDatabase";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, ArrowLeft, Save, Loader2, Eye } from "lucide-react";

const ArticleEditor = () => {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { categories } = useCategories();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [saving, setSaving] = useState(false);
  const [loadingArticle, setLoadingArticle] = useState(isEditing);
  const [form, setForm] = useState({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    category_id: "",
    status: "draft",
    featured: false,
    read_time: 3,
    tags: "",
    seo_title: "",
    seo_description: "",
  });

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (isEditing && id) {
      supabase
        .from("articles")
        .select("*")
        .eq("id", id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setForm({
              title: data.title,
              slug: data.slug,
              excerpt: data.excerpt || "",
              content: data.content || "",
              category_id: data.category_id || "",
              status: data.status,
              featured: data.featured,
              read_time: data.read_time,
              tags: (data.tags || []).join(", "),
              seo_title: data.seo_title || "",
              seo_description: data.seo_description || "",
            });
          }
          setLoadingArticle(false);
        });
    }
  }, [id, isEditing]);

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  };

  const handleTitleChange = (title: string) => {
    setForm((prev) => ({
      ...prev,
      title,
      slug: isEditing ? prev.slug : generateSlug(title),
    }));
  };

  const handleSave = async (publishNow = false) => {
    if (!form.title.trim()) {
      toast({ title: "Error", description: "Title is required.", variant: "destructive" });
      return;
    }

    const slug = form.slug.trim() || generateSlug(form.title);
    if (!slug) {
      toast({ title: "Error", description: "Could not generate a valid slug.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const status = publishNow ? "published" : form.status;
    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const articleData = {
      title: form.title.trim(),
      slug,
      excerpt: form.excerpt.trim() || null,
      content: form.content || null,
      category_id: form.category_id || null,
      status,
      featured: form.featured,
      read_time: form.read_time,
      tags,
      seo_title: form.seo_title || null,
      seo_description: form.seo_description || null,
      author_id: user?.id || null,
      ...(publishNow && { published_at: new Date().toISOString() }),
    };

    try {
      if (isEditing) {
        const { error } = await supabase.from("articles").update(articleData).eq("id", id);
        if (error) throw error;
        toast({ title: "Saved!", description: "Article updated successfully." });
      } else {
        const { error } = await supabase.from("articles").insert(articleData);
        if (error) throw error;
        toast({ title: "Created!", description: `Article ${publishNow ? "published" : "saved as draft"}.` });
        navigate("/admin");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loadingArticle) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Access denied.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/admin")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          </div>
          <div className="flex items-center gap-2">
            {isEditing && (
              <Link
                to={`/article/${form.slug}`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg"
              >
                <Eye className="h-4 w-4" />
                Preview
              </Link>
            )}
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              Save Draft
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
              Publish
            </button>
          </div>
        </div>
      </header>

      <div className="container py-6 max-w-4xl">
        <div className="space-y-5">
          {/* Title */}
          <div>
            <input
              type="text"
              value={form.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Article title..."
              className="w-full text-3xl font-bold bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
            />
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground">Slug:</span>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
                className="text-xs bg-muted px-2 py-1 rounded text-foreground outline-none flex-1"
              />
            </div>
          </div>

          {/* Excerpt */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Excerpt</label>
            <textarea
              value={form.excerpt}
              onChange={(e) => setForm((prev) => ({ ...prev, excerpt: e.target.value }))}
              placeholder="Brief description of the article..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm outline-none resize-none"
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Content (Markdown)</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
              placeholder="Write your article content using Markdown..."
              rows={20}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm outline-none resize-y font-mono"
            />
          </div>

          {/* Meta fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Category</label>
              <select
                value={form.category_id}
                onChange={(e) => setForm((prev) => ({ ...prev, category_id: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm outline-none"
              >
                <option value="">No category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Read Time (minutes)</label>
              <input
                type="number"
                value={form.read_time}
                onChange={(e) => setForm((prev) => ({ ...prev, read_time: parseInt(e.target.value) || 3 }))}
                min={1}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Tags (comma separated)</label>
              <input
                type="text"
                value={form.tags}
                onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))}
                placeholder="iPhone, storage, tips"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm outline-none"
              />
            </div>

            <div className="flex items-center gap-3 pt-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(e) => setForm((prev) => ({ ...prev, featured: e.target.checked }))}
                  className="rounded border-input"
                />
                <span className="text-sm text-foreground">Featured article</span>
              </label>
            </div>
          </div>

          {/* SEO */}
          <div className="border-t border-border pt-5">
            <h3 className="font-semibold text-foreground mb-3">SEO Settings</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">SEO Title</label>
                <input
                  type="text"
                  value={form.seo_title}
                  onChange={(e) => setForm((prev) => ({ ...prev, seo_title: e.target.value }))}
                  placeholder="Custom title for search engines"
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">SEO Description</label>
                <textarea
                  value={form.seo_description}
                  onChange={(e) => setForm((prev) => ({ ...prev, seo_description: e.target.value }))}
                  placeholder="Meta description for search engines (under 160 chars)"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm outline-none resize-none"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArticleEditor;
