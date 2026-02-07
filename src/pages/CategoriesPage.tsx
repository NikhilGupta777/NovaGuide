import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import Layout from "@/components/Layout";
import CategoryCard from "@/components/CategoryCard";
import { useCategories } from "@/hooks/useDatabase";

const CategoriesPage = () => {
  const { categories, loading } = useCategories();

  return (
    <Layout>
      <div className="container py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1 className="text-3xl font-bold text-foreground mb-2">All Categories</h1>
          <p className="text-muted-foreground mb-8">Browse help guides by topic</p>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map((category, index) => (
                <motion.div key={category.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: index * 0.05 }}>
                  <CategoryCard category={category} />
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </Layout>
  );
};

export default CategoriesPage;
