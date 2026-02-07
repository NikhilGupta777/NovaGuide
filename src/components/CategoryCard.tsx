import { Link } from "react-router-dom";
import type { Category } from "@/data/categories";

interface CategoryCardProps {
  category: Category;
}

const CategoryCard = ({ category }: CategoryCardProps) => {
  const Icon = category.icon;

  return (
    <Link
      to={`/category/${category.slug}`}
      className="group block p-6 rounded-xl bg-card border border-border card-elevated"
    >
      <div className={`w-12 h-12 rounded-lg ${category.bgClass} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
        <Icon className={`h-6 w-6 ${category.colorClass}`} />
      </div>
      <h3 className="font-semibold text-card-foreground mb-1 group-hover:text-primary transition-colors">
        {category.name}
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed mb-3">
        {category.description}
      </p>
      <span className="text-xs font-medium text-muted-foreground">
        {category.articleCount} articles
      </span>
    </Link>
  );
};

export default CategoryCard;
