import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import Layout from "@/components/Layout";
import BreadcrumbNav from "@/components/BreadcrumbNav";
import ArticleCard from "@/components/ArticleCard";
import AdPlaceholder from "@/components/AdPlaceholder";
import { useCategories, useArticlesByCategory } from "@/hooks/useDatabase";
import { getIconComponent, getCategoryColors } from "@/lib/iconMap";

const CategoryPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const { categories, loading: catsLoading } = useCategories();
  const category = categories.find((c) => c.slug === slug);
  const { articles: categoryArticles, loading: articlesLoading } = useArticlesByCategory(category?.id);

  if (catsLoading) {
    return (
      <Layout>
        <div className="container py-16 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!category) {
    return (
      <Layout>
        <div className="container py-16 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Category Not Found</h1>
          <p className="text-muted-foreground mb-4">The category you're looking for doesn't exist.</p>
          <Link to="/" className="text-primary font-medium hover:underline">Go back home</Link>
        </div>
      </Layout>
    );
  }

  const Icon = getIconComponent(category.icon);
  const colors = getCategoryColors(category.icon);

  return (
    <Layout>
      <div className="container py-8">
        <BreadcrumbNav items={[{ label: category.name }]} />

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-10">
          <div className="flex items-center gap-4 mb-4">
            <div className={`w-14 h-14 rounded-xl ${colors.bg} flex items-center justify-center`}>
              <Icon className={`h-7 w-7 ${colors.color}`} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">{category.name}</h1>
              <p className="text-muted-foreground">{category.description}</p>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {articlesLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : categoryArticles.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {categoryArticles.map((article, index) => (
                  <motion.div key={article.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: index * 0.08 }}>
                    <ArticleCard article={article} categories={categories} />
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-muted/50 rounded-xl">
                <p className="text-muted-foreground">No articles in this category yet. Check back soon!</p>
              </div>
            )}
            <div className="mt-8"><AdPlaceholder type="inline" className="max-w-md mx-auto" /></div>
          </div>

          <aside className="space-y-6">
            <AdPlaceholder type="sidebar" />
            <div className="bg-card rounded-xl border border-border p-5">
              <h3 className="font-semibold text-foreground mb-3 text-sm">Other Categories</h3>
              <div className="space-y-1">
                {categories.filter((c) => c.id !== category.id).map((cat) => {
                  const CatIcon = getIconComponent(cat.icon);
                  const catColors = getCategoryColors(cat.icon);
                  return (
                    <Link key={cat.id} to={`/category/${cat.slug}`} className="flex items-center gap-3 py-2 px-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                      <CatIcon className={`h-4 w-4 ${catColors.color}`} />{cat.name}
                    </Link>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </Layout>
  );
};

export default CategoryPage;
