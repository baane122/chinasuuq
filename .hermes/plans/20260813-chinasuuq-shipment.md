# ChinaSuuq Polishing & Shipment Plan (Mobile + Backend + Store Builds)

> Recommended execution: **subagent-driven-development** (one subagent per task, two-stage review).

**Goal:** Ship a store-ready ChinaSuuq: verify every mobile screen works end-to-end, harden the WebView translator, complete missing profile/account screens, rebuild Android (with all recent fixes) and finish iOS signing so both stores can be submitted.

**Architecture:** Expo SDK 54 monorepo (`apps/mobile`), Next.js 16 web + admin (`apps/web`), shared `packages/*`, Supabase `athkmrvsaijwgsyvwrbp` backend, EAS for native builds. Web deploys to Vercel via git push; mobile ships via EAS.

**Tech Stack:** React Native 0.81 / Expo 54 / expo-router, `react-native-webview`, Zustand, Supabase JS SDK + direct REST, EAS Build, Next.js 16 + Tailwind v4, lucide icons.

**Status snapshot (verified):**
- Mobile: 31 screens, 22 registered in root Stack, TypeScript clean (0 errors), expo-doctor 18/18, Android Hermes export OK.
- Profile subscreens all exist and are wired (`personal-info, addresses, add-address [add+edit], payment-methods, order-history, wishlist, referral`) + hub account.tsx (9 menu items→real routes).
- WebView translator fixed: language-switch reset (`data-cs-orig` restore), faster cadence (burst passes + 1.2s loop, cap 40, group 30), syntax-error fix (char-class `-` order). Committed `cdee125`.
- Supabase: 61 tables, migrations 012/013 applied + corrected 015 (8 admin views, settings, customer_payment_methods) all pushed and recorded. Migrations 012-014 recorded as applied.
- EAS: Android **preview APK FINISHED** (`ac69e582`, 4doPYQ...apk) and **production AAB FINISHED** (`61ad1269`, sNnN02O...aab). **iOS NOT built** (no Apple signing creds).

---

## Current Blocking Gaps

1. **iOS builds not done** — needs Apple Developer signing credentials (Apple ID `abdirahmanbaane@gmail.com`, password + 2FA) entered in an interactive EAS terminal.
2. **Android artifacts predate recent fixes** (USD-price fix `5130879`, translator fix `cdee125`, migration work) — need a **fresh rebuild** so the APK/AAB actually contain the latest code.
3. **Runtime QA not executed** — tsc/doctor/export pass, but no on-device/emulator verification of every screen (esp. WebView translation on a real page).
4. **`profiles.email` missing** — admin views expose email as NULL (schema doesn't have the column).

---

## Phase 1 — Runtime QA & Bug Fixes

### Task 1: Run the app in Expo Go and visually verify every screen
**Objective:** Confirm each screen renders, navigates forward/back, and uses real data (not mock).
**Files (read-only):**
- `apps/mobile/app/(tabs)/home.tsx`
- `apps/mobile/app/(tabs)/orders.tsx`
- `apps/mobile/app/cart/index.tsx`
- `apps/mobile/app/product/[id].tsx`
- `apps/mobile/app/orders/[id].tsx`
- `apps/mobile/app/orders/tracking.tsx`
- `apps/mobile/app/support/index.tsx`
- `apps/mobile/app/settings/index.tsx`

**Step 1: Start Expo Go**
```bash
cd apps/mobile && npx expo start
```
**Step 2: Run through each screen** (use Expo Go QR scan or simulator). Check:
Tab bar (4 tabs): Home, Markets, Orders, Account.
Home: loads curated products, no crash.
Markets: list of 7 marketplaces renders, tap any → WebView opens.
Orders: empty-state or list, tap order → detail page.
Cart: empty state, add item → shows USD price, tap checkout → checkout form renders.
Settings: language toggle, profile fields.
Support: form renders.
**Step 3: Log failures** — file a checklist on paper or Notes app. Any crash, blank screen, or broken button = Task 2.

### Task 2: Fix any runtime bugs discovered in Task 1
**Objective:** For each bug from Task 1, fix in-place and re-verify.
**Files:** likely candidates:
- `apps/mobile/src/db/index.ts` (Supabase queries)
- `apps/mobile/src/store/cart.ts` (cart state)
- `apps/mobile/src/store/auth.ts` (auth state)
- `apps/mobile/src/components/marketplace/SmartProductForm.tsx` (capture form)
- `apps/mobile/app/marketplace/[marketplace].tsx` (WebView + translation)
**Steps:**
1. Identify the failing screen/flow.
2. Read the relevant source file.
3. Fix the issue (patch).
4. Re-run the screen in Expo Go to confirm fix.
5. `npx tsc --noEmit` → confirm 0 errors.
6. Commit: `fix(mobile): [short description]`.

---

## Phase 2 — WebView Translation End-to-End Test

### Task 3: Manually test translation on a real Chinese page
**Objective:** Prove zh→en and zh→so translation actually fires and replaces visible text.
**Precondition:** Expo Go running on device/emulator.
**Steps:**
1. Open Markets tab → tap "1688" marketplace.
2. Wait for page to fully load (see "Loading 1688…" disappear).
3. Look for Chinese text on the 1688 homepage. After 1-2 seconds it should begin to change to English.
4. Tap the translate globe button (EN/SO) → confirm it switches to Somali.
5. Tap again → cycles back to OFF.
**Expected result:** Chinese text visibly replaced in both directions. No crashes.
**Failure mode:** If Chinese text never changes → check that `TRANSLATE_SCRIPT` is being injected (`onLoadEnd` → `runPerPageScripts`). If it changes once but doesn't cycle → regression in `data-cs-orig` restore path (review Task 4).

### Task 4: (If needed) Debug translation injection timing
**Objective:** If translation doesn't fire, verify the script is injected at the right moment.
**Files:** `apps/mobile/app/marketplace/[marketplace].tsx` (lines 140-163 `runPerPageScripts`, lines 381-394 `onLoadEnd`)
**Check:**
- `runPerPageScripts` is called in `onLoadEnd` with delay=10.
- A second injection fires at +700ms.
- `webRef.current.injectJavaScript(combined)` runs without exception.
**Fix:** If `webRef.current` is null in `onLoadEnd`, add a guard and retry with +300ms.
**Validation:** Re-test Task 3.
**Commit:** `fix(mobile): ensure translation injects reliably on SPA pages`.

---

## Phase 3 — Rebuild Android APK/AAB (with latest code)

### Task 5: Queue fresh Android preview build
**Objective:** The APK at `4doPYQ...apk` was built before the USD-price and translation fixes. Queue a new build to include all recent commits.
**Preconditions:** EAS token valid (`dDierj...Z__-`), network capable of uploading ~50MB archive.
**Step 1: Verify token**
```bash
cd apps/mobile && npx eas-cli whoami
# should print: baane123
```
**Step 2: Queue build**
```bash
npx eas-cli build --platform android --profile preview --non-interactive --no-wait
```
**Step 3: Record the Build ID** from the JSON output and monitor at https://expo.dev/accounts/baane123/projects/chinasuuq-mobile/builds/
**Expected:** Build goes through `QUEUED → IN_PROGRESS → FINISHED` in ~10-20 min.
**Failure:** If upload stalls >5 min at 0%, kill and retry from a faster network.

### Task 6: Queue fresh Android production build
**Objective:** Production AAB also predates the fixes. Queue the latest.
**Step 1:**
```bash
npx eas-cli build --platform android --profile production --non-interactive --no-wait
```
**Step 2:** Record Build ID.
**Step 3:** When finished, download the `.aab` artifact for Google Play submission.

---

## Phase 4 — iOS Build (requires interactive Apple credentials)

### Task 7: Run iOS credential wizard interactively
**Objective:** Create Apple signing certificates + provisioning profiles so EAS can build iOS.
**Note:** This CANNOT be automated non-interactively — the wizard prompts for Apple ID, password, and 2FA code.
**Step 1:** Open a terminal (not Hermes) and run:
```bash
cd ~/Desktop/chinasuuq-new/apps/mobile
npx eas-cli credentials --platform ios
```
**Step 2:** When prompted:
- Select profile: `preview` (then `production` after)
- Select "Yes, log in to Apple account"
- Apple ID: `abdirahmanbaane@gmail.com`
- Password: [your Apple password — enter in terminal only]
- 2FA: [code from your device — enter in terminal only]
**Step 3:** After credentials are set up, queue iOS builds:
```bash
npx eas-cli build --platform ios --profile preview --non-interactive --no-wait
npx eas-cli build --platform ios --profile production --non-interactive --no-wait
```
**Step 4:** Record both Build IDs.
**Expected:** iOS builds take ~15-25 min. Artifacts: `.ipa` files.
**Failure:** If Apple 2FA fails, retry with new code. If certificate errors appear, delete old certs via `npx eas-cli credentials --platform ios` then re-run.

---
