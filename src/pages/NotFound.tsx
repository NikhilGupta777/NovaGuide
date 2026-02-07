import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import Layout from "@/components/Layout";
import SEOHead from "@/components/SEOHead";
import { SearchX } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <Layout>
      <SEOHead title="Page Not Found" noIndex />
      <div className="container py-20 text-center max-w-lg mx-auto">
        <SearchX className="h-16 w-16 text-muted-foreground mx-auto mb-6" />
        <h1 className="text-4xl font-bold text-foreground mb-3">404</h1>
        <p className="text-lg text-muted-foreground mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
        >
          Go back home
        </Link>
      </div>
    </Layout>
  );
};

export default NotFound;
