# ChinaSuuq Production Readiness — Full Stack Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make every mobile screen data-connected to Supabase, add Somali payment integration (Zaad/Edahab/EVC Plus), smooth the WebView marketplace UX, and achieve production readiness for app store submission.

**Architecture:** Local-first data layer (`src/db/index.ts`) already bridges mobile → Supabase. Most screens use it but some are offline-only or stubbed. The admin dashboard is Next.js + Supabase direct client. Payment integration follows the manual-confirmation pattern (no universal Somali payment gateway exists — providers use USSD push / merchant portals, not public REST APIs). The plan adds a payment-confirmation flow in the admin and a WhatsApp-triggered payment in mobile.

**Tech Stack:** Expo SDK 54, react-native-webview, Zustand, Supabase JS SDK, Next.js 16, Tailwind v4, EAS Build.

---

## Current State (verified)

**What works:**
- 31 mobile screens, all with proper default exports, TypeScript clean
- `src/db/index.ts` (577 lines) — local-first layer with Supabase sync for: orders, products, profiles, addresses, payments, favorites, sourcing captures
- Cart → Checkout → createOrder flow works (writes to local + syncs to Supabase `orders`)
- Admin: 10 domain pages (orders, customers, products, payments, rates, sourcing, quotes, shipments, warehouse, staff) + dashboard + settings + marketplace accounts
- All 8 admin views created and verified against live schema
- Translation WebView fixed (language switch, speed, multi-marketplace image capture)

**What's broken/missing:**

| # | Gap | Screen/Page | Severity |
|---|-----|-------------|----------|
| 1 | Support screen is FAQ-only, no ticket creation | `app/support/index.tsx` | High |
| 2 | Cart uses local-only state, no Supabase sync | `app/cart/index.tsx` | High |
| 3 | Home tab shows products from local cache only, never refreshes from Supabase | `app/(tabs)/home.tsx` | Medium |
| 4 | Orders tab uses `getOrders()` (local only), not `getOrdersByUser()` | `app/(tabs)/orders.tsx` | High |
| 5 | No payment confirmation flow — checkout creates order but payment is manual WhatsApp | `app/cart/checkout.tsx` | High |
| 6 | Admin payments page has CRUD but no webhook / USSD confirmation | `apps/web/src/app/admin/(protected)/payments/page.tsx` | High |
| 7 | Admin rates page works but exchange rate isn't pushed to mobile settings | `apps/web/src/app/admin/(protected)/rates/page.tsx` | Medium |
| 8 | Notifications screen polls Supabase but has no write path (no way to send) | `app/notifications/index.tsx` | Low |
| 9 | Profile personal-info saves locally but Supabase sync is untested | `app/profile/personal-info.tsx` | Medium |
| 10 | WebView scroll/zoom can feel janky on low-end devices | `app/marketplace/[marketplace].tsx` | Medium |
| 11 | No end-to-end test harness | — | High |
| 12 | Android APK needs rebuild (predates latest fixes) | EAS | High |
| 13 | iOS builds still blocked on Apple credentials | EAS | High |

---

## Somali Payment Integration — Research Summary

### The Reality (no sugar-coating)
There is **no universal Somali payment gateway API**. Unlike M-Pesa (Kenya) which has a developer API, Somali mobile money providers (Zaad, Edahab, EVC Plus) operate as **closed USSD systems**:

| Provider | Network | USSD Code | API Available? | Integration Path |
|----------|---------|-----------|----------------|------------------|
| **Zaad** | Telesom (Somaliland) | `*888#` | No public API | Merchant portal or manual confirmation |
| **Edahab** | Golis (Somaliland) | `*888#` | No public API | Merchant portal or manual confirmation |
| **EVC Plus** | Hormuud (Somalia) | `*770#` | No public API | Merchant portal or manual confirmation |
| **Sahal** | Somtel (Somalia) | `*799#` | No public API | Merchant portal or manual confirmation |
| **Premier** | Somtel | `*100#` | No public API | Merchant portal or manual confirmation |

### Integration Strategy (production-viable)

**Option A: Manual Confirmation Flow (RECOMMENDED — ships now)**
1. Customer selects payment method (Zaad/Edahab/EVC Plus) at checkout
2. App shows payment instructions: "Transfer $X to +252 61 234 5678 (ChinaSuuq Ltd) via [Zaad/Edahab/EVC]"
3. Customer makes payment on their phone via USSD
4. Customer enters transaction reference/confirmation number in the app
5. Admin sees the payment in Mission Control → confirms/rejects
6. Order status updates automatically

**Option B: WhatsApp Bridge (already partially working)**
1. After checkout, send order details + payment instructions to WhatsApp
2. Customer screenshots payment confirmation → sends via WhatsApp
3. Admin manually confirms in Mission Control

**Option C: Third-party aggregator (future, if available)**
Some Somali fintech startups (e.g., **Salaam Online**, **SomPay**) are building aggregator APIs, but none are production-ready or publicly documented yet. Monitor these.

### Payment Flow Architecture

```
Mobile App (checkout)          Supabase                    Admin Mission Control
─────────────────              ────────                    ─────────────────────
1. Select payment method ───→ INSERT into payments table
2. Show payment instructions   (status: "pending")
3. Customer pays via USSD
4. Enter txn reference ──────→ UPDATE payment (reference, status: "awaiting_confirmation")
5.                              ← Notification to admin
6. Admin confirms ───────────→ UPDATE payment (status: "confirmed")
7.                              → UPDATE order (payment_status: "paid")
8. Order proceeds to shipping
```

---

## Phase 1 — Wire Every Screen to Supabase (Backend Connectivity)

### Task 1: Fix Orders tab to use `getOrdersByUser()` (not local-only)
**Objective:** The Orders tab currently calls `getOrders()` which reads local AsyncStorage only. It should call `getOrdersByUser(userId)` which fetches from Supabase + merges with local.
**Files:**
- Modify: `apps/mobile/app/(tabs)/orders.tsx:60`
**Change:**
```typescript
// BEFORE (line ~60):
const data = await getOrders();
// AFTER:
import { useAuthStore } from "@/store/auth";
const user = useAuthStore((s) => s.user);
const data = user ? await getOrdersByUser(user.id) : await getOrders();
```
**Steps:**
1. Read `app/(tabs)/orders.tsx` fully
2. Import `useAuthStore` and `getOrdersByUser` from `@/db`
3. Replace `getOrders()` call with `getOrdersByUser(user.id)`
4. Add loading state for initial fetch
5. `npx tsc --noEmit` → 0 errors
6. Commit: `fix(mobile): orders tab fetches from Supabase via getOrdersByUser`

### Task 2: Fix Home tab to refresh products from Supabase
**Objective:** Home tab loads products from local cache but never force-refreshes from Supabase. Add pull-to-refresh that fetches fresh data.
**Files:**
- Modify: `apps/mobile/app/(tabs)/home.tsx:156`
**Change:** Wrap the product fetch in a `refreshProducts` function that calls `getProducts()` with `force=true` (add an optional force param to `db/index.ts getProducts()`). Add `RefreshControl` to the ScrollView.
**Steps:**
1. Add `force?: boolean` param to `getProducts()` in `src/db/index.ts`
2. When `force=true`, skip local cache and go straight to Supabase
3. In `home.tsx`, add `RefreshControl` to ScrollView
4. On refresh, call `await getProducts(true)` then `setProducts(result)`
5. `npx tsc --noEmit` → 0 errors
6. Commit: `fix(mobile): home tab pull-to-refresh fetches fresh products from Supabase`

### Task 3: Connect Support screen to Supabase (create support tickets)
**Objective:** Support screen is FAQ-only. Add a "Contact Us" form that creates a ticket in Supabase `support_tickets` table.
**Files:**
- Modify: `apps/mobile/app/support/index.tsx`
- Modify: `apps/mobile/src/db/index.ts` (add `createSupportTicket`)
**Steps:**
1. Add `createSupportTicket()` to `src/db/index.ts` that inserts into `support_tickets` table
2. Add a contact form section below the FAQ in `support/index.tsx`
3. Form fields: subject, message, priority (low/medium/high)
4. On submit: create ticket, show success toast, navigate back
5. `npx tsc --noEmit` → 0 errors
6. Commit: `feat(mobile): support screen creates tickets in Supabase`

### Task 4: Wire Profile personal-info to Supabase (verify sync works)
**Objective:** Profile personal-info saves locally but Supabase sync is untested. Verify it works, fix if broken.
**Files:**
- Read: `apps/mobile/app/profile/personal-info.tsx`
- Read: `apps/mobile/src/db/index.ts:400-414` (updateProfile)
**Steps:**
1. Read personal-info.tsx — check what it calls on save
2. If it calls `updateProfile()`, verify the Supabase path works (check RLS policies allow auth user to update their own profile)
3. If broken, fix the Supabase call or add RLS policy
4. `npx tsc --noEmit` → 0 errors
5. Commit: `fix(mobile): profile personal-info syncs to Supabase`

### Task 5: Add notification badge count from Supabase
**Objective:** Tab bar should show unread notification count from Supabase.
**Files:**
- Modify: `apps/mobile/app/(tabs)/_layout.tsx` (add badge to notifications tab)
- Modify: `apps/mobile/src/db/index.ts` (add `getUnreadNotificationCount`)
**Steps:**
1. Add `getUnreadNotificationCount(userId)` to `db/index.ts` — queries `notifications` table WHERE `read_at IS NULL` AND `profile_id = userId`
2. In `_layout.tsx`, use `Tab.Badge` or custom badge on the Notifications tab
3. Poll every 60s or on app focus
4. `npx tsc --noEmit` → 0 errors
5. Commit: `feat(mobile): notification badge count from Supabase`

---

## Phase 2 — Somali Payment Integration

### Task 6: Add payment-confirmation UI to checkout flow
**Objective:** After order creation, show a payment instructions screen with the selected method's details and a field to enter transaction reference.
**Files:**
- Create: `apps/mobile/app/orders/payment-confirm.tsx`
- Modify: `apps/mobile/app/_layout.tsx` (register new screen)
- Modify: `apps/mobile/app/cart/checkout.tsx:147` (navigate to payment-confirm after order creation)
**Steps:**
1. Create `payment-confirm.tsx` screen that shows:
   - Order summary (amount, items)
   - Payment instructions based on method (Zaad: "Transfer to +252 61 234 5678", EVC: "Scratch card code", etc.)
   - Text input for transaction reference
   - "Confirm Payment" button
2. Register in `_layout.tsx`
3. In `checkout.tsx`, after `createOrder()`, navigate to `/orders/payment-confirm?id={orderId}`
4. On confirm: update order payment_status to "awaiting_confirmation", save reference
5. `npx tsc --noEmit` → 0 errors
6. Commit: `feat(mobile): payment confirmation screen with transaction reference`

### Task 7: Add payment confirmation table/columns to Supabase
**Objective:** Ensure the `payments` table can store transaction references and confirmation status.
**Files:**
- New SQL: apply via Management API
**SQL:**
```sql
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS transaction_reference TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS confirmed_by UUID;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
```
**Steps:**
1. Apply SQL via Management API
2. Verify: `SELECT column_name FROM information_schema.columns WHERE table_name='payments' AND column_name IN ('transaction_reference','confirmed_by','confirmed_at');`
3. Record migration in `supabase_migrations.schema_migrations`
4. Commit SQL file to repo

### Task 8: Add payment webhook endpoint (admin can confirm payments)
**Objective:** Admin can confirm/reject payments from Mission Control, which updates order status.
**Files:**
- Modify: `apps/web/src/app/admin/(protected)/payments/page.tsx`
**Steps:**
1. Add "Confirm" and "Reject" action buttons to each payment row
2. On confirm: UPDATE payments SET status='confirmed', confirmed_at=now(), confirmed_by=admin_id WHERE id=payment_id
3. Also UPDATE orders SET payment_status='paid' WHERE id=order_id
4. On reject: UPDATE payments SET status='failed'
5. Show transaction reference in the payment row
6. Commit: `feat(admin): payment confirm/reject actions with transaction reference`

### Task 9: Add payment method info to settings screen
**Objective:** Settings screen should show available payment methods and their instructions.
**Files:**
- Modify: `apps/mobile/app/settings/index.tsx`
**Steps:**
1. Add a "Payment Methods" section to settings
2. List: Zaad (+252 61 234 5678), Edahab (+252 61 234 5678), EVC Plus (+252 61 234 5678), Bank Transfer (account details)
3. Each with a "Copy Number" button
4. `npx tsc --noEmit` → 0 errors
5. Commit: `feat(mobile): payment methods info in settings`

---

## Phase 3 — WebView Marketplace Smoothing

### Task 10: Add skeleton loading states for WebView
**Objective:** While the WebView loads, show a branded skeleton instead of blank white.
**Files:**
- Modify: `apps/mobile/app/marketplace/[marketplace].tsx:416-423` (loading overlay)
**Steps:**
1. Replace the current loading spinner with a branded skeleton:
   - Animated pulsing rectangles matching marketplace brand color
   - Marketplace name + "Loading..." text
2. Use `Animated` API or `expo-linear-gradient` for shimmer effect
3. Commit: `feat(mobile): branded skeleton loading for marketplace WebView`

### Task 11: Optimize WebView performance (hardware acceleration, cache)
**Objective:** Make the WebView feel smoother on low-end devices.
**Files:**
- Modify: `apps/mobile/app/marketplace/[marketplace].tsx:345-415` (WebView props)
**Changes:**
```typescript
// Add these props to the WebView:
renderLoading={() => null}  // we handle loading ourselves
setWebContentsDebuggingEnabled={__DEV__}  // debug in dev only
cacheEnabled
cacheMode="LOAD_DEFAULT"
```
**Steps:**
1. Read current WebView props
2. Add cache and performance props
3. Test on device — should feel snappier on revisits
4. Commit: `perf(mobile): WebView cache and hardware acceleration tuning`

### Task 12: Add "recently visited" marketplace shortcuts
**Objective:** Show the last 3 visited marketplaces as quick-access chips at the top of the Markets tab.
**Files:**
- Modify: `apps/mobile/app/(tabs)/markets.tsx`
- Modify: `apps/mobile/src/lib/marketplaces.ts` (add recently-visited storage)
**Steps:**
1. Add `getRecentlyVisited()` / `addRecentlyVisited(id)` to `marketplaces.ts` using AsyncStorage
2. In markets.tsx, show a "Recent" row above the marketplace grid with the last 3 visited
3. Tapping a recent chip navigates directly to the marketplace
4. `npx tsc --noEmit` → 0 errors
5. Commit: `feat(mobile): recently visited marketplace shortcuts`

---

## Phase 4 — Admin Mission Control Enhancements

### Task 13: Add payment dashboard widget
**Objective:** Admin dashboard should show today's payments, total confirmed, pending count.
**Files:**
- Modify: `apps/web/src/app/admin/(protected)/page.tsx`
**Steps:**
1. In the dashboard, add a "Payments Today" card showing:
   - Total amount confirmed today
   - Pending confirmation count
   - Failed count
2. Query: `supabase.from('payments').select('*').gte('created_at', todayStart)`
3. Commit: `feat(admin): payment dashboard widget`

### Task 14: Add real-time order status notifications
**Objective:** When admin confirms a payment, the mobile user gets a push notification (or in-app notification).
**Files:**
- Modify: `apps/web/src/app/admin/(protected)/payments/page.tsx` (on confirm, insert notification)
- Modify: `apps/mobile/src/db/index.ts` (add `createNotification`)
**Steps:**
1. When admin confirms a payment, INSERT into `notifications` table:
   ```sql
   INSERT INTO notifications (profile_id, title, body, type)
   VALUES (order_user_id, 'Payment Confirmed', 'Your order #CSQ-xxx has been confirmed', 'payment')
   ```
2. Mobile notifications screen already polls this table
3. Commit: `feat: payment confirmation triggers notification`

---

## Phase 5 — Testing & Verification

### Task 15: End-to-end smoke test (manual)
**Objective:** Walk through the full user journey on Expo Go.
**Steps:**
1. Start Expo Go: `cd apps/mobile && npx expo start`
2. Test journey:
   [ ] Home tab loads products from Supabase
   [ ] Markets tab → tap 1688 → WebView loads → translation fires (zh→en)
   [ ] Tap + button on a product → SmartProductForm shows with image thumbnail
   [ ] Add to cart → cart badge shows count
   [ ] Cart → shows product with USD price
   [ ] Checkout → fill form → select ZAAD → place order
   [ ] Payment confirm screen shows instructions
   [ ] Enter reference → confirm
   [ ] Orders tab shows the new order
   [ ] Order detail shows tracking
   [ ] Profile → Personal Info → edit name → save → verify it persists
   [ ] Profile → Addresses → add address → verify it appears
   [ ] Settings → language toggle works
   [ ] Support → submit ticket → verify it appears in admin
   [ ] Notifications tab shows payment confirmation
3. Log any failures

### Task 16: Admin end-to-end test
**Objective:** Walk through the full admin journey.
**Steps:**
1. Open admin: `cd apps/web && npm run dev`
2. Login: admin@chinasuuq.com / admin123
3. Test journey:
   [ ] Dashboard loads with KPIs
   [ ] Orders page lists orders
   [ ] Payments page lists payments
   [ ] Confirm a pending payment → order status updates
   [ ] Products page → create/edit/delete a product
   [ ] Customers page lists customers
   [ ] Settings page saves exchange rate
   [ ] Marketplace accounts page shows shared logins
4. Log any failures

### Task 17: Rebuild Android APK with all fixes
**Objective:** Queue a fresh EAS build that includes all fixes from this session.
**Steps:**
```bash
cd apps/mobile
npx eas-cli build --platform android --profile preview --non-interactive --no-wait
npx eas-cli build --platform android --profile production --non-interactive --no-wait
```
4. Record Build IDs
5. When finished, download APK/AAB artifacts

### Task 18: iOS build (requires interactive Apple credentials)
**Objective:** Complete iOS signing and build.
**Steps:**
1. Open terminal (not Hermes):
```bash
cd ~/Desktop/chinasuuq-new/apps/mobile
npx eas-cli credentials --platform ios
```
2. Enter Apple ID: abdirahmanbaane@gmail.com
3. Enter password + 2FA in terminal
4. Queue builds:
```bash
npx eas-cli build --platform ios --profile preview --non-interactive --no-wait
npx eas-cli build --platform ios --profile production --non-interactive --no-wait
```
5. Record Build IDs

---

## Execution Order

```
Phase 1 (Tasks 1-5): Backend connectivity     ← do first, everything depends on this
Phase 2 (Tasks 6-9): Payment integration       ← core business logic
Phase 3 (Tasks 10-12): WebView smoothing       ← UX polish
Phase 4 (Tasks 13-14): Admin enhancements      ← in parallel with Phase 3
Phase 5 (Tasks 15-18): Testing + builds        ← after all features done
```

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Supabase GoTrue auth still broken (500 on login/signup) | Mobile users can't log in → can't place orders | Use WhatsApp checkout as primary CTA; defer auth fix to Supabase support |
| No real Somali payment API exists | Can't do automated payment confirmation | Manual confirmation flow (Task 6-8) is the industry standard |
| EAS upload stalls on slow network | Can't build APK | Retry from faster network; use local JDK build as fallback |
| Android APK predates latest fixes | Users get old version with broken translation | Task 17 rebuilds with all fixes |

## Open Questions

1. **WhatsApp number for payments** — Is +252 61 234 5678 the correct number for Zaad/Edahab/EVC Plus payments, or is it a different number?
2. **Bank account details** — What bank name and account number should be shown for bank transfer payments?
3. **Admin login** — The GoTrue auth fault (HTTP 500 on login/signup) is still present. Should we use the REST API auth bypass pattern for now, or wait for Supabase support?
4. **Push notifications** — Should we add Expo Push Notifications for real-time order updates, or is in-app polling sufficient for v1?
