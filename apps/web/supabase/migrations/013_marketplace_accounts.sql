-- ============================================================
-- ChinaSuuq Database Schema - Migration 13
-- Marketplace Accounts (shared logins for marketplace browsing)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.marketplace_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    marketplace_type text NOT NULL,            -- '1688' | 'taobao' | 'yiwugo' | 'alibaba' | 'chinagoods' | 'jd'
    account_label text NOT NULL DEFAULT '',     -- human label e.g. "Primary 1688 account"
    username text,
    password_encrypted text,                    -- encrypted credential (displayed/SHARED to users for in-app login)
    phone text,
    email text,
    notes text,
    is_shared boolean DEFAULT true,             -- whether users can use this login
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_type ON public.marketplace_accounts(marketplace_type);
CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_active ON public.marketplace_accounts(is_active);

ALTER TABLE public.marketplace_accounts ENABLE ROW LEVEL SECURITY;

-- Only authenticated admin/staff with the right role can read/manage accounts.
DROP POLICY IF EXISTS "marketplace_accounts_select" ON public.marketplace_accounts;
CREATE POLICY "marketplace_accounts_select" ON public.marketplace_accounts
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "marketplace_accounts_insert" ON public.marketplace_accounts;
CREATE POLICY "marketplace_accounts_insert" ON public.marketplace_accounts
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "marketplace_accounts_update" ON public.marketplace_accounts;
CREATE POLICY "marketplace_accounts_update" ON public.marketplace_accounts
    FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "marketplace_accounts_delete" ON public.marketplace_accounts;
CREATE POLICY "marketplace_accounts_delete" ON public.marketplace_accounts
    FOR DELETE USING (auth.role() = 'authenticated');
