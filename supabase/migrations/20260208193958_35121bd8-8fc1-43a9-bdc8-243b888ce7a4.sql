
-- Bug 8: Add updated_at column to nightly_builder_runs for progress tracking
ALTER TABLE public.nightly_builder_runs
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Bug 3: Create atomic increment functions for nightly_builder_runs counters
CREATE OR REPLACE FUNCTION public.increment_nightly_counter(
  _run_id UUID,
  _column TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _column = 'articles_generated' THEN
    UPDATE nightly_builder_runs 
    SET articles_generated = COALESCE(articles_generated, 0) + 1,
        updated_at = now()
    WHERE id = _run_id;
  ELSIF _column = 'articles_published' THEN
    UPDATE nightly_builder_runs 
    SET articles_published = COALESCE(articles_published, 0) + 1,
        updated_at = now()
    WHERE id = _run_id;
  ELSIF _column = 'articles_failed' THEN
    UPDATE nightly_builder_runs 
    SET articles_failed = COALESCE(articles_failed, 0) + 1,
        updated_at = now()
    WHERE id = _run_id;
  END IF;
END;
$$;
