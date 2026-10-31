-- 202610310004: stop leaking guest sourcing-request PII
--
-- public.sourcing_requests carried this SELECT policy:
--
--   sourcing_select_own | SELECT | {public}
--     USING (user_id = auth.uid() OR user_id IS NULL OR is_staff_or_admin())
--
-- The `user_id IS NULL` arm was meant to let the anonymous quote form read back
-- what it just wrote. It actually made every guest request readable by everyone:
-- anon (no JWT), and every signed-in customer. The web quote form
-- (components/quote/QuoteForm.tsx) has no contact columns, so it embeds the
-- sender's NAME and WHATSAPP NUMBER in `product_description` — which means the
-- row set that was world-readable is exactly the personal data of people who
-- never made an account. Verified live: an anon GET returned a guest row
-- containing "Name: Alice / WhatsApp: +252 61 555 0199".
--
-- No client reads guest rows back:
--   * web QuoteForm only INSERTs and shows its own success screen;
--   * mobile only upsert()s its own capture with the signed-in user_id;
--   * admin reads through is_staff_or_admin().
-- So the NULL arm is removed. Staff still see everything, a signed-in customer
-- still sees their own requests, and the public form can still INSERT.
--
-- Insert remains open to anon on purpose (that is the public quote form). It
-- cannot spoof an owner: a non-NULL user_id that is not auth.uid() is rejected,
-- which was re-verified before writing this migration.

DROP POLICY IF EXISTS "sourcing_select_own" ON public.sourcing_requests;

CREATE POLICY "sourcing_select_own" ON public.sourcing_requests
  FOR SELECT
  TO public
  USING (user_id = auth.uid() OR public.is_staff_or_admin());

-- The duplicate staff-only policy stays; it is redundant with the arm above but
-- harmless and already referenced by the RLS audit.
