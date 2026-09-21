# ChinaSuuq

**China-to-Somalia e-commerce marketplace.**

Browse products from six Chinese marketplaces (1688, Taobao, YiwuGo, Alibaba, ChinaGoods, JD), get quotes, and ship by air or sea freight to Somali cities. This repository contains the public web experience, a full admin operations console, and the mobile app, all backed by one Supabase project.

## Repository map

```
chinasuuq/
├── apps/
│   ├── web/                Next.js 16 static-export site (public pages + /admin console)
│   │   ├── supabase/
│   │   │   ├── functions/  Edge Functions (Deno)
│   │   │   └── migrations/ Postgres schema + RLS (18 migrations)
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

Edge Functions read their secrets from Supabase runtime env (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` for `ai-extraction`) — never from the client bundle.

## Deployment (web + APK)

### Web (Vercel)

The Vercel project is rooted at the **repository root**; root `vercel.json` drives everything:

- **Install**: `npm install` · **Build**: `cd apps/web && npm run build` · **Output**: `apps/web/out`
- Pushes to `main` auto-deploy.
- Because the app is a full static export, Next.js `headers()` / `proxy.ts` never run in production. All security headers (CSP, HSTS preload, X-Frame-Options, Permissions-Policy, COOP/CORP, `/admin/*` no-store, APK `Content-Disposition`) and the `www → apex` 301 redirect live in `vercel.json`. `apps/web/next.config.ts` documents this; its own header config would be silently ignored.

### Android APK

The mobile APK is a static asset of the web app:

1. Build with EAS (`eas build -p android --profile preview`, project `@baaaane24/chinasuuq-mobile`).
2. Download the APK and replace `apps/web/public/app/chinasuuq.apk`.
3. Bump the version in `apps/mobile/app.json` (`expo.version`, `expo.android.versionCode`).
4. Commit; the next Vercel deploy serves it at `https://chinasuuq.com/app/chinasuuq.apk`.

CI fails the web build if `out/app/chinasuuq.apk` is missing or the landing page stops referencing `app/chinasuuq.apk`.

## Database & migrations

Postgres schema + RLS live in `apps/web/supabase/migrations/` (18 migrations, latest `202609240001_shared_marketplace_account_rpc.sql`; the major hardening pass is `202609210001_money_integrity_rls_hardening.sql`).

```bash
supabase db push        # apply pending migrations (or psql \i <file> for a single file)
```

Every migration in this repo is written to be idempotent / conditional where possible. See doc.md for the schema overview, money-integrity rules, and the RLS model.

## Edge Functions

Six functions in `apps/web/supabase/functions/`, deployed individually:

```bash
supabase functions deploy <name> --project-ref athkmrvsaijwgsyvwrbp
```

| Function | Auth required | Purpose |
|----------|---------------|---------|
| `ai-settings` | admin | Read/save AI provider settings (settings key `ai_provider`, key masked on read) |
| `ai-test-connection` | admin | Probe an OpenAI-compatible provider's `/models` endpoint |
| `operational-queue` | staff/admin | Mission-control actionable queue from admin views |
| `cart-validate` | none (anon OK) | Server-side MOQ/stock validation against the `products` table |
| `quotes-validate` | none (anon OK) | Server-authoritative price/total validation; never trusts client totals |
| `ai-extraction` | none (stub) | Prompt-injection guardrail; model call not yet wired (`model_call_not_yet_wired`) |

Shared helpers: `_shared/auth.ts` (`requireAdmin`, `requireRole`, `requireStaffOrAdmin` — verify the caller JWT and `profiles.role`) and `_shared/cors.ts`. Functions that touch privileged data run with `SUPABASE_SERVICE_ROLE_KEY` **inside** the function only, after caller verification.

## Security model

- The Supabase anon key is public by design; all data access is governed by Postgres RLS, not key secrecy.
- The web bundle has **no service-role client** — `apps/web/src/lib/supabase.ts` exports only the anon `supabase` client and `edgeFetch()`, which attaches the signed-in user's JWT (falling back to the anon key) when calling Edge Functions.
- Admin pages authenticate with Supabase Auth and read/write through the anon client; the server-side RLS + trigger rules are the actual access control. The `/admin` route guard in the layout is a UX redirect, not the security boundary.
- The admin recovery-code path (`apps/web/src/lib/adminSession.ts`) is compiled inert unless `NEXT_PUBLIC_DEV_BUILD=1`.
- Signup cannot self-assign roles: `handle_new_user` forces `role = 'customer'`, and a trigger guards `profiles.role` changes (migration `202609210001`).
- Security headers and the admin `no-store` policy are enforced at the CDN via root `vercel.json`.

## CI

`.github/workflows/ci.yml` runs on push/PR to `main` (Node 22):

1. **web-build** — `tsc --noEmit`, `eslint` (non-blocking; see gaps below), `next build`, then verifies `out/index.html` and `out/app/chinasuuq.apk` exist and that the landing page still references the APK path.
2. **mobile-config** — JSON validation of `apps/mobile/app.json` and `eas.json`, YAML validation of `apps/mobile/.eas/workflows/*.yml`.
3. **guard** — fails if agent/tool state dirs or junk files (`.agent-teams/`, `.DS_Store`, `supabase/.temp/`, …) are tracked in git.

## Known gaps & follow-ups

- **Orphan Edge Functions**: `cart-validate`, `quotes-validate`, `operational-queue`, and `ai-extraction` currently have **no callers** in either app. The mobile cart validates client-side (`apps/mobile/src/lib/cartValidation.ts`) and the admin settings page calls only `ai-settings` / `ai-test-connection`.
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

