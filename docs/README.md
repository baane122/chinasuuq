# Documentation

Everything about the ChinaSuuq platform, organised by purpose. The root `README.md` is the
short version; **`doc.md` is the authoritative reference** for how the system actually works.

## Start here

| File | What it is |
|---|---|
| `../doc.md` | **The reference.** Architecture, routes, admin console, schema + RLS, edge functions, security model, mobile app, design system, deployment, known gaps. |
| `../README.md` | Two-minute orientation: what the product is, how to run it locally, how to deploy. |
| `PRODUCTION_READINESS.md` | Current ship/no-ship state and what blocks it. |
| `audits/CURRENT_AUDIT_2026-10-30.md` | **Most recent full audit** — every finding, every fix, with live verification. Read this before touching the DB or RLS. |

## `audits/` — historical, newest first

Point-in-time audits. They are **not** maintained; each reflects the code and database as they
were on its date. Where a later audit contradicts an earlier one, the later one wins, and
`CURRENT_AUDIT_2026-10-30.md` wins over all of them.

- `CURRENT_AUDIT_2026-10-30.md` — security sweep, grant drift, migration drift, marketplace/AI performance
- `PRODUCTION_READY_2026-10-04.md`, `AUDIT_QUICK_REF_2026-10-04.md`, `DEEP_AUDIT_TECHNICAL_2026-10-04.md`, `MOBILE_AUDIT_2026-10-04.md`, `DEEP_AUDIT_2026-10-04.md`
- `DEEP_AUDIT_2026-10-14.md`, `DEEP_AUDIT_2026-10-03.md`, `AUDIT_2026-10-01.md`

## `guides/` — how to do specific things

- `MOBILE_BUILD.md` — Expo/EAS build and store submission
- `PAYMENT_OPS_SOP.md` — confirming mobile-money payments by hand (the current live flow)
- `SHIPPING_CHECKLIST.md` — freight booking → consolidation → delivery

## Operational documents

- `SIFALO_PAY_INTEGRATION.md` — the planned automated-payment upgrade (blocked on merchant keys;
  the founder-facing decisions are all recorded here)
- `auth-system-doc.md` — sign-up, roles, and the privilege guards

## Two rules worth knowing before you edit anything

1. **The live database is authoritative, not the migration files.** `supabase_migrations.schema_migrations`
   holds only 5 rows for 66 migration files — most of this schema was applied by hand, so a
   local migration is *not* proof a column exists in production. Read `information_schema` on the
   live project first. PostgREST fails the whole request with `42703` if one selected column is
   missing, and the clients swallow errors, which is the most common cause of a blank screen here.

2. **Never insert test rows into `exchange_rates`.** A trigger deactivates all sibling rows for a
   currency pair when one active row is written. A test insert silently kills the live FX rate, and
   deleting it afterwards can leave zero active rows. Restore by PATCHing `is_active=true` on the
   newest intended row.
