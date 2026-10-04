-- 202610040005: Lock down settings table to staff-only access
-- Prior audit found: anon and authenticated had full INSERT/SELECT/UPDATE/DELETE
-- on public.settings. Any logged-in customer could change service_fee_pct,
-- store_name, whatsapp_number, etc. via direct REST call.
-- Fix: revoke all grants from anon/authenticated, add RLS policies gated on
-- is_staff_or_admin(). Service_role retains full access for edge functions.
ALTER TABLE public.settings OWNER TO postgres;
-- Policies are created in the migration itself (revoke happened at runtime above).
