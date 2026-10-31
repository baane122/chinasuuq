-- 202610310002: make marketplace credential storage work (or not block)
--
-- 202610040008 installed a BEFORE INSERT/UPDATE trigger on marketplace_accounts
-- that called pgp_sym_encrypt(...). Two things were wrong on the live project:
--   1. pgcrypto is installed in schema `extensions`, but the trigger's
--      search_path is `public, pg_temp`, so the unqualified call resolves to
--      nothing:
--        42883: function pgp_sym_encrypt(text, text) does not exist
--   2. even with the schema fixed there was no `app.encryption_key` setting,
--      so the key argument was NULL.
-- Together they meant "save a marketplace account that has a password" failed
-- outright — the admin Marketplaces panel could create a credential-less
-- account but never store one with credentials.
--
-- Product direction (2026-10-31): a customer's marketplace session is carried
-- by COOKIES synced from the mobile app (marketplace-session-sync), not by
-- username/password. Google-style password columns are legacy. So this
-- migration:
--   * stores the encryption key in Supabase Vault (never in a table),
--   * resolves pgcrypto through the `extensions` schema explicitly,
--   * keeps the column encrypted for anything that still writes it,
--   * leaves rows that never set a password untouched (NULL stays NULL), and
--   * does not re-encrypt an unchanged value, so routine cookie saves are
--     unaffected.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = 'marketplace_credentials_key'
  ) THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'marketplace_credentials_key',
      'Symmetric key for public.marketplace_accounts.password_encrypted'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.encrypt_marketplace_password()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key text;
BEGIN
  -- Only a changed, non-empty value is (re)encrypted. An unchanged value is
  -- already ciphertext and must be written back verbatim; a cleared one stays
  -- cleared. This is what keeps a cookies-only sync from touching the column.
  IF NEW.password_encrypted IS NOT DISTINCT FROM OLD.password_encrypted THEN
    RETURN NEW;
  END IF;

  IF NEW.password_encrypted IS NULL OR NEW.password_encrypted = '' THEN
    NEW.password_encrypted := NULL;
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'marketplace_credentials_key'
   LIMIT 1;

  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION
      'ChinaSuuq: marketplace credential key is unavailable; cannot store a password. Sync cookies from the mobile app instead.'
      USING ERRCODE = 'P0001';
  END IF;

  NEW.password_encrypted := encode(
    extensions.pgp_sym_encrypt(NEW.password_encrypted, v_key),
    'base64'
  );
  RETURN NEW;
END;
$$;

-- Staff may read the key through the SECURITY DEFINER trigger only; the vault
-- table itself stays unreadable to API roles (vault's own default).
REVOKE ALL ON FUNCTION public.encrypt_marketplace_password() FROM PUBLIC;

COMMENT ON COLUMN public.marketplace_accounts.password_encrypted IS
  'Legacy: encrypted with the marketplace_credentials_key vault secret. Sessions are carried by cookies (cookies column) synced from the staff mobile app; this column is not a login path.';
