# ChinaSuuq

**China-to-Somalia e-commerce marketplace.**

Browse products from six Chinese marketplaces (1688, Taobao, YiwuGo, Alibaba, ChinaGoods, JD), get quotes, and ship by air or sea freight to Somali cities. This repository contains the public web experience, a full admin operations console, and the mobile app, all backed by one Supabase project.

## Repository map

```
chinasuuq/
├── apps/
│   ├── web/                Next.js 16 static-export site (public pages + /admin console)
│   │   ├── supabase/
│   │   │   ├── functions/  Edge Functions (Deno): 8 functions + _shared/
│   │   │   └── migrations/ Postgres schema + RLS (29 migrations)
│   │   └── public/app/     chinasuuq.apk — served at https://chinasuuq.com/app/chinasuuq.apk
│   └── mobile/             Expo SDK 57 app (Expo Router, React Native 0.86)
├── packages/shared/        Shared TS types, constants, utils, validation, errors, api-client
├── vercel.json             Root deploy config: build, redirects, security headers
└── .github/workflows/ci.yml
```

## Stack

| Area | Technologies |
|------|--------------|
| Web | Next.js 16.2.12 (`output: "export"` — fully static), React 19, Tailwind CSS v4, framer-motion, zustand, zod, `@supabase/supabase-js` |
| Mobile | Expo SDK 57, React Native 0.86, Expo Router, zustand, AsyncStorage, `@supabase/supabase-js` |
| Shared | `@chinasuuq/shared` — plain TS modules (`types`, `constants`, `utils`, `validation`, `errors`, `api-client`, `hooks`) |
| Backend | Supabase: Postgres + Auth + Row Level Security + Edge Functions (project ref `athkmrvsaijwgsyvwrbp`) |
| CI | GitHub Actions (web typecheck/lint/build, mobile config validation, repo hygiene guard) |

## Monorepo layout & workspaces

The root `package.json` declares npm workspaces for `apps/web` and `packages/*` only. `apps/mobile` is installed separately.

```bash
npm install                  # root: installs apps/web + packages/*
cd apps/mobile && npm install
```

## Local development

```bash
npm run dev:web              # apps/web → http://localhost:3000
npm run dev:mobile           # apps/mobile via Expo (npx expo start)

npm run build                # static export → apps/web/out
npm run typecheck            # tsc --noEmit in apps/web
npm run lint                 # turbo lint
```

## Environment variables

No `.env` file is required to build or run either app — the public-by-design Supabase anon credentials are baked in:

| Variable | Where set | Notes |
|----------|-----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `apps/web/next.config.ts` `env` block | `https://athkmrvsaijwgsyvwrbp.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `apps/web/next.config.ts` `env` block | Anon key baked in next.config.ts (public by design; access is controlled by RLS, not key secrecy) |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | `apps/web/next.config.ts` `env` block | `8615277074143` |
| `NEXT_PUBLIC_DEV_BUILD` | local `.env.local` only | Dev-only switch that enables the admin fallback/recovery entry point (`apps/web/src/lib/adminSession.ts`). Absent in production builds, where every fallback path is inert. |
| `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `apps/mobile/app.config.js` | Optional overrides; defaults are the same baked values, exposed to the app via `expo-constants` (`extra.supabaseUrl` / `extra.supabaseAnonKey`) |

Edge Functions read `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from Supabase runtime env — never from the client bundle. AI provider credentials are **not** runtime env: they live in the single-row table `public.ai_provider_config`, editable only through `ai-settings` (admin). The old `settings` key `ai_provider` is gone, and a trigger now refuses secret-looking keys in `settings` (see Security model).

## Deployment (web + APK)

### Web (Vercel)

The Vercel project is rooted at the **repository root**; root `vercel.json` drives everything:

- **Install**: `npm install` · **Build**: `cd apps/web && npm run build` · **Output**: `apps/web/out`
- Pushes to `main` auto-deploy.
- Because the app is a full static export, Next.js `headers()` / `proxy.ts` never run in production. All security headers (CSP, HSTS preload, X-Frame-Options, Permissions-Policy, COOP/CORP, `/admin/*` no-store, APK `Content-Disposition`) and the `www → apex` 301 redirect live in `vercel.json`. `apps/web/next.config.ts` documents this; its own header config would be silently ignored.

### Android APK

The mobile APK is a static asset of the web app:

1. Build with EAS (`eas build -p android --profile preview`, project `@baaaane24/chinasuuq-mobile`). The `preview` profile is arm-only (`ORG_GRADLE_PROJECT_reactNativeArchitectures`), which is what keeps the artifact at ~75 MB and inside GitHub's 100 MB per-file push limit.
2. Download the APK from the finished build's `artifacts.buildUrl` and replace `apps/web/public/app/chinasuuq.apk`.
3. Verify the file is a complete archive — `unzip -l apps/web/public/app/chinasuuq.apk | tail -1` should report ~1,300 entries. A truncated download looks like a valid file by size and header but Android rejects it; that is how an un-installable APK shipped once (doc.md §9).
4. Bump `expo.version` in `apps/mobile/app.json` for the human-visible version; `cli.appVersionSource: "remote"` means EAS owns the real `versionCode`.
5. Commit; the next Vercel deploy serves it at `https://chinasuuq.com/app/chinasuuq.apk`.

CI fails the web build if `out/app/chinasuuq.apk` is missing, if the landing page stops referencing `app/chinasuuq.apk`, or if the APK has no central directory (fewer than 500 entries).

### Performance pass (2026-09-27)

- Every photographic/illustrated artwork file the site renders is now WebP (converted with `cwebp -q 80`): the referenced set dropped from ~34 MB to ~0.6 MB and `apps/web/public` from 117 MB to ~50 MB. Two non-WebP images are still referenced — the header/footer logo (108 KB JPG) and `og-image.png`, which only appears in metadata — and `images.unoptimized` stays `true`, because a static export has no image server.
- Admin list screens refetch only on realtime events for the tables they actually read, and dashboard over-fetching (a 500-row product pull, a 5000-row per-category tally, 16 sequential head-counts, several sequential awaits) was replaced by narrow queries and the grouped RPCs.
- Next 16's smooth route-transition scrolling is switched off with `data-scroll-behavior="smooth"` on `<html>` (`apps/web/src/app/layout.tsx`) — that attribute is what makes the router jump instantly; without it Next animates the whole document on every navigation.

## Database & migrations

Postgres schema + RLS live in `apps/web/supabase/migrations/` (29 migrations, latest `202609270001_admin_live_and_counts.sql`; the major hardening pass is `202609210001_money_integrity_rls_hardening.sql`).

**The live database, not this repo, is authoritative.** Several base migrations were never committed here, so check any column list against live `information_schema` before writing a query: PostgREST fails the **entire** request with 42703 (`undefined_column`) if a single selected column is missing.

```bash
supabase db push        # apply pending migrations (or psql \i <file> for a single file)
```

In practice these migrations have been applied through the Supabase Management API; the repo's ledger of what is live is `supabase_migrations.schema_migrations`. Every migration in this repo is written to be idempotent / conditional where possible. See doc.md for the schema overview, money-integrity rules, and the RLS model.

## Edge Functions

Eight functions in `apps/web/supabase/functions/` (plus `_shared/`), deployed individually:

```bash
supabase functions deploy <name> --project-ref athkmrvsaijwgsyvwrbp
```

| Function | Auth required | Purpose |
|----------|---------------|---------|
| `ai-settings` | admin | Read/save the AI provider config in `public.ai_provider_config` (key masked on read, `base_url` vetted at save time) |
| `ai-test-connection` | admin | Probe an OpenAI-compatible provider's `/models` endpoint |
| `ai-extraction` | staff/admin | Real provider call against the admin-configured credential, behind a prompt-injection guardrail and strict schema validation; called by the admin Products page |
| `ai-translate` | any signed-in role | `POST {texts, target_lang}`: duplicates collapsed, the `translations` cache answers hits, only misses reach the provider → `{ok, results:[{source, translated, cached}], target_lang, counts}` |
| `product-enrich` | any signed-in role | `POST {title, product_id?, marketplace?, evidence}`: MOQ / price / variant fallback. A reported MOQ must appear **verbatim** in the submitted evidence or it is rejected, and confidence is assigned server-side, never taken from the model; writes through `record_moq_candidate` with the service role → `{moq, moq_confidence, moq_raw_text, price_cny, variant_hints, notes, recorded, model}` |
| `cart-validate` | none (anon OK) | Server-side MOQ/stock validation against `source_products` (there is no `products` table) |
| `operational-queue` | staff/admin | Mission-control actionable queue from admin views |
| `quotes-validate` | none (anon OK) | Server-authoritative price/total validation; never trusts client totals |

Shared helpers: `_shared/auth.ts` (`requireAdmin`, `requireRole`, `requireStaffOrAdmin` — verify the caller JWT and `profiles.role`), `_shared/cors.ts`, and `_shared/ai-provider.ts` (`loadAiProviderConfig` plus an SSRF guard on `base_url`: https-only, port 443-only, and private / CGNAT / link-local / multicast / IPv6-ULA hosts rejected). Functions that touch privileged data run with `SUPABASE_SERVICE_ROLE_KEY` **inside** the function only, after caller verification.

## Live data paths

- **Mobile orders are real writes.** `createOrder()` (`apps/mobile/src/db/index.ts`) calls the `submit_mobile_order(...)` SECURITY DEFINER RPC (migration `202609260001`): it requires an `auth.uid()`, recomputes subtotal / service fee / total server-side and ignores the client's own totals, then writes `orders` + `order_items` with provenance (`marketplace_key`, `source_url`, `unit_price_cny`, `exchange_rate`, `moq_at_purchase`, `origin`). Offline or signed out it queues in AsyncStorage and `syncPendingOrders()` replays it; it never reports a fake success.
- **MOQ is a first-class, provenance-tracked field.** `source_products.moq / moq_source ('manual'|'regex'|'ai') / moq_confidence / moq_raw_text / moq_reviewed_at` (`202609250003`), one local parser and reader in `apps/mobile/src/lib/moqIngest.ts` — only readings at confidence ≥ 0.8 may block checkout — a `moq_review_queue` view for staff, and a gate in `apps/mobile/app/cart/checkout.tsx` backed by `cart-validate` with a local fallback when the network or the server gate fails open.
- **Home trending feed (mobile).** `product_events` + the `record_product_event` / `fn_trending_products` RPCs (`202609250002`), consumed by `apps/mobile/src/api/trending.ts` (3.5 s RPC timeout, 10-minute AsyncStorage cache under `chinasuuq-trending-products`, status `live|cache|empty|unavailable`) and rendered by `apps/mobile/src/components/home/TrendingRow.tsx` with one-tap add-to-cart.
- **Admin console is live.** The shell subscribes to Supabase Realtime on a single `admin-live` channel (`apps/web/src/app/admin/(protected)/layout.tsx` + `apps/web/src/lib/admin/live-store.ts`, 1500 ms burst debounce) over the tables published by `202609250000` and `202609270001` (orders, sourcing_requests, notifications, shipments, source_products, payments). Dashboard KPIs come from staff-only SECURITY DEFINER RPCs (`admin_kpis`, `admin_revenue_daily`, `admin_revenue_by_marketplace`, `admin_order_status_counts`, `admin_category_product_counts`, migration `202609240003`) rather than client-side guesses.

## Security model

- The Supabase anon key is public by design; all data access is governed by Postgres RLS, not key secrecy.
- The web bundle has **no service-role client** — `apps/web/src/lib/supabase.ts` exports only the anon `supabase` client and `edgeFetch()`, which attaches the signed-in user's JWT (falling back to the anon key) when calling Edge Functions.
- Admin pages authenticate with Supabase Auth and read/write through the anon client; the server-side RLS + trigger rules are the actual access control. The `/admin` route guard in the layout is a UX redirect, not the security boundary.
- The admin recovery-code path (`apps/web/src/lib/adminSession.ts`) is compiled inert unless `NEXT_PUBLIC_DEV_BUILD=1`.
- Signup cannot self-assign roles: `handle_new_user` forces `role = 'customer'`, and a trigger guards `profiles.role` changes (migration `202609210001`).
- AI provider credentials are contained in `public.ai_provider_config` (single row, `id = 1`): RLS enabled with **no policies** and grants revoked from `anon` / `authenticated`, so only the service role can read it. They used to sit in the anonymously-readable `settings` table; a `settings_secret_guard` trigger now refuses secret-looking keys there (migration `202609240002_ai_secret_containment.sql`). Every AI function loads the credential through `_shared/ai-provider.ts`, whose `base_url` guard is the single SSRF check.
- Security headers and the admin `no-store` policy are enforced at the CDN via root `vercel.json`.

## CI

`.github/workflows/ci.yml` runs on push/PR to `main` (Node 22):

1. **web-build** — `tsc --noEmit`, `eslint` (non-blocking; see gaps below), `next build`, then verifies `out/index.html` and `out/app/chinasuuq.apk` exist and that the landing page still references the APK path.
2. **mobile-config** — JSON validation of `apps/mobile/app.json` and `eas.json`, YAML validation of `apps/mobile/.eas/workflows/*.yml`.
3. **guard** — fails if agent/tool state dirs or junk files (`.agent-teams/`, `.DS_Store`, `supabase/.temp/`, …) are tracked in git.

## Known gaps & follow-ups

- **Orphan Edge Functions**: `quotes-validate` and `operational-queue` are deployed with **no callers** in either app. Every other function has one: `ai-settings` / `ai-test-connection` from the admin AI tab, `ai-extraction` from the admin Products page, `cart-validate` from mobile checkout (`apps/mobile/src/lib/cartValidateRemote.ts`), `product-enrich` from `apps/mobile/src/db/index.ts` — and `ai-translate` only from the unwired client in the next bullet.
- **Completed but not yet consumed**: `apps/mobile/src/api/translate.ts` (the only `ai-translate` client — no screen imports it), `apps/mobile/src/config/marketplaceRegistry.ts`, `productEvents.getTrendingProducts()` (superseded by `src/api/trending.ts`), and the `moq_review_queue`, `translations_view` / `admin_product_events_view` views are all in place with nothing reading them.
- **`admin_orders_view` exposes no items JSONB** — the view selects `NULL::jsonb AS items` — so the dashboard's recent-orders and derivation paths read `orders` (plus `admin_order_items_view`) directly.
- **~33 MB of legacy PNG/JPG artwork** still sits unreferenced in `apps/web/public/images/` (`hero/hero1-3.png`, `how/`, `marketing/`, `categories/*.jpg`, `onboarding/slide3.png`) — kept until product sign-off, not deleted.
- **`apps/mobile/ios/` is untracked** prebuild output; EAS prebuilds iOS on its own servers, so nothing is missing from the repo.
- **Production `source_products` is empty (0 rows)**, so the catalog-dependent surfaces above have no real data to show yet, and `categories.image_url` is NULL for all 12 categories.
- **Guest order tracking**: orders with `user_id IS NULL` are anon-readable via the `orders_select_own` policy (pending replacement with tokenized reference lookup + app change — documented in the `202609210001` migration footer).
- **`quote_items.cost_price`** is visible to quote owners through RLS (business-sensitive; migration footer proposes moving supplier costs to `supplier_options`).
- **Unvalidated CHECK constraints**: the money-integrity constraints were added `NOT VALID`; run `ALTER TABLE ... VALIDATE CONSTRAINT ...` once data is confirmed clean.
- **ESLint debt**: `apps/web` carries ~77 pre-existing lint errors (mostly `@typescript-eslint/no-explicit-any` and react-hooks rules in admin pages). CI runs lint non-blocking; **typecheck and build are the hard gates**.
- **TypeScript version drift**: `apps/web` uses TS ^5, `apps/mobile` ~6.0.3.
- **Unused mobile dependency**: `expo-secure-store` is declared but never imported.
- **Legacy admin mock store**: `apps/web/src/lib/admin/store.ts` + `seed*.ts` (localStorage-backed demo data, `useAdminData`) are no longer imported by any page — candidate for deletion.
- **npm cache ownership (this machine)**: `~/.npm` has a wrong owner (npm suggests `sudo chown -R 501:20 ~/.npm`); local installs here use `npm install --cache /tmp/npm-cache-chinasuuq` as a workaround.

## Mobile packages that look removable but must stay

`apps/mobile/package.json` contains entries that appear unused or duplicate but are required peers/polyfills — removing them has broken the app before:

| Package | Why it must stay |
|---------|------------------|
| `react-refresh` (^0.14.x) | `babel-preset-expo` peer (`>=0.14.0 <1.0.0`); removing it broke `expo start` |
| `react-dom` | React Native Web / Expo Router peer |
| `react-native-screens`, `react-native-gesture-handler` | React Navigation / Expo Router peers |
| `@react-navigation/native`, `-native-stack`, `-bottom-tabs` | Expo Router peers |
| `react-native-svg` | `lucide-react-native` peer |
| `stream-browserify`, `querystring-es3` | Metro polyfills for Node built-ins used by dependencies |

