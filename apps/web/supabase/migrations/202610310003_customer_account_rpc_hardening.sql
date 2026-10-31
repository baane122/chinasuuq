-- 202610310003: repair and lock down the two customer-account RPCs
--
-- 1. public.create_customer_account() was broken for EVERY call. It inserts the
--    auth.users row by hand and then inserts public.profiles itself — but
--    auth.users has an AFTER INSERT trigger (public.handle_new_user) that already
--    creates that profile row. The second insert therefore always raised
--        23505: duplicate key value violates unique constraint "profiles_pkey"
--    so the function could never create an account. It is only exercised
--    server-side (no app caller), but it was advertised as usable and was not.
--
-- 2. Both create_customer_account() and verify_customer() were executable by
--    `anon`. verify_customer() checks a password against auth.users with no
--    rate limit, cooldown or lockout — an unthrottled password oracle that sits
--    beside GoTrue's protected /token endpoint. create_customer_account()
--    likewise let anyone holding the anon key mint confirmed accounts directly.
--
-- Fixes:
--   * create_customer_account: rely on handle_new_user for the profile row and
--     backfill it only if the trigger did not run; make the identity insert
--     conflict-safe; return a stable JSON contract.
--   * both functions: EXECUTE only for service_role. The apps use GoTrue
--     (supabase.auth) for sign-up/sign-in, so nothing in the product depends on
--     anon being able to call these.

CREATE OR REPLACE FUNCTION public.create_customer_account(
  p_email text,
  p_password text,
  p_full_name text,
  p_phone text DEFAULT NULL,
  p_language text DEFAULT 'en'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF p_email IS NULL OR position('@' in p_email) < 2 THEN
    RETURN json_build_object('error', 'invalid_email');
  END IF;

  IF p_password IS NULL OR length(p_password) < 6 THEN
    RETURN json_build_object('error', 'weak_password');
  END IF;

  IF (SELECT 1 FROM auth.users WHERE lower(email) = lower(p_email)) IS NOT NULL THEN
    RETURN json_build_object('error', 'email_exists');
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    lower(p_email),
    crypt(p_password, gen_salt('bf', 10)),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name),
    now(), now(), '', '', '', ''
  )
  RETURNING id INTO v_id;

  -- on_auth_user_created already inserted the profile. Only write one if the
  -- trigger was disabled or removed, so this path can never collide.
  INSERT INTO public.profiles (id, full_name, role, language, phone)
  VALUES (v_id, COALESCE(NULLIF(p_full_name, ''), split_part(lower(p_email), '@', 1)), 'customer', COALESCE(p_language, 'en'), p_phone)
  ON CONFLICT (id) DO UPDATE
    SET full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        phone     = COALESCE(EXCLUDED.phone, public.profiles.phone),
        language  = COALESCE(public.profiles.language, EXCLUDED.language);

  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_id::text, v_id,
    jsonb_build_object('sub', v_id::text, 'email', lower(p_email), 'email_verified', true),
    'email', now(), now(), now()
  )
  ON CONFLICT DO NOTHING;

  RETURN json_build_object('user_id', v_id, 'email', lower(p_email), 'role', 'customer');
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ChinaSuuq: create_customer_account failed for %: %', p_email, SQLERRM;
  RETURN json_build_object('error', 'create_failed');
END;
$function$;

REVOKE ALL ON FUNCTION public.create_customer_account(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_customer_account(text, text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_account(text, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.verify_customer(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_customer(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_customer(text, text) TO service_role;

COMMENT ON FUNCTION public.verify_customer(text, text) IS
  'Service-role only: unthrottled credential check, must never be exposed to anon (GoTrue /token is the client auth path).';
