
-- Create agent_runs table to track full pipeline execution
CREATE TABLE public.agent_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topic TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'auto_discover', 'batch'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'discovering', 'researching', 'writing', 'optimizing', 'completed', 'failed'
  current_step INTEGER NOT NULL DEFAULT 0,
  total_steps INTEGER NOT NULL DEFAULT 4,
  
  -- Pipeline data
  discovered_topics JSONB DEFAULT '[]'::jsonb,
  research_notes TEXT,
  research_sources JSONB DEFAULT '[]'::jsonb,
  generated_outline TEXT,
  
  -- Result
  article_id UUID REFERENCES public.articles(id) ON DELETE SET NULL,
  error_message TEXT,
  
  -- Timestamps
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Metadata
  model_used TEXT DEFAULT 'google/gemini-3-flash-preview',
  token_usage JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

-- Only admins can access pipeline runs
CREATE POLICY "Admins can view agent runs"
ON public.agent_runs FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert agent runs"
ON public.agent_runs FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update agent runs"
ON public.agent_runs FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete agent runs"
ON public.agent_runs FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create auto_generation_settings table
CREATE TABLE public.auto_generation_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  frequency TEXT NOT NULL DEFAULT 'daily', -- 'hourly', 'daily', 'weekly'
  articles_per_run INTEGER NOT NULL DEFAULT 3,
  target_categories JSONB DEFAULT '[]'::jsonb,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.auto_generation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage auto settings"
ON public.auto_generation_settings FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default settings row
INSERT INTO public.auto_generation_settings (enabled, frequency, articles_per_run) 
VALUES (false, 'daily', 3);
