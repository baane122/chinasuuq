-- 202610310012: support can sign an account out of every device
--
-- The one-device rule (202610310007) only lets an account revoke ITS OWN other
-- sessions. The case that actually reaches support is the opposite one: a
-- customer calls in because their phone was stolen, or a staff member leaves
-- and their phone is still signed in. Nobody at the company could act on that
-- before now — the only lever was to know the DB password.
--
-- Deliberately narrow:
--   * staff/super_admin only (is_staff_or_admin, which is now also status-aware);
--   * it never touches accounts whose profile is a super_admin unless the
--     caller is a super_admin, so a support agent cannot lock the owner out;
--   * it returns a count, so the UI can say what actually happened.
--
-- The web app has no device of its own to protect here: this revokes every
-- session of the target account, which is the point ("sign out everywhere").

CREATE OR REPLACE FUNCTION public.admin_revoke_user_sessions(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
DECLARE
  v_target_role text;
  v_count integer := 0;
BEGIN
  IF NOT COALESCE(public.is_staff_or_admin(), false) THEN
    RAISE EXCEPTION 'ChinaSuuq: only staff may sign an account out'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'ChinaSuuq: an account id is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.role::text INTO v_target_role FROM public.profiles p WHERE p.id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ChinaSuuq: no account exists with id %', p_user_id
      USING ERRCODE = '23503';
  END IF;

  IF v_target_role = 'super_admin'
     AND NOT COALESCE(public.is_super_admin(), false) THEN
    RAISE EXCEPTION 'ChinaSuuq: only a super_admin may sign a super_admin out'
      USING ERRCODE = '42501';
  END IF;

  WITH gone AS (
    DELETE FROM auth.sessions WHERE user_id = p_user_id RETURNING id
  )
  SELECT count(*) INTO v_count FROM gone;

  UPDATE public.user_devices
     SET revoked_at = COALESCE(revoked_at, now())
   WHERE user_id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'revoked', v_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_revoke_user_sessions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_user_sessions(uuid) TO authenticated;
