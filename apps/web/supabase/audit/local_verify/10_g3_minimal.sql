-- Generation 3 — the crash case: no items AND no target_marketplace column at all.
-- An earlier revision of admin_revenue_by_marketplace() probed information_schema
-- for `items` and then still named `target_marketplace`, aborting with
-- "column o2.target_marketplace does not exist". This generation is the reason
-- the function reads every field through to_jsonb().
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  order_number text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.seed_orders() RETURNS void LANGUAGE sql AS $$
  INSERT INTO orders(id, profile_id, order_number, status, subtotal, total, created_at) VALUES
    ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000b','CS-1','completed',1000,1000, public.ts_today(1)),
    ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-00000000000b','CS-2','completed', 500, 500, now() - interval '29 days'),
    ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-00000000000b','CS-3','shipped', 250, 250, now() - interval '45 days'),
    ('44444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-00000000000b','CS-4','cancelled',9999,9999, public.ts_today(3)),
    ('99999999-9999-9999-9999-999999999999','00000000-0000-0000-0000-00000000000b','CS-6','completed', 300, 300, public.ts_today(2));
$$;

-- Nothing is attributable in this generation: the whole 2050 must be honest.
INSERT INTO expected_marketplace_revenue VALUES ('Unattributed',2050);

-- g3: no items, no target_marketplace. Same contract as g2.
CREATE FUNCTION public.insert_order(p_items jsonb) RETURNS uuid
LANGUAGE sql AS $$
  INSERT INTO orders(order_number, profile_id, status, subtotal, total, created_at)
  VALUES ('CSQ-PROV-' || nextval('public.prov_seq')::text, '00000000-0000-0000-0000-00000000000b', 'pending', 0,
          CASE WHEN p_items IS NULL THEN 0 ELSE 4173.12 END, now())
  RETURNING id
$$;
  INSERT INTO public.generation_caps VALUES (false);
