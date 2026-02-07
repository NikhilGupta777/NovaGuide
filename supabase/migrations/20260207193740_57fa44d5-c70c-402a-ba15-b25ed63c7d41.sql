
-- Drop the overly permissive policy
DROP POLICY "Service role can manage agent logs" ON public.agent_logs;

-- Replace with a proper policy: edge functions use service role key which bypasses RLS
-- So we don't need an explicit "true" policy. Instead, only allow admin insert from client.
