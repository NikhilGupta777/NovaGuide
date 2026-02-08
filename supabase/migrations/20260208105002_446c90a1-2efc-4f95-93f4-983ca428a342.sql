-- Backfill search_vector for articles where it may be NULL
UPDATE public.articles SET
  search_vector = setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                  setweight(to_tsvector('english', coalesce(excerpt, '')), 'B') ||
                  setweight(to_tsvector('english', coalesce(content, '')), 'C')
WHERE search_vector IS NULL;

-- Sync category article_count
UPDATE public.categories SET article_count = (
  SELECT count(*) FROM public.articles
  WHERE articles.category_id = categories.id AND articles.status = 'published'
);