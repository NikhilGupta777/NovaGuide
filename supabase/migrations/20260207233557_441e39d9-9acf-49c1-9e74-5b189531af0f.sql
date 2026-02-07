
-- ═══════════════════════════════════════════════════════════
-- Full Schema: user_roles, categories, articles, agent_runs,
-- agent_logs, auto_generation_settings, nightly_builder_*,
-- content_audit_*
-- ═══════════════════════════════════════════════════════════

-- 1. User Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
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

-- 2. Categories
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

-- 3. Articles
CREATE TABLE public.articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT,
  content TEXT,
  category_id UUID REFERENCES public.categories(id),
  status TEXT DEFAULT 'draft',
  featured BOOLEAN DEFAULT false,
  read_time INTEGER DEFAULT 3,
  tags TEXT[] DEFAULT '{}',
  seo_title TEXT,
  seo_description TEXT,
  ai_generated BOOLEAN DEFAULT false,
  author_id UUID,
  sources JSONB DEFAULT '[]',
  published_at TIMESTAMPTZ,
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

-- 4. Agent Runs
CREATE TABLE public.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT,
  mode TEXT DEFAULT 'manual',
  status TEXT DEFAULT 'pending',
  current_step INTEGER DEFAULT 0,
  total_steps INTEGER DEFAULT 6,
  model_used TEXT,
  research_notes TEXT,
  research_sources JSONB,
  generated_outline TEXT,
  article_id UUID,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  token_usage JSONB,
  factual_score NUMERIC,
  quality_score NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage agent_runs" ON public.agent_runs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. Agent Logs
CREATE TABLE public.agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT,
  status TEXT,
  article_id UUID,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage agent_logs" ON public.agent_logs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. Auto Generation Settings
CREATE TABLE public.auto_generation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled BOOLEAN DEFAULT false,
  frequency TEXT DEFAULT 'daily',
  articles_per_run INTEGER DEFAULT 5,
  target_categories TEXT[],
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

-- 7. Nightly Builder Settings
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

-- 8. Nightly Builder Runs
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
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.nightly_builder_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage nightly runs" ON public.nightly_builder_runs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 9. Nightly Builder Queue
CREATE TABLE public.nightly_builder_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date DATE DEFAULT CURRENT_DATE,
  batch_number INTEGER DEFAULT 1,
  topic TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id),
  priority INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  article_id UUID,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.nightly_builder_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage nightly queue" ON public.nightly_builder_queue
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 10. Content Audit Runs
CREATE TABLE public.content_audit_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT DEFAULT 'pending',
  total_articles_scanned INTEGER DEFAULT 0,
  total_issues_found INTEGER DEFAULT 0,
  auto_fixes_applied INTEGER DEFAULT 0,
  duplicates_found INTEGER DEFAULT 0,
  articles_set_to_draft INTEGER DEFAULT 0,
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

-- 11. Content Audit Findings
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

-- Updated_at trigger function
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
