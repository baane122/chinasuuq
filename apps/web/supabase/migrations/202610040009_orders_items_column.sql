-- 202610040009: Add items JSONB column to orders + update admin_orders_view
-- Enables the admin invoice modal to show line items directly from the view
-- instead of a separate query to admin_order_items_view.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS items jsonb;

DROP VIEW IF EXISTS public.admin_orders_view CASCADE;
CREATE VIEW public.admin_orders_view AS
 SELECT o.id,
    o.reference AS order_number,
    o.reference,
    o.user_id AS profile_id,
    p.full_name AS customer_name,
    NULL::text AS customer_email,
    p.phone AS customer_phone,
    (o.status)::text AS status,
    (o.payment_status)::text AS payment_status,
    NULL::text AS payment_method,
    (o.shipping_method)::text AS shipping_method,
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
    o.notes,
    o.items,
    o.created_at,
    NULL::timestamp with time zone AS confirmed_at,
    NULL::timestamp with time zone AS shipped_at,
    NULL::timestamp with time zone AS delivered_at,
    NULL::timestamp with time zone AS cancelled_at,
    o.updated_at
   FROM public.orders o
   LEFT JOIN public.profiles p ON p.id = o.user_id;
