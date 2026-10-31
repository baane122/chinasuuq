# Roles, sessions and access — the current truth

Written 2026-10-31 after the auth/session audit. Every statement here was
verified against the live project (`athkmrvsaijwgsyvwrbp`), not inferred from
code.

## Who is who

| Principal | How they get in | `profiles.role` | `staff_profiles.role` |
|---|---|---|---|
| Guest | never signs in | — (no row) | — |
| Customer | sign up / sign in in the mobile app | `customer` | none |
| Staff | account created, then linked by a super admin on **Staff & Roles** | `staff` | one of 18 |
| Super admin | owner account | `super_admin` | `super_admin` |

`profiles.role` is the only column RLS reads. `staff_profiles.role` is the
granular taxonomy and is used by Mission Control's permission UI. They are kept
in sync by `upsert_staff_member()` — writing only one of them is what made a
new staff member open an empty admin shell.

## What each principal can do

### Guest
- Browse the catalogue, marketplaces, search, product pages, tracking lookup,
  support, and the public site.
- Keep a **device-local** cart (`chinasuuq-cart:guest`).
- **Cannot** check out: `app/cart/checkout.tsx` redirects to sign-in. This is a
  product decision (2026-10-03), enforced in the UI; the `anon` role has no
  INSERT grant on `orders`, so the server agrees.
- **Cannot** read any sourcing request it did not create — anon reads of guest
  sourcing rows were removed in `202610310004`.

### Customer
- Everything a guest can do, plus: checkout, order history, tracking, saved
  addresses, favourite payment methods, wishlist, notifications, referrals.
- Cart is namespaced per account and survives logout.
- May read marketplace **session cookies** for logged-in browsing
  (`get_marketplace_session()` allows any signed-in profile).
- Cannot see staff tools, other customers, or any admin table.

### Staff (`profiles.role='staff'` and an ACTIVE `staff_profiles` row)
- Everything a customer can do.
- Mobile: the **Staff** banner appears; staff mode gives marketplace cookie
  sync and the full marketplace list. It is opt-in per session.
- Mission Control: sections are gated by `permissions` grants for their
  `staff_profiles.role` (12 permissions, 18 roles). UI-only affordance; the
  server is coarse.
- RLS: `is_staff_or_admin()` — which now also requires the account to be active.

### Super admin
- Everything staff can do, plus: role changes (`profiles.role`), minting another
  super admin, deactivating a super admin, disabling accounts.

## Sessions

### One phone at a time
- On every successful sign-in the app calls `claim_device_session(device_id)`.
- The RPC deletes every **other** session that belongs to one of this account's
  registered **mobile** devices. Web sessions have no `user_devices` row, so
  signing in on a phone never signs Mission Control out.
- The loser's phone keeps a cryptographically valid access token until it
  expires (Supabase default: 1 hour), but cannot refresh: the session row is
  gone, so `/token` answers `refresh_token_not_found`.
- The app checks `assert_device_session()` on resume (debounced to once a
  minute) and on that answer signs itself out with a notice on the login screen.
- A customer can revoke lost devices from **Account → Security & Devices**.
  Support can do it from **Customers → (row) → Sign out of all devices**.

### Logout scope
`supabase.auth.signOut()` defaults to **global**, which revokes every session of
the account including the web app. Both the customer logout and the staff
logout now pass `{ scope: "local" }`. `scripts/verify-auth-session.mjs` fails
the build if that regresses.

### Deactivation
- Setting `profiles.is_active = false` (Customers → Delete) or
  `staff_profiles.is_active = false` (Staff → toggle) **deletes the account's
  auth sessions** and revokes its device rows.
- `is_staff_or_admin()` / `is_super_admin()` require active rows, so a
  deactivated staff member keeps no admin RLS even inside the token window.
- `submit_mobile_order()` checks `is_active` itself, because a SECURITY DEFINER
  function does not evaluate RLS.

## Where each check lives

| Check | Location | Authority |
|---|---|---|
| Is this session staff? | `auth_context()` RPC | server (same predicate as RLS) |
| May this staff see this section? | `src/lib/admin/permissions.ts` | UI affordance |
| May this row be read/written? | RLS policies | server |
| Is this phone still the active device? | `claim/assert_device_session()` | server |
| Is the account active? | `auth_context()`, `is_active_account()`, session triggers | server |

Rules that must not drift:
- `src/lib/roles.ts` (`STAFF_PROFILE_ROLES`) must match `is_staff_or_admin()`.
- Any new SECURITY DEFINER RPC that writes user-owned rows must check
  `is_active` itself.
- Any new "sign out" must name `{ scope: "local" }` unless global is intended.
