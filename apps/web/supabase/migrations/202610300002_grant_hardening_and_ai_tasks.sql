-- 2026-10-30  Grant hardening + AI task consolidation
--
-- APPLIED TO THE LIVE PROJECT on 2026-10-30 via psql (the Supabase CLI cannot
-- reach this project and the management token is revoked). This file exists so
-- the state is reproducible and reviewable, not because it still needs running.
--
-- WHY: RLS was the only thing protecting the data from the public anon key.
-- anon held INSERT/UPDATE/DELETE on 53 of 57 public tables and on both
-- reporting views, so one careless policy would have been a breach rather than
-- a near-miss. Anonymous DELETE through order_tracking_public actually returned
-- 204 (data survived only because order_items had a foreign key).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Views are read-only. A view is a projection, never a write surface.
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.order_tracking_public FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.order_tracking_public TO anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.admin_orders_view FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.admin_orders_view TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. anon loses every write grant except the guest quote form.
--    No screen performs an anonymous UPDATE or DELETE, so this changes no
--    behaviour; it removes the entire class of "policy mistake = breach".
--    sourcing_requests keeps INSERT: that is the public quote form, and its
--    RLS policy already scopes the row (user_id is nullable for guests).
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format(
      'REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon', t);
    IF t <> 'sourcing_requests' THEN
      EXECUTE format('REVOKE INSERT ON public.%I FROM anon', t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Shared translation cache.
--    A string translated on one device is reused on every other device.
--    Read-only for anon: a translation cache is not secret. Writes stay with
--    service_role and the ai-translate function.
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.translations TO anon, authenticated;

DROP POLICY IF EXISTS translations_public_read ON public.translations;
CREATE POLICY translations_public_read ON public.translations
  FOR SELECT TO anon, authenticated USING (true);

-- ---------------------------------------------------------------------------
-- 4. Translation is Google gtx from the device, not a paid model.
--    Removing the task row means no code path can resolve a provider for it,
--    so paid translation cannot be switched back on by accident. The
--    ai-translate function remains deployed for direct callers.
-- ---------------------------------------------------------------------------
DELETE FROM public.ai_provider_tasks WHERE task = 'translation';

-- ---------------------------------------------------------------------------
-- 5. Copilot latency. Measured against the live provider on 2026-10-30:
--      [反重力次]gemini-3.7-flash-high  2.36s copilot / 6.28s translation
--      gemini-3.1-flash-image          1.56s copilot / 1.98s translation
--    gemini-3.1-flash-image is 3.2x faster on a real prompt and is also the
--    vision model, so chat and image understanding share one warm provider.
-- ---------------------------------------------------------------------------
UPDATE public.ai_provider_tasks
   SET model = 'gemini-3.1-flash-image', updated_at = now()
 WHERE task IN ('copilot', 'vision', 'extraction');

COMMIT;

-- ---------------------------------------------------------------------------
-- ROLLBACK (if ever needed)
--   GRANT INSERT, UPDATE, DELETE ON public.<table> TO anon;
--   GRANT INSERT, UPDATE, DELETE ON public.order_tracking_public TO anon;
--   INSERT INTO public.ai_provider_tasks(task, model) VALUES ('translation', '<model>');
-- ---------------------------------------------------------------------------
