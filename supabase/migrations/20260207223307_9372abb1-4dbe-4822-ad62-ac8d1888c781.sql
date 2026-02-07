
-- =====================================================
-- Nightly Content Builder: 3 new tables + RLS policies
-- =====================================================

-- 1. nightly_builder_settings: Configuration table
CREATE TABLE public.nightly_builder_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  topics_per_category integer NOT NULL DEFAULT 50,
  auto_publish_min_quality integer NOT NULL DEFAULT 7,
  auto_publish_min_factual integer NOT NULL DEFAULT 7,
  allow_category_creation boolean NOT NULL DEFAULT true,
  stop_requested boolean NOT NULL DEFAULT false,
  last_run_at timestamp with time zone,
  next_run_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.nightly_builder_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage nightly builder settings"
  ON public.nightly_builder_settings
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_nightly_builder_settings_updated_at
  BEFORE UPDATE ON public.nightly_builder_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. nightly_builder_runs: Tracks each execution
CREATE TABLE public.nightly_builder_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status text NOT NULL DEFAULT 'pending',
  batch_number integer NOT NULL DEFAULT 1,
  total_categories_processed integer NOT NULL DEFAULT 0,
  categories_created integer NOT NULL DEFAULT 0,
  total_topics_found integer NOT NULL DEFAULT 0,
  total_after_dedup integer NOT NULL DEFAULT 0,
  articles_generated integer NOT NULL DEFAULT 0,
  articles_published integer NOT NULL DEFAULT 0,
  articles_failed integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.nightly_builder_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage nightly builder runs"
  ON public.nightly_builder_runs
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. nightly_builder_queue: Topics split across time-slot batches
CREATE TABLE public.nightly_builder_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_date date NOT NULL DEFAULT CURRENT_DATE,
  batch_number integer NOT NULL DEFAULT 1,
  topic text NOT NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  priority integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.nightly_builder_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage nightly builder queue"
  ON public.nightly_builder_queue
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Index for efficient queue lookups
CREATE INDEX idx_nightly_builder_queue_batch ON public.nightly_builder_queue(run_date, batch_number, status);
CREATE INDEX idx_nightly_builder_runs_status ON public.nightly_builder_runs(status, created_at DESC);
