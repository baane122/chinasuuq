-- 202610310014: user_devices is read-only for clients
--
-- 202610310007 revoked the table from PUBLIC and anon and granted SELECT to
-- authenticated, but Supabase's default privileges also grant INSERT, UPDATE,
-- DELETE, TRUNCATE, REFERENCES and TRIGGER directly to `authenticated` on every
-- new table in `public`. Those grants survived, so the only thing standing
-- between a signed-in client and a forged device row was the absence of an
-- INSERT policy.
--
-- RLS does deny it (no policy = no rows written), but a table whose entire
-- write path is meant to be SECURITY DEFINER RPCs should not hand out write
-- privileges at all. Verified after this migration: the only remaining grant to
-- `authenticated` is SELECT, and an INSERT attempt is refused at the privilege
-- level as well as by RLS.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.user_devices FROM authenticated;
GRANT SELECT ON public.user_devices TO authenticated;

COMMENT ON TABLE public.user_devices IS
  'One row per (account, installed app). Clients may SELECT their own rows only. '
  'All writes go through claim_device_session / assert_device_session / '
  'revoke_my_other_devices / admin_revoke_user_sessions (SECURITY DEFINER).';
