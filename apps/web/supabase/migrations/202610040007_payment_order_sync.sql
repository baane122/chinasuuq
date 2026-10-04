-- 202610040007: Trigger to sync orders.payment_status when payments are confirmed
-- Prior audit: payments/page.tsx confirmed payments but never updated
-- orders.payment_status or orders.balance_due_usd, leaving orders permanently
-- in 'pending' payment state even after manual confirmation.
CREATE OR REPLACE FUNCTION public.sync_order_payment_status()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE public.orders o
    SET
      payment_status = NEW.status,
      amount_paid_usd = COALESCE(NEW.amount_usd, o.amount_paid_usd, 0),
      balance_due_usd = GREATEST(0, (o.total_usd - COALESCE(o.amount_paid_usd, 0) - COALESCE(NEW.amount_usd, 0))),
      updated_at = now()
    FROM public.orders o2
    WHERE o2.id = NEW.order_id AND o.id = o2.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS orders_payment_status_sync ON public.payments;
CREATE TRIGGER orders_payment_status_sync
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_order_payment_status();
