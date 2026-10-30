# Payment Operations SOP — ZAAD / Edahab Manual Confirmation

**Audience:** ChinaSuuq ops staff · **Tool:** Admin → Payments (chinasuuq.com/admin, staff or super_admin login)
**Last updated:** 2026-09-29 · The `payments` table starts empty — this is the runbook for the first real transaction onward.

## How payment works (no gateway, by design)

1. Customer places an order → checkout records the order with `total_usd` (item subtotal + **5% service fee**, `settings.service_fee_pct`). Shipping is **not** prepaid — it is collected on arrival in Somalia.
2. Customer transfers the total via **ZAAD** or **Edahab** to the company mobile-money account and sends the receipt (reference number / SMS screenshot) — typically through WhatsApp **+86 152 7707 4143**.
3. A `payments` row is created with `status = "pending"`, the customer's transfer `reference`, `amount`, `currency`, and `method` (`zaad` / `edahab`).
4. **Ops confirms by hand** in Admin → Payments. There is no webhook; `payments.webhook_received` is unused.

## Daily confirmation loop

1. Open **Admin → Payments**, tab **Pending**.
2. For each pending payment, verify against the mobile-money SMS from the business number:
   - `reference` matches the receipt's transaction ID;
   - `amount` matches the order total (`orders.total_usd` for the shown `order_id`);
   - the order exists and is not duplicated.
3. **Confirm:** flip the row's status `select` to **confirmed** (or tick rows in **Reconcile** mode and press **Confirm Selected** for bulk). Confirming stamps `verified_by` (your staff profile) and `verified_at` — that stamp is the audit trail.
4. **Mismatch / duplicate / customer cancelled:** set **failed** (wrong or unverifiable receipt) or **refunded** (money returned via ZAAD/Edahab reversal), then contact the customer on WhatsApp.
5. **Weekly:** press **Export** for a CSV of the filtered list → bookkeeping.

Tabs on the page: All / Pending / Confirmed / Failed / Refunded. Stat cards show Confirmed Revenue (the only number that is real revenue: the 5% fee), pending, failed, refunded.

## Status meanings (live enum)

| Status | Meaning | Who sets it |
|---|---|---|
| `pending` | Receipt claimed, not yet verified | System (at checkout / New Payment) |
| `confirmed` | **Ops verified against SMS receipt** | Ops (this SOP) |
| `failed` | Receipt invalid, mismatch, or duplicate | Ops |
| `refunded` / `partially_refunded` | Money returned to customer | Ops |
| `processing`, `completed`, `cancelled`, `expired` | Reserved by schema; avoid unless ops agrees on a meaning | — |

## Guardrails & edge cases

- **Only staff can change payment status** — the money-integrity RLS migration blocks customers from self-confirming payments. If a status change is refused, re-login as staff.
- **Short payment** (customer underpaid): keep `pending`, message the customer for the balance, confirm only when the full `orders.total_usd` has landed.
- **Two receipts, one reference**: confirm one payment, set the duplicate **failed**, note it in the WhatsApp thread.
- **Wrong order charged**: confirm nothing; set **refunded** after reversal, and create the correct payment with **New Payment**.
- `evidence_url` / `provider_ref` may hold the receipt screenshot link / provider transaction id when available (optional fields).

## First-transaction checklist (table empty today)

- [ ] ZAAD & Edahab business numbers on the checkout page are the ones ops can actually see SMS for.
- [ ] The WhatsApp number in settings (`+86 152 7707 4143`) is monitored during stated hours.
- [ ] At least 2 staff accounts exist so `verified_by` has a second pair of eyes for large amounts.
- [ ] Do a dry run: one small real order end-to-end before announcing the store.
