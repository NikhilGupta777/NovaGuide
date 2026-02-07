import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import Layout from "@/components/Layout";
import SearchBar from "@/components/SearchBar";
import CategoryCard from "@/components/CategoryCard";
import ArticleCard from "@/components/ArticleCard";
import AdPlaceholder from "@/components/AdPlaceholder";
import { useCategories, useFeaturedArticles, useArticles } from "@/hooks/useDatabase";

const Index = () => {
  const { categories, loading: catsLoading } = useCategories();
  const { articles: featured, loading: featuredLoading } = useFeaturedArticles();
  const { articles: latest, loading: latestLoading } = useArticles();

  return (
    <Layout hideHeaderAd>
      {/* Hero Section */}
      <section className="hero-gradient relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-primary-foreground rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-20 w-96 h-96 bg-primary-foreground rounded-full blur-3xl" />
        </div>
        <div className="container relative py-16 md:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto"
          >
            <h1 className="text-3xl md:text-5xl font-extrabold text-primary-foreground mb-4 leading-tight">
              Digital Help for{" "}
              <span className="text-accent">Everyone</span>
            </h1>
            <p className="text-base md:text-lg text-primary-foreground/80 mb-8 leading-relaxed max-w-2xl mx-auto">
              Clear, step-by-step guides for your phone, computer, apps, social media, and everything digital. 
              No tech jargon — just solutions that work.
            </p>
            <SearchBar variant="hero" />
            <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
              <span className="text-xs text-primary-foreground/50">Popular:</span>
              {["Reset password", "Clear cache", "Screenshot", "WiFi fix"].map((term) => (
                <Link
                  key={term}
                  to={`/search?q=${encodeURIComponent(term)}`}
                  className="text-xs px-3 py-1 rounded-full bg-primary-foreground/10 text-primary-foreground/70 hover:bg-primary-foreground/20 transition-colors"
                >
                  {term}
                </Link>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Banner Ad after Hero */}
      <div className="container py-4 hidden md:block">
        <AdPlaceholder type="banner" />
      </div>

      {/* Categories Section */}
      <section className="container py-12 md:py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-foreground">Browse by Category</h2>
              <p className="text-muted-foreground mt-1">Find help for any device or platform</p>
            </div>
            <Link
              to="/categories"
              className="hidden md:inline-flex items-center gap-1 text-sm font-medium text-primary hover:gap-2 transition-all"
            >
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {catsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map((category, index) => (
                <motion.div
                  key={category.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                >
                  <CategoryCard category={category} />
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </section>

      {/* Featured Guides */}
      {!featuredLoading && featured.length > 0 && (
        <section className="bg-muted/50">
          <div className="container py-12 md:py-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">Featured Guides</h2>
              <p className="text-muted-foreground mb-8">Most popular solutions our readers love</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {featured.map((article, index) => (
                  <motion.div
                    key={article.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: index * 0.08 }}
                  >
                    <ArticleCard article={article} categories={categories} variant="featured" />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* Inline Ad */}
      <div className="container py-4">
        <AdPlaceholder type="inline" className="max-w-md mx-auto" />
      </div>

      {/* Latest Articles */}
      {!latestLoading && latest.length > 0 && (
        <section className="container py-12 md:py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">Latest Articles</h2>
            <p className="text-muted-foreground mb-8">Fresh guides added to help you daily</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {latest.slice(0, 6).map((article, index) => (
                <motion.div
                  key={article.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.06 }}
                >
                  <ArticleCard article={article} categories={categories} />
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>
      )}

      {/* CTA Section */}
      <section className="hero-gradient">
        <div className="container py-12 md:py-16 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-primary-foreground mb-3">
            Can't find what you need?
          </h2>
          <p className="text-primary-foreground/80 mb-6 max-w-lg mx-auto">
            Our knowledge base is growing every day with new guides powered by AI research. Try searching for your specific issue.
          </p>
          <SearchBar variant="hero" />
        </div>
      </section>
    </Layout>
  );
};

export default Index;
