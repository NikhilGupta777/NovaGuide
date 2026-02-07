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
      className="group block p-6 rounded-xl bg-card border border-border card-elevated"
    >
      <div className={`w-12 h-12 rounded-lg ${colors.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
        <Icon className={`h-6 w-6 ${colors.color}`} />
      </div>
      <h3 className="font-semibold text-card-foreground mb-1 group-hover:text-primary transition-colors">
        {category.name}
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {category.description}
      </p>
    </Link>
  );
};

export default CategoryCard;
