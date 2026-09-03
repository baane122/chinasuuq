-- ============================================================
-- ChinaSuuq Database Schema - Migration 14
-- Admin view layer + extended enums + missing columns
-- This migration makes the mobile → admin data flow work
-- end-to-end by:
--   1. Extending enums to cover all status values used in app + admin
--   2. Adding missing columns that admin/mobile write to
--   3. Creating admin_*_view as a stable API surface
--   4. Adding a `customers_view` projection of profiles
--   5. Adding `settings` (key/value) and `audit_logs` tables
-- ============================================================

-- ─── 1. Extend order_status enum ─────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'awaiting_payment' AND enumtypid = 'order_status'::regtype) THEN
    ALTER TYPE order_status ADD VALUE 'awaiting_payment';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'in_warehouse' AND enumtypid = 'order_status'::regtype) THEN
    ALTER TYPE order_status ADD VALUE 'in_warehouse';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'out_for_delivery' AND enumtypid = 'order_status'::regtype) THEN
    ALTER TYPE order_status ADD VALUE 'out_for_delivery';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'customs' AND enumtypid = 'order_status'::regtype) THEN
    ALTER TYPE order_status ADD VALUE 'customs';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ─── 2. Extend payment_status enum ───────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'confirmed' AND enumtypid = 'payment_status'::regtype) THEN
    ALTER TYPE payment_status ADD VALUE 'confirmed';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ─── 3. Extend sourcing_status enum ───────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'assigned' AND enumtypid = 'sourcing_status'::regtype) THEN
    ALTER TYPE sourcing_status ADD VALUE 'assigned';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'quoted' AND enumtypid = 'sourcing_status'::regtype) THEN
    ALTER TYPE sourcing_status ADD VALUE 'quoted';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'purchased' AND enumtypid = 'sourcing_status'::regtype) THEN
    ALTER TYPE sourcing_status ADD VALUE 'purchased';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ─── 4. Extend shipping_status enum ──────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'preparing' AND enumtypid = 'shipping_status'::regtype) THEN
    ALTER TYPE shipping_status ADD VALUE 'preparing';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'loaded' AND enumtypid = 'shipping_status'::regtype) THEN
    ALTER TYPE shipping_status ADD VALUE 'loaded';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'received' AND enumtypid = 'shipping_status'::regtype) THEN
    ALTER TYPE shipping_status ADD VALUE 'received';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'inspected' AND enumtypid = 'shipping_status'::regtype) THEN
    ALTER TYPE shipping_status ADD VALUE 'inspected';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'returned' AND enumtypid = 'shipping_status'::regtype) THEN
    ALTER TYPE shipping_status ADD VALUE 'returned';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ─── 5. Add missing columns for mobile writes ────────────────
-- Sourcing requests: text marketplace + legacy mobile fields
ALTER TABLE public.sourcing_requests
  ADD COLUMN IF NOT EXISTS marketplace TEXT,
  ADD COLUMN IF NOT EXISTS product_url TEXT,
  ADD COLUMN IF NOT EXISTS product_description TEXT,
  ADD COLUMN IF NOT EXISTS destination_city TEXT,
  ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS price_cny NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS price_usd NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS images TEXT[];

-- Shipments: legacy mobile/admin columns
ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS reference TEXT,
  ADD COLUMN IF NOT EXISTS method TEXT,
  ADD COLUMN IF NOT EXISTS origin TEXT,
  ADD COLUMN IF NOT EXISTS destination TEXT,
  ADD COLUMN IF NOT EXISTS departure_date DATE,
  ADD COLUMN IF NOT EXISTS estimated_arrival DATE,
  ADD COLUMN IF NOT EXISTS tracking_number TEXT;

-- Warehouse packages: legacy mobile columns
ALTER TABLE public.warehouse_packages
  ADD COLUMN IF NOT EXISTS barcode TEXT,
  ADD COLUMN IF NOT EXISTS photos TEXT[],
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(10,3);

-- Quotes: legacy columns
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS request_id UUID,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS total_cny NUMERIC(12,2);

-- Orders: legacy reference + address columns for mobile compatibility
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS reference TEXT,
  ADD COLUMN IF NOT EXISTS total_usd NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS payment_status_old TEXT,
  ADD COLUMN IF NOT EXISTS recipient_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT;

-- Profiles: legacy mobile fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT;

-- Source products: marketplace text (for marketplace filter)
ALTER TABLE public.source_products
  ADD COLUMN IF NOT EXISTS marketplace TEXT;

-- Favourites: legacy compatibility
ALTER TABLE public.favorites
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS product_id UUID;

-- Addresses: legacy user_id compatibility (the table now uses profile_id)
ALTER TABLE public.addresses
  ADD COLUMN IF NOT EXISTS user_id UUID;

-- ─── 6. Settings table (key/value JSONB) ──────────────────────
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
CREATE POLICY "settings_modify" ON public.settings FOR ALL USING (auth.is_staff_or_admin() OR auth.uid() IS NULL);

INSERT INTO public.settings (key, value) VALUES
  ('service_fee_pct', '5'::jsonb),
  ('whatsapp_number', '"8615277074143"'::jsonb),
  ('min_order_usd', '20'::jsonb),
  ('default_language', '"en"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ─── 7. Notifications table (read-by-user) ───────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID,
    title TEXT NOT NULL,
    body TEXT,
    type TEXT DEFAULT 'info',
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_profile ON public.notifications(profile_id);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT USING (profile_id = auth.uid() OR auth.is_staff_or_admin());
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT WITH CHECK (auth.is_staff_or_admin() OR auth.uid() IS NULL);

-- ─── 8. Customer payment methods table ──────────────────────
CREATE TABLE IF NOT EXISTS public.customer_payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL,
    method TEXT NOT NULL,
    identifier TEXT,         -- phone number for ZAAD, account # for bank
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

-- ─── 9. Audit log table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs(created_at DESC);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_admin_read" ON public.audit_logs;
CREATE POLICY "audit_admin_read" ON public.audit_logs
  FOR SELECT USING (auth.is_staff_or_admin());
DROP POLICY IF EXISTS "audit_insert" ON public.audit_logs;
CREATE POLICY "audit_insert" ON public.audit_logs
  FOR INSERT WITH CHECK (true);

-- ─── 10. Admin views ──────────────────────────────────────────

-- admin_orders_view: every column admin orders page renders
CREATE OR REPLACE VIEW public.admin_orders_view AS
SELECT
  o.id,
  o.order_number,
  o.reference,
  o.profile_id,
  p.full_name AS customer_name,
  p.email AS customer_email,
  p.phone AS customer_phone,
  o.status::text AS status,
  o.payment_status::text AS payment_status,
  o.payment_method,
  o.shipping_method::text AS shipping_method,
  o.subtotal,
  o.shipping_cost,
  o.service_fee,
  o.tax_amount,
  o.discount_amount,
  o.total,
  o.amount_paid,
  o.balance_due,
  o.currency,
  o.recipient_name,
  o.phone,
  o.city,
  o.address,
  o.target_marketplace,
  o.source_url,
  o.notes,
  o.items,
  o.created_at,
  o.confirmed_at,
  o.shipped_at,
  o.delivered_at,
  o.cancelled_at,
  o.cancellation_reason,
  o.updated_at
FROM public.orders o
LEFT JOIN public.profiles p ON p.id = o.profile_id;

-- admin_customers_view
CREATE OR REPLACE VIEW public.admin_customers_view AS
SELECT
  p.id,
  p.full_name,
  p.email,
  p.phone,
  p.city,
  p.language,
  p.is_active,
  p.created_at,
  p.updated_at,
  cp.customer_type,
  cp.business_name,
  cp.tier,
  COALESCE((SELECT COUNT(*) FROM public.orders o WHERE o.profile_id = p.id), 0) AS total_orders,
  COALESCE((SELECT SUM(o.total) FROM public.orders o WHERE o.profile_id = p.id), 0) AS total_spent
FROM public.profiles p
LEFT JOIN public.customer_profiles cp ON cp.user_id = p.id;

-- admin_payments_view: maps orders.payment_status to payment view
CREATE OR REPLACE VIEW public.admin_payments_view AS
SELECT
  o.id,
  o.order_number,
  o.profile_id,
  p.full_name AS customer_name,
  o.total AS amount,
  o.currency::text AS currency,
  o.payment_method,
  o.payment_status::text AS status,
  o.payment_reference AS reference,
  o.shipping_method::text AS shipping_method,
  o.created_at
FROM public.orders o
LEFT JOIN public.profiles p ON p.id = o.profile_id
WHERE o.payment_method IS NOT NULL;

-- admin_sourcing_view: alias columns expected by admin page
CREATE OR REPLACE VIEW public.admin_sourcing_view AS
SELECT
  sr.id,
  sr.profile_id,
  p.full_name AS customer_name,
  sr.title,
  sr.description,
  sr.marketplace,
  sr.target_marketplace::text AS target_marketplace,
  sr.product_url,
  sr.product_description,
  sr.destination_city,
  sr.quantity_needed,
  sr.price_cny,
  sr.price_usd,
  sr.images,
  sr.status::text AS status,
  sr.created_at,
  sr.assigned_to,
  sr.notes
FROM public.sourcing_requests sr
LEFT JOIN public.profiles p ON p.id = sr.profile_id;

-- admin_shipments_view
CREATE OR REPLACE VIEW public.admin_shipments_view AS
SELECT
  s.id,
  s.shipment_number,
  s.order_id,
  s.consolidation_id,
  s.status::text AS status,
  s.carrier,
  s.tracking_number,
  s.method,
  s.reference,
  s.origin,
  s.origin_warehouse,
  s.destination,
  s.destination_country,
  s.destination_city,
  s.destination_address,
  s.weight_grams,
  s.volumetric_weight_grams,
  s.dimensions,
  s.package_count,
  s.shipping_cost,
  s.currency::text AS currency,
  s.departure_date,
  s.estimated_arrival,
  s.shipped_at,
  s.estimated_delivery_date,
  s.delivered_at,
  s.created_at
FROM public.shipments s;

-- admin_warehouse_view
CREATE OR REPLACE VIEW public.admin_warehouse_view AS
SELECT
  wp.id,
  wp.order_id,
  wp.tracking_number,
  wp.shipping_provider,
  wp.warehouse_location,
  wp.status::text AS status,
  wp.weight_grams,
  wp.dimensions,
  wp.condition_notes,
  wp.received_at,
  wp.inspected_at,
  wp.consolidated_at,
  wp.created_at,
  o.order_number
FROM public.warehouse_packages wp
LEFT JOIN public.orders o ON o.id = wp.order_id;

-- admin_staff_view
CREATE OR REPLACE VIEW public.admin_staff_view AS
SELECT
  sp.user_id AS id,
  p.full_name,
  p.email,
  p.phone,
  sp.department,
  sp.job_title,
  sp.is_available,
  sp.can_approve_orders,
  sp.can_manage_suppliers,
  sp.can_process_payments,
  sp.can_manage_inventory,
  sp.assigned_warehouse,
  sp.hire_date,
  p.created_at
FROM public.staff_profiles sp
JOIN public.profiles p ON p.id = sp.user_id;

-- admin_quotes_view
CREATE OR REPLACE VIEW public.admin_quotes_view AS
SELECT
  q.id,
  q.quote_number,
  q.sourcing_request_id,
  q.profile_id,
  p.full_name AS customer_name,
  q.subtotal,
  q.shipping_cost,
  q.service_fee,
  q.tax_amount,
  q.discount_amount,
  q.total,
  q.currency::text AS currency,
  q.valid_until,
  q.status::text AS status,
  q.notes,
  q.created_at
FROM public.quotes q
LEFT JOIN public.profiles p ON p.id = q.profile_id;

-- ─── 11. RLS adjustments for the new tables ───────────────────
DROP POLICY IF EXISTS "addresses_select_own" ON public.addresses;
CREATE POLICY "addresses_select_own" ON public.addresses
  FOR SELECT USING (profile_id = auth.uid() OR user_id = auth.uid() OR auth.is_staff_or_admin());
DROP POLICY IF EXISTS "addresses_modify_own" ON public.addresses;
CREATE POLICY "addresses_modify_own" ON public.addresses
  FOR ALL USING (profile_id = auth.uid() OR user_id = auth.uid() OR auth.is_staff_or_admin());

-- Favourites: support both profile_id (canonical) and user_id (mobile legacy)
DROP POLICY IF EXISTS "favorites_select_own" ON public.favorites;
CREATE POLICY "favorites_select_own" ON public.favorites
  FOR SELECT USING (profile_id = auth.uid() OR user_id = auth.uid() OR auth.is_staff_or_admin());
DROP POLICY IF EXISTS "favorites_modify_own" ON public.favorites;
CREATE POLICY "favorites_modify_own" ON public.favorites
  FOR ALL USING (profile_id = auth.uid() OR user_id = auth.uid());

-- Orders: anon insert (guest checkout) supported
DROP POLICY IF EXISTS "orders_anon_insert" ON public.orders;
CREATE POLICY "orders_anon_insert" ON public.orders
  FOR INSERT WITH CHECK (auth.uid() IS NULL OR profile_id = auth.uid() OR profile_id IS NULL);
DROP POLICY IF EXISTS "orders_select_own" ON public.orders;
CREATE POLICY "orders_select_own" ON public.orders
  FOR SELECT USING (profile_id = auth.uid() OR profile_id IS NULL OR auth.is_staff_or_admin());
DROP POLICY IF EXISTS "orders_update_own" ON public.orders;
CREATE POLICY "orders_update_own" ON public.orders
  FOR UPDATE USING (profile_id = auth.uid() OR auth.is_staff_or_admin());

-- Sourcing requests: anon insert
DROP POLICY IF EXISTS "sourcing_anon_insert" ON public.sourcing_requests;
CREATE POLICY "sourcing_anon_insert" ON public.sourcing_requests
  FOR INSERT WITH CHECK (auth.uid() IS NULL OR profile_id = auth.uid() OR profile_id IS NULL);
DROP POLICY IF EXISTS "sourcing_select_own" ON public.sourcing_requests;
CREATE POLICY "sourcing_select_own" ON public.sourcing_requests
  FOR SELECT USING (profile_id = auth.uid() OR profile_id IS NULL OR auth.is_staff_or_admin());
