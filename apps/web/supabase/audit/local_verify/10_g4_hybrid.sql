-- Generation 4 — the shape apps/mobile/src/lib/supabase-adapter.ts adaptOrder()
-- actually writes: legacy web column names (profile_id, order_number, subtotal,
-- total) PLUS the mobile-era additions (reference, items, target_marketplace,
-- source_url, city). This is the most likely live schema, and the only one where
-- both order-number spellings coexist.
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id),
  order_number text UNIQUE,
  reference text,
  status text NOT NULL DEFAULT 'pending',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  service_fee numeric(12,2) DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  balance_due numeric(12,2) NOT NULL DEFAULT 0,
  payment_status text DEFAULT 'pending',
  payment_method text,
  currency text DEFAULT 'USD',
  shipping_method text,
  recipient_name text,
  phone text,
  city text,
  address text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  target_marketplace text,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.seed_orders() RETURNS void LANGUAGE sql AS $$
  INSERT INTO orders(id, profile_id, order_number, reference, status, subtotal, total, city, target_marketplace, items, created_at) VALUES
    ('11111111-1111-1111-1111-111111111111',
     '00000000-0000-0000-0000-00000000000b','CSQ-1','CS-1','completed',1000,1000,'Mogadishu',NULL,
     '[{"marketplace":"1688","total_price":600},{"marketplace":"jd","total_price":400}]'::jsonb,
     public.ts_today(1)),
    ('22222222-2222-2222-2222-222222222222',
     '00000000-0000-0000-0000-00000000000b','CSQ-2','CS-2','completed',500,500,'Hargeisa','taobao','[]'::jsonb,
     now() - interval '29 days'),
    ('33333333-3333-3333-3333-333333333333',
     '00000000-0000-0000-0000-00000000000b','CSQ-3','CS-3','shipped',250,250,'Bossaso',NULL,
     '[{"marketplace":"1688","total_price":"¥180"}]'::jsonb,
     now() - interval '45 days'),
    ('44444444-4444-4444-4444-444444444444',
     '00000000-0000-0000-0000-00000000000b','CSQ-4','CS-4','cancelled',9999,9999,'Mogadishu',NULL,
     '[{"marketplace":"1688","total_price":9999}]'::jsonb,
     public.ts_today(3)),
    ('99999999-9999-9999-9999-999999999999',
     '00000000-0000-0000-0000-00000000000b','CSQ-6','CS-6','completed',300,300,'Kismayo',NULL,
     '[{"marketplace_name":"1688"},{"app":"jd"}]'::jsonb,
     public.ts_today(2));
$$;

-- Same money as generation 1: total must resolve from `total`, not `total_usd`.
INSERT INTO expected_marketplace_revenue VALUES ('1688',1000),('jd',550),('taobao',500);

-- Used by 40_provenance.sql: insert one order carrying the item objects that
-- checkout.tsx writes today, in this generation's own column spelling.
CREATE FUNCTION public.insert_order(p_items jsonb) RETURNS uuid
LANGUAGE sql AS $$
  INSERT INTO orders(profile_id, order_number, reference, status, subtotal, total, city, items, created_at)
  VALUES ('00000000-0000-0000-0000-00000000000b', 'CSQ-PROV-' || nextval('public.prov_seq')::text, 'CS-PROV-' || nextval('public.prov_seq')::text, 'pending', 0,
          CASE WHEN p_items IS NULL THEN 0 ELSE 4173.12 END,
          'Mogadishu', coalesce(p_items, '[]'::jsonb), now())
  RETURNING id
$$;
  INSERT INTO public.generation_caps VALUES (true);
