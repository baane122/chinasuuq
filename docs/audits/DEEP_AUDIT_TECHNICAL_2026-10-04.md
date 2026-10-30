# ChinaSuuq Deep Audit — Technical Findings

## CRITICAL: RLS Lockdown Migration (202610040003)

### Current State (UNSECURE)
The `is_staff_or_admin()` function in migration `202408010010_rls_policies.sql` is defined as:

```sql
CREATE OR REPLACE FUNCTION auth.is_staff_or_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('staff', 'admin', 'super_admin')
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

**Problem:** This function reads from `profiles` table, but the RLS policies that use it (123+ across the database) are evaluated with the caller's JWT. Since the function is `SECURITY DEFINER`, it runs with the owner's privileges (postgres), but the `auth.uid()` returns the caller's ID, not the owner's.

**Result:** ANY signed-in user (including customers) passes `is_staff_or_admin()` because:
1. They have a valid JWT (`auth.uid()` returns their ID)
2. The function checks if their role is 'staff', 'admin', or 'super_admin'
3. BUT — and this is the key issue — the function itself is NOT checking the JWT role claim, it's checking the `profiles` table

**Wait, let me re-read the migration comment...**

Actually, re-reading migration `202610040003_rls_lockdown.sql` line 6-15:

> `public.is_staff_or_admin()` was `CREATE FUNCTION … SELECT auth.uid() IS NOT NULL;`
> i.e. "any signed-in user". 32 live policies across orders, order_items, payments, quotes, shipments, sourcing_requests, customers, exchange_rates, settings, staff_profiles, customer_profiles, source_products, product_events, notifications, marketplace-related tables call it as their "admin" test, and every `admin_*_view` is security_invoker=true — so those views expand to the caller and inherit the same permissive check. Result today: a paying customer with the anon key + their own JWT can read (and write) every order, payment, quote, credential row and staff record in production, and the Mission Control panel cannot tell staff from customers.

**So the CURRENT function is WRONG.** It should be checking `auth.jwt() ->> 'role'` against the database role, not just checking if the user exists.

### The Fix (Migration 202610040003)

The new function:

```sql
CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(auth.jwt() ->> 'role', '') = 'authenticated'
    AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role::text IN ('staff', 'super_admin', 'admin')
    );
$fn$;
```

**Changes:**
1. Checks `auth.jwt() ->> 'role' = 'authenticated'` — ensures caller has a valid JWT (not anon key)
2. Then checks `profiles.role` in the database
3. Pins `search_path` to prevent shadowing attacks

### What This Fixes

| Table | Before | After |
|-------|--------|-------|
| `orders` | Any logged-in user can SELECT all rows | Only staff/super_admin can SELECT all; customers see only their own |
| `payments` | Any logged-in user can SELECT all rows | Only staff/super_admin |
| `quotes` | Any logged-in user can SELECT all rows | Only staff/super_admin; customers can INSERT their own |
| `staff_profiles` | Any logged-in user can SELECT all rows | Only staff/super_admin |
| `profiles` | Anyone can UPDATE their own row (including role) | Trigger blocks role changes unless super_admin |
| `support_tickets` | No INSERT policy for customers | Customers can INSERT; staff can FULL access |
| `support_messages` | RLS ON, ZERO policies — dead for everyone | Participants and staff can access |

### How to Apply

**Method 1: Supabase Dashboard (Recommended)**
```
1. Go to: https://app.supabase.com/project/athkmrvsaijwgsyvwrbp/sql
2. Click "New Query"
3. Copy entire content of: apps/web/supabase/migrations/202610040003_rls_lockdown.sql
4. Paste and Run
```

**Method 2: CLI (requires working DB connection)**
```bash
cd /Users/abdirahmanbaane/Desktop/chinasuuq-new/apps/web/supabase
supabase db push --project-ref athkmrvsaijwgsyvwrbp
```

**Verification After Apply:**
```sql
-- 1. Check function is SECURITY DEFINER
SELECT proname, prosecdef, proconfig 
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN ('is_staff_or_admin', 'is_super_admin');

-- Expected: prosecdef = t for both

-- 2. Check no blanket READ policies remain
SELECT tablename, policyname, qual 
FROM pg_policies
WHERE schemaname = 'public' 
  AND coalesce(qual, '') IN ('true', '')
  AND cmd IN ('SELECT', 'ALL') 
ORDER BY 1;

-- Expected survivors only: source_products, product_translations, exchange_rates

-- 3. Test with customer JWT (should return [])
-- GET /rest/v1/orders?select=id&limit=1
-- Expected: [] (was: every order in system)

-- 4. Test role escalation blocked
-- PATCH /rest/v1/profiles?id=eq.<self> {"role":"super_admin"}
-- Expected: error (was: success)
```

---

## HIGH: Checkout Shipping Display Bug

### Problem
User requirement: **"Customer simply picks Air or Sea, and pays shipping when the goods arrive"**

Current behavior in `apps/mobile/app/cart/checkout.tsx`:
- Line 109-123: Calculates `estimatedShipping` based on cart weight
- Line 125: `grandTotal = subtotal + serviceFee` (correct — excludes shipping)
- Line 434: Displays `~${estimatedShipping} (final on arrival)` — confusing
- Line 438: Shows "Total (estimate, excl. shipping)" — correct label

### Fix Applied
Removed the estimated shipping line from the summary. Now shows:
```
Subtotal (estimate): $100.00
Service Fee (est. 5%): $5.00
─────────────────────────
Subtotal + Service Fee: $105.00
Shipping: Air Freight · Paid on arrival
```

The shipping method cards (lines 345, 358) still show the estimate for transparency, but it's clear it's separate from the total.

---

## MEDIUM: Admin Form Validation

### Problem
`FormInput.tsx` lacks `onBlur` handler and proper validation feedback.

### Current Code
```tsx
onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
```

### Recommended Fix
```tsx
onChange={(e) => onChange(e.target.value)}
onBlur={(e) => {
  if (required && !e.target.value.trim()) {
    // Show validation error
  }
}}
```

**Status:** Low priority — forms work, just not ideal UX.

---

## LOW: Missing Error Tracking

### Problem
No production error tracking (Sentry, LogRocket, etc.)

### Impact
- Cannot see runtime errors in production
- Cannot track user-facing failures
- Debugging relies on user reports

### Recommendation
Add Sentry SDK to both web and mobile apps:
```typescript
// Web (Next.js)
import * as Sentry from "@sentry/nextjs";
Sentry.init({ dsn: "https://xxx@yyy.ingest.sentry.io/xxx" });

// Mobile (Expo)
import * as Sentry from "@sentry/react-native";
Sentry.init({ dsn: "https://xxx@yyy.ingest.sentry.io/xxx" });
```

**Status:** Nice-to-have, not blocking.

---

## ARCHITECTURE NOTES

### Why This Architecture Works

1. **Monorepo structure** — Shared types prevent drift between web/mobile
2. **Edge functions for AI** — Keys never touch client bundle
3. **Local-first mobile** — AsyncStorage fallback keeps app usable offline
4. **RLS as security boundary** — Server-side policies protect data regardless of client code
5. **UI permissions as affordance** — Hides features users don't need, but RLS is the real gate

### Known Trade-offs

1. **Static export limitations** — No server-side rendering for dynamic content
   - Workaround: Edge functions handle server-side logic
   
2. **Client-side pagination** — DataTable loads all rows, paginates client-side
   - Impact: Slow with 1000+ rows
   - Fix: Implement server-side pagination (future work)

3. **No soft deletes** — All deletes are permanent
   - Risk: Accidental data loss
   - Fix: Add `deleted_at` column to all tables (future work)

---

## DEPLOYMENT CHECKLIST

### Pre-Deploy
- [ ] Apply migration 202610040003 (RLS lockdown)
- [ ] Apply migrations 202610040001-0002, 0004
- [ ] Verify with test customer account
- [ ] Test staff account still works

### Post-Deploy
- [ ] Monitor error logs (24h)
- [ ] Check support ticket creation works
- [ ] Verify order visibility (customer sees only own orders)
- [ ] Update documentation

---

**Audit Date:** 2026-10-04  
**Auditor:** Hermes Agent  
**Status:** 🔴 BLOCKED on migration deployment
