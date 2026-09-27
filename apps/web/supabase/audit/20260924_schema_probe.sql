-- ============================================================
-- ChinaSuuq — READ-ONLY schema probe (not a migration)
-- Run this in the Supabase SQL editor and paste the output back.
-- Nothing here writes anything.
-- ============================================================
--
-- WHY THIS EXISTS
-- The repo carries THREE incompatible shapes for the orders tables, and the
-- code cannot tell which one the live database actually has:
--
--   1. migration 202408010007 defines orders(profile_id, subtotal, total,
--      order_number, target_marketplace, source_url) with NO `items` and NO
--      `reference` column, and a separate order_items table.
--   2. apps/web/supabase/migrations/20260813_admin_view_layer_corrected.sql
--      states the live schema is "user_id-based, *_usd money cols" and
--      references orders.user_id, subtotal_usd, total_usd, reference,
--      destination_city, delivery_address.
--   3. apps/mobile/src/lib/supabase-adapter.ts adaptOrder() writes
--      profile_id + order_number + subtotal + total (shape 1) AND
--      reference + items (shape 2 / neither).
--
-- Consequences that are invisible from source code alone:
--   • If the live table lacks `profile_id`, every mobile order upsert fails,
--     is swallowed by the empty catch in src/db/index.ts createOrder(), and
--     orders silently live only in AsyncStorage. Customers would appear to
--     have ordered nothing.
--   • If the live table has no `items` column, per-line data (which product,
--     which marketplace, MOQ) never reaches SQL at all, which is exactly why
--     admin_orders_view returns `NULL::jsonb AS items`.
--
-- So: probe first, migrate second.
-- ============================================================

-- 1. Which column names does the live orders table actually carry?
--    Look for user_id vs profile_id, subtotal_usd vs subtotal, items, reference.
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'orders'
ORDER BY ordinal_position;

-- 2. Same question for order_items: does it exist, and does it already carry
--    any marketplace provenance?
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'order_items'
ORDER BY ordinal_position;

-- 3. THE DECISIVE TEST — are mobile orders reaching the database at all?
--    0 rows here, while customers report placed orders, means the sync is
--    broken and this is the root cause of the admin visibility complaint.
SELECT
    count(*)                                   AS total_orders,
    count(*) FILTER (WHERE created_at > now() - interval '7 days')  AS orders_last_7d,
    count(*) FILTER (WHERE created_at > now() - interval '1 day')   AS orders_last_1d,
    max(created_at)                                                AS newest_order_at
FROM public.orders;

-- 4. Is line-item data present anywhere queryable?
--    Uses to_jsonb(o) rather than the bare column, so this still runs (and
--    simply reports 0) when the live table has no `items` column at all.
SELECT
    count(*)                                                AS orders_total,
    count(*) FILTER (WHERE jsonb_typeof(to_jsonb(o)->'items') = 'array') AS items_is_array,
    count(*) FILTER (WHERE jsonb_array_length(coalesce(to_jsonb(o)->'items','[]'::jsonb)) > 0) AS items_nonempty
FROM public.orders o;

-- 5. Sample a few real orders so the item JSON shape can be read exactly
--    (field names inside each item decide how the normalization maps them).
SELECT *
FROM public.orders
ORDER BY created_at DESC
LIMIT 3;

-- 6. Does order_items have any rows, and do they carry a marketplace?
--    Guarded so the probe still runs if the table was never created live.
DO $$
DECLARE n bigint;
BEGIN
    IF to_regclass('public.order_items') IS NULL THEN
        RAISE NOTICE 'order_items: DOES NOT EXIST on this project';
    ELSE
        EXECUTE 'SELECT count(*) FROM public.order_items' INTO n;
        RAISE NOTICE 'order_items rows: % (0 while orders exist means line items never leave the JSON blob)', n;
    END IF;
END $$;

-- 7. Which marketplaces exist, so the normalization can validate names?
SELECT name, display_name, marketplace_type, is_active
FROM public.marketplaces
ORDER BY name;

-- 8. Is the AI credential leak reachable right now? Expected BEFORE the fix:
--    1 row with a non-empty api_key. AFTER migration 202609240002: 0 rows here,
--    because the secret moves to ai_provider_config.
--    (Run as the postgres/service role in the SQL editor, not as anon.)
--    Reports only lengths and presence — never the key itself.
SELECT
    key,
    (coalesce(value->>'api_key', '') <> '')                   AS has_api_key,
    length(coalesce(value->>'api_key', ''))                   AS api_key_length,
    coalesce(value->>'base_url', '')                          AS base_url,
    coalesce(value->>'model', '')                             AS model,
    coalesce((value->>'is_configured')::text, '')             AS is_configured
FROM public.settings
WHERE key = 'ai_provider';

-- 9. Confirm ai_provider_config is invisible to anon/authenticated after the fix.
--    Guarded, because the table legitimately does not exist before the migration.
DO $$
BEGIN
    IF to_regclass('public.ai_provider_config') IS NULL THEN
        RAISE NOTICE 'ai_provider_config: DOES NOT EXIST YET — migration 202609240002 not applied';
    ELSE
        RAISE NOTICE 'ai_provider_config: exists. Rows visible to the CURRENT role: %',
            (SELECT count(*) FROM public.ai_provider_config);
        RAISE NOTICE '  (run as anon/authenticated to confirm 0; as service_role to confirm 1)';
    END IF;
END $$;

-- 10. Role check for the AI settings gate: requireAdmin() only accepts
--     'admin' or 'super_admin', and the live enum reportedly dropped 'admin',
--     so only super_admin users can save AI settings today. Verify:
SELECT enumlabel::text AS role
FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'user_role'
ORDER BY enumsortorder;

SELECT role, count(*) FROM public.profiles GROUP BY role ORDER BY role;

-- 11. Shared marketplace credentials exposed to anon (audit finding P0 #2):
--     how many shared accounts exist, and are they plaintext?
SELECT
    marketplace_type,
    account_label,
    is_shared,
    is_active,
    (username IS NOT NULL)  AS has_username,
    length(coalesce(password_encrypted,'')) AS password_length
FROM public.marketplace_accounts
WHERE is_shared = true
ORDER BY marketplace_type;
