ALTER TABLE public.content_audit_runs ADD COLUMN IF NOT EXISTS fix_all_status text DEFAULT null;
-- Values: null (not started), 'fixing' (in progress), 'fixed' (completed)
-- This allows the client to resume fix-all after a refresh