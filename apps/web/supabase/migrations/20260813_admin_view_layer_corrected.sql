-- ============================================================
-- ChinaSuuq - Migration 15 (corrected admin view layer + settings)
-- Adapted to the ACTUAL live schema (user_id-based, *_usd money cols)
-- Resolves the divergence in migration 014 which referenced a
-- profile_id/subtotal schema that does not exist on this project.
-- ============================================================

-- ─── 1. settings table (key/value JSONB) ─────────────────────
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_select" ON public.settings;
CREATE POLICY "settings_select" ON public.settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "settings_modify" ON public.settings;
CREATE POLICY "settings_modify" ON public.settings FOR ALL USING (public.is_staff_or_admin() OR auth.uid() IS NULL);

INSERT INTO public.settings (key, value) VALUES
  ('store_name', '"ChinaSuuq"'::jsonb),
  ('support_email', '"support@chinasuuq.com"'::jsonb),
  ('whatsapp_number', '"8615277074143"'::jsonb),
  ('default_language', '"en"'::jsonb),
  ('service_fee_pct', '5'::jsonb),
  ('min_order_usd', '20'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ─── 2. customer_payment_methods table ───────────────────────
CREATE TABLE IF NOT EXISTS public.customer_payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL,
    method TEXT NOT NULL,
    identifier TEXT,
    label TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpm_profile ON public.customer_payment_methods(profile_id);
ALTER TABLE public.customer_payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cpm_own" ON public.customer_payment_methods;
CREATE POLICY "cpm_own" ON public.customer_payment_methods
  FOR ALL USING (profile_id = auth.uid());

-- ─── 3. Admin views (mapped to live schema) ───────────────────

-- admin_orders_view: maps live orders (user_id, *_usd) to the column
-- names the admin web app selects.
DROP VIEW IF EXISTS public.admin_orders_view;
CREATE OR REPLACE VIEW public.admin_orders_view AS
SELECT
  o.id,
  o.reference AS order_number,
  o.reference,
  o.user_id AS profile_id,
  p.full_name AS customer_name,
  NULL::text AS customer_email,
  p.phone AS customer_phone,
  o.status::text AS status,
  o.payment_status::text AS payment_status,
  NULL::text AS payment_method,
  o.shipping_method::text AS shipping_method,
  o.subtotal_usd AS subtotal,
  o.shipping_estimate_usd AS shipping_cost,
  o.service_fee_usd AS service_fee,
  0 AS tax_amount,
  0 AS discount_amount,
  o.total_usd AS total,
  o.amount_paid_usd AS amount_paid,
  o.balance_due_usd AS balance_due,
  o.currency,
  NULL::text AS recipient_name,
  NULL::text AS phone,
  o.destination_city AS city,
  o.delivery_address AS address,
  NULL::text AS target_marketplace,
  NULL::text AS source_url,
  o.notes AS notes,
  NULL::jsonb AS items,
  o.created_at,
  NULL::timestamptz AS confirmed_at,
  NULL::timestamptz AS shipped_at,
  NULL::timestamptz AS delivered_at,
  NULL::timestamptz AS cancelled_at,
  NULL::text AS cancellation_reason,
  o.updated_at
FROM public.orders o
LEFT JOIN public.profiles p ON p.id = o.user_id;

-- admin_customers_view
DROP VIEW IF EXISTS public.admin_customers_view;
CREATE OR REPLACE VIEW public.admin_customers_view AS
SELECT
  p.id,
  p.full_name,
  NULL::text AS email,
  p.phone,
  cp.city,
  p.language,
  p.is_active,
  p.created_at,
  p.updated_at,
  cp.customer_type,
  cp.business_name,
  cp.tier,
  COALESCE(cp.total_orders, 0) AS total_orders,
  COALESCE(cp.total_spent_usd, 0) AS total_spent
FROM public.profiles p
LEFT JOIN public.customer_profiles cp ON cp.user_id = p.id;

-- admin_payments_view: maps orders.payment_status to a payments projection.
-- Live orders carry payment info; fall back to the real payments table.
DROP VIEW IF EXISTS public.admin_payments_view;
CREATE OR REPLACE VIEW public.admin_payments_view AS
SELECT
  o.id,
  o.reference AS order_number,
  o.user_id AS profile_id,
  p.full_name AS customer_name,
  o.total_usd AS amount,
  o.currency::text AS currency,
  NULL::text AS payment_method,
  o.payment_status::text AS status,
  NULL::text AS reference,
  o.shipping_method::text AS shipping_method,
  o.created_at
FROM public.orders o
LEFT JOIN public.profiles p ON p.id = o.user_id;

-- admin_sourcing_view
DROP VIEW IF EXISTS public.admin_sourcing_view;
CREATE OR REPLACE VIEW public.admin_sourcing_view AS
SELECT
  sr.id,
  sr.user_id AS profile_id,
  p.full_name AS customer_name,
  COALESCE(NULLIF(sr.product_description,''), '')::text AS title,
  ''::text AS description,
  sr.marketplace::text AS marketplace,
  sr.marketplace::text AS target_marketplace,
  sr.product_url,
  sr.product_description,
  sr.destination_city,
  sr.quantity AS quantity_needed,
  NULL::numeric AS price_cny,
  NULL::numeric AS price_usd,
  NULL::text[] AS images,
  sr.status::text AS status,
  sr.created_at,
  sr.assigned_agent_id AS assigned_to,
  sr.internal_notes AS notes
FROM public.sourcing_requests sr
LEFT JOIN public.profiles p ON p.id = sr.user_id;

-- admin_quotes_view
DROP VIEW IF EXISTS public.admin_quotes_view;
CREATE OR REPLACE VIEW public.admin_quotes_view AS
SELECT
  q.id,
  q.reference AS quote_number,
  q.request_id AS sourcing_request_id,
  q.user_id AS profile_id,
  p.full_name AS customer_name,
  q.total_cny AS subtotal,
  0 AS shipping_cost,
  q.service_fee,
  0 AS tax_amount,
  q.discount AS discount_amount,
  q.total_usd AS total,
  'USD'::text AS currency,
  q.valid_until,
  q.status::text AS status,
  q.customer_notes AS notes,
  q.created_at
FROM public.quotes q
LEFT JOIN public.profiles p ON p.id = q.user_id;

-- admin_shipments_view
DROP VIEW IF EXISTS public.admin_shipments_view;
CREATE OR REPLACE VIEW public.admin_shipments_view AS
SELECT
  s.id,
  s.reference AS shipment_number,
  NULL::uuid AS order_id,
  s.total_packages AS package_count,
  s.status::text AS status,
  s.carrier,
  s.tracking_number,
  NULL::text AS method,
  s.reference,
  s.origin,
  NULL::text AS origin_warehouse,
  s.destination,
  NULL::text AS destination_country,
  NULL::text AS destination_city,
  NULL::text AS destination_address,
  s.total_weight_kg * 1000 AS weight_grams,
  s.chargeable_weight_kg * 1000 AS volumetric_weight_grams,
  NULL::jsonb AS dimensions,
  s.total_packages,
  s.freight_cost AS shipping_cost,
  s.method::text AS currency,
  s.departure_date,
  s.estimated_arrival,
  NULL::timestamptz AS shipped_at,
  s.estimated_arrival AS estimated_delivery_date,
  s.actual_arrival AS delivered_at,
  s.created_at
FROM public.shipments s;

-- admin_warehouse_view
DROP VIEW IF EXISTS public.admin_warehouse_view;
CREATE OR REPLACE VIEW public.admin_warehouse_view AS
SELECT
  wp.id,
  wp.order_id,
  wp.barcode AS tracking_number,
  NULL::text AS shipping_provider,
  NULL::text AS warehouse_location,
  wp.status::text AS status,
  wp.weight_kg * 1000 AS weight_grams,
  NULL::jsonb AS dimensions,
  wp.inspection_notes AS condition_notes,
  wp.received_at,
  wp.inspected_at,
  NULL::timestamptz AS consolidated_at,
  wp.created_at,
  o.reference AS order_number
FROM public.warehouse_packages wp
LEFT JOIN public.orders o ON o.id = wp.order_id;

-- admin_staff_view
DROP VIEW IF EXISTS public.admin_staff_view;
CREATE OR REPLACE VIEW public.admin_staff_view AS
SELECT
  sp.user_id AS id,
  p.full_name,
  NULL::text AS email,
  p.phone,
  sp.department,
  NULL::text AS job_title,
  sp.is_active,
  sp.role::text AS staff_role,
  sp.created_at
FROM public.staff_profiles sp
LEFT JOIN public.profiles p ON p.id = sp.user_id;

-- ─── 4. RLS adjustments (adapted to live user_id schema) ──────
DROP POLICY IF EXISTS "addresses_select_own" ON public.addresses;
CREATE POLICY "addresses_select_own" ON public.addresses
  FOR SELECT USING (user_id = auth.uid() OR public.is_staff_or_admin());
DROP POLICY IF EXISTS "addresses_modify_own" ON public.addresses;
CREATE POLICY "addresses_modify_own" ON public.addresses
  FOR ALL USING (user_id = auth.uid() OR public.is_staff_or_admin());

DROP POLICY IF EXISTS "favorites_select_own" ON public.favorites;
CREATE POLICY "favorites_select_own" ON public.favorites
  FOR SELECT USING (user_id = auth.uid() OR public.is_staff_or_admin());
DROP POLICY IF EXISTS "favorites_modify_own" ON public.favorites;
CREATE POLICY "favorites_modify_own" ON public.favorites
  FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "orders_anon_insert" ON public.orders;
CREATE POLICY "orders_anon_insert" ON public.orders
  FOR INSERT WITH CHECK (auth.uid() IS NULL OR user_id = auth.uid() OR user_id IS NULL);
DROP POLICY IF EXISTS "orders_select_own" ON public.orders;
CREATE POLICY "orders_select_own" ON public.orders
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL OR public.is_staff_or_admin());
DROP POLICY IF EXISTS "orders_update_own" ON public.orders;
CREATE POLICY "orders_update_own" ON public.orders
  FOR UPDATE USING (user_id = auth.uid() OR public.is_staff_or_admin());

DROP POLICY IF EXISTS "sourcing_anon_insert" ON public.sourcing_requests;
CREATE POLICY "sourcing_anon_insert" ON public.sourcing_requests
  FOR INSERT WITH CHECK (auth.uid() IS NULL OR user_id = auth.uid() OR user_id IS NULL);
DROP POLICY IF EXISTS "sourcing_select_own" ON public.sourcing_requests;
CREATE POLICY "sourcing_select_own" ON public.sourcing_requests
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL OR public.is_staff_or_admin());
