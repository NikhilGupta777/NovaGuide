import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import Layout from "@/components/Layout";
import BreadcrumbNav from "@/components/BreadcrumbNav";
import ArticleCard from "@/components/ArticleCard";
import SearchBar from "@/components/SearchBar";
import AdPlaceholder from "@/components/AdPlaceholder";
import { searchArticles } from "@/data/articles";
import { SearchX } from "lucide-react";

const SearchPage = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const results = query ? searchArticles(query) : [];

  return (
    <Layout>
      <div className="container py-8">
        <BreadcrumbNav items={[{ label: `Search: "${query}"` }]} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
            Search Results
          </h1>
          <p className="text-muted-foreground mb-6">
            {results.length > 0
              ? `Found ${results.length} result${results.length !== 1 ? "s" : ""} for "${query}"`
              : query
              ? `No results found for "${query}"`
              : "Enter a search term to find articles"}
          </p>

          <SearchBar variant="hero" initialQuery={query} className="mb-8" />

          {/* Banner Ad */}
          <div className="mb-8 hidden md:block">
            <AdPlaceholder type="banner" />
          </div>

          {results.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map((article, index) => (
                <motion.div
                  key={article.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.06 }}
                >
                  <ArticleCard article={article} />
                </motion.div>
              ))}
            </div>
          ) : query ? (
            <div className="text-center py-16">
              <SearchX className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No articles found</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Try different keywords or browse our categories to find what you need.
              </p>
            </div>
          ) : null}
        </motion.div>
      </div>
    </Layout>
  );
};

export default SearchPage;
