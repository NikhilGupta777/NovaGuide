
CREATE TABLE public.discover_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'running',
  topic_count INTEGER NOT NULL DEFAULT 0,
  topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.discover_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage discover_runs"
  ON public.discover_runs
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
