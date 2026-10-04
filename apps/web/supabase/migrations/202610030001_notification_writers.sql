-- ============================================================
-- ChinaSuuq — Migration 202610030001: notification writers
-- 2026-10-03 (audit §2 "Notifications FAKE end-to-end: zero INSERTs"; §6 A)
--
-- First automatic writer for `notifications`: an AFTER UPDATE OF status
-- trigger on public.orders that inserts one in-app notification for the
-- order's customer when the status moves to a customer-visible milestone.
--
-- LIVE SCHEMA NOTES (the live DB diverges from repo migrations — nothing
-- here hardcodes one generation; the DO block detects the shape at apply
-- time and builds the trigger's INSERT from the columns that exist):
--  * notifications has two repo generations:
--      - 202408010009 L134–161 (full): profile_id, type notification_type,
--        title, message, related_type, related_id, action_url,
--        channel TEXT default 'in_app' ('in_app','email','sms','push',
--        'whatsapp'), is_read, metadata, created_at.
--      - 202408010014 L181–189 (compact): profile_id, title, body,
--        type text default 'info', read_at, created_at.
--    The LIVE shape is proven by its consumers, neither of which matches
--    the other: mobile app/notifications/index.tsx selects
--    id,title,body,type,read,created_at filtered on user_id, and admin
--    (protected)/layout.tsx L264 comments "the live table flags read state
--    with the boolean `read`; there is no `read_at` column".
--    ⇒ live = (id, user_id, title, body, type, read, created_at).
--    user_id/profile_id, body/message and read/is_read are all handled.
--  * orders owner column: user_id live (20260813_admin_view_layer_corrected
--    maps o.user_id), profile_id in repo 202408010007 — read via to_jsonb,
--    the same generation-agnostic trick 202609210001 §3 uses for money.
--  * Status vocabulary: union of the 202408010001 order_status enum, the
--    labels added by 202408010014 (awaiting_payment, in_warehouse,
--    out_for_delivery, customs) and the live admin orders page
--    (arrived_somalia). Compared as text, so enum and text generations
--    both work.
--  * SECURITY: the trigger function is SECURITY DEFINER with search_path
--    pinned. Assumption (labelled): migration roles in Supabase own the
--    tables and can write notifications regardless of RLS — same precedent
--    as handle_new_user inserting into the RLS-protected profiles table;
--    belt-and-braces, a staff INSERT policy + grant are (re)issued below.
--
-- Idempotent: CREATE OR REPLACE function, DROP/TRIGGER recreate, DROP/CREATE
-- policy, re-runnable grants.
-- ============================================================

DO $$
DECLARE
    v_owner    text;   -- user_id | profile_id
    v_content  text;   -- body | message
    v_read     text;   -- read | is_read | NULL
    v_cols     text;
    v_vals     text;
    v_sql      text;
BEGIN
    IF to_regclass('public.notifications') IS NULL OR to_regclass('public.orders') IS NULL THEN
        RAISE NOTICE 'notification writers: notifications or orders absent; skipping';
        RETURN;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='notifications' AND column_name='user_id') THEN
        v_owner := 'user_id';
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='notifications' AND column_name='profile_id') THEN
        v_owner := 'profile_id';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='notifications' AND column_name='body') THEN
        v_content := 'body';
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='notifications' AND column_name='message') THEN
        v_content := 'message';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='notifications' AND column_name='read') THEN
        v_read := 'read';
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='notifications' AND column_name='is_read') THEN
        v_read := 'is_read';
    END IF;

    IF v_owner IS NULL OR v_content IS NULL
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema='public' AND table_name='notifications' AND column_name='title') THEN
        RAISE NOTICE 'notification writers: notifications shape unrecognised (owner/title/content); skipping';
        RETURN;
    END IF;

    -- Column list for the INSERT, assembled from what actually exists.
    -- created_at defaults to NOW() in every generation and channel defaults
    -- to 'in_app' where that column exists — both stay out and take their
    -- defaults.
    v_cols := format('%I, title, %I', v_owner, v_content);
    v_vals := 'v_uid, v_title, v_body';
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='notifications' AND column_name='type') THEN
        v_cols := v_cols || ', type';
        -- 'order_update' is a 202408010001 notification_type label and free
        -- text for the compact generation; the literal is untyped so it
        -- coerces to whichever the column is.
        v_vals := v_vals || ', ''order_update''';
    END IF;
    IF v_read IS NOT NULL THEN
        v_cols := v_cols || ', ' || quote_ident(v_read);
        v_vals := v_vals || ', false';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='notifications' AND column_name='related_type')
       AND EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='notifications' AND column_name='related_id') THEN
        v_cols := v_cols || ', related_type, related_id';
        v_vals := v_vals || ', ''order'', NEW.id';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='notifications' AND column_name='metadata') THEN
        v_cols := v_cols || ', metadata';
        v_vals := v_vals || ', jsonb_build_object(''status'', NEW.status::text)';
    END IF;

    -- The trigger function. Static half is dollar-quoted (its own literals
    -- need no escaping); only the two detected identifiers are interpolated.
    v_sql := $fn$
CREATE OR REPLACE FUNCTION public.notify_on_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
    v_status text := NEW.status::text;
    v_uid    uuid;
    v_ref    text;
    v_title  text;
    v_body   text;
BEGIN
    -- The trigger is declared AFTER UPDATE OF status, but Postgres fires
    -- "OF status" whenever the statement lists the column, changed or not;
    -- IS DISTINCT FROM is the "only on distinct new statuses" guard —
    -- re-saving the same value (the confirmed-spam case) never notifies.
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NULL;
    END IF;

    -- Orders owner across both generations (live user_id, repo 0007 profile_id).
    v_uid := COALESCE((to_jsonb(NEW)->>'user_id')::uuid,
                      (to_jsonb(NEW)->>'profile_id')::uuid);
    IF v_uid IS NULL THEN
        RETURN NULL;  -- guest order with nobody to notify
    END IF;

    v_ref := COALESCE(NULLIF((to_jsonb(NEW)->>'reference')::text, ''),
                      (to_jsonb(NEW)->>'order_number')::text, 'your order');

    -- Customer-visible milestones only; anything else (draft/pending churn,
    -- inspection internals) returns NULL title and is skipped.
    v_title := CASE v_status
        WHEN 'confirmed'        THEN 'Order confirmed'
        WHEN 'awaiting_payment' THEN 'Payment requested'
        WHEN 'quoted'           THEN 'Quote ready'
        WHEN 'quote_approved'   THEN 'Quote approved'
        WHEN 'paid'             THEN 'Payment received'
        WHEN 'sourcing'         THEN 'Sourcing started'
        WHEN 'sourced'          THEN 'Source found'
        WHEN 'purchasing'       THEN 'Purchasing started'
        WHEN 'purchased'        THEN 'Goods purchased'
        WHEN 'in_warehouse'     THEN 'Arrived at warehouse'
        WHEN 'consolidated'     THEN 'Ready for shipping'
        WHEN 'shipped'          THEN 'Shipped'
        WHEN 'in_transit'       THEN 'In transit'
        WHEN 'customs'          THEN 'At customs'
        WHEN 'customs_hold'     THEN 'Held at customs'
        WHEN 'arrived_somalia'  THEN 'Arrived in Somalia'
        WHEN 'out_for_delivery' THEN 'Out for delivery'
        WHEN 'delivered'        THEN 'Delivered'
        WHEN 'completed'        THEN 'Order completed'
        WHEN 'cancelled'        THEN 'Order cancelled'
        ELSE NULL
    END;
    IF v_title IS NULL THEN
        RETURN NULL;
    END IF;
    v_body := v_title || ': order ' || v_ref || '.';

    INSERT INTO public.notifications ($fn$
        || v_cols || ') SELECT ' || v_vals || ' WHERE NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.'
        || quote_ident(v_owner) || ' = v_uid AND n.' || quote_ident(v_content)
        || ' = v_body AND n.created_at > now() - interval ''10 minutes'');
    RETURN NULL;
END
$body$;
';

    EXECUTE v_sql;

    -- (Re)install the trigger.
    EXECUTE 'DROP TRIGGER IF EXISTS orders_status_notification ON public.orders';
    EXECUTE $tr$
        CREATE TRIGGER orders_status_notification
            AFTER UPDATE OF status ON public.orders
            FOR EACH ROW EXECUTE FUNCTION public.notify_on_order_status_change()
    $tr$;

    RAISE NOTICE 'notification writers: orders_status_notification trigger installed';
END $$;

-- ─── Staff writes for the admin composer UI ───────────────────────────
-- Existing INSERT policies (202408010010 notifications_insert_admin,
-- 202408010014 notifications_insert) both key on is_staff_or_admin() — the
-- composer runs with a staff JWT so RLS does not block it — but 0014's also
-- lets auth.uid() IS NULL through, and neither is re-asserted anywhere after
-- the 202609210001 hardening. Re-issue a clean staff-only policy (permissive
-- OR against the old ones) so composer writes work even if an older policy
-- was dropped on live. Follow-up for a dedicated security pass: the 0014
-- "OR auth.uid() IS NULL" anon clause should be dropped once confirmed.
DO $$
BEGIN
    IF to_regclass('public.notifications') IS NULL
       OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                      WHERE n.nspname = 'public' AND p.proname = 'is_staff_or_admin') THEN
        RAISE NOTICE 'notification writers: staff insert policy skipped (table or is_staff_or_admin() missing)';
        RETURN;
    END IF;
    EXECUTE 'GRANT INSERT ON public.notifications TO authenticated, service_role';
    EXECUTE 'DROP POLICY IF EXISTS notifications_insert_staff ON public.notifications';
    EXECUTE $pol$
        CREATE POLICY notifications_insert_staff ON public.notifications
            FOR INSERT TO authenticated WITH CHECK (public.is_staff_or_admin())
    $pol$;
END $$;
