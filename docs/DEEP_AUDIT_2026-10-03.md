# ChinaSuuq — Deep Audit & Enhancement Plan (2026-10-03)

Four parallel deep-audits: marketplace WebView screens (all of them, not just home), admin dashboard, backend edge functions + schema contracts, mobile app architecture. Every claim below carries file:line evidence from the audit runs.

---

## 1. Marketplace WebView — every screen, wiring verdict

The WebView exists in exactly one file (`app/marketplace/[marketplace].tsx`, 1478 lines); every "screen" inside it is an overlay/state around the live page. All postMessage channels (`LOGIN_WALL`, `BLANK`, `PUNISH`, `VISION_SCAN`, `CAPTURE`) are sent by injected scripts **and** handled — no orphaned messages either direction.

| # | WebView-internal screen | Status | Evidence |
|---|---|---|---|
| 1 | Live marketplace page (1688/Taobao/YiwuGo/…) | REAL | L60–66, L199 → RPC `get_shared_marketplace_account`, L224 auto-login script |
| 2 | In-page translation (zh→EN/SO) | REAL but BYPASSES our stack | uses `translate.googleapis.com` (webviewScripts.ts L131–168); our paid `ai-translate` edge never used here |
| 3 | USD price overlay | REAL / wrong source | live rate from open.er-api.com (exchange.ts L63–68); **never reads `exchange_rates` table that admin edits** |
| 4 | Login-wall banner | REAL | webviewScripts.ts L405–418 → L251–255 |
| 5 | Curated catalog fallback | REAL | `source_products` via db L708–730; cards → real `/product/[id]` |
| 6 | Punish/risk recovery overlay | REAL | webviewScripts.risk.ts L12–33 |
| 7 | Product capture ("Add to Cart") | REAL | DOM scrape incl. MOQ → L267–288 |
| 8 | AI Vision scan | REAL, dual-path | snapshot+screenshot → `ai-vision` edge; contract verified both sides (aiVision.ts L59–77 ≙ edge L63–65, L119). Logged-out/role-mismatch silently falls back to **bundled-key direct call** (aiVision.ts L142–145) |
| 9 | SmartProductForm review | REAL | fx live, MOQ via `product-enrich`, writes `sourcing_requests` |
| 10 | ProductReviewSheet (5-section costs) | PARTIAL | service fee hardcoded `0.05` (L169); intl shipping/duties honestly `pending` |
| 11 | WhatsApp order bar | REAL | by design |
| 12 | markets.tsx destination chip "Mogadishu" | FAKE CHROME | TouchableOpacity with **no onPress** (markets.tsx L50–54) |
| 13 | markets.tsx market list | REAL-by-config | static config, no live counts |

Product-detail side: `AiTranslateCard.tsx` → `aiChat` → **direct fetch to `ai.ota1245.top` with API key baked into app source** (`src/lib/ai.ts` L11–12). The paid, cached, Mission-Control-driven `ai-translate` edge function + its client (`src/api/translate.ts:105`) exist but have **zero callers** — the whole server translation stack is orphaned.

## 2. Admin dashboard — inventory, design, RBAC

All screens under `apps/web/src/app/admin/(protected)/`. Dashboard, Customers, Products, Sourcing, Quotes, Warehouse, AI Copilot, Rates, Login: **REAL** (RPCs/views/CRUD verified). Problem children:

- **Orders** — real but hard 50-row cap, no pagination UI; invoice modal fabricates one line from `target_marketplace` instead of `admin_order_items_view` (orders/page.tsx:355–358).
- **Payments** — confirm writes `payments` only; **never syncs `orders.payment_status`** — order/payment state desync by omission (payments/page.tsx:228–236, no trigger exists).
- **Marketplaces** — cookie editor writes `cookies/health` columns that exist only on live DB, not in migrations; the RPC mobile uses **nulls the cookies** (202609240001:24) → cookie injection can silently no-op. Worse: that RPC is SECURITY-DEFERRED to **anon** and ships plaintext shared passwords to the app, with a seeded credential in SQL (L26–44).
- **Staff** — "create staff" inserts a `staff_profiles` row **without linking any auth user** (staff/page.tsx:136–141) → new staff cannot log in. 13 roles are cosmetic: `staff_roles/permissions` tables exist with RLS, no screen checks them; any staff can edit payments, AI keys, delete staff.
- **Settings** — General/Currency save to `settings` KV but **no consumer anywhere reads those keys**; Shipping tab edits React state only — **fully FAKE** (settings/page.tsx:48, 473–497).
- **Shipments** — CRUD real but orphaned: no order↔shipment join, mobile never reads `shipments`.
- **Notifications** — **FAKE end-to-end**: zero INSERTs into `notifications` anywhere (admin, mobile, functions). Mobile inbox reads an empty table; badge is `useState(3)` (home.tsx:145); toggles are AsyncStorage-local; no expo-notifications, no push tokens. The channel is dead.
- **RBAC bug** — `ai-settings` gates with roles `['admin','super_admin']` but `'admin'` was dropped from the user_role enum (202609210001:27) → ordinary staff get 401 on AI settings.
- Orphaned edge functions: `operational-queue` (backed by `admin_tasks`), `quotes-validate` — deployed, zero consumers.

Design quality is genuinely high (Tailwind v4 tokens, `TableShell` skeletons/empty/error, URL-persisted filters, density prefs, realtime live-store). Concrete weaknesses: hardcoded hex drift in AI Copilot + dashboard charts (ai/page.tsx:160–233 vs token #FF5A0A), no dark mode, `DataTable` renders all rows (DataTable.tsx:154–188), duplicated data-access layers, Modal/Drawer patterns reimplemented per page.

## 3. Backend / security

- **CRITICAL — leaked provider key**: `sk-H5qx…` hardcoded in `apps/mobile/src/lib/ai.ts:9-10` AND `apps/web/src/lib/ai/client.ts:10`; already compiled into `apps/web/out/` chunks and the shipped `chinasuuq.apk`. Worst consumers: **public unauthenticated pages** — `QuoteForm.tsx:271` (AiQuoteAssistant) and `(public)/track/page.tsx:401` (AiShipmentConcierge) — anonymous visitors spend on the exposed key, unbounded.
- HIGH: `cart-validate` + `quotes-validate` have **no auth import** (anon can enumerate MOQ/price/stock; cart gate fails open).
- MEDIUM: `ai-vision` role list excludes `admin`/`supplier` → silent bundled-key fallback.
- LOW: CORS `*`; `unauthorized()` omits CORS headers; plaintext provider keys in `ai_provider_config` (contained by RLS).
- Positives: SSRF guard thorough; money-integrity RLS hardened; Mission-Control per-task AI provider CRUD is **verified end-to-end real** (AI Copilot → ai-proxy, translate, vision, extraction, enrich all resolve providers per task).
- Schema drift: repo migrations map to every queried table, but the **live DB has uncommitted columns**; migration `202609290001` is pending (Management API token expired at the time). Probe live schema before shipping any query.
- Sifalo Pay: design doc only, **no implementation in repo**.

## 4. Mobile app

Structure sound (~26k LOC, zustand, offline-first `src/db`, good token adoption). Issues: 5 screens bypass `db/` with direct `supabase.from()` (notifications×2, payment-methods) — break offline; `src/hooks/` is empty while `[marketplace].tsx` holds 26 `useState` in one file; i18n at 221 keys with support/settings fully English; **uncommitted `CategoryChips.tsx` removes `useI18n` → Somali chip labels being deleted**; `picsum.photos` placeholders; `RefreshControl` on only 4 screens; wishlist uses a second MOQ parser (`parseMOQ`) instead of `moqOrderRules`; dead `priceRangeLabel` with `/7.25` in product/[id].tsx:305.

---

## 5. The "really wired" fix list (WebView + AI + exchange)

1. **P0** Rotate `sk-H5qx…`; delete `AI_KEY/AI_URL` from `src/lib/ai.ts` + `apps/web/src/lib/ai/client.ts`; route `aiTranslateProduct`, `aiRankProducts`, AiQuoteAssistant, AiShipmentConcierge through `ai-proxy`/`ai-translate` (JWT-gated) or a new customer-gated function.
2. **P0** Fix shared-credential leak: `get_shared_marketplace_account` must stop returning plaintext passwords to anon (auth-gate it), or remove seeded credential.
3. **P1** Exchange single-source-of-truth: `getCnyPerUsd()` reads `exchange_rates` (admin-managed) first, open.er-api second, 7.25 last; sweep `/7.25` hardcodes (db/index.ts:501, product/[id].tsx:305).
4. **P1** Wire `src/api/translate.ts` into AiTranslateCard + WebView translation (kills the Google free-endpoint dependency and activates the paid cache + Mission Control providers).
5. **P1** Add `admin`/`supplier` to ai-vision allowed roles.
6. **P2** markets.tsx: wire or remove the no-op destination chip.
7. **P2** ProductReviewSheet service fee from `settings` table instead of `0.05`.
8. **P2** wishlist → `moqOrderRules`; restore CategoryChips i18n before committing.

## 6. Admin dashboard enhancement plan

Design layer: enforce tokens (purge 23 hex hits), true dark mode via `dark:` scale on `@theme`, server+client pagination in `DataTable`, unify all data access into `supabase-data.ts`, single Modal/Drawer primitive, real invoice lines from `admin_order_items_view`.

Advanced features, each wired to mobile (feasibility verified against existing tables/functions):

| Feature | Backend already there | Missing |
|---|---|---|
| **A. Notification composer + auto-notify on order/payment/shipment status + push** | `notifications` table w/ channel 'push' + RLS | writers, `push_tokens` table, expo-notifications, admin segmentation UI |
| **B. Payment→order reconciliation** | `payments`, money-integrity guards 202609210001 | orchestration edge fn syncing `orders.payment_status` + status + customer notify |
| **C. Mission Control: Operational Queue screen** | `operational-queue` fn + `admin_tasks` — fully built, zero UI | admin page + approve/dismiss |
| **D. Rate-change propagation** | `exchange_rates` + admin Rates | mobile `exchange.ts` reads it (fix 3) — admin then truly controls customer prices |
| **E. Shipment tracking admin↔mobile** | `shipments`, status adapter mirrored mobile-side | order↔shipment join, milestone timeline, mobile tracker reads it |
| **F. Real RBAC** | `staff_roles` + `permissions` tables w/ RLS | fix `requireAdmin` enum bug, gate screens, staff-invite flow linking auth user |
| **G. Content Manager (banners/categories/featured)** | `categories`, `admin_category_product_counts` | CRUD screens; mobile reads instead of hardcoded `HERO_BANNERS`/`CATEGORIES` |
| **H. AI cost & usage dashboard** | all AI calls funnel through task-resolved providers | `ai_usage_events` ledger in fns + dashboard page |
| **I. Quote SLA board + wishlist→sourcing funnel** | `quotes.valid_until/status`, `sourcing_requests` | aging chips, reminders, admin surface for `product_events` / featured boosts |
| **J. Marketplace account health** | — | add cookies/health columns or drop UI; kill anon password RPC |

---

## 7. Patch round 2 (2026-10-03, later) — AI settings failure + WebView page parity

**"Could not reach the AI settings service" root cause (two stacked bugs, both now fixed AND deployed live):**
1. `ai-settings` / `ai-test-connection` gated on `requireAdmin` = roles `["admin","super_admin"]`, but the live `user_role` enum has no `admin` value → every staff request was rejected. Both now use `requireStaffOrAdmin`.
2. `unauthorized()` in `_shared/auth.ts` returned 401 WITHOUT CORS headers → the browser refused to read the response, so the client couldn't even see the 401 and reported "Could not reach". Fixed; verified live (401 + `access-control-allow-origin` on preflight).

**Live RBAC truth (probed via Management API):** no `roles`/`staff_roles`/`role_permissions` tables exist. The real model is one flat `permissions(role staff_role, permission permission_type)` table — staff_role is an 18-value enum (super_admin, operations_director, finance_verifier, …), permission_type the 13 actions (verify_payment, manage_roles, manage_exchange_rate, …). The table was EMPTY — that was the "Permissions not configured" banner. `lib/admin/permissions.ts` was rewritten against the real schema (it had been querying join tables that don't exist), and migration `202610030005_rbac_default_grants.sql` was APPLIED LIVE: default grants seeded for all 18 roles (AI keys + staff deletion = `manage_roles` → super_admin/operations_director only; payment confirm = `verify_payment` → finance pair, branch manager, ops director). Adjust the org chart to taste.

**Marketplace WebView page-type parity** (home / search results / product detail must all behave the same for translation, USD exchange, AI Vision):
- `NAV_WATCH_SCRIPT` (webviewScripts.ts): in-page sentinel posts `NAV` on any `location.href` change (pushState/hash/popstate) — SPA marketplaces previously only ran the script suite on the entry document.
- `[marketplace].tsx` handles `NAV` exactly like a real navigation: clears the stale captured product (fixes the review-sheet-opens-with-PREVIOUS-product bug on SPA detail pages) and re-runs the full per-page suite (translate, USD, capture, login-wall, punish).
- TRANSLATE_SCRIPT: the 60-request budget now RESETS on route change and the periodic pass self-heals instead of clearing its own timer — product detail reached from a translated search list now translates like the home page.

**Deployed live:** ai-settings, ai-test-connection, ai-chat, ai-translate, ai-vision, cart-validate, quotes-validate, payment-reconcile. **Still pending live:** migrations 202610030001–0004 (notification trigger, shipment↔order link, shared-account RPC hardening, service-fee seed) — 0003 intentionally breaks guest marketplace auto-login until confirmed. Rebuild web bundle + APK to purge the old leaked-key artifacts.
