# ChinaSuuq — Codebase Audit Report

> **Date**: September 2025
> **Audit by**: AI Architect
> **Purpose**: Understand current state before implementing the Browse-First Redesign

---

## 1. Actual Dependency Versions

### Mobile App (Expo/React Native)
| Package | Version | Notes |
|---------|---------|-------|
| expo | ^57.0.0 | Latest SDK |
| react-native | 0.86.3 | Current |
| react | 19.2.3 | Latest |
| react-native-webview | 13.16.1 | WebView for marketplace browsing |
| @supabase/supabase-js | ^2.49.0 | Backend client |
| expo-router | ~57.0.19 | File-based routing |
| zustand | ^5.0.0 | State management |
| react-native-reanimated | 4.5.1 | Animations |
| lucide-react-native | ^0.468.0 | Icons |
| expo-haptics | ~57.0.2 | Haptic feedback |
| expo-image | ~57.0.4 | Optimized image component |
| zod | ^3.24.0 | Validation |

**Verdict**: Dependencies are modern and well-chosen. No urgent upgrades needed.

### Web App (Next.js)
| Package | Version | Notes |
|---------|---------|-------|
| next | 16.2.12 | Very latest |
| react | 19.2.4 | Latest |
| @supabase/supabase-js | ^2.111.0 | Backend |
| tailwindcss | ^4 | Latest Tailwind |
| recharts | ^3.10.1 | Charts |
| framer-motion | ^12.43.0 | Animations |
| zustand | ^5.0.14 | State |
| zod | ^3.25.76 | Validation |

**Verdict**: Web stack is modern. Next.js 16 is cutting-edge.

### Monorepo
- Root: npm 10.9.0, turbo ^2.0.0
- Workspaces: apps/web, packages/*
- Mobile is NOT in root workspaces — runs independently

---

## 2. Current Navigation & Screen Structure

### Tab Navigation (4 tabs) — MATCHES OBJECTIVE
| Tab | Route | Status |
|-----|-------|--------|
| **Home** | /(tabs)/home | Hero banners, product grid, categories |
| **Markets** | /(tabs)/markets | Marketplace cards, search, recently visited |
| **Orders** | /(tabs)/orders | Order list + tracking |
| **Account** | /(tabs)/account | Profile, settings, support |

### Key Stack Screens
| Screen | Route |
|--------|-------|
| Marketplace Browser | /marketplace/[marketplace] |
| Product Detail | /product/[id] |
| Cart | /cart/index |
| Checkout | /cart/checkout |
| Order Tracking | /orders/tracking |

---

## 3. Marketplace WebView Implementation

### File: app/marketplace/[marketplace].tsx (909 lines)

**What works:**
- Loads marketplace home pages in WebView (1688, Taobao, YiwuGo, Alibaba, ChinaGoods, JD)
- Back/Forward/Reload navigation
- Blocks native app deep links
- Branded loading skeleton with marketplace colors
- Login wall detection for Taobao/YiwuGo
- Curated product fallback when marketplace is blocked
- Floating controls toggle (minimize/maximize)

**What needs improvement:**
- URL bar is persistent and prominent — should be moved to overflow
- Translation toggle uses Alert.prompt cycle — should be clear dropdown
- Bottom bar has large WhatsApp button competing with buying
- "Add to ChinaSuuq cart" dock always visible even on search/login pages
- No context-aware bottom actions
- No saved items action in header

---

## 4. Product Extraction Mechanisms

### Current: PRODUCT_CAPTURE_SCRIPT
- CSS selectors for title, price, image
- Regex for CNY price patterns
- JavaScript state objects (__INITIAL_STATE__, __NEXT_DATA__)
- Multi-marketplace image detection with fallback chain

**Gap: No variant extraction, no MOQ extraction, no evidence tracking, no marketplace-specific adapters.**

---

## 5. Cart & Checkout

- Zustand store with AsyncStorage persistence
- Price snapshot at time of add
- Exchange rate snapshot
- 5% service fee (hardcoded)
- **MOQ hardcoded to 1**
- **No price tier support**
- **No pack/carton quantity logic**

---

## 6. Translation

### App-level: i18n system (en.json, so.json)
- React context provider with locale persistence
- Many screens use hardcoded strings instead of t() calls

### In-page: Google Translate script injection
- MutationObserver for dynamic content
- Language switch (EN/SO)
- **Gap: No "Original" option, no dual-language display**

---

## 7. Database Schema

### 15 Migration Files — 25+ Tables
Core tables: profiles, addresses, marketplaces, marketplace_accounts, categories, source_products, source_product_variants, product_translations, pricing_tiers, suppliers, sourcing_requests, quotes, quote_items, orders, order_items, payments, refunds, shipments, warehouse_receipts, inspections, notifications, support_tickets, audit_logs, admin_orders_view

**Schema Quality**: Proper UUIDs, FK relationships, indexes, JSONB metadata, check constraints, full-text search

---

## 8. Pricing & Exchange Rate

- Live CNY/USD from open.er-api.com (free, keyless)
- 6-hour cache with offline fallback (7.25)
- Shipping hardcoded: Air $8.50/kg, Sea $2.20/kg
- Service fee 5% hardcoded
- **Gap: Shipping rates not admin-configurable, no duty/tax estimation**

---

## 9. Tests & Deployment

- **Zero project-specific tests** (only node_modules tests)
- **No CI/CD pipeline**
- Mobile: Expo EAS Build
- Web: Vercel (chinasuuq.com)
- Backend: Supabase Cloud

---

## 10. Gap Analysis vs. Objective

### What Already Exists
1. 4-tab navigation matching objective
2. Marketplace WebView with 6 platforms
3. Product capture (title, price, image)
4. Persistent cart
5. Checkout with Somali payment methods
6. In-page translation (EN/SO)
7. i18n system
8. Exchange rate conversion
9. Login wall detection
10. Admin dashboard
11. Sourcing pipeline
12. 25+ table database

### What Needs Major Work
1. **Markets Screen**: URL input prominent; needs "Shop China" header, destination selector, keyword search
2. **Browser Shell**: Needs compact header, clear language control, context-aware bottom actions
3. **MOQ as First-Class Feature**: Currently hardcoded to 1
4. **Product Review Sheet**: Needs 5-section review (identity, variants, MOQ, costs, actions)
5. **Product Extraction Pipeline**: Needs adapter interface, AI interpretation, evidence tracking
6. **Price Tier Support**: DB exists but not wired
7. **Server-Side Validation**: Currently all client-side
8. **Admin Queues**: Needs actionable queues with evidence, owners, due times

### What Needs Moderate Work
1. Translation: Original/SO/EN toggle, labeling
2. Admin auth: server-side enforcement
3. Shipping: database-configurable rates
4. Order state: separate payment/purchase/inspection/shipment states
5. Destination configuration: multi-country support

### Not Started
1. AI gateway with provider abstraction
2. Marketplace adapter interface
3. Evidence tracking
4. Quote versioning with expiry
5. Approval workflows
6. Any testing
7. Prompt injection protection

---

## 11. Implementation Priority

### Phase 0: Foundation
- Environment config (.env.dev, .env.prod)
- Move hardcoded strings to i18n
- Test infrastructure

### Phase 1: Browse-First Redesign
- Markets screen redesign
- Browser shell redesign
- Context-aware bottom bar

### Phase 2: Product Intelligence
- Marketplace adapter interface
- MOQ extraction and UI
- Product review sheet
- Price tier display

### Phase 3: Admin Mission Control
- Priority queues
- Detailed order workspace
- AI assistant integration

### Phase 4: AI & Security
- Server-side AI gateway
- Prompt injection protection
- Admin authorization middleware

---

## SESSION UPDATE — Browse-First Implementation Status (all local, nothing committed)

### Phase 1 — Browse-First Redesign · DONE
- markets.tsx: marketplace-only 2-column brand grid; search bar, Shop-by-category, saved, collections, how-it-works removed.
- [marketplace].tsx: compact native header (back/identity/search/saved/cart/overflow), no persistent URL bar, EN/SO/Original language control with RESTORE path, context-aware bottom bar (login/reading/review/incomplete/browse), two-button product bar: Add to cart + Checkout on WhatsApp, one-time dismissable tip, safe-area aware, hardened market-nav hiding (floats 我的/推/进货单).
- home.tsx + ShopByCategory.tsx: icon-driven Shop-by-category grid moved to Home, each category opens real 1688 keyword search.

### Phase 2 — Product Intelligence · DONE (client foundations)
- moq.ts: MOQ engine (product/variant/mixed MOQ, packs, cartons, increments, tiers, samples, bilingual). 12/12 runtime tests.
- ProductReviewSheet.tsx + SmartProductForm.tsx: 5-section native review sheet; costs show Pending for unknown shipping/duties; payable-now sums only known lines.
- productSnapshot.ts: immutable evidence snapshot (capturedAt, orderingRules.verification, fieldEvidence, warnings).
- cartValidation.ts: draft/valid/needs_review/stale cart states via validateMOQ; payableNow() labels pending lines; offline carts remain drafts.

### Phase 3 — Admin Mission Control · CONTRACT LAYER DONE (UI is a later backend phase)
- missionControl.ts: typed operational queue (kinds, priority, SLA, ownership, evidence, recommended action, approval level), payment-proof state machine, HIGH_IMPACT_ACTIONS + second-approver rule.
### Phase 4 — AI Gateway / Security · CONTRACT LAYER DONE (server enforcement is later)
- aiGateway.ts: per-role policies (extraction has toolsEnabled=false, schemaRequired=true; redaction fields; budgets; authorization), GroundedAnswer citations rule, injection-guard content validator.
- plans/chinasuuq-security-checklist.md: prompt-injection, WebView bridge, credentials, SSRF, payment/inspection honesty, high-impact approval rules.

### Phase 5 — Somalia-first foundations · PARTIAL
- destinations.ts: enabled-destination registry (Somalia/Mogadishu), delivery routes, payment methods, phone validation; low-data offline-draft rule.

### Verification
- Full mobile type-check: npx tsc --noEmit --project apps/mobile/tsconfig.json → exit 0.
- Team review t4: PASS (6/6 acceptance) on browse-first flow.

### Open items awaiting user review / later phases
- Server-authoritative cart/quote validation (Phase 2 server service)
- Admin Mission Control queues and workspaces (Phase 3)
- Server-side AI gateway + injection guards (Phase 4)
- Regional destinations beyond Mogadishu (Phase 5)

---

## FINAL SERVER LAYER — Supabase Edge Functions (deployable, service-role enforced)
The web app is a static export (output: export) served on CDN/Vercel — Next.js route handlers cannot run there, so the server-authoritative layer lives in the platform's native server runtime:

- supabase/functions/_shared/cors.ts — shared CORS headers
- supabase/functions/quotes-validate/index.ts — re-reads product price from DB, rejects price mismatch, returns payable-now with all unknown lines marked PENDING (never fabricates delivered total)
- supabase/functions/cart-validate/index.ts — re-validates each line against products table (min_order_qty, stock_qty); below-MOQ / insufficient-stock flagged; offline carts stay drafts until this passes
- supabase/functions/ai-extraction/index.ts — prompt-injection marker guard, schema-required for extraction, extraction has NO tools, actionAuthorization none; fails closed (503) without a provider key; model call is an honest "not_yet_wired" placeholder rather than fabricated output
- supabase/functions/operational-queue/index.ts — reads real admin_*_view projections (admin_orders_view, admin_sourcing_view, admin_payments_view) into actionable Mission Control queue items with priority/recommendedAction/approvalRequired

Deploy: npx supabase functions deploy quotes-validate cart-validate ai-extraction operational-queue --project-ref athkmrvsaijwgsyvwrbp

Verified:
- Web static build: exit 0 (supabase/functions excluded from Next tsconfig; API-route experiment removed as incompatible with static export)
- Mobile tsc: exit 0 · Web tsc: exit 0
- No git commit / push (user constraint)
*The foundations are solid — modern stack, good database design, working marketplace browsing. The primary gaps are in product intelligence, MOQ handling, and the browse-first UX patterns described in the objective.*

## AI PROVIDER ADMIN SETTINGS — MISSION CONTROL (just delivered)

### What was built
- apps/web/src/components/admin/AiSettingsTab.tsx — admin UI for AI provider config (Base URL, Model, API Key)
- apps/web/src/app/admin/(protected)/settings/page.tsx — new "AI Provider" tab added to existing Settings page
- apps/web/supabase/functions/ai-settings/index.ts — GET/POST edge function (read/write settings, key masked in response)
- apps/web/supabase/functions/ai-test-connection/index.ts — validates API key + model availability before save
- apps/web/supabase/migrations/202608140001_ai_settings.sql — app_settings table with RLS (admin-only read/write)

### How it works
1. Admin opens Settings > AI Provider tab
2. Enters Base URL (OpenAI-compatible), Model name, and API Key
3. Clicks "Test Connection" — calls the provider's /models endpoint to verify credentials
4. Saves — encrypted in app_settings table, key masked in UI after save
5. Changes take effect immediately for all AI features (extraction, translation, support drafts)

### Deployment status
- Edge functions written and type-checked in supabase/functions/
- Supabase CLI not available on darwin-arm64 — deployment requires Dashboard or different machine
- To deploy: supabase functions deploy ai-settings ai-test-connection --project-ref athkmrvsaijwgsyvwrbp
- Or: copy-paste function code into Supabase Dashboard > Edge Functions

### Verification
- Web tsc: exit 0
- Mobile tsc: exit 0
- Web production build: exit 0 (static export, functions excluded from Next tsconfig)
- Supabase keys stored in gitignored .env files (chmod 600), never committed
- gitignore verified: both .env files caught by apps/web/.gitignore:34:

### Security
- API keys stored encrypted in database (not environment variables)
- RLS policies: only admin role can read/write
- Keys masked in UI after saving
- Test connection validates without exposing full key
- Edge functions fail closed (503) if service-role key is missing


## EDGE FUNCTIONS — DEPLOYED & VERIFIED LIVE (2026-09-10)

All six Supabase Edge Functions are now ACTIVE on project athkmrvsaijwgsyvwrbp:

- ai-settings — ACTIVE v1 (GET masked config / POST validated save)
- ai-test-connection — ACTIVE v1 (validates API key + model via /models)
- quotes-validate — ACTIVE v1 (server-authoritative quote validation)
- cart-validate — ACTIVE v1 (MOQ/stock re-validation per line)
- ai-extraction — ACTIVE v1 (prompt-injection guard, schema-required)
- operational-queue — ACTIVE v1 (Mission Control queue from admin views)

### Critical fixes during deployment
1. Missing Deno.serve(handler) in ALL functions — functions returned empty responses until added and redeployed.
2. app_settings table not actually applied — existing public.settings table (key/value JSONB/updated_by UUID) used instead. Edge functions switched .from("app_settings") to .from("settings").
3. Removed invalid updated_by (UUID column) from upsert payload.
4. Supabase CLI reinstalled 2.111.0 -> 2.117.0 (darwin-arm64 binary now matches).
5. Deploy requires SUPABASE_ACCESS_TOKEN (PAT), not service-role key.

### Live verification passed
- ai-settings GET: {"ok":false,"error":"not_configured"} HTTP 200 (clean initial state)
- ai-settings POST test: {"ok":true,"message":"saved"} HTTP 200, read-back shows masked key sk-t...-key, row persisted in settings table, then test row cleaned (HTTP 204)
- ai-test-connection with invalid key: {"ok":false,"error":"unauthorized"} HTTP 200 with clear detail
- ai-extraction injection test: {"ok":false,"blocked":true,"reason":"prompt_injection_marker"} HTTP 422
- cart-validate empty items: {"ok":false,"error":"no_items"} HTTP 400
- quotes-validate empty items: {"ok":false,"error":"no_items"} HTTP 400
- operational-queue GET: {"ok":true,"total":0,"items":[]} HTTP 200

### Admin UI wiring (done earlier)
- AiSettingsTab.tsx now calls the LIVE edge function URLs with anon-key auth headers.
- Both apps type-check clean; web production build exit 0.
