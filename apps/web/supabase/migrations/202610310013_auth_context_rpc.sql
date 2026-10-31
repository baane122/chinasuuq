-- 202610310013: one authoritative answer to "what may this session do?"
--
-- Both clients currently re-derive the caller's authority themselves:
--   * mobile: `profiles.role` only          (src/store/auth.ts → isStaffRole)
--   * web:    `profiles.role` only          (app/admin/(protected)/layout.tsx)
-- while RLS uses `is_staff_or_admin()`, which since 202610310009 also requires
-- `profiles.is_active` and `staff_profiles.is_active`. Those three answers can
-- disagree, and the live disagreement is real: a deactivated staff member still
-- sees a valid `role='staff'`, so the admin shell opens and then every query
-- returns zero rows — "Mission Control is empty" with no error.
--
-- This RPC returns exactly the facts the policies use, so a client can render
-- the right screen instead of guessing. It reveals nothing the caller could not
-- already read about themselves.
--
-- 202610310007's claim/assert also treat a deactivated STAFF record as a
-- disabled account now: the Staff page toggles staff_profiles.is_active, and
-- leaving that path able to claim a device would keep a fired employee's phone
-- signed in.

CREATE OR REPLACE FUNCTION public.auth_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO public, auth, pg_temp
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_profile    public.profiles;
  v_staff      public.staff_profiles;
  v_is_staff   boolean;
  v_is_super   boolean;
BEGIN
  IF v_uid IS NULL OR COALESCE(auth.jwt() ->> 'role', '') <> 'authenticated' THEN
    RETURN jsonb_build_object(
      'authenticated', false,
      'active', false,
      'role', NULL,
      'staff_role', NULL,
      'is_staff', false,
      'is_super_admin', false
    );
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  SELECT * INTO v_staff FROM public.staff_profiles WHERE user_id = v_uid;

  v_is_staff :=
    v_profile.id IS NOT NULL
    AND v_profile.role::text IN ('staff', 'super_admin', 'admin')
    AND v_profile.is_active IS TRUE
    AND (v_staff.id IS NULL OR v_staff.is_active IS NOT FALSE);

  v_is_super := v_is_staff AND v_profile.role::text = 'super_admin';

  RETURN jsonb_build_object(
    'authenticated', true,
    'active', COALESCE(v_profile.is_active, false)
      AND (v_staff.id IS NULL OR v_staff.is_active IS NOT FALSE),
    'role', v_profile.role::text,
    'staff_role', v_staff.role::text,
    'is_staff', v_is_staff,
    'is_super_admin', v_is_super
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.auth_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_context() TO authenticated;

-- ── claim/assert: a deactivated staff row is a disabled account ─────────────
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
    RETURN jsonb_build_object('ok', false, 'reason', 'no_session_claim');
  END IF;

  SELECT p.is_active
         AND NOT EXISTS (
           SELECT 1 FROM public.staff_profiles sp
            WHERE sp.user_id = p.id AND sp.is_active IS FALSE
         )
    INTO v_active
    FROM public.profiles p
   WHERE p.id = v_uid;

  IF v_active IS FALSE THEN
    -- Revoke even though we refuse the claim: a disabled account must not keep
    -- a working session on a phone that was already signed in.
    DELETE FROM auth.sessions WHERE user_id = v_uid;
    UPDATE public.user_devices SET revoked_at = COALESCE(revoked_at, now())
     WHERE user_id = v_uid;
    RETURN jsonb_build_object('ok', false, 'reason', 'account_disabled');
  END IF;

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

  SELECT p.is_active
         AND NOT EXISTS (
           SELECT 1 FROM public.staff_profiles sp
            WHERE sp.user_id = p.id AND sp.is_active IS FALSE
         )
    INTO v_active
    FROM public.profiles p
   WHERE p.id = v_uid;

  IF v_active IS FALSE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'account_disabled');
  END IF;

  SELECT * INTO v_row
    FROM public.user_devices
   WHERE user_id = v_uid
     AND device_id = btrim(COALESCE(p_device_id, ''));

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'claimed', false);
  END IF;

  IF v_row.revoked_at IS NOT NULL OR v_row.session_id IS DISTINCT FROM v_session THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session_revoked');
  END IF;

  UPDATE public.user_devices SET last_seen_at = now() WHERE id = v_row.id;
  RETURN jsonb_build_object('ok', true, 'claimed', true);
END;
$function$;
