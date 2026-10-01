# ChinaSuuq — Production Readiness & Business Workability Assessment

**Date:** 2026-09-29 · **Scope:** Web (chinasuuq.com), Admin Mission Control, Mobile (Expo), Supabase backend
**Verdict:** ⏳ DRAFT — verdict finalized after the four deep audits (web public / admin / mobile / backend) are merged.

## 1. Verified platform truth (live probes, this session)

Every claim below was verified against the **live** Supabase project (`athkmrvsaijwgsyvwrbp`) or by running the gates — not read from docs.

### Data layer
- **25/25 tables & views** and **5/5 RPCs** referenced anywhere in web `src/` exist in the live schema; every one-line `select`/`insert` column list aligns (static sweep vs. live OpenAPI). One drift found & fixed: `recordPayment()` inserted `shipping_method`, a column that does not exist live (would have failed with PGRST204) — payload now uses `provider_ref`/`evidence_url`.
- All four admin views (`admin_orders_view`, `admin_sourcing_view`, `admin_shipments_view`, `admin_payments_view`) return 200; metric RPCs (`admin_kpis`, `admin_category_product_counts`, `admin_revenue_daily`, `admin_order_status_counts`, `admin_revenue_by_marketplace`) exist and refuse non-staff sessions (`P0001` staff guard = healthy).
- `payments` live columns (14) match the admin payments page exactly; the `confirmed` payment status is schema-valid (added by `202408010014_admin_view_layer.sql`).
- `translations` cache table (7 cols, no `id`) **is applied** — mobile in-WebView translation works; cache fills on first use. (Earlier "missing" verdict was a probe error: `select=id` on a table without `id`.)

### Deployment reality
- **Fresh production deployment:** 0 rows in `orders`, `order_items`, `payments`, `source_products`, `sourcing_requests`, `product_events`, `translations`; 1 profile (the admin), 7 settings rows, 1 active shared marketplace account (`dollarstore`). The full pipeline exists end-to-end but has **zero production transactions yet** — every admin surface renders its empty state on first real use.
- Settings live: `service_fee_pct=5`, `min_order_usd=20`, `exchange_rate {cny_to_usd:0.15, cny_to_sos:79.5}`, `whatsapp_number=+86 152 7707 4143`, `default_language=en`.

### Migration matrix (corrected)
| Migration | State |
|---|---|
| `202408010001…202408010014` (base + admin view layer) | ✅ Applied |
| `202609210001_money_integrity_rls_hardening` | ✅ Applied |
| `202609240001_shared_marketplace_account_rpc` | ✅ Applied |
| `202609250001_translation_cache` | ✅ Applied |
| **`202609290001_quote_requests`** (+ `sourcing_requests.contact_name/contact_phone`) | ⏳ **Pending — optional.** The web quote flow works today by writing contact info into `product_description`; applying it restores a structured quote intake. |

### Payment ops (manual, by design)
- ZAAD / Edahab mobile-money transfers are **confirmed by ops staff** in Admin → Payments (bulk-confirm, CSV export, per-row status select; confirm stamps `verified_by`/`verified_at`). No gateway, no webhook (`payments.webhook_received` is vestigial). Runbook: `docs/PAYMENT_OPS_SOP.md` (drafted this session).
- Revenue = the 5% service fee; shipping collected on arrival in Somalia. Model is workable without any payment-provider dependency.

## 2. Work shipped this session (all gates green)

| Wave | Content |
|---|---|
| Milestone `323125c` | Web quote flow, admin live-data wiring, catalog columns, mobile order path, Tailwind v4 theme, ai-translate cache hardening (cache-read failure now degrades with `console.warn` + cold-cache loop instead of hard-failing) |
| Perf pass | [vercel.json](apps/web/vercel.json) 6th header rule: CDN edge caching for HTML (`s-maxage=86400` + 7-day SWR) scoped with negative lookahead so `/admin` no-store, `/_next` immutable, `/images`, `/app/*.apk` rules keep sole authority; `next.config.ts` + font loading audited, already optimal |
| Schema drift fix | `apps/web/src/lib/admin/supabase-data.ts` `recordPayment()` → live `payments` columns |
| Docs | `docs/PAYMENT_OPS_SOP.md` (payment operations runbook) — in progress |

## 3. Audit findings (to merge)

- [ ] Web public pages — _pending audit agent_
- [ ] Admin mission control — _pending audit agent_
- [ ] Mobile screens — _pending audit agent_
- [ ] Supabase backend — _pending audit agent_

## 4. Blockers & recommended next

1. **Redeploy the `ai-translate` edge function** after the cache-hardening commit (hardening only — current deployed behavior still works).
2. **Optional migration** `202609290001` (quote_requests) — apply via Supabase dashboard/CLI when structured quote intake is wanted.
3. Populate catalog: the store has marketplaces wired but 0 source products; first real inventory + first orders will exercise every empty state.

## 5. Business workability

- Bilingual EN/SO throughout; 5% fee model live in settings; manual payment confirmation closes the ops loop without gateway dependency; shipping on arrival matches market norms.
- Shared marketplace accounts (`marketplace_accounts`, active: `dollarstore`) enable staff purchasing with pre-login automation.
- Gaps accepted at launch: returns/refunds manual via WhatsApp (`+86 152 7707 4143`), no automated marketplace order sync, dashboard aggregates instead of external analytics.
