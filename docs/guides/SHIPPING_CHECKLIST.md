# ChinaSuuq Mobile — Production Shipping Checklist

App: **ChinaSuuq** · bundleId `com.chinasuuq.app` · Expo SDK 54 · RN 0.81.5

Mark `[ ]` you do it / `[X]` I do it / `[~]` blocked on someone else.

---

## Phase 0 — Accounts & One-time setup (YOU need these)
- [ ] **Apple Developer Program** — $99/yr. Required for App Store + iOS TestFlight. https://developer.apple.com/programs/
- [ ] **Google Play Console** — $25 one-time. Required for Play Store. https://play.google.com/console
- [ ] **EAS account** (free) — `npx eas login` (uses Expo account). https://expo.dev/signup
- [ ] **Expo project created** (free) — `npx eas init` will do it

## Phase 1 — Live-backend sync (blocks admin, NOT the app build)
The app builds and ships **without** this. Sync activates the admin mission-control link.
- [ ] **RLS fix applied** to Supabase (see SQL block below) — **you paste into Supabase SQL Editor**, OR give me the **service_role** key and I do it
- [ ] (Optional) Pull the latest working RLS-confirmed anon policy

## Phase 2 — App config & assets (I do this now)
- [X] Create `assets/icon.png` (1024x1024) and `assets/splash.png` (1284x2778) from logo
- [X] Generate Android adaptive icon (`assets/adaptive-icon.png` 1024x1024 + background)
- [X] Update `app.json` — add description, version, category, iOS Android fields, package visibility
- [X] Create `eas.json` — build profiles: `development`, `preview`, `production` (apk/ipa), `app-bundle` for Play
- [X] Add `tsconfig`/babel `react-native-reanimated` plugin if missing (EAS build needs it)
- [X] Add a `privacy policy` link in app.json (stores require it)
- [X] Confirm `app.config.js` honors app.json + env
- [X] Add `errorBoundary` + global error handler

## Phase 3 — EAS Build (YOU trigger, builds run in cloud ~10-20min)
- [ ] `npx eas login` (your Expo account)
- [ ] `npx eas init` (creates EAS project, links to this app)
- [ ] `npx eas build --profile preview --platform android` (test APK)
- [ ] `npx eas build --profile preview --platform ios` (TestFlight)
- [ ] Smoke test on a real Android phone + iPhone via TestFlight / internal track

## Phase 4 — iOS release build
- [ ] In App Store Connect: create the app, fill in name/description/keywords/category
- [ ] Bundle identifier: `com.chinasuuq.app`
- [ ] Set up **EAS credentials** (`npx eas credentials` interactive) — auto-managed is fine
- [ ] `npx eas build --profile production --platform ios` → produces .ipa
- [ ] `npx eas submit --platform ios` (uploads to App Store Connect for review)
- [ ] Submit for **App Store review** in App Store Connect

## Phase 5 — Android release build
- [ ] In Play Console: create the app, fill in store listing
- [ ] `npx eas build --profile production --platform android` → produces .aab
- [ ] `npx eas submit --platform android` (uploads to Play Console internal track)
- [ ] Roll out to **production** in Play Console (manual review faster than Apple)

## Phase 6 — Post-launch
- [ ] Live RLS + supabase URL finalised so admin mission-control receives real data
- [ ] In-app updates (`expo-updates`) for OTA fixes
- [ ] Crashlytics / Sentry for error monitoring
- [ ] Privacy policy hosted at a public URL (paste the URL in app.json + store listing)

---

## Current production-blockers I'm fixing this session
1. `eas.json` doesn't exist → **creating it now**
2. `app.json` missing description / iOS privacy manifest fields / Android scheme → **updating now**
3. `assets/icon.png` and `splash.png` missing → **generating from logo.jpg**
4. `app.config.js` not present → **creating to wire envs properly**
5. **RLS** → still blocking live sync (you need to paste 8 lines of SQL in Supabase, or give me the service_role key)

---

## SQL to paste in Supabase SQL Editor (one-time, ~30s)
```sql
alter table public.sourcing_requests add column if not exists product_url text;
alter table public.orders add column if not exists address text;
alter table public.orders add column if not exists recipient_name text;
alter table public.orders add column if not exists phone text;
alter table public.orders add column if not exists city text;
alter table public.orders add column if not exists payment_method text;
alter table public.orders add column if not exists items jsonb;
drop policy if exists anon_insert_orders on public.orders;
create policy anon_insert_orders on public.orders for insert to anon with check (true);
drop policy if exists anon_select_orders on public.orders;
create policy anon_select_orders on public.orders for select to anon using (true);
drop policy if exists anon_update_orders on public.orders;
create policy anon_update_orders on public.orders for update to anon using (true) with check (true);
drop policy if exists anon_insert_sourcing on public.sourcing_requests;
create policy anon_insert_sourcing on public.sourcing_requests for insert to anon with check (true);
drop policy if exists anon_select_sourcing on public.sourcing_requests;
create policy anon_select_sourcing on public.sourcing_requests for select to anon using (true);
drop policy if exists anon_update_sourcing on public.sourcing_requests;
create policy anon_update_sourcing on public.sourcing_requests for update to anon using (true) with check (true);
drop policy if exists anon_select_products on public.source_products;
create policy anon_select_products on public.source_products for select to anon using (true);
```
