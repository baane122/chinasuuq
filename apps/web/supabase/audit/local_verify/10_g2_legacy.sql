-- Generation 2 — the original migration 202408010007 shape: profile_id / order_number /
-- subtotal / total, real Postgres ENUMS for status and marketplace, and no items
-- column at all (line items live in the separate order_items table, which mobile
-- never writes). Enum status is the important case here: _order_revenue_status()
-- compares to_jsonb-derived text, which must survive an enum column.
CREATE TYPE public.order_status       AS ENUM ('pending','confirmed','processing','shipped','delivered','completed','cancelled','refunded');
CREATE TYPE public.marketplace_type   AS ENUM ('alibaba','taobao','tmall','1688','yiwugo','pinduoduo','jd','china_goods','dollar_store');

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  status public.order_status NOT NULL DEFAULT 'pending',
  currency text DEFAULT 'USD',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  balance_due numeric(12,2) NOT NULL DEFAULT 0,
  shipping_method text,
  target_marketplace public.marketplace_type,
  source_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.seed_orders() RETURNS void LANGUAGE sql AS $$
  INSERT INTO orders(id, order_number, profile_id, status, total, target_marketplace, created_at) VALUES
    ('11111111-1111-1111-1111-111111111111','CS-1','00000000-0000-0000-0000-00000000000b','completed',1000,NULL, public.ts_today(1)),
    ('22222222-2222-2222-2222-222222222222','CS-2','00000000-0000-0000-0000-00000000000b','completed', 500,'taobao', now() - interval '29 days'),
    ('33333333-3333-3333-3333-333333333333','CS-3','00000000-0000-0000-0000-00000000000b','shipped',   250,NULL, now() - interval '45 days'),
    ('44444444-4444-4444-4444-444444444444','CS-4','00000000-0000-0000-0000-00000000000b','cancelled',9999,NULL, public.ts_today(3)),
    ('99999999-9999-9999-9999-999999999999','CS-6','00000000-0000-0000-0000-00000000000b','completed', 300,NULL, public.ts_today(2));

  -- order_items rows exist in this generation but the rollups deliberately do
  -- not depend on them being populated; prove a populated table changes nothing.
    -- A staff-typed line, created without naming `origin`: this function body is
  -- analysed at CREATE FUNCTION time, which runs before migration 19 adds the
  -- column. The ALTER backfills it to 'staff', which is the point.
  INSERT INTO order_items(id, order_id, product_name, unit_price, total_price)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001',
          '11111111-1111-1111-1111-111111111111', 'Staff-added line', 10, 10);
$$;

-- No line-level provenance exists in this generation, so only CS-2's order-level
-- marketplace is attributable; the rest must honestly say Unattributed.
-- 2050 - 500 = 1550 unattributed.
INSERT INTO expected_marketplace_revenue VALUES ('taobao',500),('Unattributed',1550);

-- g2 has no items column at all, so the argument is deliberately ignored: this
-- is the generation where provenance cannot exist, and the sync must cope.
CREATE FUNCTION public.insert_order(p_items jsonb) RETURNS uuid
LANGUAGE sql AS $$
  INSERT INTO orders(order_number, profile_id, status, total, created_at)
  VALUES ('CSQ-PROV-' || nextval('public.prov_seq')::text, '00000000-0000-0000-0000-00000000000b', 'pending',
          CASE WHEN p_items IS NULL THEN 0 ELSE 4173.12 END, now())
  RETURNING id
$$;
  INSERT INTO public.generation_caps VALUES (false);
