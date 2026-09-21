-- Shared marketplace login lookup for the mobile app.
-- SECURITY DEFINER: anon users may call it, it returns only the active
-- shared account (is_shared = true) for one marketplace, nothing else.
create or replace function public.get_shared_marketplace_account(p_marketplace text)
returns table (
  id uuid,
  marketplace text,
  username text,
  password text,
  cookies text,
  is_active boolean,
  last_refreshed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    a.marketplace_type as marketplace,
    a.username,
    a.password_encrypted as password,
    null::text as cookies,
    a.is_active,
    a.updated_at as last_refreshed_at
  from public.marketplace_accounts a
  where a.marketplace_type = p_marketplace
    and a.is_active = true
    and a.is_shared = true
  order by a.created_at desc
  limit 1;
$$;

grant execute on function public.get_shared_marketplace_account(text) to anon, authenticated;

-- 1$ Dollar Store shared login (mobile pre-login in the WebView).
-- Idempotent: skip when a shared dollarstore account already exists.
insert into public.marketplace_accounts
  (marketplace_type, account_label, username, password_encrypted, is_shared, is_active)
select
  'dollarstore', 'Shared 1$ Dollar Store login', '15277078888', 'a123456', true, true
where not exists (
  select 1 from public.marketplace_accounts
  where marketplace_type = 'dollarstore' and is_shared = true
);
