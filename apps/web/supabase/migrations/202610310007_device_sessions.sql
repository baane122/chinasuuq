-- 202610310007: one active mobile device per account, enforced server-side
--
-- PRODUCT RULE (owner, 2026-10-31): a signed-in customer or staff member stays
-- signed in on ONE phone. Signing in on a second phone signs the first one out.
-- Nothing in the repo enforced this: there was no device table, no session
-- registry, and Supabase happily issued a separate refresh-token chain to every
-- device that called /token. A lost or resold phone therefore kept a fully valid
-- session forever, and a fired staff member's phone kept admin RLS access.
--
-- HOW ENFORCEMENT WORKS (verified against the live project, not assumed):
--   * Every access token carries a `session_id` claim that is stable across
--     refresh_token rotation (measured: same id before and after a refresh).
--   * A JWT for `sub=<uid>` maps to exactly one row in auth.sessions.
--   * DELETE FROM auth.sessions cascades to auth.refresh_tokens
--     (FK refresh_tokens.session_id -> sessions.id ON DELETE CASCADE), and a
--     deleted session's refresh token then fails at /token with
--     `refresh_token_not_found` (measured). That is the revocation primitive.
--
-- So the phone claims its device AFTER sign-in. The claim deletes every OTHER
-- session that belongs to one of this account's registered MOBILE devices. Web
-- sessions never get a user_devices row, so signing in on a phone does not kick
-- Mission Control out of the browser — an earlier draft that deleted all other
-- sessions would have done exactly that.
--
-- The residual window is the access token already in the loser's memory, which
-- stays cryptographically valid until its exp (Supabase default 1 hour). The app
-- closes that window by calling assert_device_session() on foreground/resume and
-- forcing a local sign-out when the claim no longer matches, so a superseded
-- phone drops to the login screen with an explanation instead of silently
-- reading data with a stale token.

-- ── registry ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_devices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_id    text NOT NULL,
  session_id   uuid,
  platform     text,
  device_name  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz,
  CONSTRAINT user_devices_device_id_len CHECK (char_length(btrim(device_id)) BETWEEN 8 AND 128)
);

CREATE UNIQUE INDEX IF NOT EXISTS user_devices_user_device_key
  ON public.user_devices (user_id, device_id);
CREATE INDEX IF NOT EXISTS user_devices_session_idx
  ON public.user_devices (session_id);

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

-- Read-only for owners: every write goes through the DEFINER RPCs below, so a
-- client cannot hand itself someone else's session id.
DROP POLICY IF EXISTS user_devices_select_own ON public.user_devices;
CREATE POLICY user_devices_select_own ON public.user_devices
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_devices_staff_select ON public.user_devices;
CREATE POLICY user_devices_staff_select ON public.user_devices
  FOR SELECT TO authenticated
  USING (public.is_staff_or_admin());

REVOKE ALL ON public.user_devices FROM PUBLIC, anon;
GRANT SELECT ON public.user_devices TO authenticated;

-- ── claim the device this session runs on ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_device_session(
  p_device_id text,
  p_device_name text DEFAULT NULL,
  p_platform text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_session  uuid;
  v_active   boolean;
  v_revoked  integer := 0;
BEGIN
  IF v_uid IS NULL OR COALESCE(auth.jwt() ->> 'role', '') <> 'authenticated' THEN
    RAISE EXCEPTION 'ChinaSuuq: sign in required'
      USING ERRCODE = '42501';
  END IF;

  IF p_device_id IS NULL OR char_length(btrim(p_device_id)) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_device');
  END IF;

  v_session := NULLIF(auth.jwt() ->> 'session_id', '')::uuid;
  IF v_session IS NULL THEN
    -- No claim in the token means we cannot tell which session is "this" one,
    -- and guessing would let us revoke the caller's own session.
    RETURN jsonb_build_object('ok', false, 'reason', 'no_session_claim');
  END IF;

  SELECT p.is_active INTO v_active FROM public.profiles p WHERE p.id = v_uid;
  IF v_active IS FALSE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'account_disabled');
  END IF;

  -- Retire every OTHER session this account registered from a mobile device.
  -- Scoped through user_devices on purpose: sessions with no device row are
  -- web sessions, and those are deliberately left alone.
  WITH gone AS (
    DELETE FROM auth.sessions AS s
    USING public.user_devices AS d
    WHERE d.user_id = v_uid
      AND d.session_id = s.id
      AND s.id <> v_session
    RETURNING s.id
  )
  SELECT count(*) INTO v_revoked FROM gone;

  UPDATE public.user_devices
     SET revoked_at = COALESCE(revoked_at, now())
   WHERE user_id = v_uid
     AND session_id IS NOT NULL
     AND session_id <> v_session;

  INSERT INTO public.user_devices
      (user_id, device_id, session_id, platform, device_name, last_seen_at, revoked_at)
  VALUES
      (v_uid, btrim(p_device_id), v_session,
       NULLIF(btrim(COALESCE(p_platform, '')), ''),
       NULLIF(btrim(COALESCE(p_device_name, '')), ''),
       now(), NULL)
  ON CONFLICT (user_id, device_id) DO UPDATE
    SET session_id   = EXCLUDED.session_id,
        platform     = COALESCE(EXCLUDED.platform, public.user_devices.platform),
        device_name  = COALESCE(EXCLUDED.device_name, public.user_devices.device_name),
        last_seen_at = now(),
        revoked_at   = NULL;

  UPDATE public.profiles SET last_login = now() WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'revoked_other_devices', v_revoked);
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_device_session(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_device_session(text, text, text) TO authenticated;

-- ── is this session still the account's active device? ──────────────────────
CREATE OR REPLACE FUNCTION public.assert_device_session(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_session uuid := NULLIF(auth.jwt() ->> 'session_id', '')::uuid;
  v_row     public.user_devices;
  v_active  boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;
  IF v_session IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_session_claim');
  END IF;

  SELECT p.is_active INTO v_active FROM public.profiles p WHERE p.id = v_uid;
  IF v_active IS FALSE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'account_disabled');
  END IF;

  SELECT * INTO v_row
    FROM public.user_devices
   WHERE user_id = v_uid
     AND device_id = btrim(COALESCE(p_device_id, ''));

  IF NOT FOUND THEN
    -- Installed before this migration, or the claim never landed. Not a
    -- revocation: let the app claim again on its next sign-in / resume.
    RETURN jsonb_build_object('ok', true, 'claimed', false);
  END IF;

  IF v_row.revoked_at IS NOT NULL OR v_row.session_id IS DISTINCT FROM v_session THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session_revoked');
  END IF;

  UPDATE public.user_devices SET last_seen_at = now() WHERE id = v_row.id;
  RETURN jsonb_build_object('ok', true, 'claimed', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_device_session(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_device_session(text) TO authenticated;

-- ── "sign out my other phones" ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revoke_my_other_devices()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_session uuid := NULLIF(auth.jwt() ->> 'session_id', '')::uuid;
  v_count   integer := 0;
BEGIN
  IF v_uid IS NULL OR v_session IS NULL THEN
    RAISE EXCEPTION 'ChinaSuuq: sign in required'
      USING ERRCODE = '42501';
  END IF;

  WITH gone AS (
    DELETE FROM auth.sessions AS s
    USING public.user_devices AS d
    WHERE d.user_id = v_uid
      AND d.session_id = s.id
      AND s.id <> v_session
    RETURNING s.id
  )
  SELECT count(*) INTO v_count FROM gone;

  UPDATE public.user_devices
     SET revoked_at = COALESCE(revoked_at, now())
   WHERE user_id = v_uid
     AND session_id IS NOT NULL
     AND session_id <> v_session;

  RETURN jsonb_build_object('ok', true, 'revoked', v_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.revoke_my_other_devices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_my_other_devices() TO authenticated;
