-- Fix 1: Add updated_at to nightly_builder_queue for proper stale detection
ALTER TABLE public.nightly_builder_queue 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Set existing rows
UPDATE public.nightly_builder_queue SET updated_at = created_at WHERE updated_at IS NULL;

-- Add auto-update trigger for nightly_builder_queue
CREATE TRIGGER update_nightly_builder_queue_updated_at
BEFORE UPDATE ON public.nightly_builder_queue
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Fix 2: Change dangerous defaults on nightly_builder_queue
ALTER TABLE public.nightly_builder_queue ALTER COLUMN run_date SET DEFAULT NULL;
ALTER TABLE public.nightly_builder_queue ALTER COLUMN batch_number SET DEFAULT NULL;

-- Fix 3: Add auto-update trigger for nightly_builder_runs (updated_at column already exists)
CREATE TRIGGER update_nightly_builder_runs_updated_at
BEFORE UPDATE ON public.nightly_builder_runs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Fix 7: Disable orphaned auto_generation_settings
UPDATE public.auto_generation_settings SET enabled = false;