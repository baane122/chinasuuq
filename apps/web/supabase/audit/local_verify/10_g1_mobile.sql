-- Generation 1 — "mobile/live" shape: user_id + *_usd + items jsonb + target_marketplace.
-- This is the shape the admin pages and supabase.ts were written against.
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id),
  reference text,
  status text DEFAULT 'pending',
  payment_status text DEFAULT 'pending',
  subtotal_usd numeric(14,2),
  total_usd numeric(14,2),
  shipping_method text,
  destination_city text,
  target_marketplace text,
  source_url text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE FUNCTION public.seed_orders() RETURNS void LANGUAGE sql AS $$
  INSERT INTO orders(id, user_id, reference, status, total_usd, destination_city, target_marketplace, items, created_at) VALUES
    ('11111111-1111-1111-1111-111111111111',
     '00000000-0000-0000-0000-00000000000b','CS-1','completed',1000,'Mogadishu',NULL,
     '[{"marketplace":"1688","total_price":600},{"marketplace":"jd","total_price":400}]'::jsonb,
     public.ts_today(1)),
    ('22222222-2222-2222-2222-222222222222',
     '00000000-0000-0000-0000-00000000000b','CS-2','completed',500,'Hargeisa','taobao','[]'::jsonb,
     now() - interval '29 days'),
    ('33333333-3333-3333-3333-333333333333',
     '00000000-0000-0000-0000-00000000000b','CS-3','shipped',250,'Bossaso',NULL,
     '[{"marketplace":"1688","total_price":"¥180"}]'::jsonb,
     now() - interval '45 days'),
    ('44444444-4444-4444-4444-444444444444',
     '00000000-0000-0000-0000-00000000000b','CS-4','cancelled',9999,'Mogadishu',NULL,
     '[{"marketplace":"1688","total_price":9999}]'::jsonb,
     public.ts_today(3)),
    ('99999999-9999-9999-9999-999999999999',
     '00000000-0000-0000-0000-00000000000b','CS-6','completed',300,'Kismayo',NULL,
     '[{"marketplace_name":"1688"},{"app":"jd"}]'::jsonb,
     public.ts_today(2));
$$;

-- 1688: 600 (CS-1 proportional) + 250 (CS-3 junk money -> even split) + 150 (CS-6 no money -> even split) = 1000
--   jd: 400 (CS-1 proportional) + 150 (CS-6 even split) = 550
-- taobao: 500 (CS-2, order-level provenance, no lines)
-- CS-4 cancelled contributes nothing to any bucket.
INSERT INTO expected_marketplace_revenue VALUES ('1688',1000),('jd',550),('taobao',500);

-- Used by 40_provenance.sql: insert one order carrying the item objects that
-- checkout.tsx writes today, in this generation's own column spelling.
CREATE FUNCTION public.insert_order(p_items jsonb) RETURNS uuid
LANGUAGE sql AS $$
  INSERT INTO orders(user_id, reference, status, total_usd, destination_city, items, created_at)
  VALUES ('00000000-0000-0000-0000-00000000000b', 'CS-PROV-' || nextval('public.prov_seq')::text, 'pending',
          CASE WHEN p_items IS NULL THEN 0 ELSE 4173.12 END,
          'Mogadishu', coalesce(p_items, '[]'::jsonb), now())
  RETURNING id
$$;
  INSERT INTO public.generation_caps VALUES (true);
