# Sifalo Pay Integration — Deep-Dive & Design Recommendation

**Date:** 2026-10-02 · Sources: sifalopay.com, developer.sifalopay.com (hosted-checkout.md, e-wallet-api.md, sandbox.md, refunds.md, getting-started.md — read in full)

---

## 1. What Sifalo Pay actually is

A payment **gateway aggregator** for East Africa. One API in front of:

| Method | Gateway code | Notes |
|---|---|---|
| **Waafi** (also EVC Plus, ZAAD, SAHAL!) | `waafi` | One gateway covers EVC/ZAAD/SAHAL |
| **eDahab** | `edahab` | Slow — allow 120s |
| **Premier Wallet** | `pbwallet` | USD only |
| **Cards** (Visa/MC) | hosted checkout only | |

**Currencies:** USD or SLSH (not `SOS`). Premier/checkout USD only.
**Paid = `status: success` + `code: 601`.** No webhooks pushed — you verify.
**No public pricing in docs** — fees are on your merchant contract (the photo you sent shows their commercial terms; "cutting from the customer not from me" means: **fee is added on top of the customer's charge**, not deducted from your settlement — this is a merchant-contract setting to confirm with Sifalo).

## 2. The two integration modes

### A. Hosted checkout (recommended to start)
```
Server → POST /gateway/ {amount, gateway:"checkout", currency:"USD", return_url:"...?order_id=X"}  (HTTP Basic auth)
       ← {key, token}
Browser → https://pay.sifalo.com/checkout/?key=..&token=..   (customer pays on Sifalo's page)
Return  → return_url?order_id=X&sid=ABC123
Server → POST /gateway/verify.php {sid}   (NO basic auth)
       ← {status:"success", code:601, payment_type:"EDAHAB", ...}
```
Customer picks Waafi/EVC/ZAAD/SAHAL/eDahab/Premier/Card **on Sifalo's page**. We never touch wallet numbers.

### B. e-Wallet API (direct charge)
Server POSTs `{account:"25262...", gateway:"edahab", amount, currency, order_id}` → customer approves on phone (`603` pending → poll verify) → `601` paid.
Requires collecting the wallet number (we have it at checkout for Zaad/Edahab users).

**Sandbox:** `pay.sifalo.net` + `spay-api.sifalo.net`, test wallets `252621111111` (eDahab success) etc. Staging keys only work on `.net`, live only on `.com`.

## 3. Why this changes our architecture

Current reality: ZAAD/Edahab/EVC have **no direct APIs** → manual USSD payment + admin confirmation. Sifalo Pay **IS the missing API layer** — it exposes EVC Plus, ZAAD, SAHAL, eDahab, Premier and cards through one REST gateway. This upgrades ChinaSuuq from manual-confirmation to **real-time automated payments** while keeping the manual flow as fallback.

## 4. Design decision: separate page vs Settings

**Recommendation: BOTH, with different jobs.**

- **Settings → Payments tab (new):** Sifalo Pay **configuration** — mode (sandbox/live toggle), API user + key (stored in `ai_provider_config`-style secret containment — NEVER in browser), default gateway order, fee-handling toggle ("customer pays fees" vs "absorb"), enable/disable per method (Waafi/EVC/ZAAD/SAHAL/eDahab/Premier/Card). This is config, belongs in Settings next to AI Provider — same CRUD pattern, same security model.
- **Admin → Payments page (existing):** stays the **operations surface** — now it gains live Sifalo transactions (auto-confirmed via `601` verify) alongside the existing manual-confirmation rows. No new page needed; extend the existing one with a `source` filter (`sifalo` vs `manual`) and a `sid` column.

## 5. Implementation plan (when you have Sifalo merchant keys)

1. **DB:** `payment_gateways` settings row (mode, keys encrypted server-side, enabled methods) + `payments.sifalo_sid` column.
2. **Edge function `sifalo-charge`** (customer-facing): hosted-checkout `POST /gateway/` → return `checkout_url` to app/web. Keys stay server-side (same containment as ai_provider_config).
3. **Edge function `sifalo-verify`**: called by `return_url` + by a poll after `603` → verify sid → mark order paid on `601`.
4. **Checkout UI:** "Pay now (Sifalo)" button → redirect to hosted checkout → return to order page → verify → success screen. Manual USSD flow stays as fallback.
5. **Mission Control:** Settings → Payments tab (config CRUD + test-connection against sandbox) + Payments page gains `sifalo` source rows auto-marked confirmed.

**Do we need anything from you:** sign up at pay.sifalo.net (staging), enable 2FA, create API username+key, and confirm with Sifalo that fees are charged **on top** to the customer (your photo suggests yes — get it in writing). Then I wire the full flow.
