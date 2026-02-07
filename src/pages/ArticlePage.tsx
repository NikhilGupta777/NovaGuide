import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Clock, Calendar, Tag, ArrowLeft, Loader2 } from "lucide-react";
import Layout from "@/components/Layout";
import BreadcrumbNav from "@/components/BreadcrumbNav";
import ArticleCard from "@/components/ArticleCard";
import AdPlaceholder from "@/components/AdPlaceholder";
import { useArticleBySlug, useArticlesByCategory, useCategories } from "@/hooks/useDatabase";
import { getCategoryColors } from "@/lib/iconMap";

const ArticlePage = () => {
  const { slug } = useParams<{ slug: string }>();
  const { article, loading } = useArticleBySlug(slug || "");
  const { categories } = useCategories();

  const category = categories.find((c) => c.id === article?.category_id);
  const { articles: relatedArticles } = useArticlesByCategory(category?.id);
  const colors = category ? getCategoryColors(category.icon) : null;

  if (loading) {
    return (
      <Layout>
        <div className="container py-16 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!article) {
    return (
      <Layout>
        <div className="container py-16 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Article Not Found</h1>
          <p className="text-muted-foreground mb-4">The article you're looking for doesn't exist.</p>
          <Link to="/" className="text-primary font-medium hover:underline">Go back home</Link>
        </div>
      </Layout>
    );
  }

  const related = relatedArticles.filter((a) => a.id !== article.id).slice(0, 3);

  const renderContent = (content: string) => {
    const lines = content.split("\n");
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeContent = "";

    lines.forEach((line, index) => {
      if (line.startsWith("```")) {
        if (inCodeBlock) {
          elements.push(
            <pre key={`code-${index}`} className="bg-muted rounded-lg p-4 overflow-x-auto mb-4 text-sm font-mono">
              <code>{codeContent.trim()}</code>
            </pre>
          );
          codeContent = "";
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
        }
        return;
      }
      if (inCodeBlock) { codeContent += line + "\n"; return; }
      if (line.startsWith("## ")) {
        elements.push(<h2 key={index} className="text-2xl font-bold mt-8 mb-4 text-foreground">{line.replace("## ", "")}</h2>);
      } else if (line.startsWith("### ")) {
        elements.push(<h3 key={index} className="text-xl font-semibold mt-6 mb-3 text-foreground">{line.replace("### ", "")}</h3>);
      } else if (line.trim() === "") {
        // skip
      } else {
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        const rendered = parts.map((part, i) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
          }
          const codeParts = part.split(/(`[^`]+`)/g);
          return codeParts.map((cp, j) => {
            if (cp.startsWith("`") && cp.endsWith("`")) {
              return <code key={`${i}-${j}`} className="px-1.5 py-0.5 bg-muted rounded text-sm font-mono">{cp.slice(1, -1)}</code>;
            }
            return cp;
          });
        });
        if (line.startsWith("- ")) {
          elements.push(<li key={index} className="ml-6 mb-2 text-foreground list-disc">{rendered.flat().slice(1)}</li>);
        } else {
          elements.push(<p key={index} className="mb-4 text-foreground leading-relaxed">{rendered}</p>);
        }
      }
    });
    return elements;
  };

  return (
    <Layout>
      <article className="container py-8">
        <BreadcrumbNav
          items={[
            ...(category ? [{ label: category.name, href: `/category/${category.slug}` }] : []),
            { label: article.title },
          ]}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <div className="mb-8">
                {category && colors && (
                  <Link to={`/category/${category.slug}`} className={`category-badge ${colors.bg} ${colors.color} mb-3 inline-flex`}>
                    {category.name}
                  </Link>
                )}
                <h1 className="text-2xl md:text-4xl font-bold text-foreground leading-tight mb-4">{article.title}</h1>
                <p className="text-lg text-muted-foreground leading-relaxed mb-4">{article.excerpt}</p>
                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" />{article.read_time} min read</span>
                  {article.published_at && (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4" />
                      {new Date(article.published_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                    </span>
                  )}
                </div>
              </div>

              <div className="border-t border-border pt-8" />
              <div className="prose-article">{article.content && renderContent(article.content)}</div>

              <div className="my-8"><AdPlaceholder type="inline" className="max-w-md mx-auto" /></div>

              {article.tags && article.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-8 pt-6 border-t border-border">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  {article.tags.map((tag) => (
                    <Link key={tag} to={`/search?q=${encodeURIComponent(tag)}`} className="text-xs px-3 py-1 rounded-full bg-muted text-muted-foreground hover:text-foreground transition-colors">
                      {tag}
                    </Link>
                  ))}
                </div>
              )}

              <div className="mt-8">
                <Link to={category ? `/category/${category.slug}` : "/"} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:gap-3 transition-all">
                  <ArrowLeft className="h-4 w-4" />Back to {category ? category.name : "Home"}
                </Link>
              </div>

              {related.length > 0 && (
                <div className="mt-12 pt-8 border-t border-border">
                  <h3 className="text-xl font-bold text-foreground mb-4">Related Articles</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {related.map((ra) => (
                      <ArticleCard key={ra.id} article={ra} categories={categories} />
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </div>

          <aside className="space-y-6">
            <AdPlaceholder type="sidebar" />
            {related.length > 0 && (
              <div className="bg-card rounded-xl border border-border p-5">
                <h3 className="font-semibold text-foreground mb-3 text-sm">More in {category?.name}</h3>
                <div className="space-y-1">
                  {related.slice(0, 5).map((a) => (
                    <ArticleCard key={a.id} article={a} categories={categories} variant="compact" />
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </article>
    </Layout>
  );
};

export default ArticlePage;
