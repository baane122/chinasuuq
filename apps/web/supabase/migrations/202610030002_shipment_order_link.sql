-- ============================================================
-- ChinaSuuq — Migration 202610030002: shipment ↔ order link
-- 2026-10-03 (audit §2 "Shipments — CRUD real but orphaned: no
-- order↔shipment join"; §6 E)
--
-- DECISION — does shipments already have an order reference? NO on live.
-- Evidence read from the repo's own migrations:
--  * 202408010008 L222 defines shipments.order_id UUID NOT NULL — but that is
--    the never-fully-applied repo generation.
--  * 20260813_admin_view_layer_corrected L186–215, which explicitly adapts
--    "to the ACTUAL live schema (user_id-based, *_usd money cols)", emits
--    `NULL::uuid AS order_id` from admin_shipments_view (L190) and reads
--    shipments columns (reference, total_packages, total_weight_kg, method,
--    departure_date, estimated_arrival, actual_arrival, freight_cost) that do
--    not exist in the 0008 table. ⇒ the live shipments row has no usable
--    order link; the view stubs it out.
-- So this migration ADDS the link (nullable: shipments are created before/
-- apart from orders in some flows, and an NOT NULL column would fail against
-- existing rows). If a database where 0008 was applied verbatim runs this,
-- every statement below is a no-op (order_id, its FK and its index all
-- pre-exist) — the view refresh then just swaps the NULL for the real column.
--
-- Idempotent throughout: ADD COLUMN IF NOT EXISTS, constraint/index guarded
-- by catalog lookups, view rewrite wrapped and settings reapplied.
-- ============================================================

ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS order_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.shipments'::regclass
          AND conname = 'fk_shipments_order_id'
    ) THEN
        ALTER TABLE public.shipments
            ADD CONSTRAINT fk_shipments_order_id
            FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
        RAISE NOTICE 'shipments.order_id FK created';
    END IF;
EXCEPTION WHEN others THEN
    -- e.g. orders missing on a partial database; the column itself still lands.
    RAISE NOTICE 'shipments.order_id FK skipped: %', SQLERRM;
END $$;

-- The 0008 generation already indexes order_id as idx_shipments_order; the
-- IF NOT EXISTS name covers the live generation, and a duplicate index is
-- merely redundant, never broken.
CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON public.shipments(order_id);

-- ─── Expose the link on the admin view ─────────────────────────────────
-- CREATE OR REPLACE VIEW keeps every column name and position identical —
-- only `NULL::uuid AS order_id` becomes `s.order_id` — so an unchanged view
-- definition is replaced cleanly. security_invoker + grants from
-- 202609210001 §7 are reapplied because CREATE OR REPLACE does not carry
-- view-level SET settings over from the dropped version. If the live view
-- has diverged from the corrected definition the replace fails, which the
-- exception handler logs and moves past — nothing else in this migration
-- depends on it.
DO $$
BEGIN
    IF to_regclass('public.admin_shipments_view') IS NULL THEN
        RETURN;
    END IF;

    BEGIN
        EXECUTE $v$
            CREATE OR REPLACE VIEW public.admin_shipments_view AS
            SELECT
              s.id,
              s.reference AS shipment_number,
              s.order_id,
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
            FROM public.shipments s
        $v$;
    EXCEPTION WHEN others THEN
        RAISE NOTICE 'admin_shipments_view left untouched (live definition differs): %', SQLERRM;
        RETURN;
    END;

    ALTER VIEW public.admin_shipments_view SET (security_invoker = true);
    REVOKE ALL ON public.admin_shipments_view FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.admin_shipments_view TO authenticated;
    RAISE NOTICE 'admin_shipments_view now exposes real shipments.order_id';
END $$;
