import { Loader2, Bookmark } from "lucide-react";
import Layout from "@/components/Layout";
import SEOHead from "@/components/SEOHead";
import BreadcrumbNav from "@/components/BreadcrumbNav";
import ArticleCard from "@/components/ArticleCard";
import { useBookmarks } from "@/hooks/useBookmarks";
import { useArticles, useCategories } from "@/hooks/useDatabase";

const BookmarksPage = () => {
  const { bookmarks } = useBookmarks();
  const { articles, loading } = useArticles();
  const { categories } = useCategories();

  const saved = articles.filter((a) => bookmarks.includes(a.slug));

  return (
    <Layout>
      <SEOHead title="Bookmarks" description="Your saved articles" noIndex />
      <div className="container py-8">
        <BreadcrumbNav items={[{ label: "Bookmarks" }]} />
        <div className="flex items-center gap-3 mb-6">
          <Bookmark className="h-6 w-6 text-primary" />
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Saved Articles</h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : saved.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {saved.map((article) => (
              <ArticleCard key={article.id} article={article} categories={categories} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-muted/50 rounded-xl">
            <Bookmark className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-foreground mb-1">No saved articles</h3>
            <p className="text-muted-foreground text-sm">Click the bookmark icon on any article to save it for later.</p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default BookmarksPage;
