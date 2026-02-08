import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2, TrendingUp } from "lucide-react";
import Layout from "@/components/Layout";
import SEOHead from "@/components/SEOHead";
import SearchBar from "@/components/SearchBar";
import CategoryCard from "@/components/CategoryCard";
import ArticleCard from "@/components/ArticleCard";
import AdPlaceholder from "@/components/AdPlaceholder";
import AskAISection from "@/components/AskAISection";
import NewsletterSignup from "@/components/NewsletterSignup";
import { useCategories, useFeaturedArticles, useArticles, usePopularArticles } from "@/hooks/useDatabase";

const Index = () => {
  const { categories, loading: catsLoading } = useCategories();
  const { articles: featured, loading: featuredLoading } = useFeaturedArticles();
  const { articles: latest, loading: latestLoading } = useArticles();
  const { articles: popular, loading: popularLoading } = usePopularArticles(6);

  return (
    <Layout hideHeaderAd>
      <SEOHead />
      {/* Hero Section */}
      <section className="hero-gradient relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.07]">
          <div className="absolute top-10 left-[10%] w-80 h-80 bg-primary-foreground rounded-full blur-[100px]" />
          <div className="absolute bottom-0 right-[15%] w-[28rem] h-[28rem] bg-primary-foreground rounded-full blur-[120px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-accent rounded-full blur-[160px] opacity-30" />
        </div>
        <div className="container relative py-20 md:py-28">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} className="text-center max-w-3xl mx-auto">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, delay: 0.1 }} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/10 mb-6">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="text-xs font-medium text-primary-foreground/80">AI-powered guides updated daily</span>
            </motion.div>
            <h1 className="text-4xl md:text-6xl font-extrabold text-primary-foreground mb-5 leading-[1.1] tracking-tight">
              Digital Help for{" "}
              <span className="text-accent relative">
                Everyone
                <svg className="absolute -bottom-1 left-0 w-full h-2 text-accent/40" viewBox="0 0 200 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 5.5C47 2 153 2 199 5.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                </svg>
              </span>
            </h1>
            <p className="text-base md:text-xl text-primary-foreground/75 mb-10 leading-relaxed max-w-2xl mx-auto">
              Clear, step-by-step guides for your phone, computer, apps, social media, and everything digital. No tech jargon — just solutions that work.
            </p>
            <SearchBar variant="hero" />
            <div className="flex flex-wrap items-center justify-center gap-2 mt-8">
              <span className="text-xs text-primary-foreground/40 font-medium">Popular:</span>
              {["Reset password", "Clear cache", "Screenshot", "WiFi fix"].map((term, i) => (
                <motion.div key={term} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.5 + i * 0.08 }}>
                  <Link to={`/search?q=${encodeURIComponent(term)}`} className="text-xs px-3.5 py-1.5 rounded-full bg-primary-foreground/10 text-primary-foreground/70 hover:bg-primary-foreground/20 hover:text-primary-foreground transition-all duration-200 backdrop-blur-sm border border-primary-foreground/5">
                    {term}
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <div className="container py-4 hidden md:block">
        <AdPlaceholder type="banner" />
      </div>

      {/* Categories */}
      <section className="container py-12 md:py-16">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-foreground">Browse by Category</h2>
              <p className="text-muted-foreground mt-1">Find help for any device or platform</p>
            </div>
            <Link to="/categories" className="hidden md:inline-flex items-center gap-1 text-sm font-medium text-primary hover:gap-2 transition-all">
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {catsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map((category, index) => (
                <motion.div key={category.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: index * 0.05 }}>
                  <CategoryCard category={category} />
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </section>

      {/* Featured Guides */}
      {!featuredLoading && featured.length > 0 && (
        <section className="bg-muted/40 border-y border-border/50">
          <div className="container py-14 md:py-20">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
              <div className="flex items-end justify-between mb-8">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary mb-2 block">Handpicked</span>
                  <h2 className="text-2xl md:text-3xl font-bold text-foreground">Featured Guides</h2>
                  <p className="text-muted-foreground mt-1">Most popular solutions our readers love</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {featured.map((article, index) => (
                  <motion.div key={article.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: index * 0.08 }}>
                    <ArticleCard article={article} categories={categories} variant="featured" />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* Most Popular */}
      {!popularLoading && popular.length > 0 && (
        <section className="container py-14 md:py-20">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">Trending</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-1">Most Popular</h2>
            <p className="text-muted-foreground mb-8">Guides readers visit the most</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {popular.map((article, index) => (
                <motion.div key={article.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: index * 0.06 }}>
                  <ArticleCard article={article} categories={categories} />
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>
      )}

      <AskAISection />

      <div className="container py-4">
        <AdPlaceholder type="inline" className="max-w-md mx-auto" />
      </div>

      {/* Latest Articles */}
      {!latestLoading && latest.length > 0 && (
        <section className="container py-14 md:py-20">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
            <span className="text-xs font-semibold uppercase tracking-wider text-primary mb-2 block">Recently added</span>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-1">Latest Articles</h2>
            <p className="text-muted-foreground mb-8">Fresh guides added to help you daily</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {latest.slice(0, 6).map((article, index) => (
                <motion.div key={article.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: index * 0.06 }}>
                  <ArticleCard article={article} categories={categories} />
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>
      )}

      {/* Newsletter CTA */}
      <section className="bg-muted/40 border-y border-border/50">
        <div className="container py-12 text-center">
          <h2 className="text-xl font-bold text-foreground mb-2">Never miss a guide</h2>
          <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">Subscribe to get the latest articles and tips delivered directly to your inbox.</p>
          <div className="max-w-sm mx-auto">
            <NewsletterSignup />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="hero-gradient relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.05]">
          <div className="absolute top-0 right-[20%] w-64 h-64 bg-primary-foreground rounded-full blur-[80px]" />
        </div>
        <div className="container relative py-16 md:py-20 text-center">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
            <h2 className="text-2xl md:text-4xl font-bold text-primary-foreground mb-4">Can't find what you need?</h2>
            <p className="text-primary-foreground/75 mb-8 max-w-lg mx-auto text-base md:text-lg">Our knowledge base is growing every day with new guides powered by AI research. Try searching for your specific issue.</p>
            <SearchBar variant="hero" />
          </motion.div>
        </div>
      </section>
    </Layout>
  );
};

export default Index;
