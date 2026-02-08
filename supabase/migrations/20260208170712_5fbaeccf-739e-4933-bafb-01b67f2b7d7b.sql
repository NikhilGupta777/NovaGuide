
-- ═══════════════════════════════════════════════════════════
-- Consolidated schema from all migration files
-- ═══════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- =============================================
-- 1. ROLE SYSTEM
-- =============================================
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can read own role" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- =============================================
-- 2. CATEGORIES
-- =============================================
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT DEFAULT 'Lightbulb',
  sort_order INTEGER DEFAULT 0,
  article_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categories are publicly readable" ON public.categories
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage categories" ON public.categories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- 3. ARTICLES
-- =============================================
CREATE TABLE public.articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT,
  content TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'draft',
  featured BOOLEAN DEFAULT false,
  read_time INTEGER DEFAULT 3,
  tags TEXT[] DEFAULT '{}',
  seo_title TEXT,
  seo_description TEXT,
  ai_generated BOOLEAN DEFAULT false,
  featured_image TEXT,
  author_id UUID,
  sources JSONB DEFAULT '[]',
  view_count INTEGER DEFAULT 0,
  search_vector tsvector,
  published_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published articles are publicly readable" ON public.articles
  FOR SELECT USING (status = 'published' OR (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin')));

CREATE POLICY "Admins can manage articles" ON public.articles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_articles_search_vector ON public.articles USING GIN(search_vector);

-- =============================================
-- 4. AGENT RUNS
-- =============================================
CREATE TABLE public.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT,
  mode TEXT DEFAULT 'manual',
  status TEXT DEFAULT 'pending',
  current_step INTEGER DEFAULT 0,
  total_steps INTEGER DEFAULT 6,
  discovered_topics JSONB DEFAULT '[]',
  model_used TEXT DEFAULT 'google/gemini-3-flash-preview',
  research_notes TEXT,
  research_sources JSONB DEFAULT '[]',
  generated_outline TEXT,
  article_id UUID REFERENCES public.articles(id) ON DELETE SET NULL,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  token_usage JSONB DEFAULT '{}',
  factual_score NUMERIC,
  quality_score NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage agent_runs" ON public.agent_runs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- 5. AGENT LOGS
-- =============================================
CREATE TABLE public.agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  details JSONB DEFAULT '{}',
  article_id UUID REFERENCES public.articles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage agent_logs" ON public.agent_logs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- 6. AUTO GENERATION SETTINGS
-- =============================================
CREATE TABLE public.auto_generation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled BOOLEAN DEFAULT false,
  frequency TEXT DEFAULT 'daily',
  articles_per_run INTEGER DEFAULT 3,
  target_categories JSONB DEFAULT '[]',
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.auto_generation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage auto settings" ON public.auto_generation_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- 7. NIGHTLY BUILDER SETTINGS
-- =============================================
CREATE TABLE public.nightly_builder_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled BOOLEAN DEFAULT false,
  topics_per_category INTEGER DEFAULT 50,
  auto_publish_min_quality INTEGER DEFAULT 7,
  auto_publish_min_factual INTEGER DEFAULT 7,
  allow_category_creation BOOLEAN DEFAULT true,
  stop_requested BOOLEAN DEFAULT false,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.nightly_builder_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage nightly settings" ON public.nightly_builder_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- 8. NIGHTLY BUILDER RUNS
-- =============================================
CREATE TABLE public.nightly_builder_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT DEFAULT 'pending',
  batch_number INTEGER DEFAULT 1,
  total_categories_processed INTEGER DEFAULT 0,
  categories_created INTEGER DEFAULT 0,
  total_topics_found INTEGER DEFAULT 0,
  total_after_dedup INTEGER DEFAULT 0,
  articles_generated INTEGER DEFAULT 0,
  articles_published INTEGER DEFAULT 0,
  articles_failed INTEGER DEFAULT 0,
  details JSONB DEFAULT '{}',
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.nightly_builder_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage nightly runs" ON public.nightly_builder_runs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- 9. NIGHTLY BUILDER QUEUE
-- =============================================
CREATE TABLE public.nightly_builder_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date DATE DEFAULT CURRENT_DATE,
  batch_number INTEGER DEFAULT 1,
  topic TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  priority INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  article_id UUID REFERENCES public.articles(id) ON DELETE SET NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.nightly_builder_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage nightly queue" ON public.nightly_builder_queue
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_nightly_builder_queue_batch ON public.nightly_builder_queue(run_date, batch_number, status);
CREATE INDEX idx_nightly_builder_runs_status ON public.nightly_builder_runs(status, created_at DESC);

-- =============================================
-- 10. CONTENT AUDIT RUNS
-- =============================================
CREATE TABLE public.content_audit_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT DEFAULT 'pending',
  total_articles_scanned INTEGER DEFAULT 0,
  total_issues_found INTEGER DEFAULT 0,
  auto_fixes_applied INTEGER DEFAULT 0,
  duplicates_found INTEGER DEFAULT 0,
  articles_set_to_draft INTEGER DEFAULT 0,
  fix_all_status TEXT DEFAULT null,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.content_audit_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage audit runs" ON public.content_audit_runs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- 11. CONTENT AUDIT FINDINGS
-- =============================================
CREATE TABLE public.content_audit_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.content_audit_runs(id) ON DELETE CASCADE NOT NULL,
  article_id UUID REFERENCES public.articles(id) ON DELETE CASCADE,
  article_title TEXT,
  issue_type TEXT NOT NULL,
  severity TEXT DEFAULT 'info',
  description TEXT NOT NULL,
  suggestion TEXT,
  auto_fixed BOOLEAN DEFAULT false,
  fix_applied TEXT,
  related_article_id UUID,
  related_article_title TEXT,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.content_audit_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage audit findings" ON public.content_audit_findings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- 12. DISCOVER RUNS
-- =============================================
CREATE TABLE public.discover_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'running',
  topic_count INTEGER NOT NULL DEFAULT 0,
  topics JSONB NOT NULL DEFAULT '[]',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.discover_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage discover_runs" ON public.discover_runs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- 13. CONTACT SUBMISSIONS
-- =============================================
CREATE TABLE public.contact_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit contact form" ON public.contact_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can read contact submissions" ON public.contact_submissions FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update contact submissions" ON public.contact_submissions FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete contact submissions" ON public.contact_submissions FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- =============================================
-- 14. EMAIL SUBSCRIBERS
-- =============================================
CREATE TABLE public.email_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  subscribed_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can subscribe" ON public.email_subscribers FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can read subscribers" ON public.email_subscribers FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete subscribers" ON public.email_subscribers FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- =============================================
-- 15. ARTICLE FEEDBACK
-- =============================================
CREATE TABLE public.article_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES public.articles(id) ON DELETE CASCADE NOT NULL,
  helpful BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.article_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit feedback" ON public.article_feedback FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can read feedback" ON public.article_feedback FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- =============================================
-- FUNCTIONS & TRIGGERS
-- =============================================

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_articles_updated_at BEFORE UPDATE ON public.articles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_auto_generation_settings_updated_at BEFORE UPDATE ON public.auto_generation_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_nightly_builder_settings_updated_at BEFORE UPDATE ON public.nightly_builder_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Increment view count
CREATE OR REPLACE FUNCTION public.increment_view_count(_slug text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE articles SET view_count = view_count + 1 WHERE slug = _slug AND status = 'published';
$$;

-- Full-text search vector trigger
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

-- Full-text search function
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

-- Category article count sync
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

-- Recommended articles function
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

-- =============================================
-- SEED DATA
-- =============================================
INSERT INTO public.categories (name, slug, description, icon, sort_order) VALUES
  ('Phone & Mobile', 'phone-mobile', 'Fix common phone issues, settings, and mobile tips for Android & iPhone', 'Smartphone', 1),
  ('Tablets', 'tablets', 'iPad, Android tablets, setup guides and troubleshooting', 'Tablet', 2),
  ('Desktop & Computer', 'desktop-computer', 'Windows, Mac, and Linux guides for all your computer needs', 'Monitor', 3),
  ('Apps & Software', 'apps-software', 'How to use popular apps, install software, and fix app issues', 'AppWindow', 4),
  ('YouTube', 'youtube', 'YouTube tips, channel management, and video solutions', 'Youtube', 5),
  ('Social Media', 'social-media', 'Facebook, Instagram, TikTok, X, and more social media help', 'Share2', 6),
  ('Accounts & Login', 'accounts-login', 'Password recovery, account security, and login troubleshooting', 'KeyRound', 7),
  ('Files & Documents', 'files-documents', 'PDF, file conversion, storage, and document management', 'FileText', 8),
  ('General How-To', 'general-how-to', 'Everyday tech tips, quick fixes, and helpful digital guides', 'Lightbulb', 9);

-- Default auto generation settings
INSERT INTO public.auto_generation_settings (enabled, frequency, articles_per_run) 
VALUES (false, 'daily', 3);
