# ChinaSuuq — Production Readiness & Business Workability Assessment

**Date:** 2026-09-21 · **Scope:** Web (chinasuuq.com), Admin Mission Control, Mobile (iOS/Android via Expo), Supabase backend
**Verdict: ✅ CONDITIONAL GO** — ready for soft launch now; 3 blockers before public marketing push.

## Platform Health (verified this session)

| Area | State | Evidence |
|---|---|---|
| Web landing + 21 public pages | ✅ Builds clean | `tsc --noEmit` pass, Vercel auto-deploy live |
| Admin Mission Control (14 pages) | ✅ Dashboard, Products, Orders, Customers, Payments, Shipments, Sourcing, Marketplaces, Quotes, Rates, Warehouse, Staff, Settings, Layout — all CRUD live against Supabase | 972-line dashboard, service-role server queries |
| Mobile app (38+ screens) | ✅ All registered in Stack; 4-tab shell; settings crash fixed; orders tab shows ALL orders with filters | `tsc --noEmit` pass; EAS APK builds succeed |
| Marketplace integration | ✅ 7 marketplaces incl. new **1$ Dollar Store** (huolangjun666.com) with auto-login pre-login | `marketplace_accounts` row live; `autoLoginScript` injected per WebView page |
| Orders flow | ✅ Cart → Checkout → Order → Success → Orders tab (fixed: fresh orders were hidden before) | `orders.tsx` renders all statuses, 16 status pills |
| Supabase schema | ✅ 18 tables, RLS on all, money-integrity hardening migration ready | migrations in `apps/web/supabase/migrations/` |

## 🚫 Blockers before public launch (all ≤30 min each)

1. **Apply 2 pending migrations** in Supabase SQL Editor:
   - `202609210001_money_integrity_rls_hardening.sql` (stops customers self-marking payments paid, signup role escalation)
   - `202609240001_shared_marketplace_account_rpc.sql` (pre-login for logged-out users)
2. **Admin login hardening:** review `apps/web/src/lib/adminSession.ts` fallback-session path — ensure the fallback PIN/secret is not a static guessable value in client code; prefer Supabase Auth + staff role only.
3. **Payment ops doc:** ZAAD/Edahab receipts are manually confirmed by staff in Admin → Payments. Write the 1-page ops SOP (who checks, when, how to reject) before real orders arrive.

## ⚡ Speed & quality wins shipped

- Orders tab redesign (stats strip, All/Active/Completed chips, brand status pills)
- 1$ Dollar Store end-to-end: icon assets, marketplaces registry (mobile+web+admin), auto-login, cart grouping
- Vercel security headers + vercel.json config; sitemap/robots for SEO pages

## 🔜 Recommended next (week 1 post-launch, by impact)

1. **Realtime order status** — replace polling with Supabase Realtime channel on `orders` (mobile already subscribes to nothing; admin polls).
2. **Push notifications** — `expo-notifications` + Supabase edge trigger on order status change (order confirmed/shipped/delivered). Biggest trust-builder for Somali customers.
3. **Product image pipeline** — admin bulk upload to Supabase Storage instead of manual URLs; auto-webp via Next Image (already configured).
4. **Exchange-rate source check** — `DEFAULT_EXCHANGE_RATE = 7.0` is hardcoded fallback; add admin-editable rate (Rates page already exists — wire it into mobile pricing).
5. **FlashList** for marketplace product grids >50 items (FlatList currently).

## 💼 Business workability

- **Revenue model works:** 5% service fee collected at checkout + shipping paid on arrival in Somalia (standard for the market; no payment-gateway dependency).
- **Ops loop closes:** Customer orders in app → admin Mission Control sees order → staff purchases via marketplace pre-login (shared accounts) → status updates flow to customer tracking tab.
- **Bilingual (EN/SO) throughout** — matches target market.
- **Gaps (acceptable at launch):** returns/refunds are manual WhatsApp-based; no automated marketplace order sync (staff does this by hand using pre-login); analytics are the admin dashboard's own aggregates, not GA/Plausible.

## Reliability note (session ops)

Long autonomous turns hit provider 504s (gateway timeout). Mitigation adopted: short turns, commit per milestone, background long builds — no work lost on failure.
