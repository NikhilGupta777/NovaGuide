import { Link } from "react-router-dom";
import { getIconComponent, getCategoryColors } from "@/lib/iconMap";
import type { Tables } from "@/integrations/supabase/types";

type DbCategory = Tables<"categories">;

interface CategoryCardProps {
  category: DbCategory;
}

const CategoryCard = ({ category }: CategoryCardProps) => {
  const Icon = getIconComponent(category.icon);
  const colors = getCategoryColors(category.icon);

  return (
    <Link
      to={`/category/${category.slug}`}
      className="group block p-6 rounded-xl bg-card border border-border card-elevated relative overflow-hidden"
    >
      <div className={`absolute top-0 right-0 w-24 h-24 ${colors.bg} rounded-full blur-[40px] opacity-0 group-hover:opacity-40 transition-opacity duration-500`} />
      <div className={`w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center mb-4 group-hover:scale-110 group-hover:shadow-lg transition-all duration-300`}>
        <Icon className={`h-6 w-6 ${colors.color}`} />
      </div>
      <h3 className="font-semibold text-card-foreground mb-1.5 group-hover:text-primary transition-colors">
        {category.name}
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mb-2">
        {category.description}
      </p>
      {(category.article_count ?? 0) > 0 && (
        <span className="text-xs text-muted-foreground">
          {category.article_count} article{category.article_count !== 1 ? "s" : ""}
        </span>
      )}
    </Link>
  );
};

export default CategoryCard;
