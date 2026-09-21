# ChinaSuuq — Platform Documentation

> **Live**: https://chinasuuq.com · **Admin**: https://chinasuuq.com/admin · **APK**: https://chinasuuq.com/app/chinasuuq.apk
> **Supabase project**: `athkmrvsaijwgsyvwrbp` (`athkmrvsaijwgsyvwrbp.supabase.co`)
> This document describes the codebase as it is. For the short version see the root `README.md`.

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Monorepo & Workspaces](#2-monorepo--workspaces)
3. [Architecture](#3-architecture)
4. [Web App — Routes & Data](#4-web-app--routes--data)
5. [Admin Console](#5-admin-console)
6. [Database — Schema, Money Integrity, RLS](#6-database--schema-money-integrity-rls)
7. [Edge Functions](#7-edge-functions)
8. [Security Model](#8-security-model)
9. [Mobile App (Expo)](#9-mobile-app-expo)
10. [Design System](#10-design-system)
11. [Deployment & CI](#11-deployment--ci)
12. [Known Gaps & Follow-ups](#12-known-gaps--follow-ups)
13. [Appendix — Key Constants](#13-appendix--key-constants)

---

## 1. Platform Overview

ChinaSuuq connects Somali buyers with Chinese suppliers across six marketplaces — 1688, Taobao, YiwuGo, Alibaba, ChinaGoods, JD.com. The platform covers discovery → sourcing requests → quotes → orders → payment (Somali mobile money) → warehouse consolidation → international air/sea freight → delivery.

**Verified user-facing facts** (constants in `packages/shared/constants.ts` and `apps/mobile/src/lib/shipping.ts`):

- WhatsApp support: `+86 152 7707 4143` (`WHATSAPP_LINK = https://wa.me/8615277074143`).
- Air freight: $8.50/kg, minimum charge $15, 7–14 days. Sea freight: $2.20/kg with a 10 kg minimum chargeable weight, minimum charge $25, 25–35 days.
- Bilingual English / Somali (af-Soomaali) on both web and mobile.
- Payment methods surfaced in the order/payment flows: ZAAD, Edahab, EVC Plus, Premier Wallet, Sahal, bank transfer (labels in shared constants and admin UI).

**Roles** (actual role values used by RLS and Edge Functions): `customer`, `staff`, `admin`, `super_admin` (`profiles.role`; staff accounts additionally carry `staff_profiles.is_super_admin`).

## 2. Monorepo & Workspaces

```
chinasuuq/
├── apps/
│   ├── web/                        Next.js 16.2.12 — FULL STATIC EXPORT (output: "export")
│   │   ├── src/
│   │   │   ├── app/(public)/       Landing + info + marketplace pages
│   │   │   ├── app/admin/          Admin login + (protected) console
│   │   │   ├── components/         landing/, admin/, marketplaces/, ui/, icons/
│   │   │   ├── lib/                supabase.ts, i18n.tsx, admin/, marketplaces.ts, utils.ts
│   │   │   ├── store/              Zustand: cart.ts, ui.ts
│   │   │   ├── i18n/               en.json, so.json
│   │   │   └── types/              Shared web types
│   │   ├── supabase/
│   │   │   ├── functions/          6 Edge Functions + _shared/
│   │   │   └── migrations/         18 SQL migrations
│   │   └── public/app/chinasuuq.apk
│   └── mobile/                     Expo SDK 57, React Native 0.86.3, Expo Router
│       ├── app/                    (auth)/, (tabs)/, product/, marketplace/, cart/, orders/,
│       │                           profile/, settings/, notifications/, support/, search/
│       ├── src/
│       │   ├── db/index.ts         Local-first repository (Supabase → AsyncStorage fallback)
│       │   ├── lib/                supabase.ts, shipping.ts, exchange.ts, i18n.tsx, moq.ts,
│       │   │                       cartValidation.ts, missionControl.ts, marketplaces.ts, ...
│       │   ├── store/              Zustand: cart.ts, auth.ts
│       │   ├── i18n/               en.json, so.json
│       │   └── components/         home/, cart/, orders/, product/, profile/, checkout/, ui/
│       ├── app.json / app.config.js / eas.json / .eas/workflows/
├── packages/shared/                @chinasuuq/shared (TS source, no build step)
├── vercel.json                     Root deploy + security headers
└── .github/workflows/ci.yml
```

- Root `package.json` workspaces: `apps/web` and `packages/*` **only**. `apps/mobile` is installed separately (`cd apps/mobile && npm install`).
- Root scripts: `dev:web`, `dev:mobile`, `build` (web static export), `typecheck` (`tsc --noEmit` in apps/web), `lint` / `clean` (turbo).
- `packages/shared` exports: `types`, `constants`, `utils`, `validation`, `errors`, `api-client`, `hooks` (plain TS, consumed directly from source).

## 3. Architecture

```
                    ┌────────────────────────────────────────────┐
                    │                 Supabase                   │
                    │  Postgres (RLS) · Auth · Edge Functions    │
                    └───────────────┬────────────────────────────┘
                                    │  anon key + user JWT
          ┌─────────────────────────┼──────────────────────────┐
          │                         │                          │
 ┌────────▼─────────┐     ┌─────────▼────────┐      ┌──────────▼─────────┐
 │ Web (static)     │     │ Mobile (Expo)    │      │ Edge Functions     │
 │ chinasuuq.com    │     │ APK / Expo Go    │      │ (Deno, service     │
 │ public + /admin  │     │ local-first repo │      │  role inside only) │
 └──────────────────┘     └──────────────────┘      └────────────────────┘
```

- **Web** (`apps/web/src/lib/supabase.ts`): one anon Supabase client + `edgeFetch()` helper that attaches the signed-in user's JWT to Edge Function calls. There is no server: no API routes, no middleware, no proxy. All privileged work happens in Edge Functions or via RLS-governed direct queries.
- **Mobile** (`apps/mobile/src/lib/supabase.ts`): anon client with AsyncStorage session persistence, configured via `expo-constants` (`extra.supabaseUrl` / `extra.supabaseAnonKey` set in `app.config.js`).
- **Edge Functions** hold `SUPABASE_SERVICE_ROLE_KEY` and verify caller JWT + `profiles.role` (`_shared/auth.ts`) before any privileged query.
- No realtime subscriptions are used anywhere (verified: no `.channel()` usage in either app).


## 4. Web App — Routes & Data

All pages are statically exported (`trailingSlash: true`, images unoptimized; remote images allowed from `*.supabase.co` storage and `cod.lk888.ai` via `next.config.ts`).

### Public routes (`src/app/(public)/`)

| Route | Purpose |
|-------|---------|
| `/` | Landing: hero, search, marketplace cards, how-it-works, trust bar, app download, footer |
| `/marketplaces/` | Marketplace index |
| `/marketplaces/{1688,taobao,yiwugo,alibaba,chinagoods,jd}/` | Per-marketplace pages (`[id]` route; slugs from `src/lib/marketplaces.ts`) |
| `/how-it-works/` | Process explainer |
| `/shipping/` | Air vs sea comparison, rates, delivery cities |
| `/business/` | B2B sourcing / bulk orders |
| `/about/` | Company info |
| `/help/` | FAQ, contact, WhatsApp |
| `/track/` | Order tracking by reference — queries the `orders` table directly with the anon client |

The mobile APK is linked from the landing page as `/app/chinasuuq.apk` (CI enforces both the file and the reference).

### Admin routes (`src/app/admin/`)

- `/admin/login` — Supabase Auth email/password login (the only login page; the top-level `src/app/login/` directory is empty).
- `/admin` + 12 protected sections under `admin/(protected)/` (see §5).

### Data layer (important)

- `src/lib/supabase.ts` — anon `supabase` client + `edgeFetch()`. The only sanctioned way to call Edge Functions; attaches `apikey` + user JWT.
- `src/lib/admin/supabase-data.ts` — typed helpers over the real database: status mappers (mobile ↔ DB), `getDashboardKpis()`, `listOrders()`/`updateOrder()` (via `admin_orders_view`), `listCustomers()` (`admin_customers_view`), product CRUD on `source_products`, marketplace accounts, sourcing, payments, exchange rates, quotes, shipments, warehouse packages, staff, settings get/set.
- `src/lib/admin/store.ts` + `seed*.ts` — **legacy localStorage-backed mock store (`useAdminData`) with demo seed data. No page imports it anymore; it is dead code kept only as reference.**
- Every admin page reads and writes **real Supabase tables/views** with the anon client (RLS applies). There is no mock or offline mode in the shipped admin.

## 5. Admin Console

`/admin` requires Supabase Auth. `admin/(protected)/layout.tsx` redirects to `/admin/login` when there is no session (a UI guard — the actual access control is RLS). The dev-only recovery path (`NEXT_PUBLIC_DEV_BUILD`) is inert in production (`src/lib/adminSession.ts`).

### Modules and their real data sources

| Module (route) | Reads / writes |
|----------------|----------------|
| Dashboard `/admin` | KPIs via `getDashboardKpis()` (`admin_orders_view`, `admin_customers_view`, `admin_sourcing_view`, `source_products`) + direct counts on `notifications`, `shipments`, `sourcing_requests`, `categories` |
| Customers `/admin/customers` | `admin_customers_view` via `listCustomers()`, orders via `listOrders()` |
| Products `/admin/products` | `source_products` CRUD |
| Orders `/admin/orders` | `admin_orders_view` via `listOrders()`, updates via `updateOrder()` on `orders` |
| Payments `/admin/payments` | `payments` (list, insert, update status, delete) |
| Quotes `/admin/quotes` | `quotes` (list, insert, update, delete) |
| Rates `/admin/rates` | `exchange_rates` (list, insert, update, delete) |
| Sourcing `/admin/sourcing` | `sourcing_requests` (list, insert, update, delete) |
| Shipments `/admin/shipments` | `shipments` (list, insert, update, delete) |
| Warehouse `/admin/warehouse` | `warehouse_packages` (list, insert, update, delete) |
| Staff `/admin/staff` | `staff_profiles` (list, insert, update; `is_super_admin` flag) |
| Marketplaces `/admin/marketplaces` | `marketplace_accounts` (list, insert, update, delete) |
| Settings `/admin/settings` | `settings` key/value, password change (`auth.updateUser`), AI provider tab via Edge Functions (`ai-settings`, `ai-test-connection`) |

### UI conventions

Shared admin components live in `src/components/admin/` (`DataTable`, `StatusBadge`, `Modal`, `ConfirmDialog`, `Toast`, `FormInput`, `KPICard`, `ui/` primitives) plus `AiSettingsTab.tsx` for the AI provider form. Styling uses the `admin-*` utility classes from `globals.css` (see §10).


## 6. Database — Schema, Money Integrity, RLS

### Migrations (`apps/web/supabase/migrations/`, 18 files)

| Migration | Content |
|-----------|---------|
| `202408010001_enums_extensions.sql` | Enums + Postgres extensions |
| `202408010002_core_profiles_auth.sql` | `profiles`, customer profile tables, auth triggers |
| `202408010003_addresses_marketplaces.sql` | `addresses`, marketplace definitions |
| `202408010004_products_translations_pricing.sql` | `source_products` + translations/pricing |
| `202408010005_user_interactions.sql` | User interaction tables (favorites etc.) |
| `202408010006_sourcing_suppliers_quotes.sql` | `sourcing_requests`, suppliers, `quotes` / `quote_items` |
| `202408010007_orders_payments_refunds.sql` | `orders`, `order_items`, `payments`, refunds |
| `202408010008_warehouse_shipping_deliveries.sql` | `warehouse_packages`, `shipments`, deliveries |
| `202408010009_support_notifications_audit.sql` | Support tickets, `notifications`, audit |
| `202408010010_rls_policies.sql` | Baseline RLS |
| `202408010011_triggers_functions.sql` | Triggers + functions |
| `202408010012_add_marketplaces_chinagoods_jd.sql` | Adds ChinaGoods + JD marketplaces |
| `202408010013_marketplace_accounts.sql` | `marketplace_accounts` |
| `202408010014_admin_view_layer.sql` | First admin view layer |
| `20260813_admin_view_layer_corrected.sql` | Corrected admin views (`admin_orders_view`, `admin_customers_view`, `admin_sourcing_view`, `admin_payments_view`, `admin_shipments_view`, `admin_quotes_view`, `admin_warehouse_view`, `admin_staff_view`) |
| `202608140001_ai_settings.sql` | AI provider settings storage |
| `202609210001_money_integrity_rls_hardening.sql` | Money + RLS hardening (details below) |
| `202609240001_shared_marketplace_account_rpc.sql` | `get_shared_marketplace_account(marketplace)` — SECURITY DEFINER RPC returning only the active shared account for one marketplace (used by the mobile WebView flow) |

Apply with `supabase db push` (or `psql \i <file>` for one file). The migrations are written to be safe to re-run where practical.

### Core tables (as used by the code)

`profiles` (with `role`), customer profiles, `addresses`, `source_products` (marketplace, titles, CNY/USD prices, MOQ, stock, images), `orders` / `order_items` (order_number, reference, status, payment_status, subtotal/shipping_cost/service_fee/total, shipping_method, recipient/city/address), `payments` (order_id, amount, currency, method, status, reference, shipping_method), `quotes` / `quote_items` (sourcing_request_id, profile_id, subtotal, shipping_cost, service_fee, tax, discount, total, valid_until), `sourcing_requests`, `shipments` (carrier, status, origin/destination, weight_grams, package_count, shipping_cost, estimated_delivery_date, shipped_at, delivered_at), `warehouse_packages`, `staff_profiles` (`is_super_admin`), `marketplace_accounts` (marketplace_type, username, password_encrypted, is_active, is_shared), `notifications`, `exchange_rates` (source_currency, target_currency, rate, source, is_active, valid_from/valid_until), `settings` (key/value + updated_by/updated_at).

### Money-integrity rules (migration `202609210001`)

Fixes applied by this migration (each step conditional; safe to re-run):

- **Signup role escalation closed**: `handle_new_user` forces `role = 'customer'`; user_metadata role is ignored. A trigger guards `profiles.role` changes.
- **Orders money guard trigger**: non-staff callers cannot change money columns or `payment_status` on orders; newly inserted orders start `pending` and cannot arrive with payments.
- **Payments insert rule**: customers may insert payment rows only with `status = 'pending'` (no self-confirmed payments).
- **Settings policy fix**: `settings` was anon-writable; now admin-only writes.
- **Admin views hardened**: `security_invoker` views, privileges revoked from `anon`, staff/admin SELECT policies (`staff_select_all` ensured on orders, profiles, customer_profiles, sourcing_requests, quotes, shipments, warehouse_packages, staff_profiles).
- **Numeric money**: float money columns converted to `numeric(14,2)` (and `numeric(18,8)` where appropriate); `NOT VALID` CHECK constraints added on amounts.

Documented follow-ups (migration footer): replace guest-order anon readability with tokenized tracking; move `quote_items.cost_price` out of quote-owner visibility. (VALIDATE of all 10 `ck_money_*` CHECKs completed 2026-09-21 — no violations.)

### RLS model

- **anon**: read the public catalog (`source_products`, `categories`); guest orders (`user_id IS NULL`) remain readable via `orders_select_own` (known gap, see §12).
- **authenticated customer**: full access to own rows (orders, addresses, favorites, profile); payments insert pending-only; orders rows are money-guarded by triggers.
- **staff / admin / super_admin**: `auth.is_staff_or_admin()` helpers plus the `admin_*_view` projections (security_invoker — they execute with the caller's privileges, so RLS still applies).
- The Edge Functions bypass RLS **only** via `SUPABASE_SERVICE_ROLE_KEY` inside the function, after verifying the caller's JWT and role.

## 7. Edge Functions

Location: `apps/web/supabase/functions/<name>/index.ts`. Shared: `_shared/auth.ts` (`requireRole`, `requireAdmin`, `requireStaffOrAdmin`, `unauthorized`), `_shared/cors.ts` (permissive CORS `*`).

Deploy: `supabase functions deploy <name> --project-ref athkmrvsaijwgsyvwrbp`

Caller status (verified by grep): `ai-settings` + `ai-test-connection` (admin settings), `cart-validate` (mobile checkout via `src/lib/cartValidateRemote.ts`), `ai-extraction` (admin Products page "AI Extract"). `quotes-validate` and `operational-queue` are deployed with no callers yet.

### `ai-settings` (GET/POST) — admin only

- GET → `{ ok, is_configured, base_url, model, api_key_masked, updated_at, updated_by }` or `{ ok:false, error:"not_configured" }`. API key masked to first 4 + last 4 chars.
- POST `{ api_key, base_url, model }` → validation (`api_key` ≥ 10 chars, `base_url` http(s), `model` required) → upserts `settings` key `ai_provider` with `updated_by` taken from the verified admin JWT (never the body). Errors: `422 { ok:false, errors:[...] }`.
- Called by `src/components/admin/AiSettingsTab.tsx`.

### `ai-test-connection` (POST) — admin only

- POST `{ base_url, api_key, model }` → probes `<base_url>/models` (15 s timeout) → `{ ok, models_available, model_found, model_requested, note }`, or `{ ok:false, error: "unauthorized" | "forbidden" | "http_<n>" | "timeout" | "connection_failed", detail }`.
- Called by `AiSettingsTab.tsx` ("Test connection").

### `operational-queue` (GET) — staff/admin only

- Returns the mission-control actionable queue from `admin_orders_view`, `admin_sourcing_view`, `admin_payments_view` (service-role read inside the function).
- → `{ ok, total, items:[{ id, kind: "order_confirmation"|"purchase_blocked", priority, status:"open", problem, why, evidence:[...], recommendedAction, approvalRequired:"single", createdAt, updatedAt }], generatedAt }`. Capped at 100 items.
- Mirrors the typed contract in `apps/mobile/src/lib/missionControl.ts`. **No caller yet.**

### `cart-validate` (POST) — anon OK

- POST `{ items:[{ productId, quantity }] }` → per line: reads `products` (min_order_qty, stock_qty, price_cny) with the service role → `{ ok, lines:[{ productId, status:"valid"|"needs_review", problems:["below_moq"|"insufficient_stock"|"missing_product_id"], minOrderQty, stockQty, unitPriceCny }], validatedAt }`. `ok` is true only when every line is valid.
- **Caller:** mobile checkout (`apps/mobile/app/cart/checkout.tsx`) calls it through `src/lib/cartValidateRemote.ts` right before order placement. Hard problems (`below_moq`, `insufficient_stock`) block checkout with an alert; network failure never blocks (offline-first).

### `quotes-validate` (POST) — anon OK

- Server-authoritative totals: re-reads each product's `price_cny` from the DB and flags `price_mismatch` when the client-supplied `unitPriceCny` differs by more than 0.005; other problems: `missing_product_id`, `invalid_quantity`, `missing_price`.
- → `{ ok, currency:"CNY", lines:[{ ok, productId, quantity, goodsCny, status, problem }], breakdown:{ goodsCny, serviceFeeUsd:"pending", domesticDeliveryCny:"pending", internationalShippingUsd:"pending", dutiesUsd:"pending", payableNowUsd, remainingToConfirm:"pending" }, validatedAt }`. Unknown cost components are returned explicitly as `"pending"` — the function never fabricates a delivered total.
- **No caller yet** — contract is line-based, ready for a future customer quote-request flow.

### `ai-extraction` (POST) — staff/admin only, real model call

- POST `{ content, schema }` → caller must be staff/admin (`401 staff_required` otherwise). Rejects prompt-injection markers with `422 { blocked:true, reason:"prompt_injection_marker" }`; requires a non-empty schema (object map, string[], or `{name,type}` entries).
- Loads the admin-configured provider from `public.settings` (`ai_provider`: base_url/api_key/model — only staff can write settings), enforces https + no private hosts on `base_url`, then calls `POST {base_url}/chat/completions` with ZERO tools, temperature 0.1, a strict JSON-only system prompt, and a 25 s timeout.
- Validates the model output against the schema (type coercion, `missing[]` for unfilled fields) → `{ ok, data, missing, policy:{ toolsEnabled:false, actionAuthorization:"none" }, model }`. Errors: `503 ai_provider_not_configured`, `502 model_call_failed`/`model_output_not_json`, `500 model_timeout`.
- **Caller:** admin Products page ("AI Extract from listing" panel in the Add-Product side panel, `apps/web/src/app/admin/(protected)/products/page.tsx`) — fills title/category/price/moq/description + detects marketplace from the URL for admin review before saving.


## 8. Security Model

- **Anon key is public by design** — baked into `next.config.ts` (web) and `app.config.js` (mobile). Confidentiality comes from RLS, not key secrecy.
- **No service-role client in the web bundle** — `apps/web/src/lib/supabase.ts` exports the anon client and `edgeFetch()` only. Service-role access exists exclusively inside Edge Functions, behind caller verification.
- **Admin auth** — Supabase Auth email/password at `/admin/login`; the `(protected)` layout redirects unauthenticated users (UX guard only). Recovery/fallback code paths are gated by `NEXT_PUBLIC_DEV_BUILD` and inert in production (`src/lib/adminSession.ts`).
- **Role forcing at signup** and **money guards** — see §6.
- **Edge Function auth model** — `_shared/auth.ts` verifies the bearer JWT against Supabase Auth, loads `profiles.role`, and allows only listed roles; privileged queries then run with the service role. Anonymous callers can only reach `cart-validate` and `quotes-validate` (product/MOQ validation, no user data); `ai-settings`, `ai-test-connection`, `ai-extraction` and `operational-queue` require staff/admin.
- **CORS** — `_shared/cors.ts` allows all origins for function calls; functions themselves authenticate callers.

### Security headers (root `vercel.json` — the single source of truth)

| Header | Value |
|--------|-------|
| Content-Security-Policy | `default-src 'self'`; scripts `'self' 'unsafe-inline' 'unsafe-eval' https://*.vercel-scripts.com`; styles `'self' 'unsafe-inline'`; images self/data/blob + Supabase, WhatsApp, lk888.ai, Google avatars; connect self + Supabase (incl. `wss://`) + Vercel + lk888.ai + translate.googleapis.com; frames limited to 1688/Taobao/YiwuGo/Alibaba/ChinaGoods/JD (m. + www.); form-action wa.me; `frame-ancestors 'none'`; `upgrade-insecure-requests` |
| Strict-Transport-Security | `max-age=63072000; includeSubDomains; preload` |
| X-Frame-Options | `DENY` |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | accelerometer/camera/geolocation/microphone/payment/usb/autoplay/gyroscope/interest-cohort all disabled |
| COOP / CORP | `same-origin` / `same-site` |
| X-Powered-By | removed (empty) |
| `/admin/:path*` | `Cache-Control: no-store, no-cache, must-revalidate, private`, `Pragma: no-cache`, `X-Robots-Tag: noindex, nofollow` |
| `/app/chinasuuq.apk` | `Content-Disposition: attachment; filename=chinasuuq.apk`, `nosniff` |
| Redirects | `www.chinasuuq.com → chinasuuq.com` (301) |

Because the web app is a static export, Next.js `headers()`/`proxy.ts` never run in production; `proxy.ts` was deleted and `next.config.ts` documents that `vercel.json` is authoritative.

## 9. Mobile App (Expo)

- **Stack**: Expo SDK 57, React Native 0.86.3, React 19.2.3, Expo Router (~57.0.19), zustand 5, zod, `lucide-react-native`, `react-native-webview` (in-app marketplace browsing), Reanimated 4, AsyncStorage 2.2. TypeScript ~6.0.3 (web uses ^5 — known drift).
- **Config**: `app.json` (version, `android.versionCode`, package `com.chinasuuq.app`, EAS project `a8484922-0c4f-4f79-b4be-f93fe1dd5747`, owner `baaaane24`) merged by `app.config.js`, which reads `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` with baked defaults into `extra`.
- **Routes** (`app/`): `(auth)/` login/signup, `(tabs)/` home, markets, orders, account (cart badge); `product/[id]`, `marketplace/[marketplace]` (WebView + shared-account RPC), `cart/`, `orders/`, `profile/` (addresses, payment methods, wishlist, legal pages …), `settings/`, `notifications/`, `support/`, `search/`, `onboarding`, `+not-found`.
- **Local-first repository** (`src/db/index.ts`): every screen read/write goes through it — tries Supabase first (orders, products, sourcing captures, profile, addresses, payments, favorites, support tickets, notifications), transparently falls back to AsyncStorage when the backend is unreachable (`isBackendOnline()` health check with 60 s cache), and writes through to Supabase when it returns.
- **Status mapping** (`src/lib/supabase-adapter.ts`): bidirectional map between the mobile pipeline (`pending, confirmed, purchasing, purchased, in_transit_china, warehouse, inspection, consolidated, shipped, in_transit, arrived_somalia, customs, ready_for_pickup, out_for_delivery, delivered, cancelled`) and DB statuses (`in_warehouse`, `inspection_passed`, `customs_hold`, `out_for_delivery`, `sourcing`, `quoted`, `awaiting_payment`, …). The admin `supabase-data.ts` mirrors the same mappers.
- **i18n**: `src/i18n/en.json` + `so.json` via `src/lib/i18n.tsx` context.
- **Marketplace browsing**: WebView flow; shared marketplace accounts come from the `get_shared_marketplace_account` RPC (returns only active `is_shared = true` accounts).
- **EAS build profiles** (`eas.json`): `development`, `preview` (Android APK), `production`. EAS workflow YAMLs live in `apps/mobile/.eas/workflows/` (`build-dev.yml`, `production.yml`) — these are EAS workflows, not GitHub Actions.

### APK release process

1. `eas build -p android --profile preview` (or production profile as needed).
2. Download the APK from the EAS dashboard.
3. Replace `apps/web/public/app/chinasuuq.apk`.
4. Bump `expo.version` / `expo.android.versionCode` in `apps/mobile/app.json`.
5. Commit and push; Vercel serves the new APK at `https://chinasuuq.com/app/chinasuuq.apk` (with `Content-Disposition: attachment`). CI verifies the file ships in the static export and that the landing page still links it.


## 10. Design System

Tailwind CSS v4 with CSS-first tokens in `apps/web/src/app/globals.css` (`@theme` variables consumed as standard Tailwind utilities — `bg-brand-500`, `text-dark-900`, `bg-warm-50`).

### Color tokens (web)

| Scale | Values |
|-------|--------|
| `brand` | 50 `#FFF7ED` · 100 `#FFEDD5` · 200 `#FED7AA` · 300 `#FDBA74` · 400 `#FB923C` · **500 `#FF5A0A` (primary)** · 600 `#E84400` · 700 `#C2410C` · 800 `#9A3412` · 900 `#7C2D12` |
| `dark` | 50 `#F8F8F8` · 100 `#E9E5E1` (borders) · 200 `#D1CCC7` · 300 `#A8A29E` · 400 `#78716C` · 500 `#57534E` · 600 `#44403C` · 700 `#292524` · 800 `#1C1917` · **900 `#111111` (text/headings)** · 950 `#0A0A0A` |
| `warm` | 50 `#FFFCF8` (page background) · 100 `#FFF8F0` · 200 `#FFF3E9` (accent surfaces) |

Base page: `background: var(--color-warm-50)`, text `dark-900`. Mobile mirrors these in `apps/mobile/src/lib/theme.ts`.

### Admin utility classes (`globals.css`)

| Class | Purpose |
|-------|---------|
| `admin-input` | Standard text input (h-10, rounded-xl, `border-dark-900/10`, brand focus ring) |
| `admin-label` | Small uppercase field label |
| `admin-btn-primary` | Solid `bg-brand-500 hover:bg-brand-600` action button |
| `admin-btn-ghost` / `admin-btn-outline` / `admin-btn-danger` | Secondary / outlined / destructive buttons |
| `admin-table` | Table styling with brand-tinted row hover |

Fonts: Inter (mobile loads it via `@expo-google-fonts/inter`). Icons: `lucide-react` (web) / `lucide-react-native` (mobile). Landing animations: framer-motion, with below-the-fold sections split via `next/dynamic` (`optimizePackageImports` for framer-motion + lucide in `next.config.ts`).

Tailwind v4 runs through `@tailwindcss/postcss`, with optional pinned platform packages (`@tailwindcss/oxide`, `lightningcss-linux-x64-gnu`) for reproducible builds.

## 11. Deployment & CI

### Web — Vercel (project root = repo root)

- Root `vercel.json`: install `npm install`, build `cd apps/web && npm run build`, output `apps/web/out`, redirects + all security headers.
- Auto-deploys on push to `main`. The build is a full static export (`next build --webpack` with `output: "export"`, type errors NOT ignored). CI additionally asserts `out/index.html` and `out/app/chinasuuq.apk` exist.
- There is no server runtime: no API routes, no ISR, no middleware. Dynamic behavior = client-side Supabase + Edge Functions.

### Mobile — EAS

- Profiles: `development` / `preview` (APK) / `production` in `apps/mobile/eas.json`.
- EAS workflows: `apps/mobile/.eas/workflows/build-dev.yml`, `production.yml` (validated by CI; YAML check is best-effort if `js-yaml` is unavailable).

### CI (`.github/workflows/ci.yml`, Node 22, push/PR → `main`)

1. **web-build**: `tsc --noEmit` → `eslint` (non-blocking) → `next build` → verify static output (`out/index.html`, `out/app/chinasuuq.apk`) → verify landing page references `app/chinasuuq.apk`.
2. **mobile-config**: `app.json` + `eas.json` JSON validation, EAS workflow YAML validation.
3. **guard**: repo hygiene — fails when agent/tool state dirs (`.agent-teams/`, `.hermes/`, `.zcode/`, `supabase/.temp/`, `.DS_Store`) are tracked.

### Local build notes (this machine)

- `~/.npm` has a cache ownership problem (npm suggests `sudo chown -R 501:20 ~/.npm`); use `npm install --cache /tmp/npm-cache-chinasuuq` locally.

## 12. Known Gaps & Follow-ups

1. **Partially orphaned Edge Functions** — `cart-validate` is wired into mobile checkout and `ai-extraction` into the admin Products page. `quotes-validate` (line-based contract, awaiting a customer quote-request flow) and `operational-queue` (duplicated by direct admin-view queries in the dashboard) remain deployed but uncalled — wire or drop when those surfaces are built.
2. **Guest-order tracking** — anon-readable guest orders (`orders_select_own`) pending tokenized reference lookup (migration footer).
3. **`quote_items.cost_price` exposure** to quote owners (migration footer proposes `supplier_options`).
4. ~~CHECK constraints `NOT VALID`~~ — DONE: all 10 constraints validated against live data (2026-09-21).
5. **AI extraction is a stub** — `model_call_not_yet_wired`; the AI provider credentials live in `settings` (`ai_provider`) managed via `ai-settings`.
6. **ESLint debt** — ~77 pre-existing errors in `apps/web` (mostly `@typescript-eslint/no-explicit-any`, react-hooks rules in admin pages); lint is non-blocking in CI, typecheck + build are the gates.
7. **TS version drift** — web TS ^5 vs mobile ~6.0.3.
8. **`expo-secure-store`** declared but unused in mobile.
9. **Legacy admin mock store** (`src/lib/admin/store.ts`, `seed*.ts`) is unreferenced dead code.
10. **No realtime** — order status updates are pull-based; nothing subscribes to Supabase Realtime.

## 13. Appendix — Key Constants

| Constant | Value | Defined in |
|----------|-------|------------|
| WhatsApp number / link | `8615277074143` / `https://wa.me/8615277074143` | `packages/shared/constants.ts` |
| Air freight | $8.50/kg, min $15 | `apps/mobile/src/lib/shipping.ts` |
| Sea freight | $2.20/kg, min $25, min chargeable 10 kg | `apps/mobile/src/lib/shipping.ts` |
| Marketplaces (web) | 1688, Taobao, YiwuGo, Alibaba, Chinagoods, JD | `apps/web/src/lib/marketplaces.ts` |
| Marketplaces (mobile) | same six + `dollarstore` ("1$ Dollar Store") | `apps/mobile/src/lib/marketplaces.ts` |
| EAS project / owner | `a8484922-0c4f-4f79-b4be-f93fe1dd5747` / `baaaane24` | `apps/mobile/app.json` |
| Android package | `com.chinasuuq.app` | `apps/mobile/app.json` |
| Dev admin recovery code | `chinasuuq-dev` (only when `NEXT_PUBLIC_DEV_BUILD=1`) | `apps/web/src/lib/adminSession.ts` |

---

*Maintained by hand against the codebase (last pass: route inventory, admin data sources, edge function contracts, migrations, and security headers all re-verified from source). When behavior changes, update this file and the root `README.md` together.*
