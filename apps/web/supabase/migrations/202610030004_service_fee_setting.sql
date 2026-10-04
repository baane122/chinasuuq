-- ============================================================
-- ChinaSuuq — Migration 202610030004: service_fee_pct setting seed
-- 2026-10-03 (audit §5 fix 7 "ProductReviewSheet service fee hardcoded
-- 0.05"; §2 "Settings saves to `settings` KV but nothing reads it")
--
-- Real shape of the settings KV table (identical in 202408010014 §6 and
-- 20260813_admin_view_layer_corrected §1, the file that "adapted to the
-- ACTUAL live schema"):
--     key TEXT PRIMARY KEY, value JSONB NOT NULL,
--     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_by UUID
--
-- ONLY IF ABSENT: ON CONFLICT (key) DO NOTHING — never overwrites a value
-- staff set from the admin Settings screen. NOTE the two existing seeds
-- (0014 §6, 20260813 §1) insert 'service_fee_pct' = 5 — PERCENT POINTS —
-- while the mobile ProductReviewSheet and 202609260001's default
-- p_service_fee_pct use 0.05 — a FRACTION. This migration seeds the
-- fraction form as specified; if the old 5 row is already on live it is
-- left untouched and consumers must decide the unit (documented here so
-- the admin-team follow-up is explicit, not silently numeric).
-- RLS: settings_select is public-by-design (202609210001 §6), so no read
-- grant changes are needed; writes stay staff-gated.
-- ============================================================

DO $$
BEGIN
    IF to_regclass('public.settings') IS NULL THEN
        RAISE NOTICE 'service_fee_setting: settings table absent; skipping';
        RETURN;
    END IF;

    INSERT INTO public.settings (key, value)
    VALUES ('service_fee_pct', '0.05'::jsonb)
    ON CONFLICT (key) DO NOTHING;

    IF FOUND THEN
        RAISE NOTICE 'service_fee_pct seeded (0.05)';
    ELSE
        RAISE NOTICE 'service_fee_pct already present; left unchanged';
    END IF;
END $$;
