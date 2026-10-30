# Live DB column contract — verified 2026-09-29

Probed via PostgREST against `athkmrvsaijwgsyvwrbp` with the public anon key
(`select=<col>&limit=1` → 200 = column exists, 400/PGRST204 = does not exist;
`marketplace=eq.<v>` → 200/400 enum membership). RLS blocks row *data* but not
column *contracts*, so this is authoritative without any service role.

## Table of verified columns

| Table | Exists (✓) | Does NOT exist (✗ — writing these fails the WHOLE request) |
|---|---|---|
| `orders` | id, reference, user_id, status, payment_status, shipping_method, subtotal_usd, service_fee_usd, total_usd, currency, delivery_address, notes, created_at | order_number, customer_id, total, recipient_name, city, address, contact_* , shipping_address |
| `sourcing_requests` | id, user_id, marketplace, product_url, product_description, quantity, destination_city, status (enum default 'pending'), created_at, updated_at | profile_id, customer_id, agent_id, title, description, reference_urls, target_marketplace, quantity_needed, price_cny, price_usd, images, contact_* , notes |
| `sourcing_requests.marketplace` enum | 1688, taobao, yiwugo, alibaba, chinagoods, jd | dollarstore, chinasuuq-deals (insert NULL instead) |
| `quotes` | id, reference, user_id, status, total_usd, total_cny, valid_until, created_at, updated_at | request_id, quote_number, sourcing_request_id, profile_id, exchange_rate, fees, freight_estimate, subtotal*, shipping_cost, service_fee, tax_amount, discount_amount, total, currency, notes, items |
| `quote_items` | id, quote_id, product_name, quantity, variant, unit_price_cny, created_at | supplier, price_cny, price_usd, moq, selected, cost_price, sourcing_request_id, source_url, unit_price_usd |
| `payments` | id, order_id, amount, currency, method, status, reference, created_at | amount_usd |
| `shipments` | id, reference, method, status, origin, destination, total_packages, tracking_number, carrier, departure_date, estimated_arrival, notes, created_at, updated_at | order_id, weight_grams |
| `warehouse_packages` | id, order_id, weight_kg, quantity, status, created_at, updated_at | customer_id, location, reference, method, tracking_number, carrier, destination, notes |
| `staff_profiles` | id, user_id, role, is_super_admin, created_at | full_name, name, email, phone, avatar_url |
| `exchange_rates` | id, from_currency, to_currency, rate, reason, is_active, effective_from, effective_until, created_at | currency, source |
| `notifications` | id, user_id, title, body, type, read, created_at | is_read |
| `categories` | id, name_en, name_so, slug, icon, image_url, parent_id, sort_order, is_active, created_at (12 rows, image_url all NULL) | |

## Verified enums (probe 2, 2026-09-29 — `?col=eq.value` → 200 valid / 400 invalid)

| Column | Valid values |
|---|---|
| `sourcing_requests.status` | pending, assigned, quoted, approved, purchased, cancelled (NOT 'open') |
| `orders.status` | pending, confirmed, purchasing, purchased, consolidated, shipped, in_transit, arrived_somalia, out_for_delivery, delivered, cancelled (NOT awaiting_payment/paid/in_warehouse/inspection_passed/customs_hold) |
| `quotes.status` | draft, sent, approved, rejected, expired (NOT viewed/accepted/cancelled/pending) |
| `shipments.status` | preparing, loaded, in_transit, arrived, customs, delivered (NOT at_customs/customs_cleared/out_for_delivery/returned/lost) |
| `payments.method` | zaad, edahab, evc_plus, premier, sahal, manual, bank_transfer (NOT mobile_money/credit_card/cash) |
| `payments.status` | pending, confirmed, failed, refunded |
| `warehouse_packages.status` | received, inspected, consolidated, shipped (NOT pending) |

## Additional insert-shape probes (probe 3)

- `payments`: ✓ verified_by, verified_at · ✗ payment_number, profile_id, user_id, shipping_method, notes
- `shipments`: ✓ documents, total_weight_kg, chargeable_weight_kg, freight_cost, actual_arrival (shipments insert in the page is close to correct)
- `warehouse_packages`: ✓ barcode, inspection_notes, received_at, inspected_at, photos, length_cm, width_cm, height_cm · ✗ dimensions (page inserts `dimensions` → whole INSERT fails; render `pkg.dimensions.length` crashes), notes, location
- `orders`: ✓ destination_city, balance_due_usd · ✗ items, confirmed_at, shipped_at, delivered_at, cancelled_at, payment_method
- `marketplace_accounts`: ✓ id, username, password_encrypted, is_shared · ✗ marketplace, status

## Security posture verified live (anon key)

- `admin_*_view`, `moq_review_queue`, `translations_view` → **401 permission denied** for anon (old view-exposure hole closed).
- All 8 Edge Functions deployed; all reject missing Authorization (`401 UNAUTHORIZED_NO_AUTH_HEADER`).
- `admin_kpis` RPC → 401 permission denied for anon (staff-only SECURITY DEFINER confirmed).
- `sourcing_requests` anon INSERT allowed by `sourcing_anon_insert` (`auth.uid() IS NULL OR user_id = auth.uid() OR user_id IS NULL`).
- OpenAPI introspection root (`/rest/v1/`) → 401 (disabled).

## Consequences found in code (fix targets)

1. `apps/mobile/src/lib/supabase-adapter.ts` `adaptSourcing()` writes profile_id,
   title, description, reference_urls, target_marketplace, quantity_needed,
   price_cny, price_usd, images — **all ✗ live** → every mobile sourcing sync
   fails with PGRST204 and is silently swallowed (`catch {}` in
   `apps/mobile/src/db/index.ts:718`).
2. `apps/web/src/app/admin/(protected)/quotes/page.tsx` inserts request_id, fees,
   freight_estimate, exchange_rate into `quotes` — **all ✗ live** → quote
   creation broken.
3. `apps/web/src/app/admin/(protected)/sourcing/page.tsx` TS interface expects
   customer_id / agent_id / title — display columns render empty (reads
   `admin_sourcing_view` via `listSourcing()`; view may rename, check the view).
4. No contact channel exists on `sourcing_requests` — a web-submitted anon
   request must carry contact info inside `product_description` until a
   migration adds dedicated columns (see `202609290001_web_quote_flow.sql`).

Management API token in `~/.supabase/access-token` is **expired (401)** — DDL
cannot be pushed from this machine until the user refreshes it
(`supabase login`). Code changes must therefore work on the CURRENT live
schema; DDL wants ship as ready-to-push migration files.
