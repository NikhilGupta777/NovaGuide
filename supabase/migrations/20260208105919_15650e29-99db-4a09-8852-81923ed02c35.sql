CREATE OR REPLACE FUNCTION public.get_recommended_articles(
  _article_id uuid,
  _limit integer DEFAULT 6
)
RETURNS SETOF articles
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH current AS (
    SELECT id, category_id, tags FROM articles WHERE id = _article_id
  ),
  scored AS (
    SELECT 
      a.id AS aid,
      (CASE WHEN a.category_id = c.category_id THEN 3 ELSE 0 END)
      + COALESCE(
        (SELECT count(*)::int * 2 FROM unnest(a.tags) t WHERE t = ANY(c.tags)),
        0
      )
      + LEAST(COALESCE(a.view_count, 0)::float / GREATEST(
        (SELECT MAX(view_count) FROM articles WHERE status = 'published'), 1
      ), 1.0)
      AS relevance_score
    FROM articles a, current c
    WHERE a.id != c.id
      AND a.status = 'published'
  )
  SELECT a.*
  FROM scored s
  JOIN articles a ON a.id = s.aid
  ORDER BY s.relevance_score DESC, a.published_at DESC
  LIMIT _limit;
$$;