# ChinaSuuq — Platform Documentation

> **Live**: https://chinasuuq.com · **Admin**: https://chinasuuq.com/admin · **APK**: https://chinasuuq.com/app/chinasuuq.apk
> **Supabase project**: `athkmrvsaijwgsyvwrbp` (`athkmrvsaijwgsyvwrbp.supabase.co`)
> This document describes the codebase as it is. For the short version see the root `README.md`.
>
> **Schema truth rule**: the live project is authoritative, not this repo. Several base
> migrations were never committed here, so a column that exists locally may be absent in
> production and vice versa. Before writing any projection, read `information_schema` on the
> live project (see §11 "Querying production"). PostgREST fails the *whole* request with
> `42703` when one selected column is missing, and the clients swallow errors — that is the
> single most common cause of an empty screen in this codebase.

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

ChinaSuuq connects Somali buyers with Chinese suppliers. The web app ships seven storefronts from `apps/web/src/lib/marketplaces.ts` — 1688, Taobao, YiwuGo, Alibaba, Chinagoods, JD and the 1$ Dollar Store — and the mobile app ships the same seven. The live `marketplaces` table is a **different** list (1688, alibaba, chinagoods, jd, taobao, yiwugo, `chinasuuq-deals`: no `dollarstore`), which is the schema-drift pattern in §6 — public pages read the code list, `logo_url` is NULL for every row. The platform covers discovery → sourcing requests → quotes → orders → payment (Somali mobile money) → warehouse consolidation → international air/sea freight → delivery.

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
│   │   │   ├── functions/          8 Edge Functions + _shared/
│   │   │   ├── migrations/         29 SQL migrations
│   │   │   └── audit/              schema probe + local_verify regression harness
│   │   └── public/app/chinasuuq.apk
│   └── mobile/                     Expo SDK 57, React Native 0.86.3, Expo Router
│       ├── app/                    (auth)/, (tabs)/, product/, marketplace/, cart/, orders/,
│       │                           profile/, settings/, notifications/, support/, search/
│       ├── src/
│       │   ├── api/                trending.ts (home feed), productEvents.ts, translate.ts
│       │   ├── config/             marketplaceRegistry.ts (hosts/currencies/search URLs)
│       │   ├── db/index.ts         Local-first repository (Supabase → AsyncStorage fallback)
│       │   ├── lib/                supabase.ts, shipping.ts, exchange.ts, i18n.tsx, moq.ts,
│       │   │                       moqIngest.ts, cartValidation.ts, missionControl.ts, ...
│       │   ├── store/              Zustand: cart.ts, auth.ts
│       │   ├── i18n/               en.json, so.json
│       │   └── components/         home/, cart/, orders/, product/, profile/, checkout/, ui/
│       ├── app.json / app.config.js / eas.json / .eas/workflows/
│       └── .easignore              keeps node_modules/dist/ios/android out of EAS uploads
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
- **Realtime** is used in one place: the admin shell (`src/app/admin/(protected)/layout.tsx`) subscribes to a single `admin-live` channel of `postgres_changes` listeners and forwards every event into `src/lib/admin/live-store.ts`. The store debounces bursts (`REFETCH_DEBOUNCE_MS = 1500`) because one order write fans out across `orders`, `order_items` and `notifications`, and stamps each dirty table so a screen only refetches when a table it actually reads changes. The mobile app has no realtime subscriptions (verified: no `.channel(` under `apps/mobile/app` or `apps/mobile/src`); it is pull-based with an AsyncStorage fallback.


## 4. Web App — Routes & Data

All pages are statically exported (`trailingSlash: true`, images unoptimized; remote images allowed from `*.supabase.co` storage and `cod.lk888.ai` via `next.config.ts`).

### Asset budget

`images.unoptimized: true` is forced by `output: "export"` — there is no image server — so byte weight is controlled at build time instead: every photographic/illustrated file the site references is a WebP derivative produced with `cwebp -q 80` (`apps/web/public/images/**`, `apps/web/public/markets/**`, `apps/web/public/admin/**`). Referenced artwork went from ~34 MB of PNG to ~0.6 MB of WebP, and `apps/web/public/` from 117 MB to 50 MB. The two deliberate non-WebP exceptions are `images/logo/chinasuuq-logo.jpg` (108 KB, used as the brand logo) and `images/og-image.png` (social card — crawlers do not reliably fetch WebP `og:image`). ~33 MB of superseded PNG/JPG remains in `public/images/` unreferenced (see §12).

### Public routes (`src/app/(public)/`)

| Route | Purpose |
|-------|---------|
| `/` | Landing: hero, search, marketplace cards, how-it-works, trust bar, app download, footer |
| `/marketplaces/` | Marketplace index |
| `/marketplaces/{1688,taobao,yiwugo,alibaba,chinagoods,jd,dollarstore}/` | Per-marketplace pages (`[id]` route; slugs from `src/lib/marketplaces.ts`) |
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
- `src/lib/admin/supabase-data.ts` — typed helpers over the real database: status mappers (mobile ↔ DB), `getDashboardKpis()` (the `admin_*` rollup RPCs with a documented per-metric `null` when a call fails), `listOrders()`/`updateOrder()` (via `admin_orders_view`), `listCustomers()` (`admin_customers_view`, explicit column list — never `select("*")`), product CRUD on `source_products`, marketplace accounts, sourcing, payments, exchange rates, quotes, shipments, warehouse packages, staff, settings get/set.
- `src/lib/admin/live-store.ts` — the Zustand realtime store described in §3 (`bumpLive`, `useLiveVersion(tables?)`, `useLiveConnected`).
- `src/lib/admin/csv.ts` + `TableControls.tsx` + `useTablePrefs.ts` + `useUrlFilters.ts` — the shared Mission Control table layer: column visibility/sort/page prefs persisted per table, and filter state held in the URL so a filtered view is shareable and survives a reload.
- `src/lib/admin/store.ts` + `seed*.ts` — **legacy localStorage-backed mock store (`useAdminData`) with demo seed data. No page imports it anymore; it is dead code kept only as reference.**
- Every admin page reads and writes **real Supabase tables/views** with the anon client (RLS applies). There is no mock or offline mode in the shipped admin.

## 5. Admin Console

`/admin` requires Supabase Auth. `admin/(protected)/layout.tsx` redirects to `/admin/login` when there is no session (a UI guard — the actual access control is RLS). The dev-only recovery path (`NEXT_PUBLIC_DEV_BUILD`) is inert in production (`src/lib/adminSession.ts`).

### Modules and their real data sources

| Module (route) | Reads / writes |
|----------------|----------------|
| Dashboard `/admin` | Staff-only rollup RPCs — `admin_kpis()`, `admin_revenue_daily()`, `admin_revenue_by_marketplace()`, `admin_order_status_counts()`, `admin_category_product_counts()` — plus head-counts on `shipments`, `source_products`, `sourcing_requests`, `notifications`, a narrow top-6 `source_products` query ordered by `sales_count`, recent orders and the activity feed. Every metric that cannot be computed is rendered as an em dash, never as `0`. |
| Customers `/admin/customers` | `admin_customers_view` via `listCustomers()` (explicit columns), orders via `listOrders()`, and `Customer360Drawer.tsx` for one customer's profile + orders + line items |
| Products `/admin/products` | `source_products` CRUD + "AI Extract from listing" (`ai-extraction`) |
| Orders `/admin/orders` | `admin_orders_view` via `listOrders()`, updates via `updateOrder()` on `orders`, line-level provenance through `admin_order_items_view` (`OrderProvenance.tsx`) |
| Payments `/admin/payments` | `payments` (list, insert, update status, delete) |
| Quotes `/admin/quotes` | `quotes` (list, insert, update, delete) |
| Rates `/admin/rates` | `exchange_rates` (list, insert, update, delete) |
| Sourcing `/admin/sourcing` | `sourcing_requests` + `sourcing_request_items` through `SourcingBoard.tsx` (per-line fulfilment steps; each write re-reads the row to confirm RLS accepted it) |
| Shipments `/admin/shipments` | `shipments` (list, insert, update, delete) |
| Warehouse `/admin/warehouse` | `warehouse_packages` (list, insert, update, delete) |
| Staff `/admin/staff` | `staff_profiles` (list, insert, update; `is_super_admin` flag) |
| Marketplaces `/admin/marketplaces` | `marketplace_accounts` (list, insert, update, delete) |
| Settings `/admin/settings` | `settings` key/value, password change (`auth.updateUser`), AI provider tab via Edge Functions (`ai-settings`, `ai-test-connection`) |

### Live behaviour and provenance

- The shell's realtime channel (§3) drives badge counts and list refreshes; the "Live" pill in the dashboard header reflects the actual socket state (`useLiveConnected()`), because it previously claimed Live through silent stalls.
- **What every customer bought, from which app** is answered per line item, not inferred: `order_items` carries `marketplace_key`, `source_url`, `image_url`, `unit_price_cny`, `exchange_rate`, `moq_at_purchase`, `variant_name` and an `origin` (`staff | orders_jsonb | quote | admin_import | api`) — see `202609240004_order_item_provenance.sql`. `OrderProvenance.tsx` renders that per line (which marketplace logo, which captured URL, what MOQ was in force at purchase time). Marketplace attribution for revenue comes from `admin_revenue_by_marketplace()`, which apportions each order's lines by line money instead of guessing from the destination city.
- Tables share `TableControls.tsx` (search / column visibility / page size / sort, persisted by `useTablePrefs.ts`) and CSV export through `src/lib/admin/csv.ts`.

### UI conventions

Shared admin components live in `src/components/admin/` (`DataTable`, `StatusBadge`, `Modal`, `ConfirmDialog`, `Toast`, `FormInput`, `KPICard`, `ui/` primitives) plus `AiSettingsTab.tsx` for the AI provider form. Styling uses the `admin-*` utility classes from `globals.css` (see §10).


## 6. Database — Schema, Money Integrity, RLS

### Migrations (`apps/web/supabase/migrations/`, 29 files)

The live project is authoritative, not this folder: several base migrations were never
committed here, so a column can exist locally and be absent in production (or the reverse).
PostgREST answers `42703`/`PGRST204` for the **whole request** when one selected column is
missing, and the clients swallow the error — that is why empty admin screens keep recurring.
Check `information_schema` on the live project before writing any projection, and apply SQL
through the Management API (§11), recording each version in
`supabase_migrations.schema_migrations`.

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
| `202608140001_ai_settings.sql` | AI provider settings storage (superseded by `202609240002`) |
| `202609210001_money_integrity_rls_hardening.sql` | Money + RLS hardening (details below) |
| `202609240001_shared_marketplace_account_rpc.sql` | `get_shared_marketplace_account(marketplace)` — SECURITY DEFINER RPC returning only the active shared account for one marketplace (used by the mobile WebView flow) |
| `202609240002_ai_secret_containment.sql` | `ai_provider_config` (single row, service-role only) replaces the `settings` → `ai_provider` row; secret-key filter on the `settings_select` policy + `settings_secret_guard()` trigger; `app_settings` policies tightened |
| `202609240003_admin_rollups.sql` | `_require_admin_metrics_access()` gate + `admin_kpis()`, `admin_revenue_daily()`, `admin_revenue_by_marketplace()`, `admin_order_status_counts()`, tolerant `_jsonb_number/_jsonb_text` readers |
| `202609240004_order_item_provenance.sql` | `order_items` provenance columns (`marketplace_key`, `source_url`, `unit_price_cny`, `exchange_rate`, `moq_at_purchase`, `variant_name`, `origin`, `image_url`, …), `sync_order_items()` + `trg_orders_order_items_sync`, backfill, `admin_order_items_view` |
| `202609250000_admin_realtime_publication.sql` | Adds `orders`, `sourcing_requests`, `notifications`, `shipments` to the `supabase_realtime` publication (idempotent, warns if Realtime is not provisioned) |
| `202609250001_translation_cache.sql` | `translations` table (PK `source_hash, target_lang`), RLS, `translations_view` (security_invoker) |
| `202609250002_trending_products.sql` | `product_events` + `record_product_event()`, `fn_trending_products(days, limit)` (weights view 1 / search_click 2 / add_to_cart 4 / order 8, 3-day half-life decay), `admin_product_events_view` (no `session_id`) |
| `202609250003_moq_extraction.sql` | `source_products.moq / moq_source / moq_confidence / moq_raw_text / moq_reviewed_at` + checks, `record_moq_candidate()` (service-role only; machine values may never override a manual decision or lower confidence), `moq_review_queue` view |
| `202609250004_catalog_display_columns.sql` | Curated display columns on `source_products` (`title_english/somali/original`, `description_*`, `category`, `images[]`, `attributes`, `price_cny_min/max`, `price_usd_estimated`, `stock_status`, `sales_count`, `supplier_rating`) + backfill + `source_products_sync_display_fields` trigger |
| `202609250005_live_catalog_columns.sql` | Aligns the repo contract with the live shape: `status` (`draft/active/archived`), `category`, `price_usd_estimated`, plus `idx_source_products_status_stock` |
| `202609260001_mobile_order_submit.sql` | `submit_mobile_order(...)` — the mobile write path (details in §9) + `_cs_*` item/enum helpers |
| `202609270001_admin_live_and_counts.sql` | Publishes `source_products` and `payments` for Realtime; `admin_category_product_counts()` (active categories + per-category head-count in one request) |

Apply through the Supabase Management API (§11) and record the version in
`supabase_migrations.schema_migrations`; `supabase db push` is **not** used here, because the
live project contains objects this folder never captured and a push would try to reconcile
against them. Each file is written to be safe to re-run: `ADD COLUMN IF NOT EXISTS`,
`CREATE OR REPLACE FUNCTION`, guarded `DO $$ … $$` blocks, and idempotent
`ALTER PUBLICATION … ADD TABLE` guarded by `pg_publication_tables`. Before applying, the SQL
is dry-run inside `BEGIN; … ROLLBACK;` so a failing statement is caught without changing data.

### Server-side metrics and guards

- **Rollups** (`202609240003`): the dashboard stopped deriving money numbers in the browser. `admin_kpis()` returns `(metric, value, prev_value, delta_pct)` rows (revenue all-time / 90d / 30d / today, orders by state, delivery rate, AOV, new customers, plus `to_regclass`-guarded ops counters), `admin_revenue_daily(p_days)` returns a zero-filled date spine, `admin_revenue_by_marketplace(p_days)` apportions each order across its lines' marketplaces, `admin_order_status_counts(p_days)` groups by status, and `admin_category_product_counts()` returns active categories with a real per-category head-count.
- **Gate**: every one of these is `STABLE SECURITY DEFINER SET search_path = public, pg_temp` and starts with `PERFORM public._require_admin_metrics_access()`, which raises unless `public.is_staff_or_admin()`; `EXECUTE` is revoked from `anon` and granted to `authenticated`. Because they aggregate other users' rows past RLS, they must never be reachable by anonymous callers.
- **Secret containment** (`202609240002`): AI provider credentials live in `public.ai_provider_config` (one row, `id = 1`), which has RLS enabled with **no policies** — only the service role can read it. `settings` gained a `settings_secret_guard` trigger and a `settings_select` policy that rejects secret-looking keys, so a future provider key cannot be re-saved into a public table.
- **Realtime publication**: `orders`, `sourcing_requests`, `notifications`, `shipments`, `source_products`, `payments`. Membership in the publication controls who sees the change *stream*, not who can read rows — Realtime authorises each subscription with the connecting client's role and RLS policies.

### Core tables (as used by the code)

`profiles` (with `role`), customer profiles, `addresses`, `source_products` (marketplace, titles, CNY/USD prices, MOQ, stock, images), `orders` / `order_items` (order_number, reference, status, payment_status, subtotal/shipping_cost/service_fee/total, shipping_method, recipient/city/address), `payments` (order_id, amount, currency, method, status, reference, shipping_method), `quotes` / `quote_items` (sourcing_request_id, profile_id, subtotal, shipping_cost, service_fee, tax, discount, total, valid_until), `sourcing_requests`, `shipments` (carrier, status, origin/destination, weight_grams, package_count, shipping_cost, estimated_delivery_date, shipped_at, delivered_at), `warehouse_packages`, `staff_profiles` (`is_super_admin`), `marketplace_accounts` (marketplace_type, username, password_encrypted, is_active, is_shared), `notifications`, `exchange_rates` (source_currency, target_currency, rate, source, is_active, valid_from/valid_until), `settings` (key/value + updated_by/updated_at).

Added by the 2026-09 work:

- `source_products` display columns: `title_english` / `title_somali` / `title_original`, `description_english` / `description_somali` / `description_original`, `category`, `images text[]`, `attributes jsonb`, `price_cny_min` / `price_cny_max` / `price_usd_estimated` / `domestic_shipping_cny`, `stock_status` (`in_stock|low_stock|out_of_stock`), `sales_count`, `supplier_rating`, `status` (`draft|active|archived`) — and MOQ provenance `moq`, `moq_source` (`manual|regex|ai`), `moq_confidence numeric(4,3)`, `moq_raw_text`, `moq_reviewed_at`. Both vocabularies exist in production, so readers accept either spelling (`apps/mobile/src/db/index.ts` `mapRowToProduct`); the curated columns are what new writes fill.
- `order_items` provenance: `marketplace_key`, `marketplace`, `source_url`, `image_url`, `unit_price` / `total_price` / `currency`, `unit_price_cny`, `exchange_rate`, `moq_at_purchase`, `variant` / `variant_name`, `origin` (`staff|orders_jsonb|quote|admin_import|api`), pipeline flags, `metadata`.
- `product_events` (`product_id`, `event_type` in `view|add_to_cart|order|search_click`, `marketplace_key`, `session_id`, `created_at`) — append-only from anon and authenticated, SELECT only for staff.
- `translations` (`source_text`, `source_hash`, `target_lang`, `translated_text`, `provider`, `model`; PK `(source_hash, target_lang)`) — the AI translation cache; `authenticated` may read, only the service role writes.
- `ai_provider_config` — see "Secret containment" below. Not readable by any client role.

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

Location: `apps/web/supabase/functions/<name>/index.ts` — 8 functions. Shared: `_shared/auth.ts` (`requireRole`, `requireAdmin`, `requireStaffOrAdmin`, `unauthorized`), `_shared/cors.ts` (permissive CORS `*`), `_shared/ai-provider.ts` (`validateProviderBaseUrl`, `loadAiProviderConfig`).

Deploy: `supabase functions deploy <name> --project-ref athkmrvsaijwgsyvwrbp`

Caller status (verified by grep): `ai-settings` + `ai-test-connection` (admin settings), `ai-extraction` (admin Products page), `cart-validate` (mobile checkout via `src/lib/cartValidateRemote.ts`), `product-enrich` (mobile `enrichMoqWithAi()`), `ai-translate` (only `apps/mobile/src/api/translate.ts`, which no screen imports yet). `quotes-validate` and `operational-queue` are deployed with no callers.

### `_shared/ai-provider.ts`

The three AI functions share one provider-config reader instead of each parsing `settings`:

- `validateProviderBaseUrl(raw)` — https only, no userinfo, port 443 only, and the host is rejected when it is `localhost`/`*.internal`, an IPv4 private / CGNAT / link-local address (including `169.254.169.254`), multicast or reserved, or an IPv6 loopback / ULA / link-local / v4-mapped address. This is the SSRF guard; the previous inline check in `ai-extraction` only looked for an internal host after an `@`.
- `loadAiProviderConfig(client)` — reads the `ai_provider_config` row `id = 1` (`base_url`, `api_key`, `model`, `is_configured`) with a **service-role** client and returns `null` when unconfigured or when the URL fails validation. The key is only ever placed in the `Authorization` header of the provider call; it is never logged, returned, or echoed in an error.

### `ai-translate` (POST) — any signed-in role

- POST `{ texts: string[], target_lang: string }` → cache-first translation. Caps: 40 texts, 2000 characters each (`413 too_many_texts` / `text_too_long`); `target_lang` must match `^[A-Za-z]{2}(-[A-Za-z]{2,4})?$`.
- Reads hits from `translations` by `target_lang` + `source_hash IN (…)`, re-checking `source_text` so a hash collision cannot serve the wrong string; only the misses go to the provider in one `chat/completions` call (temperature 0.1, `response_format: json_object`, 30 s abort), and results are upserted back into `translations`.
- → `{ ok:true, results:[{ source, translated, cached }], target_lang, counts:{ requested, cached, translated } }`. Errors: `authentication_required`(401), `ai_provider_not_configured`(503), `cache_read_failed`(500), `model_call_failed`/`model_output_not_json`/`model_output_unexpected`(502), `model_timeout`/`translation_failed`(500).
- **Caller:** `apps/mobile/src/api/translate.ts` (LRU + AsyncStorage cache, fail-open to the original string). No screen imports that module yet, so the mobile UI is still English/Somali from the bundled dictionaries.

### `ai-settings` (GET/POST) — admin only

- GET → `{ ok, is_configured, base_url, model, api_key_masked, updated_at, updated_by }` or `{ ok:false, error:"not_configured" }`. API key masked to first 4 + last 4 chars.
- POST `{ api_key, base_url, model }` → validation (`api_key` ≥ 10 chars, `base_url` https + `validateProviderBaseUrl()`, `model` required) → upserts the **`ai_provider_config`** row `id = 1` with `updated_by` taken from the verified admin JWT (never the body). Errors: `422 { ok:false, errors:[...] }`.
- Storage moved out of `settings` in `202609240002_ai_secret_containment.sql`; `settings` now rejects secret-shaped keys outright. Only the function reaches the table (service role), and the migration deleted the old `ai_provider` row after copying it.
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

### `product-enrich` (POST) — any signed-in role

Turns captured marketplace page text into structured MOQ/price data, and is the only AI path allowed to write MOQ.

- POST `{ title (required), product_id? (must be a UUID), marketplace?, evidence | snippet | page_text }` — exactly the body `moqIngest.buildMoqCapture()` produces. Rejects `title_required`, `content_required`, `product_id_not_uuid`, `input_too_large` (413 over 12 000 characters of the assembled prompt), and prompt-injection markers (`422 blocked:true`).
- One `chat/completions` call (temperature 0, `max_tokens: 700`, the listing wrapped in `"""`), 40 s abort.
- **Anti-hallucination gate before anything is stored:** a reported MOQ must appear as that exact number on a line of the evidence the caller submitted, otherwise it is dropped and noted as `moq_unquoted_rejected:<n>`. Confidence is assigned server-side from how explicit the quoted line was (labelled → `0.85`, unquoted-but-found → `0.6`, rejected → `min(claimed, 0.05)`) and is deliberately capped **below** the `0.9` the mobile local parser reports for an explicit "起批量", so a machine reading can never outrank a regex reading that staff can see. Price ≤ 10,000,000 CNY, at most 20 variant hints.
- When a valid `product_id` and MOQ survive, it writes through `record_moq_candidate(...)` as the service role — the client cannot call that RPC directly — and reports the verdict in `recorded` (`written | unchanged | blocked_manual | not_improvement | product_not_found | rejected_* | not_recorded_no_moq`).
- → `{ moq, moq_confidence, moq_raw_text, price_cny, variant_hints, notes[], recorded, provider_used, model }`.
- **Caller:** `apps/mobile/src/db/index.ts` `enrichMoqWithAi()`, reached from the "Ask AI" button on `MoqEvidenceCard` in the marketplace capture-review sheet and the smart product form.


## 8. Security Model

- **Anon key is public by design** — baked into `next.config.ts` (web) and `app.config.js` (mobile). Confidentiality comes from RLS, not key secrecy.
- **No service-role client in the web bundle** — `apps/web/src/lib/supabase.ts` exports the anon client and `edgeFetch()` only. Service-role access exists exclusively inside Edge Functions, behind caller verification.
- **Admin auth** — Supabase Auth email/password at `/admin/login`; the `(protected)` layout redirects unauthenticated users (UX guard only). Recovery/fallback code paths are gated by `NEXT_PUBLIC_DEV_BUILD` and inert in production (`src/lib/adminSession.ts`).
- **Role forcing at signup** and **money guards** — see §6.
- **Edge Function auth model** — `_shared/auth.ts` verifies the bearer JWT against Supabase Auth, loads `profiles.role`, and allows only listed roles; privileged queries then run with the service role. Anonymous callers can only reach `cart-validate` and `quotes-validate` (product/MOQ validation, no user data); `ai-settings`, `ai-test-connection`, `ai-extraction` and `operational-queue` require staff/admin; `ai-translate` and `product-enrich` require any signed-in role (they cost provider credits and write shared state, so an anonymous key cannot be spent).
- **AI credentials** — the provider key lives in `public.ai_provider_config`, which has RLS enabled and **no policies**: no client role can read it, signed-in or not. Only Edge Functions holding the service key reach it, they mask it on read (`api_key_masked`, first 4 + last 4), and `settings` refuses secret-shaped keys so it cannot leak back into an anon-readable table. The key was pasted into a chat while wiring this up and still needs rotating at the provider.
- **Append-only telemetry** — `product_events` grants INSERT to `anon`/`authenticated` but SELECT only to staff (`is_staff_or_admin()`), and `record_product_event()` throttles to one event per product/type/user per 60 s. `admin_product_events_view` deliberately omits `session_id`.
- **MOQ authority** — a supplier's stated minimum is business data, not user data: any signed-in role may read `source_products.moq*`, but writes go through `record_moq_candidate()`, which is granted to `service_role` only and refuses to let a machine reading override a `manual` decision or raise a confidence above what the evidence supports.
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
- **Real orders** (`submit_mobile_order`): `createOrder()` calls the `submit_mobile_order(p_reference, p_shipping_method, p_delivery_address, p_destination_city, p_notes, p_service_fee_pct, p_items jsonb)` RPC (migration `202609260001`) and `syncPendingOrders()` replays whatever was queued while offline. The RPC is `SECURITY DEFINER` with `search_path` pinned, refuses an unauthenticated caller (`42501`), validates the items array (`22023`), **recomputes subtotal, 5 % service fee and total in Postgres** — client totals are ignored — coerces the shipping method and marketplace through `pg_enum` lookups instead of blind casts, retries a colliding `reference` once, and returns `{ id, reference, total_usd, subtotal_usd, service_fee_usd, item_count }`. It writes `orders` plus one `order_items` row per line with full provenance, including `moq_at_purchase`, so the MOQ that was in force at purchase time survives a later catalog edit. A failed write returns `{ ok:false, error }`; it never reports a fake success.
- **MOQ as a provenance-tracked field** (`src/lib/moqIngest.ts` is the single reader): `resolveMoq(product, capturedText?)` decides what "minimum order" means, tagged with its source and confidence. `extractMoqLocal()` runs 11 ordered rules over captured page text (explicit 起批量/起订/MOQ phrasing at 0.95 down to a `¥N 起批` heuristic at 0.15, with an ambiguity cap); only a reading at or above `ENFORCE_CONFIDENCE = 0.8` may block a purchase, a confident reading never *lowers* the supplier's stated minimum, and `moq_source = 'manual'` short-circuits everything. `extractOrderStructure()` additionally reads price tiers, pack size and mixed-batch minimums. Staff/customer decisions are saved by `saveMoqDecision()` (which deliberately does **not** call the service-role RPC — a customer's UPDATE simply matches no rows, so the decision stays on-device and rides along in the order snapshot), and the optional `product-enrich` AI pass can only raise confidence, never override a manual value.
- **Cart gate** (`app/cart/index.tsx` + `src/lib/cartValidation.ts`): per line, `moqOrderRules()` → `validateCartItem()` → `{ status, problems, fixTo, minimum }`, where `fixTo` is the exact quantity that clears the rule (so the UI can offer one-tap repair instead of an error). `payableNow()` prices only the lines it actually knows and returns the unknown components as pending — it never invents a landed cost. At checkout, `cartValidateRemote.ts` calls the `cart-validate` function with the resolved minimums and blocks on `below_moq`, `insufficient_stock`, `out_of_stock`, `not_available`, `invalid_quantity`; when the function is unreachable or fails open, the local resolution takes over (`moq.enforce && quantity < displayMoq`).
- **Home trending feed** (`src/api/trending.ts` + `src/components/home/TrendingRow.tsx`): `fn_trending_products(days, limit)` ranks the last 7 days of `product_events` (view 1 / search_click 2 / add_to_cart 4 / order 8, halving every 3 days), with a 3.5 s race, a 10-minute AsyncStorage cache under `chinasuuq-trending-products`, and a status of `live | cache | empty | unavailable` — a cold offline launch shows the saved list with a "from the last saved list" note rather than an empty row. Each card adds straight to cart when the product resolves; otherwise it opens the product page instead of inventing a line. `recordProductEvent()` writes the events (view / add_to_cart) with a 60 s per-product throttle.
- **Marketplace registry** (`src/config/marketplaceRegistry.ts`): host allow-list, currency, rate key, "shows MOQ" flag, locales and search-URL template per marketplace (`1688, taobao, yiwugo, alibaba, chinagoods, jd, dollarstore`). The WebView host check and the admin/`marketplaces` artwork share this vocabulary; the file itself flags that its search URL templates are UNVERIFIED against the live sites, and no screen imports it yet.
- **Status mapping** (`src/lib/supabase-adapter.ts`): bidirectional map between the mobile pipeline (`pending, confirmed, purchasing, purchased, in_transit_china, warehouse, inspection, consolidated, shipped, in_transit, arrived_somalia, customs, ready_for_pickup, out_for_delivery, delivered, cancelled`) and DB statuses (`in_warehouse`, `inspection_passed`, `customs_hold`, `out_for_delivery`, `sourcing`, `quoted`, `awaiting_payment`, …). The admin `supabase-data.ts` mirrors the same mappers.
- **i18n**: `src/i18n/en.json` + `so.json` via `src/lib/i18n.tsx` context. UI chrome is translated from the bundled dictionaries; catalog text is not machine-translated yet — `src/api/translate.ts` is a complete client for the `ai-translate` function (batch ≤ 40 texts, LRU + AsyncStorage cache, fails open to the source string) but no screen imports it.
- **No realtime**: the app polls or reads once per focus and falls back to AsyncStorage; the change stream in §6 is consumed by the admin console only.
- **Marketplace browsing**: WebView flow; shared marketplace accounts come from the `get_shared_marketplace_account` RPC (returns only active `is_shared = true` accounts).
- **EAS build profiles** (`eas.json`): `development`, `preview` (Android APK), `production`. EAS workflow YAMLs live in `apps/mobile/.eas/workflows/` (`build-dev.yml`, `production.yml`) — these are EAS workflows, not GitHub Actions.
- **`apps/mobile/.easignore`** keeps `node_modules`, `dist`, `ios`, `android`, `web-build`, `.expo` and `.vercel` out of the EAS upload (EAS installs dependencies and prebuilds on its own servers); `package-lock.json` is deliberately kept for reproducible installs. `apps/mobile/ios/` exists locally as `expo prebuild` output and is intentionally untracked.
- **Scripts**: `npm run android` / `ios` in `apps/mobile` use `expo run:android` / `expo run:ios` (local native build), not `expo start`.

### APK release process

`eas.json` sets `cli.appVersionSource: "remote"`, so **EAS assigns the Android `versionCode`**
on its own — `expo.android.versionCode` in `app.json` is ignored for the build (EAS prints
"android.versionCode field in app config is ignored when version source is set to remote") and
only survives as a value inside the `expo-constants` manifest. Bump `expo.version` for the
human-visible version and let the remote counter handle install-over upgrades; keep the local
`versionCode`/`buildNumber` in step anyway so a reader is not misled.

1. `npx eas-cli build --platform android --profile preview` (add `--no-wait` to get the build id back immediately, then poll with `eas-cli build:list --platform android --limit 1 --json`). `preview` is `distribution: internal` with `android.buildType: "apk"`, so the artifact is a directly installable APK, not an AAB.
2. Credentials come from the Expo server (keystore `Build Credentials aIUFZopWVH`), not from a local keystore — the build works from any machine logged in as `baaaane24`.
3. Download the APK: the `artifacts.buildUrls.apk` link in that JSON, or `npx eas-cli build:download --platform android --build-id <id>` to the **local** path (see the `expo.dev/accounts/baaaane24/projects/chinasuuq-mobile/builds/<id>` page for the same file).
4. Replace `apps/web/public/app/chinasuuq.apk` with the downloaded file and check the size changed.
5. **Validate the artifact before committing.** An APK is a zip: it must end with an end-of-central-directory record. `python3 -c "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print(len(z.namelist()))" apps/web/public/app/chinasuuq.apk` prints the entry count, or `unzip -l` lists it. A truncated download passes `file(1)` (`PK\x03\x04` header), has a plausible size, and is still un-installable — Android refuses it with "package appears to be invalid".
6. Commit and push; Vercel serves it at `https://chinasuuq.com/app/chinasuuq.apk` (with `Content-Disposition: attachment`, set in root `vercel.json`). CI verifies the file ships in the static export and that the landing page still links it, and the push is also the production web deploy.

**Incident (2026-09-27).** The APK committed in `a2fa662` and served by chinasuuq.com since then was a partial file: 15,359,883 bytes containing 8 local file headers, **zero central-directory headers and no EOCD** — a corrupt archive nobody could install. It passed CI because the workflow only asserts `out/app/chinasuuq.apk` exists. Any complete build of this app is ~10× that size, so a size drop of that order is a corruption signal, not an optimisation. Step 5 above is the guard.

The remaining weight is structural, not artwork: the `preview` APK is a universal binary carrying `libreactnative.so`, `libhermesvm.so`, `libappmodules.so` and friends for four ABIs (`armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64`) with the `.so` files stored uncompressed and page-aligned, plus four `classes*.dex`. The two emulator ABIs are dead weight for a direct download and are the next thing to cut (§12).

The EAS upload archive used to be ~194 MB because `apps/mobile/assets/` (51 MB) rode along — `node_modules`, `ios`, `android`, `.expo` and the 26 MB local `dist/` are already excluded by `.easignore`. `apps/mobile/assets/` is now 12.9 MB: every illustration was a 1024–1254 px PNG rendered at 36–260 dp, so each file was resized to its display bucket (`sips -Z`, formats and `require()` paths unchanged) — hero carousel 828 px, onboarding 600 px, screen/empty-state art 512 px, category and marketplace tiles 160 px, brand marks 320 px. `assets/icon.png`, `assets/adaptive-icon.png` and `assets/splash.png` stay at store resolution because they are build inputs, not app art.


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

### Querying production

Migrations and read-only checks run through the Supabase Management API rather than a local
`supabase` CLI login:

```
POST https://api.supabase.com/v1/projects/athkmrvsaijwgsyvwrbp/database/query
Authorization: Bearer <sbp_…>          # body: {"query": "…"}
```

House rules for using it (each of these has already bitten once):

- Wrap any candidate change in `BEGIN; … ROLLBACK;` first — it is a real production dry-run.
- Only the **last** row-returning statement comes back; NOTICEs are swallowed; every statement needs its trailing `;` or the API reports a syntax error at `ROLLBACK`.
- There is no `information_schema.function_privileges` here — read grants from `pg_proc.proacl`.
- `supabase db push` is not used (see §6). Applying a file means sending its SQL and inserting its version into `supabase_migrations.schema_migrations(version, name, statements)` with `'{}'::text[]`.
- The Management API token is a credential: never echo it, and `curl` to `*.supabase.co` does not work from this machine (it hangs) while `api.supabase.com` does — use a direct HTTPS request for data probes.

### Performance budget (what was measured, and what got faster)

The site is a static export, so every cost is paid in the visitor's browser. Load work on 2026-09-27 was driven by measurement, not guesswork:

| Cost found | Fix |
|------------|-----|
| ~34 MB of PNG artwork referenced by the landing/info pages (the homepage alone pulled ~6.7 MB of ~1 MB marketplace logos rendered at 48 px) | WebP derivatives at `q 80`, sized to the box they render in: referenced set ~0.6 MB, `public/` 117 MB → 50 MB |
| Next 16 animates the whole document on route change because `globals.css` sets `scroll-behavior: smooth` | `data-scroll-behavior="smooth"` on `<html>`, which restores Next's instant-jump override while keeping in-page anchors smooth (`src/app/layout.tsx`) |
| ~25 round trips per admin realtime burst, including a 16-query N+1 over categories and a 500-row product pull for a top-6 list | grouped `admin_*` rollup RPCs, one `.in()` tally → one RPC, narrow projections with `order`/`limit`, and parallel `Promise.all` where awaits were sequential |
| Every admin list refetching its whole dataset on any unrelated realtime event | per-table stamps in `live-store.ts` so pages subscribe only to the tables they read |
| `.select("*")` on the customer view, 7 `JSON.parse` calls per render in `useUrlFilters`, ~500 unmemoized sourcing line cards | explicit column list (verified against live `information_schema`), `useMemo` on the parsed defaults, `memo()` on the card |
| 27 uncompressed images in the export | generated with `cwebp` (`sips` cannot write WebP on macOS) |

Deliberately **not** changed: `trailingSlash: true` and `images.unoptimized: true` are both
forced by `output: "export"`; the JS bundle (home ≈ 238 KB gzipped) is React and
framer-motion, and `optimizePackageImports` already covers `lucide-react` /
`framer-motion`, so cutting it further means removing features, not config.

### Local build notes (this machine)

- `~/.npm` has a cache ownership problem (npm suggests `sudo chown -R 501:20 ~/.npm`); use `npm install --cache /tmp/npm-cache-chinasuuq` locally.

## 12. Known Gaps & Follow-ups

1. **Uncalled Edge Functions** — `quotes-validate` (line-based contract, awaiting a customer quote-request flow) and `operational-queue` (duplicated by the dashboard's direct rollup RPCs) remain deployed with no callers. `cart-validate`, `ai-extraction`, `ai-settings`, `ai-test-connection` and `product-enrich` are all wired; `ai-translate` is wired only to a client module no screen imports yet (below).
2. **Built but not consumed** — `apps/mobile/src/api/translate.ts` (the whole `ai-translate` path), `apps/mobile/src/config/marketplaceRegistry.ts` (screens still use `src/lib/marketplaces.ts`), `productEvents.getTrendingProducts()` (superseded by `api/trending.ts`), and the `moq_review_queue`, `translations_view` and `admin_product_events_view` views. They are deployed and tested; wiring them is a follow-up, not missing work.
3. **`admin_orders_view` exposes no items JSONB**, so the dashboard's recent-orders and derivation paths read `orders` and `admin_order_items_view` directly rather than one view.
4. **Guest-order tracking** — anon-readable guest orders (`orders_select_own`) pending tokenized reference lookup (migration footer).
5. **`quote_items.cost_price` exposure** to quote owners (migration footer proposes `supplier_options`).
6. **AI provider key must be rotated** — a provider key was pasted into chat while wiring this up, so treat it as exposed. It now lives in `ai_provider_config`, but rotating it at the provider is the user's action.
7. **Production catalog is empty** — `source_products` has 0 rows (so Products, trending, top sellers, marketplace counts and the MOQ gate have no real data to exercise them) and `categories.image_url` is NULL for all 12 categories. The artwork under `apps/web/public/images/categories/` is unreferenced by both apps for this reason.
8. **~33 MB of superseded artwork** still ships in `apps/web/public/images/` (`hero/hero1-3.png`, `how/`, `marketing/`, `categories/*.jpg`, `onboarding/slide3.png`). Nothing references it (verified with `git grep`, and mobile bundles its own `assets/`), so it only costs deploy size, not page weight — deleted on product sign-off.
9. **`apps/mobile/ios/` is untracked** prebuild output by design; EAS prebuilds iOS on its own servers.
10. ~~CHECK constraints `NOT VALID`~~ — DONE: all 10 constraints validated against live data (2026-09-21).
11. **AI extraction is live, not a stub** — `ai-extraction` makes a real provider call through `ai-provider.ts`; the earlier `model_call_not_yet_wired` note is obsolete.
12. **ESLint debt** — ~77 pre-existing errors in `apps/web` (mostly `@typescript-eslint/no-explicit-any`, react-hooks rules in admin pages); lint is non-blocking in CI, typecheck + build are the gates.
13. **TS version drift** — web TS ^5 vs mobile ~6.0.3.
14. **`expo-secure-store`** declared but unused in mobile.
15. **Legacy admin mock store** (`src/lib/admin/store.ts`, `seed*.ts`) is unreferenced dead code.
16. ~~No realtime~~ — DONE: the admin console streams (`admin-live`, §3/§6). Mobile is still intentionally pull-based.
17. **`android.versionCode` in `app.json` is decorative** — `eas.json` uses `appVersionSource: "remote"`, so EAS owns the real counter (see §9's APK process). Nothing breaks, but the number in the repo is not the number on the device.
18. ~~Mobile artwork~~ — DONE: `apps/mobile/assets/` went from 51 MB to 12.9 MB by resizing every illustration to its display bucket (§9). The follow-up is structural, not artistic: the `preview` APK is a universal binary that stores four ABIs of native libraries uncompressed, and the two emulator ABIs (`x86`, `x86_64`) are dead weight for a direct download. Cutting them needs `reactNativeArchitectures` (via a config plugin or an EAS `gradleCommand` override) and must be verified against a real build before it is trusted.
19. **Column-contract risk stays open** — the repo cannot be the source of truth for the live schema (§6). Any new projection must be checked against `information_schema` first, and the safest UI pattern is a fallback ladder or an explicit "unknown", because a single missing column voids the whole request.
20. **CI does not validate the APK** — `.github/workflows/ci.yml` asserts `out/app/chinasuuq.apk` exists, which is exactly the check that let a truncated, un-installable APK ship (§9 incident). Unzip it in CI (entry count, EOCD present) or compare it against the build artifact's checksum.

## 13. Appendix — Key Constants

| Constant | Value | Defined in |
|----------|-------|------------|
| WhatsApp number / link | `8615277074143` / `https://wa.me/8615277074143` | `packages/shared/constants.ts` |
| Air freight | $8.50/kg, min $15 | `apps/mobile/src/lib/shipping.ts` |
| Sea freight | $2.20/kg, min $25, min chargeable 10 kg | `apps/mobile/src/lib/shipping.ts` |
| Marketplaces (web + mobile slugs) | 1688, Taobao, YiwuGo, Alibaba, Chinagoods, JD, `dollarstore` (1$ Dollar Store) | `apps/web/src/lib/marketplaces.ts`, `apps/mobile/src/lib/marketplaces.ts` |
| Marketplaces (live `marketplaces` table) | 1688, alibaba, chinagoods, jd, taobao, yiwugo, `chinasuuq-deals` — no `dollarstore`, all `logo_url` NULL | Supabase project |
| EAS project / owner | `a8484922-0c4f-4f79-b4be-f93fe1dd5747` / `baaaane24` | `apps/mobile/app.json` |
| Android package | `com.chinasuuq.app` | `apps/mobile/app.json` |
| Dev admin recovery code | `chinasuuq-dev` (only when `NEXT_PUBLIC_DEV_BUILD=1`) | `apps/web/src/lib/adminSession.ts` |
| MOQ enforcement threshold | `ENFORCE_CONFIDENCE = 0.8` (below this, a reading is shown but never blocks) | `apps/mobile/src/lib/moqIngest.ts` |
| Manual MOQ range | 1…100000; machine confidence 0…1 (`source_products_moq_confidence_check`) | `apps/mobile/src/lib/moqIngest.ts`, `202609250003_moq_extraction.sql` |
| Trending weights / decay | view 1 · search_click 2 · add_to_cart 4 · order 8; half-life 259200 s (3 days); days 1–90, limit 1–100 | `fn_trending_products()` in `202609250002_trending_products.sql` |
| Event throttle | 1 per product + type + user per 60 s | `record_product_event()` |
| Trending feed timings | 3500 ms RPC race, 10-minute cache TTL, key `chinasuuq-trending-products` | `apps/mobile/src/api/trending.ts` |
| Translation batch caps | 40 texts, 2000 chars each, 30 s model timeout; client LRU 400 entries + key `chinasuuq-translate-cache` | `ai-translate`, `apps/mobile/src/api/translate.ts` |
| Product-enrich input cap | 12000 chars over the assembled prompt | `product-enrich` |
| Realtime burst debounce | 1500 ms | `apps/web/src/lib/admin/live-store.ts` |
| Admin realtime channel / tables | `admin-live` → orders, sourcing_requests, notifications, shipments, source_products, payments | `admin/(protected)/layout.tsx`, §6 |
| Mobile service fee | `SERVICE_FEE_PCT = 0.05` (a `5` here would bill 500 %) | `apps/mobile/src/db/index.ts` |
| Backend health probe | `…/rest/v1/orders?select=id&limit=1`, 60 s cache, 5 s abort | `apps/mobile/src/db/index.ts` |

### Regression harness

`apps/web/supabase/audit/` holds `20260924_schema_probe.sql` (what the live project actually
looks like) and `local_verify/` — 16 numbered SQL suites plus `run.sh` that exercise the
rollups, provenance sync, publication membership, the MOQ gate, view writability and
`submit_mobile_order` against a throwaway database. Run it before applying any migration that
touches money, provenance or a view.

---

*Maintained by hand against the codebase. Last full pass: 2026-09-27 — route and admin-module
inventory, the `admin_*` rollup RPCs and their staff gate, Realtime publication membership and
the admin live store, the mobile order/trending/MOQ paths, the eight Edge Function contracts,
all 29 migrations, the AI credential containment change, and the asset/perf budget were each
re-read from source and checked against the live project. When behavior changes, update this
file and the root `README.md` together.*
