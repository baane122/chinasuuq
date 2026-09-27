-- ============================================================
-- ChinaSuuq — Migration: publish the admin live tables to Realtime
-- 2026-09-25
--
-- Mission Control opens a single `admin-live` channel
-- (apps/web/src/app/admin/(protected)/layout.tsx) and listens for
-- INSERT/UPDATE on orders, sourcing_requests, notifications and shipments.
-- Postgres only streams row events for tables that are members of the
-- `supabase_realtime` publication, so without this the channel joins happily
-- and stays silent forever.
--
-- SECURITY: publication membership does not widen data access. Realtime
-- authorises each subscription with the connecting client's own JWT, role and
-- RLS policies, exactly as a SELECT would — rows a policy would filter out are
-- never sent to that subscriber. An admin and a customer watching the same
-- table receive different change streams. Adding a table here grants
-- visibility into the stream, not access to new data.
--
-- Idempotent: re-running is a no-op, and each table is checked with
-- to_regclass so this can be applied before or after the schema migrations on
-- a project where a table has not been created yet.
-- ============================================================

DO $$
DECLARE
    t TEXT;
BEGIN
    -- Realtime is created per-project; on a project where it was never enabled
    -- ALTER PUBLICATION would abort the whole migration over a statement whose
    -- only purpose is to subscribe a UI to a stream.
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        RAISE WARNING 'ChinaSuuq: publication supabase_realtime does not exist — enable Realtime for this project, then re-run this migration.';
        RETURN;
    END IF;

    FOREACH t IN ARRAY ARRAY[
        'orders',
        'sourcing_requests',
        'notifications',
        'shipments'
    ] LOOP
        IF to_regclass('public.' || t) IS NULL THEN
            RAISE NOTICE 'table public.% does not exist; skipped', t;
            CONTINUE;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_publication_tables
            WHERE pubname    = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename  = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
            RAISE NOTICE 'public.% added to supabase_realtime', t;
        END IF;
    END LOOP;
END $$;
