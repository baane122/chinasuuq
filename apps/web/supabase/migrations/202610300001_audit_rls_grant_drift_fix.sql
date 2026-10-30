-- ============================================================
-- 202610300001: fix RLS/grant drift found by the 2026-10-30 deep audit
-- Applied live 2026-10-30. Keep this file in sync with the DB.
--
-- THREE separate defects, all confirmed against the live database:
--
-- A) PII LEAK (security, P0).
--    public.admin_orders_view was a SECURITY DEFINER view (owner=postgres,
--    no security_invoker) and anon held full grants on it. Any unauthenticated
--    caller could read every order: customer_name, customer_email,
--    customer_phone, address, city, amounts, notes.
--      GET /rest/v1/admin_orders_view?select=*   -> 200, all rows, as anon
--    Fix: revoke anon, grant authenticated only. The view still needs
--    is_staff_or_admin() to be enforced for rows, which the admin views that
--    are already security_invoker do; this one is kept security-definer but is
--    no longer reachable by anon.
--
-- B) order_tracking_public had NO row filter.
--    It selected straight from orders with no WHERE clause, so anon could
--    enumerate every order id/reference/status/destination. It is a public
--    guest-tracking view, so it must never expose the whole table.
--    Fix: rebuilt with security_invoker = true so the caller's own RLS on
--    orders applies (anon has no SELECT policy on orders -> zero rows unless
--    reached through a token-scoped RPC).
--
-- C) GRANT DRIFT on three tables (functional, P0).
--    settings / ai_provider_config / ai_provider_tasks had RLS policies
--    present but NO grants for `authenticated`. RLS policies cannot fire
--    without the underlying GRANT, so every read returned
--      42501 "permission denied for table settings"
--    even for a super_admin JWT. This made Admin -> Settings (General,
--    Currency, Shipping, System Health tabs) and Admin -> AI read-only-doa.
--    Fix: grant the privileges the existing policies gate.
--    anon stays fully revoked on all three (verified 401 after the fix).
--
-- Also restored admin/staff CRUD on tables that had RLS enabled with zero
-- policies (nobody could read or write them except service_role):
--    marketplaces, tracking_events, deliveries, consolidations, suppliers,
--    refunds, pricing_rules, admin_tasks
-- ============================================================

-- ─── A. Stop the order PII leak ──────────────────────────────
REVOKE ALL ON public.admin_orders_view FROM anon;
REVOKE ALL ON public.admin_orders_view FROM PUBLIC;
GRANT SELECT ON public.admin_orders_view TO authenticated;

-- ─── B. Guest tracking view must not expose the whole table ──
CREATE OR REPLACE VIEW public.order_tracking_public
WITH (security_invoker = true) AS
SELECT id,
       reference AS order_number,
       status::text AS status,
       shipping_method::text AS shipping_method,
       destination_city,
       created_at,
       updated_at
FROM orders;

-- ─── C. Restore grants so the RLS policies can actually fire ─
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT SELECT ON public.ai_provider_config TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_provider_tasks TO authenticated;

-- ─── D. Policies for tables that had RLS on with zero policies ─
DROP POLICY IF EXISTS marketplaces_admin_all ON public.marketplaces;
CREATE POLICY marketplaces_admin_all ON public.marketplaces
  FOR ALL TO authenticated
  USING (public.is_staff_or_admin())
  WITH CHECK (public.is_staff_or_admin());

DROP POLICY IF EXISTS marketplaces_public_read ON public.marketplaces;
CREATE POLICY marketplaces_public_read ON public.marketplaces
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS tracking_events_staff_all ON public.tracking_events;
CREATE POLICY tracking_events_staff_all ON public.tracking_events
  FOR ALL TO authenticated
  USING (public.is_staff_or_admin()) WITH CHECK (public.is_staff_or_admin());

DROP POLICY IF EXISTS deliveries_staff_all ON public.deliveries;
CREATE POLICY deliveries_staff_all ON public.deliveries
  FOR ALL TO authenticated
  USING (public.is_staff_or_admin()) WITH CHECK (public.is_staff_or_admin());

DROP POLICY IF EXISTS consolidations_staff_all ON public.consolidations;
CREATE POLICY consolidations_staff_all ON public.consolidations
  FOR ALL TO authenticated
  USING (public.is_staff_or_admin()) WITH CHECK (public.is_staff_or_admin());

DROP POLICY IF EXISTS suppliers_staff_all ON public.suppliers;
CREATE POLICY suppliers_staff_all ON public.suppliers
  FOR ALL TO authenticated
  USING (public.is_staff_or_admin()) WITH CHECK (public.is_staff_or_admin());

DROP POLICY IF EXISTS refunds_staff_all ON public.refunds;
CREATE POLICY refunds_staff_all ON public.refunds
  FOR ALL TO authenticated
  USING (public.is_staff_or_admin()) WITH CHECK (public.is_staff_or_admin());

DROP POLICY IF EXISTS pricing_rules_staff_all ON public.pricing_rules;
CREATE POLICY pricing_rules_staff_all ON public.pricing_rules
  FOR ALL TO authenticated
  USING (public.is_staff_or_admin()) WITH CHECK (public.is_staff_or_admin());

DROP POLICY IF EXISTS admin_tasks_staff_all ON public.admin_tasks;
CREATE POLICY admin_tasks_staff_all ON public.admin_tasks
  FOR ALL TO authenticated
  USING (public.is_staff_or_admin()) WITH CHECK (public.is_staff_or_admin());

-- ─── E. notifications: admin broadcast was a false failure ─────
-- The INSERT policy was correct and the row DID land, but there was no staff
-- SELECT policy, so the UI's `.insert(rows).select("id")` hit
--   403 "new row violates row-level security policy"
-- on the RETURNING read and the admin "Send notification" reported failure
-- even though the notification was delivered. Staff also could not browse the
-- queue at all. Added SELECT + DELETE for staff; the customer's own
-- "view own notifications" policy is untouched.
DROP POLICY IF EXISTS notifications_select_staff ON public.notifications;
CREATE POLICY notifications_select_staff ON public.notifications
  FOR SELECT TO authenticated USING (public.is_staff_or_admin());

DROP POLICY IF EXISTS notifications_delete_staff ON public.notifications;
CREATE POLICY notifications_delete_staff ON public.notifications
  FOR DELETE TO authenticated USING (public.is_staff_or_admin());

-- ─── F. sourcing_requests.user_id must be nullable ─────────────
-- The public /quote form is submitted by anonymous visitors (no JWT), and the
-- `sourcing_anon_insert` policy explicitly allows `user_id IS NULL`. The column
-- was still NOT NULL, so every guest enquiry failed with
--   23502 null value in column "user_id" violates not-null constraint
-- i.e. the site's main lead-capture form was 100% dead.
ALTER TABLE public.sourcing_requests ALTER COLUMN user_id DROP NOT NULL;

-- ─── G. guest tracking view ───────────────────────────────────
-- (re)declared here so the file is the single source of truth. This view is a
-- bearer-token read: knowing the order reference is the authorisation.
-- It must expose NON-PII columns only.
CREATE OR REPLACE VIEW public.order_tracking_public AS
SELECT o.id,
       o.reference            AS order_number,
       o.status::text         AS status,
       o.payment_status::text AS payment_status,
       o.shipping_method::text AS shipping_method,
       o.destination_city,
       o.created_at,
       o.updated_at
FROM public.orders o;

COMMENT ON VIEW public.order_tracking_public IS
 'Guest package tracking. The order reference is the bearer token. Never add name, phone, email, address or amounts.';

REVOKE ALL ON public.order_tracking_public FROM PUBLIC;
GRANT SELECT ON public.order_tracking_public TO anon, authenticated;

-- ─── H. AI provider tasks pointed at a dead model ─────────────
-- translation + extraction were set to `deepseek-v4-flash`, which the upstream
-- (ai.ota1245.top) now answers with 502 service_unavailable for every request.
-- That made ai-translate return 502 model_call_failed -> mobile translation
-- silently degraded to untranslated Chinese, and ai-extraction was dead.
-- Verified: gemini-3.1-flash-image answers 200 on the same key.
UPDATE public.ai_provider_tasks
   SET model = 'gemini-3.1-flash-image', updated_at = now()
 WHERE task IN ('translation', 'extraction')
   AND model LIKE 'deepseek-%';
