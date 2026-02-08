import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface SearchBarProps {
  variant?: "hero" | "compact";
  className?: string;
  initialQuery?: string;
}

const SearchBar = ({ variant = "compact", className = "", initialQuery = "" }: SearchBarProps) => {
  const [query, setQuery] = useState(initialQuery);
  const navigate = useNavigate();

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  if (variant === "hero") {
    return (
      <form onSubmit={handleSubmit} className={`w-full max-w-2xl mx-auto ${className}`}>
        <div className="relative search-glow rounded-xl bg-card border border-border">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for any tech help... e.g., 'reset iPhone password'"
            className="w-full pl-12 pr-28 py-4 text-base bg-transparent rounded-xl outline-none text-foreground placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Search
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`${className}`}>
      <div className="relative search-glow rounded-lg bg-card border border-border">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search articles..."
          className="w-full pl-9 pr-4 py-2 text-sm bg-transparent rounded-lg outline-none text-foreground placeholder:text-muted-foreground"
        />
      </div>
    </form>
  );
};

export default SearchBar;
