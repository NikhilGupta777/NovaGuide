import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type DbArticle = Tables<"articles">;
type DbCategory = Tables<"categories">;

export function useArticles() {
  const [articles, setArticles] = useState<DbArticle[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchArticles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("articles")
      .select("*")
      .eq("status", "published")
      .order("published_at", { ascending: false });

    if (!error && data) setArticles(data);
    setLoading(false);
  };

  useEffect(() => { fetchArticles(); }, []);

  return { articles, loading, refetch: fetchArticles };
}

export function useAllArticles() {
  const [articles, setArticles] = useState<DbArticle[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchArticles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("articles")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) setArticles(data);
    setLoading(false);
  };

  useEffect(() => { fetchArticles(); }, []);

  return { articles, loading, refetch: fetchArticles };
}

export function useArticleBySlug(slug: string) {
  const [article, setArticle] = useState<DbArticle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("articles")
      .select("*")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle()
      .then(({ data }) => {
        setArticle(data);
        setLoading(false);
      });
  }, [slug]);

  return { article, loading };
}

export function useCategories() {
  const [categories, setCategories] = useState<DbCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        if (data) setCategories(data);
        setLoading(false);
      });
  }, []);

  return { categories, loading };
}

export function useFeaturedArticles() {
  const [articles, setArticles] = useState<DbArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("articles")
      .select("*")
      .eq("status", "published")
      .eq("featured", true)
      .order("published_at", { ascending: false })
      .limit(4)
      .then(({ data }) => {
        if (data) setArticles(data);
        setLoading(false);
      });
  }, []);

  return { articles, loading };
}

export function useSearchArticles(query: string) {
  const [articles, setArticles] = useState<DbArticle[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setArticles([]);
      return;
    }
    setLoading(true);
    // Sanitize query: escape special Postgres LIKE chars and limit length
    const sanitized = query.trim().slice(0, 200).replace(/%/g, "\\%").replace(/_/g, "\\_");
    supabase
      .from("articles")
      .select("*")
      .eq("status", "published")
      .or(`title.ilike.%${sanitized}%,excerpt.ilike.%${sanitized}%`)
      .order("published_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setArticles(data);
        setLoading(false);
      });
  }, [query]);

  return { articles, loading };
}

export function useArticlesByCategory(categoryId: string | undefined) {
  const [articles, setArticles] = useState<DbArticle[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!categoryId) {
      setArticles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("articles")
      .select("*")
      .eq("status", "published")
      .eq("category_id", categoryId)
      .order("published_at", { ascending: false })
      .then(({ data }) => {
        if (data) setArticles(data);
        setLoading(false);
      });
  }, [categoryId]);

  return { articles, loading };
}
