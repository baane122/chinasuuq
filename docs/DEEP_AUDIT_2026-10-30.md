# ChinaSuuq — Deep audit & repair, 2026-10-30

Repo: `~/Desktop/chinasuuq-new` (Next.js 16 static export + Expo SDK 54 + Supabase `athkmrvsaijwgsyvwrbp`)
Scope: **every** admin page (17), every public page (8), every mobile screen (43), all 66 migrations, all 11 edge functions, all 36 live RPCs, all 70 live tables.

Everything below was verified against the **live** database and the **real** build — not read off the source and assumed.
Two SQL channels were available: REST with the service role, and direct `psql` through the
Tokyo pooler (`aws-0-ap-northeast-1.pooler.supabase.com:5432`).

---

## 1. Verdict at the end

| Gate | Result |
|---|---|
| `apps/web` typecheck | **clean** (0 errors) |
| `apps/web` production build | **succeeds**, 30/30 routes prerendered |
| `apps/mobile` typecheck | **clean** (0 errors) |
| `apps/mobile` bundle (`expo export`) | **succeeds**, 5.1 MB |
| `apps/mobile` verify suite | **146/146 passing, 0 failures** (was 145/1) |
| Admin pages with all data loads working | **17/17** |
| Tables admin can read but shouldn't be able to | **0** |
| anon readable order PII | **closed** (401) |
| Live RPCs resolving | **36/36** |
| Edge functions gated correctly | **11/11** |

---

## 2. P0 — security

### 2.1 Order PII was readable by anyone on the internet (**fixed**)
`public.admin_orders_view` was a **SECURITY DEFINER** view (owner `postgres`, no
`security_invoker`) and `anon` held full grants on it. An unauthenticated request returned
**every order** — `customer_name`, `customer_email`, `customer_phone`, `address`, `city`,
amounts, internal notes:

```
GET /rest/v1/admin_orders_view?select=*        -> 200, all rows, as anon
```

Fix: `REVOKE ALL ... FROM anon` + `GRANT SELECT TO authenticated`.
Re-verified: anon `401`, super_admin `200` (still sees all 3 orders).

### 2.2 `order_tracking_public` exposed the whole orders table
The view selected straight from `orders` with **no WHERE clause**, so anon could enumerate
every order id, reference, status and destination. Rebuilt with `security_invoker = true`,
then re-pointed `/track` at it (see 3.4). It now exposes only non-PII columns and only
answers when the caller knows the reference.

### 2.3 Grant drift hid `settings` and the AI tables from their own admin UI (**fixed**)
`settings`, `ai_provider_config`, `ai_provider_tasks` had RLS policies present but **no
grants for `authenticated`**. A policy cannot fire without the underlying GRANT, so:

```
GET /rest/v1/settings            -> 42501 permission denied   (even for super_admin)
GET /rest/v1/ai_provider_config  -> 42501
GET /rest/v1/ai_provider_tasks   -> 42501
```

This made **Admin → Settings completely dead** on the General, Currency and Shipping tabs
(every save failed) and the AI tab unreadable. Added the grants the existing policies gate;
anon stays revoked (verified `401`).

### 2.4 Write access — checked, and it holds
Confirmed that despite anon holding INSERT/UPDATE/DELETE **grants** on 57 tables, RLS
blocks the writes: `POST orders` and `POST payments` as anon both return
`42501 new row violates row-level security policy`. No anon write path was found.

---

## 3. P0 — features that did not work at all

### 3.1 The public quote form was 100% dead (**fixed**)
`/quote` is the site's main lead-capture form. Every guest submission failed:

```
POST sourcing_requests -> 23502 null value in column "user_id" violates not-null constraint
```

The RLS policy `sourcing_anon_insert` explicitly allows `user_id IS NULL` (anonymous
visitors), but the column was still `NOT NULL`. The two disagreed, so the form could
**never** succeed for a logged-out visitor.
Fix: `ALTER COLUMN user_id DROP NOT NULL`. Re-verified: anon insert `201`, row created,
then cleaned up.

### 3.2 `/track` could not track anything (**fixed**)
All three `orders` SELECT policies require `user_id = auth.uid()`. A guest searching a real
tracking number got zero rows and the page rendered "not found":

```
anon GET orders?reference=ilike.CS-2026-0001  -> 200 []   (order exists)
```

Fix: `/track` now reads `order_tracking_public` (bearer-token model — the reference *is* the
secret) instead of `orders`. Reduced the two "schema generation" probes to the one live shape
and dropped the stale `reference` / `total` columns. Re-verified: correct reference returns
the order, wrong reference returns `[]`, PII columns are rejected (`42703`).

### 3.3 "New quote" always failed (**fixed**)
`createQuote()` wrote `sourcing_request_id`, `profile_id`, `subtotal`, `shipping_cost`,
`total`, `currency` — **none exist** on live `quotes`:

```
POST quotes -> PGRST204 Could not find the 'currency' column of 'quotes'
```

Live `quotes` is `request_id, user_id, reference, total_cny, total_usd, exchange_rate,
service_fee, freight_estimate, discount, deposit_percent, valid_until, status,
customer_notes`. Rewrote the payload to the live shape (deriving `total_cny` from the live
rate, defaulting `valid_until` +14d and `deposit_percent` 50). Re-verified: insert `201`.

### 3.4 "New shipment" always failed (**fixed**)
`createShipment()` defaulted `status: "pending"`, but the `shipment_status` enum is
`(preparing, loaded, in_transit, arrived, customs, delivered)` — no `pending`:

```
POST shipments -> 22P02 invalid input value for enum shipment_status: "pending"
```

Fix: default `"preparing"`. Re-verified: insert `201`.

### 3.5 "Delete customer" silently did nothing (**fixed**)
`deleteCustomer()` updated `profiles.deleted_at` — that column does not exist
(`PGRST204`). `profiles` has `is_active`, so the soft-delete now sets `is_active = false`.

### 3.6 AI translation was returning 502 for every request (**fixed**)
`ai_provider_tasks` pointed `translation` **and** `extraction` at `deepseek-v4-flash`. That
model is dead upstream — every call returns `502 service_unavailable`:

```
POST /functions/v1/ai-translate -> 502 {"ok":false,"error":"model_call_failed","status":502}
```

Mobile translation therefore silently degraded to untranslated Chinese (the client's
best-effort contract swallows errors). `deepseek-v4.1` is dead too; `glm-5.3` returns empty
content under reasoning mode. Working on the same key: `gemini-3.1-flash-image` and
`[反重力次]gemini-3.7-flash-high`. Repointed `translation` + `extraction` to
`gemini-3.1-flash-image`. Re-verified:

```
{"source":"工厂直供 高品质","translated":"Warshadda Tooska ah ee Tayada Sare leh"}
{"source":"连衣裙","translated":"Dharka"}
```

### 3.7 Admin notification broadcast reported success/failure incorrectly (**fixed**)
The INSERT policy was correct and the row **did** land, but there was no staff SELECT
policy, so the UI's `.insert(rows).select("id")` failed on the **RETURNING** read with
`42501` — the admin saw "failed" for a notification that was actually delivered, and could
not browse the queue. Added staff SELECT + DELETE policies. Re-verified: insert with
`return=representation` → `201`, read-back `200`, cleanup `204`.

---

## 4. P1 — admin CRUD surface

Tables that had **RLS enabled with zero policies** (nobody but `service_role` could touch
them) now have staff policies. Each was verified with a real read + write:

| Table | Was | Now |
|---|---|---|
| `marketplaces` | 5 rows, admin saw 0, insert blocked | full CRUD verified (201/200/204) |
| `tracking_events` | 4 rows, admin saw 0 | read 2, insert/update/delete verified |
| `admin_tasks` | 0 rows, insert blocked | create/update/delete verified |
| `suppliers` | insert blocked | create/delete verified |
| `consolidations` | insert blocked | create/delete verified |
| `deliveries`, `refunds`, `pricing_rules` | unreachable | readable + writable by staff |
| `marketplace_connectors` | 1 row, admin saw 0 | readable by staff |

CRUD coverage after the fixes (C/R/U/D all wired and live-verified):

| Page | C | R | U | D |
|---|---|---|---|---|
| products | ✅ | ✅ | ✅ | ✅ |
| customers | ✅ | ✅ | ✅ | ✅ (fixed) |
| quotes | ✅ (fixed) | ✅ | ✅ | ✅ |
| shipments | ✅ (fixed) | ✅ | ✅ | ✅ |
| payments | ✅ | ✅ | ✅ | ✅ |
| sourcing | ✅ | ✅ | ✅ | ✅ |
| staff | ✅ | ✅ | ✅ | ✅ |
| warehouse | ✅ | ✅ | ✅ | ✅ |
| marketplaces | ✅ | ✅ | ✅ | ✅ |
| notifications | ✅ (fixed) | ✅ | — | ✅ |
| settings | ✅ | ✅ (fixed) | ✅ (fixed) | — |
| orders | — | ✅ | ✅ | ✅ |
| rates | — | ✅ | — | — (read-only history, by design) |
| ai | chat surface — CRUD does not apply | | | |
| dashboard / queue / trending | aggregate views, no entity CRUD | | | |

---

## 5. Mobile

* 40 routes, all navigation targets resolve (the 6 apparent "dead" links are expo-router
  route groups `(auth)` / `(tabs)` — valid).
* Phone OTP code was still in `src/store/auth.ts` and `authContract.ts` after the routes
  were removed; SMS is off on this project so it could never work. The verify suite flagged
  it. Removed both methods — suite now passes.
* **Live end-to-end checkout verified**: signed up a throwaway customer, called
  `submit_mobile_order` with a malicious `p_service_fee_pct: 0.99`, and the server correctly
  ignored it and billed 5%:

```
{"reference":"CS-2610-5016","subtotal_usd":15.16,"service_fee_pct":0.0500,
 "service_fee_usd":0.76,"total_usd":15.92,"cny_per_usd":6.6000}
```

  `order_items` rows written with marketplace + source_url provenance; money math matches
  `CNY100 / 6.60 * 1.05 = $15.91`. Test rows and the test auth user were then deleted and
  the baseline restored exactly (orders 3, order_items 3, profiles 5).

---

## 6. Edge functions (all 11 live, correctly gated)

| Function | Probe | Verdict |
|---|---|---|
| `ai-chat` | `422 messages_required` | live, model answered `AI_OK` |
| `ai-proxy` | `401 staff_required` | live, works for `translation`/`global` |
| `ai-settings` | `401 super_admin_required` | correctly gated |
| `ai-translate` | was `502`, now `200` real Somali | **fixed** |
| `ai-extraction` | `200` with array schema | works |
| `ai-vision` | was `502 provider_error`, code fixed | **needs deploy** |
| `cart-validate` | `401 auth_required` | live |
| `marketplace-session-sync` | `401` | live |
| `payment-reconcile` | `401` | live |
| `product-enrich` | `401` | live |
| `ai-test-connection` | `401` | live |

### 6.1 `ai-vision` — image prefix bug (fixed in source, not yet deployed)
The function accepted `screenshot_base64` and unconditionally prefixed
`data:image/jpeg;base64,`. Callers that already sent a data URL produced
`data:image/jpeg;base64,data:image/png;base64,...`, which upstream rejects:

```
-> 400 {"message":"请求格式或参数不合法 ... 模型是否支持 tools/vision"}
```

Reproduced deterministically, then fixed to detect and preserve the real MIME type.
**This needs a function deploy** — see §8.

---

## 7. Still open / needs a decision

1. **`ai-vision` deploy.** Source is fixed; the Supabase management token in
   `~/.supabase/access-token` is revoked (`401 Invalid access token`), so the deploy has to
   come from a machine with a valid token, or via Dashboard → Edge Functions.
2. **EAS mobile build chain is broken** (separate from this audit, unchanged):
   `eas.json` has an illegal top-level `postInstall` key that fails every eas-cli command;
   the hook belongs in `package.json` `scripts.postinstall`. `scripts/fix-jcenter.js` is
   untracked so EAS never runs it. Last 3 Android builds errored
   `EAS_BUILD_UNKNOWN_GRADLE_ERROR` (last good: `42de612`). The live APK is still v1.0.2
   while source is 1.0.4.
3. **Dead tables.** 21 live tables have RLS on with zero policies and **no code references**
   at all (`inspections`, `inspection_items`, `documents`, `pricing_rules` partly,
   `supplier_*`, `whatsapp_checkouts`, `payment_webhooks`, `integration_events`, …). They are
   not bugs — they are half-built features. Recommend either building them or dropping them.
4. **SMTP is not configured**, so verification/reset emails cannot be delivered
   (`mailer_autoconfirm=true` masks it at signup).

---

## 8. Files changed

Source:
* `apps/web/src/app/(public)/track/page.tsx` — read the guest-tracking view, live columns only
* `apps/web/src/lib/admin/supabase-data.ts` — `createQuote`, `createShipment`, `deleteCustomer`
* `apps/web/src/app/admin/(protected)/settings/page.tsx` — (no edit needed; grants fixed at DB)
* `apps/web/supabase/functions/ai-vision/index.ts` — preserve the image data-URL prefix
* `apps/mobile/src/store/auth.ts` — removed dead phone-OTP methods
* `apps/mobile/src/components/auth/authContract.ts` — removed the matching declarations
* `apps/web/public/favicon.ico` — generated from the logo (referenced but missing)
* `apps/web/supabase/migrations/202610300001_audit_rls_grant_drift_fix.sql` — the whole DB fix set

Database (applied live, mirrored in the migration above):
* revoked anon on `admin_orders_view`; granted authenticated
* rebuilt `order_tracking_public` (non-PII, bearer-token)
* granted `settings`, `ai_provider_config`, `ai_provider_tasks` to authenticated
* staff policies on `marketplaces`, `tracking_events`, `deliveries`, `consolidations`,
  `suppliers`, `refunds`, `pricing_rules`, `admin_tasks`, `marketplace_connectors`
* `notifications` staff SELECT + DELETE
* `sourcing_requests.user_id` → nullable
* `ai_provider_tasks` translation/extraction → `gemini-3.1-flash-image`

---

## 9. Note on the exchange-rate scare

Mid-audit, probing `exchange_rates` with a test INSERT silently deactivated every
CNY→USD row (a `BEFORE INSERT` trigger deactivates sibling rows for the pair), and the
follow-up DELETE left **zero** active rows — `fx_rates()` then fell back to 6.6.
This was my test, not a pre-existing bug. The newest intended row was re-activated and
`fx_rates()` verified back at `cny_per_usd 6.60 / sos_per_usd 530 / service_fee_pct 0.05`.
Rule for next time: **never insert or delete test rows in `exchange_rates`.**
