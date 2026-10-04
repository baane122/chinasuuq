-- 202610040008: Encrypt marketplace_account passwords
-- Adds pgcrypto extension (idempotent) and a BEFORE INSERT/UPDATE trigger
-- that base64-encodes password_encrypted before it hits the column.
-- NOTE: edge function get_shared_marketplace_account must decode before
-- returning; this migration only secures the storage layer.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.encrypt_marketplace_password()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.password_encrypted IS DISTINCT FROM OLD.password_encrypted THEN
    IF NEW.password_encrypted IS NOT NULL AND NEW.password_encrypted <> '' THEN
      NEW.password_encrypted := encode(
        pgp_sym_encrypt(NEW.password_encrypted, current_setting('app.encryption_key', true)),
        'base64'
      );
    ELSE
      NEW.password_encrypted := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketplace_password_encrypt ON public.marketplace_accounts;
CREATE TRIGGER marketplace_password_encrypt
  BEFORE INSERT OR UPDATE ON public.marketplace_accounts
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_marketplace_password();
