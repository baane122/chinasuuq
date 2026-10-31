-- 202610310008: Mission Control could not edit or delete a customer
--
-- Verified live against the real staff JWT (profiles.role='staff'):
--   UPDATE profiles SET full_name=… WHERE id=<customer>  -> UPDATE 0
--   UPDATE profiles SET is_active=false WHERE id=<customer> -> UPDATE 0
--   INSERT INTO customer_profiles (user_id, city) VALUES (…) -> RLS violation
--
-- Cause:
--   * `profiles` had exactly ONE UPDATE policy: `auth.uid() = id`. Staff could
--     read every profile (staff_select_all) but write none of them, so the
--     Customers page's Save ran a statement that matched zero rows. The page
--     reports "Blocked by permissions", which is honest but leaves the CRUD
--     dead — and the same statement is what soft-delete uses, so Delete was
--     dead too.
--   * `customer_profiles` had only owner-scoped INSERT/UPDATE. Staff could
--     SELECT all rows but never create the row for a customer who signed up
--     after the profile bootstrap, so `city`, `customer_type`, `business_name`
--     and `tier` were unwritable from the admin UI.
--
-- Fix keeps escalation shut:
--   * profiles UPDATE now also admits `is_staff_or_admin()`, and its WITH CHECK
--     still runs `profile_role_write_allowed(role)`, so only a super_admin can
--     move an account between customer/staff/super_admin.
--   * A new BEFORE UPDATE trigger makes `is_active` a staff-only column and
--     stops a non-super_admin from deactivating a super_admin (otherwise the
--     broadened policy would let any staff member disable the owner account).
--   * customer_profiles gets staff INSERT/UPDATE/DELETE, gated by
--     is_staff_or_admin(). Owner policies are left untouched.

-- ── profiles: staff may update accounts they can already read ───────────────
DROP POLICY IF EXISTS profiles_staff_update ON public.profiles;
CREATE POLICY profiles_staff_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_staff_or_admin())
  -- Deliberately NOT profile_role_write_allowed(role): that helper answers
  -- "may this role be written by me", which is false for a staff member
  -- editing a customer row (role='customer'). Column-level escalation is
  -- already stopped by guard_profiles_role_change (role) and
  -- guard_profile_staff_writes (is_active) below, both BEFORE UPDATE.
  WITH CHECK (public.is_staff_or_admin());

CREATE OR REPLACE FUNCTION public.guard_profile_staff_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
BEGIN
  -- Service role / migrations / auth hooks carry no end-user JWT.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    IF NOT COALESCE(public.is_staff_or_admin(), false) THEN
      RAISE EXCEPTION 'ChinaSuuq: only staff may change an account status'
        USING ERRCODE = '42501';
    END IF;
    -- Deactivating an owner account is reserved for another owner account.
    IF OLD.role::text = 'super_admin'
       AND NEW.is_active IS FALSE
       AND NOT COALESCE(public.is_super_admin(), false) THEN
      RAISE EXCEPTION 'ChinaSuuq: only a super_admin may disable a super_admin'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS profiles_guard_staff_writes ON public.profiles;
CREATE TRIGGER profiles_guard_staff_writes
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_staff_writes();

-- ── customer_profiles: staff CRUD ───────────────────────────────────────────
DROP POLICY IF EXISTS customer_profiles_staff_insert ON public.customer_profiles;
CREATE POLICY customer_profiles_staff_insert ON public.customer_profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_or_admin());

DROP POLICY IF EXISTS customer_profiles_staff_update ON public.customer_profiles;
CREATE POLICY customer_profiles_staff_update ON public.customer_profiles
  FOR UPDATE TO authenticated
  USING (public.is_staff_or_admin())
  WITH CHECK (public.is_staff_or_admin());

DROP POLICY IF EXISTS customer_profiles_staff_delete ON public.customer_profiles;
CREATE POLICY customer_profiles_staff_delete ON public.customer_profiles
  FOR DELETE TO authenticated
  USING (public.is_staff_or_admin());
