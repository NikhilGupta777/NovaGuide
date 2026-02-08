import { Link } from "react-router-dom";
import { BookOpen, Menu, X, Bookmark } from "lucide-react";
import { useState } from "react";
import SearchBar from "./SearchBar";
import AdPlaceholder from "./AdPlaceholder";
import BackToTop from "./BackToTop";
import ThemeToggle from "./ThemeToggle";
import NewsletterSignup from "./NewsletterSignup";
import { useCategories } from "@/hooks/useDatabase";

interface LayoutProps {
  children: React.ReactNode;
  hideHeaderAd?: boolean;
}

const Layout = ({ children, hideHeaderAd = false }: LayoutProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { categories } = useCategories();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {!hideHeaderAd && (
        <div className="container py-2 hidden md:block">
          <AdPlaceholder type="banner" />
        </div>
      )}

      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <span className="font-bold text-lg text-foreground leading-none block">DigitalHelp</span>
              <span className="text-[10px] text-muted-foreground leading-none">Your Tech Guide</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Home</Link>
            <Link to="/categories" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Categories</Link>
            <Link to="/about" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">About</Link>
            <Link to="/contact" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Contact</Link>
          </nav>

          <div className="flex items-center gap-2">
            <div className="hidden md:block w-64">
              <SearchBar variant="compact" />
            </div>
            <Link to="/bookmarks" className="p-2 rounded-lg hover:bg-muted transition-colors" aria-label="Bookmarks">
              <Bookmark className="h-4 w-4 text-muted-foreground" />
            </Link>
            <div className="relative">
              <ThemeToggle />
            </div>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-foreground"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-background p-4 space-y-4 animate-fade-in">
            <SearchBar variant="compact" />
            <nav className="flex flex-col gap-2">
              <Link to="/" onClick={() => setMobileMenuOpen(false)} className="py-2 text-sm font-medium text-foreground">Home</Link>
              <Link to="/categories" onClick={() => setMobileMenuOpen(false)} className="py-2 text-sm font-medium text-foreground">Categories</Link>
              <Link to="/bookmarks" onClick={() => setMobileMenuOpen(false)} className="py-2 text-sm font-medium text-foreground">Bookmarks</Link>
              <Link to="/about" onClick={() => setMobileMenuOpen(false)} className="py-2 text-sm font-medium text-foreground">About</Link>
              <Link to="/contact" onClick={() => setMobileMenuOpen(false)} className="py-2 text-sm font-medium text-foreground">Contact</Link>
              {categories.length > 0 && (
                <div className="border-t border-border pt-2 mt-2">
                  <p className="text-xs text-muted-foreground mb-2">Browse by category</p>
                  {categories.slice(0, 6).map((cat) => (
                    <Link key={cat.id} to={`/category/${cat.slug}`} onClick={() => setMobileMenuOpen(false)} className="block py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                      {cat.name}
                    </Link>
                  ))}
                </div>
              )}
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <div className="container py-4">
        <AdPlaceholder type="footer" />
      </div>

      <footer className="border-t border-border bg-card">
        <div className="container py-12">
          {/* Newsletter */}
          <div className="mb-10 text-center">
            <h3 className="text-lg font-bold text-foreground mb-2">Stay Updated</h3>
            <p className="text-sm text-muted-foreground mb-4">Get the latest guides delivered to your inbox.</p>
            <div className="max-w-sm mx-auto">
              <NewsletterSignup variant="footer" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <Link to="/" className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                  <BookOpen className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="font-bold text-foreground">DigitalHelp</span>
              </Link>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Your trusted source for clear, beginner-friendly tech guides and digital solutions.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-3 text-sm">Top Categories</h4>
              <ul className="space-y-2">
                {categories.slice(0, 5).map((cat) => (
                  <li key={cat.id}>
                    <Link to={`/category/${cat.slug}`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{cat.name}</Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-3 text-sm">More Categories</h4>
              <ul className="space-y-2">
                {categories.slice(5).map((cat) => (
                  <li key={cat.id}>
                    <Link to={`/category/${cat.slug}`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{cat.name}</Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-3 text-sm">Company</h4>
              <ul className="space-y-2">
                <li><Link to="/about" className="text-sm text-muted-foreground hover:text-foreground transition-colors">About</Link></li>
                <li><Link to="/contact" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Contact</Link></li>
                <li><Link to="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</Link></li>
                <li><Link to="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Terms of Use</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-border mt-8 pt-6 text-center">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} DigitalHelp. All rights reserved. Built to help everyone navigate the digital world.
            </p>
          </div>
        </div>
      </footer>

      <BackToTop />
    </div>
  );
};

export default Layout;
