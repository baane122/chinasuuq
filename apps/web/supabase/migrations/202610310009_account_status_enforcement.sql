-- 202610310009: "deactivated" must actually mean deactivated
--
-- Verified live on 2026-10-31:
--   * `is_staff_or_admin()` reads only `profiles.role`. It never looks at
--     `profiles.is_active` or `staff_profiles.is_active`, and no policy on any
--     of the staff tables mentions `is_active` at all. A deactivated staff
--     member therefore kept full admin RLS — every customer, order and payment
--     row still readable — until their token expired, and forever after every
--     refresh.
--   * Soft-deleting a customer (the admin Delete button) sets
--     `profiles.is_active=false`, but their session was untouched, so the
--     "deleted" customer could keep ordering and reading their history.
--
-- Two independent fixes, because either one alone leaves a hole:
--   1. Status is part of the predicate: `is_staff_or_admin()` /
--      `is_super_admin()` now require an ACTIVE profile and, when a
--      staff_profiles row exists, an ACTIVE staff record. `staff_profiles`
--      `is_active` is what the Staff page's toggle writes, `profiles.is_active`
--      is what the Customers page's Delete writes — both must count.
--   2. Deactivation revokes sessions. A predicate only affects the NEXT
--      request that touches RLS; the account would otherwise keep a working
--      refresh token. Flipping `is_active` to false deletes the account's
--      auth sessions, which invalidates its refresh tokens (the same primitive
--      the one-device rule uses), so the app is signed out within one token
--      lifetime and cannot come back.
--
-- Reactivation is deliberately NOT given back automatically: the sessions are
-- gone, so the person signs in again. That is the correct direction to fail.

-- ── 1. status-aware staff predicates ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(auth.jwt() ->> 'role', '') = 'authenticated'
    AND EXISTS (
        SELECT 1
          FROM public.profiles p
          LEFT JOIN public.staff_profiles sp ON sp.user_id = p.id
         WHERE p.id = auth.uid()
           AND p.role::text IN ('staff', 'super_admin', 'admin')
           AND p.is_active IS TRUE
           -- No staff_profiles row = a legacy/owner account that was never
           -- given a granular role; it is governed by profiles.role alone.
           AND (sp.id IS NULL OR sp.is_active IS NOT FALSE)
    );
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(auth.jwt() ->> 'role', '') = 'authenticated'
    AND EXISTS (
        SELECT 1
          FROM public.profiles p
          LEFT JOIN public.staff_profiles sp ON sp.user_id = p.id
         WHERE p.id = auth.uid()
           AND p.role::text = 'super_admin'
           AND p.is_active IS TRUE
           AND (sp.id IS NULL OR sp.is_active IS NOT FALSE)
    );
$function$;

-- ── 2. deactivation revokes the account's sessions ──────────────────────────
CREATE OR REPLACE FUNCTION public.revoke_sessions_on_deactivate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
BEGIN
  IF NEW.is_active IS FALSE AND COALESCE(OLD.is_active, true) IS TRUE THEN
    DELETE FROM auth.sessions WHERE user_id = NEW.id;
    UPDATE public.user_devices
       SET revoked_at = COALESCE(revoked_at, now())
     WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS profiles_revoke_sessions_on_deactivate ON public.profiles;
CREATE TRIGGER profiles_revoke_sessions_on_deactivate
  AFTER UPDATE OF is_active ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.revoke_sessions_on_deactivate();

-- A deactivated STAFF record must have the same effect, because the Staff page
-- toggle writes staff_profiles.is_active and never touches profiles.
CREATE OR REPLACE FUNCTION public.revoke_sessions_on_staff_deactivate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
BEGIN
  IF NEW.is_active IS FALSE AND COALESCE(OLD.is_active, true) IS TRUE THEN
    DELETE FROM auth.sessions WHERE user_id = NEW.user_id;
    UPDATE public.user_devices
       SET revoked_at = COALESCE(revoked_at, now())
     WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS staff_profiles_revoke_sessions_on_deactivate ON public.staff_profiles;
CREATE TRIGGER staff_profiles_revoke_sessions_on_deactivate
  AFTER UPDATE OF is_active ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.revoke_sessions_on_staff_deactivate();

COMMENT ON FUNCTION public.is_staff_or_admin() IS
  'Active staff check: role PLUS profiles.is_active AND staff_profiles.is_active. '
  'Deactivated accounts keep no admin RLS, which is the whole point of the toggle.';
