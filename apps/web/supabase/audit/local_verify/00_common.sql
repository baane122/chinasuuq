-- Shared Supabase-like stubs. Safe to run into a freshly created database.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

-- Supabase's bootstrap grants ALL on every table AND view created later in
-- `public` to anon and authenticated; RLS is what denies a customer on a table.
-- A plain view has no RLS of its own, so an auto-updatable single-table view is
-- writable by any signed-in customer unless the migration revokes it explicitly.
-- Without this the cluster has clean default privileges and 50_view_writes.sql
-- passes without proving anything (its own section 0 asserts this took effect).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text,
  role text DEFAULT 'customer',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid
);

CREATE TABLE public.shipments            (id uuid PRIMARY KEY, status text, created_at timestamptz DEFAULT now());
CREATE TABLE public.sourcing_requests    (id uuid PRIMARY KEY, status text, user_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.warehouse_packages   (id uuid PRIMARY KEY, status text, created_at timestamptz DEFAULT now());

-- Faithful to migration 202408010007's order_items, minus the foreign keys to
-- tables this harness does not stub (quote_items, source_products,
-- source_product_variants, suppliers). Those columns stay, so the provenance
-- migration's INSERT cannot lean on a column that the real table lacks.
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  quote_item_id uuid,
  source_product_id uuid,
  variant_id uuid,
  product_name text NOT NULL,
  description text,
  image_url text,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL,
  cost_price numeric(12,2),
  total_price numeric(12,2) NOT NULL,
  currency text DEFAULT 'USD',
  supplier_id uuid,
  supplier_order_reference text,
  supplier_status text,
  is_sourced boolean DEFAULT FALSE,
  is_purchased boolean DEFAULT FALSE,
  is_received boolean DEFAULT FALSE,
  is_inspected boolean DEFAULT FALSE,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.marketplaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  display_name text NOT NULL,
  base_url text,
  logo_url text,
  is_active boolean DEFAULT TRUE
);
INSERT INTO public.marketplaces(name, display_name, logo_url) VALUES
  ('1688','1688.com','/logos/1688.png'),
  ('jd','JD.com','/logos/jd.png'),
  ('taobao','Taobao','/logos/taobao.png');

-- Hand-derived expectations for the marketplace breakdown, per schema generation.
-- Each 1x_*.sql seed file fills this; the suite asserts against it, so one
-- physical fixture means three different things depending on what provenance
-- the generation actually stores.
CREATE TABLE public.expected_marketplace_revenue (
  marketplace text PRIMARY KEY,
  revenue numeric NOT NULL
);

CREATE OR REPLACE FUNCTION public.is_staff_or_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid)
      AND p.role IN ('staff','super_admin')
  )
$$;

-- The logical fixture is identical in every generation:
--   CS-1 completed 1000 today      lines: 1688=600, jd=400        -> proportional split
--   CS-2 completed  500 29d ago    no lines, order-level mp=taobao-> order-level attribution
--   CS-3 completed  250 45d ago    line mp=1688, money "¥180"     -> junk money must not cast-crash
--   CS-4 cancelled 9999 today      line mp=1688                   -> must be excluded everywhere
--   CS-6 completed  300 today      lines mp via alias keys, no $  -> even split
CREATE FUNCTION public.seed_fixture() RETURNS void LANGUAGE sql AS $$
  INSERT INTO profiles(id, role, created_at) VALUES
    ('00000000-0000-0000-0000-00000000000a','super_admin', now() - interval '100 days'),
    ('00000000-0000-0000-0000-00000000000b','customer',    now() - interval '10  days'),
    ('00000000-0000-0000-0000-00000000000c','staff',       now() - interval '3   days');
  INSERT INTO shipments VALUES
    ('55555555-5555-5555-5555-555555555555','in_transit', now()),
    ('55555555-5555-5555-5555-555555555556','delivered',  now());
  INSERT INTO sourcing_requests    VALUES ('66666666-6666-6666-6666-666666666666','pending',NULL,now());
  INSERT INTO warehouse_packages   VALUES ('88888888-8888-8888-8888-888888888888','received',now());
$$;

-- Ages are anchored to midnight, not to now(), so "today" stays "today" no
-- matter what time the suite runs.
CREATE FUNCTION public.ts_today(offset_min int) RETURNS timestamptz
LANGUAGE sql STABLE AS $$ SELECT date_trunc('day', now()) + make_interval(mins => offset_min) $$;

-- Whether this schema generation stores line items on the order row at all.
-- 40_provenance.sql reads this instead of guessing, so the same assertions
-- cover a generation that physically cannot carry provenance.
CREATE TABLE public.generation_caps (has_items boolean NOT NULL);

-- Makes every provenance-test order distinguishable, so a generation with a
-- UNIQUE order_number can be exercised repeatedly.
CREATE SEQUENCE public.prov_seq;

-- A mirror of migration 202408010004 — the marketplace's own vocabulary
-- (source_title, source_images, source_price, in_stock) — plus the TEXT
-- `marketplace` column 202408010014 added for mobile.
--
-- WHY IT WAS WRONG BEFORE: this stub used to carry title_english, images,
-- price_cny, price_usd_estimated, stock_status and sales_count, which exist in
-- NO migration. Every test that read them passed for the wrong reason, and it
-- actively hid a defect: admin_kpis() named stock_status inside dynamic SQL,
-- which Postgres resolves only when the statement runs, so the real dashboard
-- aborts with 42703 while this cluster printed PASS. Display and provenance
-- columns now arrive from their own migrations (run.sh applies them after this
-- file), so a missing ALTER fails here exactly as it would in production, and
-- 12_products_curated.sql sets the provenance the fixtures need once the
-- columns exist.
--
-- Dropped from the mirror: the FKs to categories/suppliers/variants (not
-- stubbed) and the `currency_type`/`product_status` enums, replaced by text —
-- the same substitution the orders stubs make, since the harness tests the
-- functions' tolerance rather than the enum spellings.
CREATE TABLE public.source_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id uuid NOT NULL REFERENCES public.marketplaces(id),
  marketplace text,
  category_id uuid,
  source_id text NOT NULL,
  source_url text NOT NULL,
  source_title text NOT NULL,
  source_description text,
  source_images text[] DEFAULT '{}'::text[],
  source_price numeric(12,2),
  source_currency text DEFAULT 'CNY',
  source_min_quantity integer DEFAULT 1,
  source_max_quantity integer,
  source_unit text DEFAULT 'piece',
  seller_name text,
  seller_id text,
  seller_rating numeric(3,2),
  seller_location text,
  moq integer DEFAULT 1,
  lead_time_days integer,
  in_stock boolean DEFAULT TRUE,
  stock_quantity integer,
  status text NOT NULL DEFAULT 'draft',
  quality_score numeric(3,1),
  is_verified boolean DEFAULT FALSE,
  verified_by uuid REFERENCES public.profiles(id),
  verified_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  sync_hash text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (marketplace_id, source_id)
);

-- The four rows the products_in_stock KPI counts (or must not). Stock is stated
-- the way an importer states it — the boolean — because that is all the base
-- schema has; 202609250004 derives the curated stock_status from it.
INSERT INTO public.source_products
    (marketplace_id, marketplace, source_id, source_url, source_title,
     source_price, in_stock, status)
SELECT (SELECT id FROM public.marketplaces WHERE name = '1688'), '1688',
       '1000000001', 'https://detail.1688.com/offer/1000000001.html', 'In stock A',
       10.00, TRUE, 'active'
UNION ALL
SELECT (SELECT id FROM public.marketplaces WHERE name = '1688'), '1688',
       '1000000002', 'https://detail.1688.com/offer/1000000002.html', 'In stock B',
       20.00, TRUE, 'active'
UNION ALL
SELECT (SELECT id FROM public.marketplaces WHERE name = 'jd'), 'jd',
       '2000000003', 'https://item.jd.com/2000000003.html', 'Out of stock',
       30.00, FALSE, 'active'
UNION ALL
SELECT (SELECT id FROM public.marketplaces WHERE name = 'taobao'), 'taobao',
       '3000000004', 'https://item.taobao.com/item.htm?id=3000000004', 'Draft lot',
       NULL, NULL, 'draft';

-- A row in the shape the mobile capture flow writes, with fixed ids the access
-- tests reference, and one un-provenanced product so the MOQ review queue is not
-- empty on a fresh cluster. Its MOQ provenance is set in 12_products_curated.sql:
-- moq_source does not exist yet at this point in the run.
INSERT INTO public.source_products(
    id, marketplace_id, marketplace, source_id, source_url, source_title,
    source_description, source_images, source_price, moq, source_min_quantity,
    in_stock, stock_quantity, status
) VALUES
  ('f0000000-0000-4000-8000-000000000001',
   (SELECT id FROM public.marketplaces WHERE name = '1688'), '1688',
   '741276720279', 'https://detail.1688.com/offer/741276720279.html', '测试商品',
   '一件代发 10件起批', ARRAY['https://cbu01.alicdn.com/img/cap.jpg'],
   12.50, 20, 1, TRUE, NULL, 'active'),
  ('f0000000-0000-4000-8000-000000000002',
   (SELECT id FROM public.marketplaces WHERE name = '1688'), '1688',
   '741276720280', 'https://detail.1688.com/offer/741276720280.html', '无 provenance 商品',
   NULL, '{}'::text[], 3.00, 1, 1, TRUE, NULL, 'draft')
ON CONFLICT (id) DO NOTHING;

-- Supabase ships an `auth` schema and auth.uid(); the 2026-09-25 migrations
-- reference both. Stub them the same way public.is_staff_or_admin() is stubbed,
-- so a view that filters on staff can be created and tested here.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE OR REPLACE FUNCTION auth.is_staff_or_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.is_staff_or_admin()
$$;

-- The provenance view, the MOQ review queue and the trending ranking all read
-- source_products, which the four order-schema generations do not create; the
-- single stub above is that table. It used to be duplicated here as a second
-- CREATE TABLE IF NOT EXISTS, which silently became a no-op after the first one
-- ran — so the columns the views name (source_id, moq_source, ...) never
-- existed and every test against them passed for the wrong reason.
