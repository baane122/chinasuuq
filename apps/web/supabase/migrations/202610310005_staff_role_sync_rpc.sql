-- 202610310005: staff role assignment must also update profiles.role
--
-- The Staff & Roles page wrote ONLY staff_profiles. Its own permission model
-- (src/lib/admin/permissions.ts) keys off staff_profiles.role, so the admin UI
-- starts showing the new member's sections — but every RLS policy and every
-- has_role()/is_staff_or_admin() check reads profiles.role, which stayed
-- 'customer'. The result was a staff member who could open the admin shell and
-- then get zero rows (or 42501) from every table behind it.
--
-- Verified live: inserting a staff_profiles row leaves profiles.role='customer'.
--
-- This RPC does both writes atomically, server-side, and refuses to run for a
-- caller who is not already staff/super_admin. Mapping is intentionally narrow:
--   staff_role 'super_admin'            -> profiles.role 'super_admin'
--   any other staff_role                -> profiles.role 'staff'
-- A staff member promoted to 'super_admin' in staff_profiles also has to be
-- super_admin in profiles, otherwise is_super_admin() (which reads profiles)
-- keeps denying them.

CREATE OR REPLACE FUNCTION public.upsert_staff_member(
  p_user_id uuid,
  p_role public.staff_role,
  p_department text DEFAULT NULL,
  p_is_active boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_role text;
  v_profile_role public.user_role;
  v_row public.staff_profiles;
BEGIN
  IF NOT COALESCE(public.is_staff_or_admin(), false) THEN
    RAISE EXCEPTION 'ChinaSuuq: only staff may assign staff roles'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'ChinaSuuq: a staff member must be linked to an account id'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id) THEN
    RAISE EXCEPTION 'ChinaSuuq: no profile exists for account %', p_user_id
      USING ERRCODE = '23503';
  END IF;

  -- Only a super_admin may mint another super_admin.
  IF p_role = 'super_admin' AND NOT COALESCE(public.is_super_admin(), false) THEN
    RAISE EXCEPTION 'ChinaSuuq: only a super_admin can grant super_admin'
      USING ERRCODE = '42501';
  END IF;

  v_profile_role := CASE WHEN p_role = 'super_admin' THEN 'super_admin'::public.user_role
                         ELSE 'staff'::public.user_role END;

  INSERT INTO public.staff_profiles (user_id, role, department, is_active, is_super_admin)
  VALUES (p_user_id, p_role, NULLIF(btrim(COALESCE(p_department, '')), ''), COALESCE(p_is_active, true), p_role = 'super_admin')
  ON CONFLICT (user_id) DO UPDATE
    SET role           = EXCLUDED.role,
        department     = EXCLUDED.department,
        is_active      = EXCLUDED.is_active,
        is_super_admin = EXCLUDED.is_super_admin,
        updated_at     = now()
  RETURNING * INTO v_row;

  -- profiles.role is guarded by guard_profiles_role_change / profiles_guard_role;
  -- both allow a super_admin caller (auth.uid() not null + is_super_admin()).
  UPDATE public.profiles
     SET role = v_profile_role,
         updated_at = now()
   WHERE id = p_user_id
     AND role <> v_profile_role;

  v_caller_role := v_profile_role::text;

  RETURN jsonb_build_object(
    'ok', true,
    'staff_id', v_row.id,
    'user_id', v_row.user_id,
    'role', v_row.role,
    'profiles_role', v_caller_role,
    'is_active', v_row.is_active
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_staff_member(uuid, public.staff_role, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_staff_member(uuid, public.staff_role, text, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.upsert_staff_member(uuid, public.staff_role, text, boolean) IS
  'Links a staff_profiles row AND syncs profiles.role (staff/super_admin). Staff-only.';
