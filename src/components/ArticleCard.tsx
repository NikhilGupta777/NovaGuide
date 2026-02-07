import { Link } from "react-router-dom";
import { Clock, ArrowRight } from "lucide-react";
import type { Article } from "@/data/articles";
import { categories } from "@/data/categories";

interface ArticleCardProps {
  article: Article;
  variant?: "default" | "featured" | "compact";
}

const ArticleCard = ({ article, variant = "default" }: ArticleCardProps) => {
  const category = categories.find((c) => c.id === article.categoryId);

  if (variant === "featured") {
    return (
      <Link
        to={`/article/${article.slug}`}
        className="group block p-6 rounded-xl bg-card border border-border card-elevated"
      >
        <div className="flex items-center gap-2 mb-3">
          {category && (
            <span className={`category-badge ${category.bgClass} ${category.colorClass}`}>
              {category.name}
            </span>
          )}
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {article.readTime} min read
          </span>
        </div>
        <h3 className="text-lg font-semibold text-card-foreground mb-2 group-hover:text-primary transition-colors leading-snug">
          {article.title}
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          {article.excerpt}
        </p>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-primary group-hover:gap-2 transition-all">
          Read guide <ArrowRight className="h-4 w-4" />
        </span>
      </Link>
    );
  }

  if (variant === "compact") {
    return (
      <Link
        to={`/article/${article.slug}`}
        className="group flex items-start gap-4 p-4 rounded-lg hover:bg-muted/50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-card-foreground group-hover:text-primary transition-colors text-sm leading-snug mb-1">
            {article.title}
          </h4>
          <div className="flex items-center gap-2">
            {category && (
              <span className="text-xs text-muted-foreground">{category.name}</span>
            )}
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{article.readTime} min</span>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors mt-1 flex-shrink-0" />
      </Link>
    );
  }

  return (
    <Link
      to={`/article/${article.slug}`}
      className="group block p-5 rounded-xl bg-card border border-border card-elevated"
    >
      <div className="flex items-center gap-2 mb-2">
        {category && (
          <span className={`category-badge ${category.bgClass} ${category.colorClass}`}>
            {category.name}
          </span>
        )}
      </div>
      <h3 className="font-semibold text-card-foreground mb-2 group-hover:text-primary transition-colors leading-snug">
        {article.title}
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed mb-3 line-clamp-2">
        {article.excerpt}
      </p>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {article.readTime} min read
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
          Read <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
};

export default ArticleCard;
