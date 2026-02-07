
-- Add sources column to articles table (JSONB for storing source URLs)
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS sources jsonb DEFAULT '[]'::jsonb;

-- Add factual_score column to agent_runs table
ALTER TABLE public.agent_runs ADD COLUMN IF NOT EXISTS factual_score integer;

-- Update default total_steps from 4 to 6
ALTER TABLE public.agent_runs ALTER COLUMN total_steps SET DEFAULT 6;

-- Enable pg_cron and pg_net extensions for scheduled autonomous runs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
