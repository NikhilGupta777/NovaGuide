
-- 1. Contact submissions table
CREATE TABLE public.contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit contact form" ON public.contact_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can read contact submissions" ON public.contact_submissions FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update contact submissions" ON public.contact_submissions FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete contact submissions" ON public.contact_submissions FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- 2. Email subscribers table
CREATE TABLE public.email_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  subscribed_at timestamptz DEFAULT now()
);
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can subscribe" ON public.email_subscribers FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can read subscribers" ON public.email_subscribers FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete subscribers" ON public.email_subscribers FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- 3. Article feedback table
CREATE TABLE public.article_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid REFERENCES public.articles(id) ON DELETE CASCADE NOT NULL,
  helpful boolean NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.article_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit feedback" ON public.article_feedback FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can read feedback" ON public.article_feedback FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- 4. Add view_count to articles
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS view_count integer DEFAULT 0;

-- 5. Increment view count function
CREATE OR REPLACE FUNCTION public.increment_view_count(_slug text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE articles SET view_count = view_count + 1 WHERE slug = _slug AND status = 'published';
$$;

-- 6. Full-text search vector column + trigger
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION public.update_article_search_vector()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.excerpt, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'C');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_search_vector
BEFORE INSERT OR UPDATE OF title, excerpt, content ON public.articles
FOR EACH ROW EXECUTE FUNCTION public.update_article_search_vector();

CREATE INDEX IF NOT EXISTS idx_articles_search_vector ON public.articles USING GIN(search_vector);

-- Backfill existing articles
UPDATE public.articles SET search_vector =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(excerpt, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(content, '')), 'C');

-- 7. Full-text search function
CREATE OR REPLACE FUNCTION public.search_articles(search_query text)
RETURNS SETOF articles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM articles
  WHERE status = 'published'
    AND search_vector @@ plainto_tsquery('english', search_query)
  ORDER BY ts_rank(search_vector, plainto_tsquery('english', search_query)) DESC
  LIMIT 50;
$$;

-- 8. Article count sync trigger on categories
CREATE OR REPLACE FUNCTION public.sync_category_article_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE categories SET article_count = (
      SELECT count(*) FROM articles WHERE category_id = NEW.category_id AND status = 'published'
    ) WHERE id = NEW.category_id;
  END IF;
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.category_id IS DISTINCT FROM NEW.category_id) THEN
    UPDATE categories SET article_count = (
      SELECT count(*) FROM articles WHERE category_id = OLD.category_id AND status = 'published'
    ) WHERE id = OLD.category_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_sync_article_count
AFTER INSERT OR UPDATE OR DELETE ON public.articles
FOR EACH ROW EXECUTE FUNCTION public.sync_category_article_count();

-- Backfill counts
UPDATE categories SET article_count = (
  SELECT count(*) FROM articles WHERE articles.category_id = categories.id AND articles.status = 'published'
);
