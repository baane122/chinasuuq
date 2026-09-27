-- ============================================================
-- ChinaSuuq — Migration: live catalog events + one-request category counts
-- 2026-09-27
--
-- Two load-time costs on Mission Control:
--
--  1. The admin shell listens for realtime writes on orders, sourcing_requests,
--     notifications and shipments only. Products therefore refreshed on an
--     unrelated order event and never on a catalog edit — the one thing the
--     Products screen is about. source_products and payments join the same
--     publication so each screen can watch only the tables it reads.
--
--  2. The dashboard's popular-categories badges had no stored product_count, so
--     every debounced burst ran one head-count per category (twelve today) on
--     top of the KPI batch. admin_category_product_counts() answers all of them
--     in one request, group-wise, and is not bounded by PostgREST's row limit.
--
-- SECURITY: the count function is SECURITY DEFINER because it aggregates other
-- users' rows past RLS, so it refuses a caller who is not staff/super_admin
-- through the same gate the rollups use (_require_admin_metrics_access), and
-- EXECUTE is revoked from anon. Publication membership grants visibility into
-- the change stream, not access to new data: Realtime authorises each
-- subscription with the connecting client's JWT, role and RLS policies exactly
-- as a SELECT would.
-- ============================================================

-- ─── 1. Publish the catalog and payment tables ───────────────────
DO $$
DECLARE
    t TEXT;
BEGIN
    -- Realtime is provisioned per project; on a project where it was never
    -- enabled, ALTER PUBLICATION would abort the migration for a statement whose
    -- only job is to feed a UI indicator.
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        RAISE WARNING 'ChinaSuuq: publication supabase_realtime does not exist — enable Realtime for this project, then re-run this migration.';
        RETURN;
    END IF;

    FOREACH t IN ARRAY ARRAY['source_products', 'payments'] LOOP
        IF to_regclass('public.' || t) IS NULL THEN
            RAISE NOTICE 'table public.% does not exist; skipped', t;
            CONTINUE;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
            RAISE NOTICE 'public.% added to supabase_realtime', t;
        END IF;
    END LOOP;
END $$;

-- ─── 2. Category product counts in one round trip ───────────────
-- Rows are keyed by the categories table, not by source_products, so a category
-- with no products still answers 0 instead of vanishing from the panel.
CREATE OR REPLACE FUNCTION public.admin_category_product_counts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v jsonb;
BEGIN
    PERFORM public._require_admin_metrics_access();

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', c.id,
                'name_en', c.name_en,
                'slug', c.slug,
                'image_url', c.image_url,
                'sort_order', c.sort_order,
                'product_count', (
                    SELECT count(*)::int
                    FROM public.source_products p
                    WHERE p.category_id = c.id
                )
            )
            ORDER BY c.sort_order, c.name_en
        ),
        '[]'::jsonb
    )
    INTO v
    FROM public.categories c
    WHERE c.is_active = true;

    RETURN v;
END $$;

COMMENT ON FUNCTION public.admin_category_product_counts() IS
    'Staff-only: active categories with a live head-count of source_products per category, in one request.';

REVOKE EXECUTE ON FUNCTION public.admin_category_product_counts() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_category_product_counts() TO authenticated;

-- PostgREST must learn the new function before the dashboard calls it.
NOTIFY pgrst, 'reload schema';
