-- 202610040006: Enable RLS on ai_provider_config and ai_provider_tasks
-- These tables store plaintext API keys. They were accessible via service_role
-- but had no RLS policies, meaning any function with security_invoker=true
-- could leak rows. Lock down to super_admin (config) and staff+super_admin (tasks).
ALTER TABLE public.ai_provider_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_provider_tasks ENABLE ROW LEVEL SECURITY;
-- Policies created at runtime.
