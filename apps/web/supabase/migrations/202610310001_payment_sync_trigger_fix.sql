-- 202610310001: repair the payments -> orders sync trigger
--
-- The 202610040007 trigger read NEW.amount_usd, but public.payments has no such
-- column (it stores `amount` plus a `currency` code). Every INSERT and every
-- UPDATE on public.payments therefore died with
--   42703: record "new" has no field "amount_usd"
-- which took the whole payments console offline: recording a payment, editing
-- one, confirming one (payment-reconcile included) and the customer-facing
-- payment insert all failed. Nothing was ever synced because nothing was ever
-- written.
--
-- This migration replaces the body with one that:
--   * reads the real columns and converts a row into USD using public.fx_rates()
--     (payments.amount is denominated in the row's own currency by design)
--   * recomputes amount_paid_usd / balance_due_usd from ALL confirmed payments
--     on the order instead of trusting one row
--   * never downgrades an order that already has confirmed money when a later
--     pending/failed payment is recorded
--
-- It also sets the `app.payment_sync` transaction-local flag around the nested
-- orders UPDATE so the two BEFORE UPDATE money guards (orders_money_guard,
-- guard_order_customer_update) allow a customer-owned payment to move its own
-- order's payment state. Without it the nested update is rejected for every
-- non-staff caller, i.e. every real customer.

CREATE OR REPLACE FUNCTION public.sync_order_payment_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_paid       numeric := 0;
  v_confirmed  integer := 0;
  v_status     public.payment_status;
  v_order_id   uuid;
  v_row_status public.payment_status;
  v_rate_cny   numeric;
  v_rate_sos   numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_order_id   := OLD.order_id;
    v_row_status := OLD.status;
  ELSE
    v_order_id   := NEW.order_id;
    v_row_status := NEW.status;
  END IF;

  IF v_order_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- amount_paid_usd is denominated in USD; payments.amount is in its own
  -- currency. Read the live rates once, then convert per row. A missing rate
  -- falls back to the fx_rates() defaults so a payment is never silently
  -- dropped from the paid total.
  SELECT NULLIF((public.fx_rates() ->> 'cny_per_usd')::numeric, 0),
         NULLIF((public.fx_rates() ->> 'sos_per_usd')::numeric, 0)
    INTO v_rate_cny, v_rate_sos;
  v_rate_cny := COALESCE(v_rate_cny, 6.66);
  v_rate_sos := COALESCE(v_rate_sos, 530);

  SELECT
    COALESCE(SUM(
      CASE upper(COALESCE(p.currency, 'USD'))
        WHEN 'SOS' THEN p.amount / v_rate_sos
        WHEN 'CNY' THEN p.amount / v_rate_cny
        ELSE p.amount
      END
    ), 0),
    COUNT(*)
  INTO v_paid, v_confirmed
  FROM public.payments p
  WHERE p.order_id = v_order_id
    AND p.status = 'confirmed';

  -- Precedence: an explicit refund wins, then an order already marked
  -- refunded stays refunded (a later pending attempt must not un-refund it),
  -- then "some money is confirmed", then the status of the row that moved.
  IF v_row_status = 'refunded' THEN
    v_status := 'refunded';
  ELSIF EXISTS (
    SELECT 1 FROM public.orders o
     WHERE o.id = v_order_id AND o.payment_status = 'refunded'
  ) THEN
    v_status := 'refunded';
  ELSIF v_confirmed > 0 THEN
    v_status := 'confirmed';
  ELSE
    v_status := v_row_status;
  END IF;

  BEGIN
    PERFORM set_config('app.payment_sync', 'on', true);

    UPDATE public.orders o
       SET payment_status  = v_status,
           amount_paid_usd = ROUND(v_paid, 2),
           balance_due_usd = GREATEST(0, ROUND(COALESCE(o.total_usd, 0) - v_paid, 2)),
           updated_at      = now()
     WHERE o.id = v_order_id;

    PERFORM set_config('app.payment_sync', 'off', true);
  EXCEPTION WHEN OTHERS THEN
    -- Never leave the bypass latched for the rest of the transaction.
    PERFORM set_config('app.payment_sync', 'off', true);
    RAISE;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- The trigger must also fire on DELETE so removing a payment re-derives the
-- order's paid balance instead of leaving a stale figure behind.
DROP TRIGGER IF EXISTS orders_payment_status_sync ON public.payments;
CREATE TRIGGER orders_payment_status_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_order_payment_status();

-- ── Guard repairs ────────────────────────────────────────────────────────
-- Both guards read the pre-PostgREST-9 individual claim setting
-- `request.jwt.claim.role`, which modern PostgREST never sets (it publishes the
-- whole claim set as `request.jwt.claims`). The service_role bypass was
-- therefore dead code: an operator or edge function using the service key could
-- not change an order amount or a profile role at all. Read the real claims.

CREATE OR REPLACE FUNCTION public.orders_money_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  op TEXT := TG_OP;
  old_total numeric; new_total numeric;
  old_sub   numeric; new_sub   numeric;
  old_paid  numeric; new_paid  numeric;
  v_jwt_role text;
BEGIN
  -- Nested write from sync_order_payment_status(): the payment row, not the
  -- caller, owns this money change.
  IF COALESCE(current_setting('app.payment_sync', true), 'off') = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_jwt_role := COALESCE(auth.jwt() ->> 'role', '');

  IF op = 'UPDATE' THEN
    old_total := COALESCE((to_jsonb(OLD)->>'total_usd')::numeric, (to_jsonb(OLD)->>'total')::numeric);
    old_sub   := COALESCE((to_jsonb(OLD)->>'subtotal_usd')::numeric, (to_jsonb(OLD)->>'subtotal')::numeric);
    old_paid  := COALESCE((to_jsonb(OLD)->>'amount_paid_usd')::numeric, (to_jsonb(OLD)->>'amount_paid')::numeric);
  END IF;
  new_total := COALESCE((to_jsonb(NEW)->>'total_usd')::numeric, (to_jsonb(NEW)->>'total')::numeric);
  new_sub   := COALESCE((to_jsonb(NEW)->>'subtotal_usd')::numeric, (to_jsonb(NEW)->>'subtotal')::numeric);
  new_paid  := COALESCE((to_jsonb(NEW)->>'amount_paid_usd')::numeric, (to_jsonb(NEW)->>'amount_paid')::numeric);

  IF v_jwt_role = 'service_role' OR public.is_staff_or_admin() THEN
    RETURN NEW;  -- staff/service path unchanged (balance maintained by the app)
  END IF;

  -- Non-staff (customers / guests):
  IF op = 'UPDATE' THEN
    IF (new_total IS DISTINCT FROM old_total)
       OR (new_sub IS DISTINCT FROM old_sub)
       OR (new_paid IS DISTINCT FROM old_paid) THEN
      RAISE EXCEPTION 'ChinaSuuq: only staff may change order amounts';
    END IF;
    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
      RAISE EXCEPTION 'ChinaSuuq: only staff may change payment_status';
    END IF;
    IF COALESCE((to_jsonb(NEW)->>'amount_refunded_usd')::text, (to_jsonb(NEW)->>'amount_refunded')::text)
       IS DISTINCT FROM
       COALESCE((to_jsonb(OLD)->>'amount_refunded_usd')::text, (to_jsonb(OLD)->>'amount_refunded')::text) THEN
      RAISE EXCEPTION 'ChinaSuuq: only staff may change refunds';
    END IF;
  END IF;

  IF op = 'INSERT' THEN
    IF new_paid IS NOT NULL AND new_paid <> 0 THEN
      RAISE EXCEPTION 'ChinaSuuq: new orders cannot carry payments (staff record payments)';
    END IF;
    IF NEW.payment_status IS NOT NULL AND NEW.payment_status::text <> 'pending' THEN
      RAISE EXCEPTION 'ChinaSuuq: new orders must start with payment_status=pending';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_order_customer_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_jwt_role text := COALESCE(auth.jwt() ->> 'role', '');
BEGIN
  IF COALESCE(current_setting('app.payment_sync', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  IF v_jwt_role = 'service_role'
     OR COALESCE(public.is_staff_or_admin(), FALSE) THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.reference IS DISTINCT FROM OLD.reference
     OR NEW.total_usd IS DISTINCT FROM OLD.total_usd
     OR NEW.subtotal_usd IS DISTINCT FROM OLD.subtotal_usd
     OR NEW.shipping_estimate_usd IS DISTINCT FROM OLD.shipping_estimate_usd
     OR NEW.service_fee_usd IS DISTINCT FROM OLD.service_fee_usd
     OR NEW.amount_paid_usd IS DISTINCT FROM OLD.amount_paid_usd
     OR NEW.balance_due_usd IS DISTINCT FROM OLD.balance_due_usd
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    RAISE EXCEPTION 'order amounts and payment state can only be changed by staff';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status = 'pending' AND NEW.status = 'cancelled') THEN
      RAISE EXCEPTION 'orders can only be cancelled by the customer, other transitions are staff-only';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- guard_profile_privileged_columns is not attached to any trigger today, but it
-- carries the same dead claim read; keep it correct if it is ever wired up.
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_jwt_role text := COALESCE(auth.jwt() ->> 'role', '');
BEGIN
  IF v_jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT COALESCE(public.is_super_admin(), FALSE) THEN
      RAISE EXCEPTION 'profiles.role can only be changed by a super_admin';
    END IF;
  END IF;

  IF (NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
    IF NOT COALESCE(public.is_super_admin(), FALSE)
       AND NOT COALESCE(public.is_staff_or_admin(), FALSE) THEN
      RAISE EXCEPTION 'account status can only be changed by staff';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── order_items provenance rollup ────────────────────────────────────────
-- orders_order_items_sync is a plain (SECURITY INVOKER) trigger function that
-- PERFORMs public.sync_order_items(), which is SECURITY DEFINER but granted only
-- to postgres/service_role. For any non-service caller the inner call raised
--   permission denied for function sync_order_items
-- which the wrapper swallows as a WARNING, so order_items provenance rows were
-- never written for real customers — silently. Running the wrapper as its
-- owner fixes that while keeping sync_order_items itself un-executable by
-- clients (it would otherwise let any caller rewrite another order's items).
CREATE OR REPLACE FUNCTION public.orders_order_items_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    PERFORM public.sync_order_items(NEW.id);
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- A provenance rollup must never be why a customer cannot place an order.
    RAISE WARNING 'ChinaSuuq: order_items sync failed for order %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.orders_order_items_sync() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orders_order_items_sync() TO service_role;
