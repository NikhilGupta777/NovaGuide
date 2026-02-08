import { Link } from "react-router-dom";
import { Clock, ArrowRight, Eye, Bookmark as BookmarkIcon } from "lucide-react";
import { getIconComponent, getCategoryColors } from "@/lib/iconMap";
import { useBookmarks } from "@/hooks/useBookmarks";
import type { Tables } from "@/integrations/supabase/types";

type DbArticle = Tables<"articles">;
type DbCategory = Tables<"categories">;

interface ArticleCardProps {
  article: DbArticle;
  categories?: DbCategory[];
  variant?: "default" | "featured" | "compact";
}

const ArticleCard = ({ article, categories = [], variant = "default" }: ArticleCardProps) => {
  const category = categories.find((c) => c.id === article.category_id);
  const colors = category ? getCategoryColors(category.icon) : null;
  const { toggleBookmark, isBookmarked } = useBookmarks();
  const bookmarked = isBookmarked(article.slug);
  const viewCount = article.view_count || 0;

  const handleBookmark = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleBookmark(article.slug);
  };

  if (variant === "featured") {
    return (
      <Link
        to={`/article/${article.slug}`}
        className="group block p-6 rounded-xl bg-card border border-border card-elevated relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/60 to-accent/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="flex items-center gap-2 mb-3">
          {category && colors && (
            <span className={`category-badge ${colors.bg} ${colors.color}`}>{category.name}</span>
          )}
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />{article.read_time} min read
          </span>
          {viewCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Eye className="h-3 w-3" />{viewCount}
            </span>
          )}
          <button onClick={handleBookmark} className="ml-auto p-1 rounded hover:bg-muted transition-colors" aria-label="Bookmark">
            <BookmarkIcon className={`h-4 w-4 ${bookmarked ? "fill-primary text-primary" : "text-muted-foreground"}`} />
          </button>
        </div>
        <h3 className="text-lg font-semibold text-card-foreground mb-2 group-hover:text-primary transition-colors leading-snug">{article.title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4 line-clamp-3">{article.excerpt}</p>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary group-hover:gap-2.5 transition-all">
          Read guide <ArrowRight className="h-4 w-4" />
        </span>
      </Link>
    );
  }

  if (variant === "compact") {
    return (
      <Link to={`/article/${article.slug}`} className="group flex items-start gap-4 p-4 rounded-lg hover:bg-muted/50 transition-colors">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-card-foreground group-hover:text-primary transition-colors text-sm leading-snug mb-1">{article.title}</h4>
          <div className="flex items-center gap-2">
            {category && <span className="text-xs text-muted-foreground">{category.name}</span>}
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{article.read_time} min</span>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors mt-1 flex-shrink-0" />
      </Link>
    );
  }

  return (
    <Link to={`/article/${article.slug}`} className="group block p-5 rounded-xl bg-card border border-border card-elevated">
      <div className="flex items-center gap-2 mb-2">
        {category && colors && (
          <span className={`category-badge ${colors.bg} ${colors.color}`}>{category.name}</span>
        )}
        <button onClick={handleBookmark} className="ml-auto p-1 rounded hover:bg-muted transition-colors" aria-label="Bookmark">
          <BookmarkIcon className={`h-3.5 w-3.5 ${bookmarked ? "fill-primary text-primary" : "text-muted-foreground"}`} />
        </button>
      </div>
      <h3 className="font-semibold text-card-foreground mb-2 group-hover:text-primary transition-colors leading-snug">{article.title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed mb-3 line-clamp-2">{article.excerpt}</p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />{article.read_time} min read
          </span>
          {viewCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Eye className="h-3 w-3" />{viewCount}
            </span>
          )}
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
          Read <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
};

export default ArticleCard;
