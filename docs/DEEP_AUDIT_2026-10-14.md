# Deep audit — 2026-10-14 (WebView speed, AI translation, roles, error handling)

Scope: `apps/mobile`, `apps/web`, `packages/shared`, `apps/web/supabase/functions/*`.
Trigger: owner report — "webview loading is too slow, very slow" + production readiness.
Method: first-hand read of the WebView screen, the injected in-page scripts, the
translation client + `ai-translate` edge function, the role gates on both apps, and
every silent `catch` in the mobile data layer and user-facing screens.

---

## 1. Why the marketplace WebView felt slow

Three independent causes, all fixed.

**1.1 The app re-downloaded the page on every tap (biggest one).**
`<WebView source={{ uri: url }}>` was bound to `url`, and `url` was also the value
reported back by `onNavigationStateChange`. On an SPA (dollarstore's hash router, and
1688's route pushes) each in-page navigation therefore looked like a *new* `source` →
React Native tore down the page and refetched it. Tapping one category cost a full
cold page load.
Fix: `source={{ uri: entryUrl }}` is now the only thing React reacts to, and in-page
moves go through `navigateTo(next)` → `webRef.loadUrl(next)`. Observed URL updates are
state for the header/back button only.

**1.2 The injected scripts competed for the main thread.**
Before this audit a single product page ran **4 timers + 3 MutationObservers** at once:
nav poll 500 ms, risk poll 700 ms (4 `querySelectorAll` + `body.innerText`), USD overlay
900 ms with an 80 ms observer and 5 sweeps, nav cleanup 250 ms with `getComputedStyle`
over every `div`/`section`/`footer`, plus a 700 ms translate pass with a TreeWalker.
Three of those passes read `document.body.innerText`, which forces a synchronous full
layout of a page with tens of thousands of nodes — the page spent its main thread on
our sweeps instead of painting.
Fix: `src/lib/webviewScripts.runtime.ts` — one 200 ms heartbeat, one rAF-coalesced
observer (max one dispatch per 300 ms), and three behaviours the old scripts had no
notion of: **idle backoff** (a pass that finds nothing doubles its interval), **task
retirement + revival** (a finished page stops paying for sweeps; a new route or a failed
translation wakes it), and **hidden-page pause** (`document.hidden` → nothing runs).

**This is now proven, not argued.** `apps/mobile/scripts/verify-cs-runtime.mjs`
(`npm run verify:webview`) evaluates the real injected source against a stub DOM, drives
its clock, and asserts the ten behaviours the performance claim depends on: a single
200 ms timer even after double injection, one observer, base cadence while work is found,
≤12 runs for an unsatisfiable task over 20 simulated minutes, retirement at `idleStop`,
revival at base cadence, re-inject adopting the new cadence, one shared 12k-bounded text
snapshot per window, zero runs while hidden plus a wake on return, ≤3 wakes for 20
mutation batches, and re-attachment when an SPA replaces `<body>`. 10/10 pass.
**Negative control:** deleting the `t.idle++` backoff line flips it to exit 1, so the gate
is not passing vacuously (the source file was restored byte-identically, sha256-verified).

**1.3 Layout thrash inside each pass.**
`textContent` (layout-free, bounded to 12k chars, cached for 400 ms and shared by every
script) replaced `innerText`; reads are separated from writes so `getBoundingClientRect`
/`getComputedStyle` can't interleave with DOM mutation; cheap substring pre-filters run
before any expensive read. The injection delay after `onLoadEnd` went 100 ms → 30 ms.

Also fixed while in there: re-injecting the suite (language switch, cookie refresh) kept
the *previous* page's backed-off interval, so a warm app got progressively lazier. It now
adopts the new cadence.

**1.4 The ¥→$ overlay could show a wrong price (correctness, not speed).**
`src/lib/webviewUsd.ts` is the whole "the customer never sees RMB" promise, and its
number parser treated every comma as a decimal point: a grouped marketplace figure
`¥1,299` was read as 1.299 CNY and shown as **$0.189** with the trailing `9` left on
screen. Same shape in the split-span path (`<span>¥</span><span>1,299.00</span>` →
$0.18). A customer ordering a four-figure machine for eighteen cents is the worst
failure this app can have, and neither `tsc` nor Metro can see it.
Fix: `CNY_RE` and all three split-span regexes now accept thousands groups
(`(?:,[0-9]{3})*`), and `toUsd` distinguishes a grouped figure (strip the commas) from
a European decimal comma (`¥43,5` → 43.5) with anchored whole-string tests — no
lookbehind, which Hermes/JSC-old reject.
**Proven by a new gate:** `npm run verify:usd`
(`apps/mobile/scripts/verify-usd-inpage.mjs`) runs the exact bytes
`usdPriceScript(rate)` returns against the shared stub DOM: plain/fullwidth/grouped/
decimal-comma prices and ranges, no compounding when a sweep repeats, zero figures left
alone, split spans (element and text-sibling forms, suffix preserved), aria-label
prices, captcha-region and `<script>` prices untouched, `__csUsdRestore` putting yuan
back, re-inject at the same rate registering no second task, a new rate re-converting,
an unusable FX figure producing no overlay at all, and the runtime-absent fallback.
18/18. **Negative control:** deleting the grouping alternative from the four regexes
turns 2 scenarios red ($0.189 / $0.18) and the gate exits 1; the source was restored
byte-identically (sha256-verified).

**1.5 The second pass: what was still slow on the browser screen.**
With the injected scheduler fixed, an instrumented sweep of the rest of the WebView path
— the screen, the native cookie bridge, the capture form — found six more things a
customer actually pays for. None of them are "optimisation taste"; each has a specific
cost.

- **Two layout-forcing `innerText` reads survived 1.3.** `LOGIN_WALL_SCRIPT` and
  `BLANK_PAGE_SCRIPT` each called `document.body.innerText` on their own pass. The
  `.slice(0, 4000)` on the end never helped — the layout is forced by reading the
  property, before slicing anything. Both now take the shared cached snapshot
  (`window.__cs ? window.__cs.text(4000) : …`), which `webviewScripts.risk.ts` had
  already proven. One behaviour change is deliberate: `textContent` sees text that CSS
  hides, so a page that paints its login wall with a hidden-node trick can now trigger
  the wall banner. The images guard is what actually separates "nothing arrived" from
  "it's slow", and it is untouched.
- **The skeleton hid a page that had already painted.** `loading` was only cleared on
  `onLoadEnd`, which waits for *every* subresource — and a Chinese marketplace page
  carries ad, tracker and CDN requests that hang or time out. The absolute-positioned
  skeleton sat over a fully usable 1688 search result for the whole 8–20 s. `onProgress`
  now clears it at `progress >= 0.85`, with `onLoadEnd` still the backstop.
- **The shimmer animation ran forever.** An `Animated.loop` gated on nothing kept the
  JS/UI threads busy on every browser screen, including ones with no skeleton on screen.
  It now starts only while `loading` is true and stops with it.
- **Five serial native cookie reads on "Sync session".** Staff tapped Sync and waited on
  five `CookieManager.get` bridge round trips one after another. They are independent, so
  they now go out together through one `Promise.all`, and a single probe failing (an
  unsupported sub-API) returns `null` instead of killing the sync. Results are still
  merged in probe order, so a cookie name present on two domains resolves to exactly the
  value it did before: parallel transport, identical outcome.
- **The shared-login bridge had no deadline, and a hung read was worse than a slow one.**
  `getMarketplaceSession` awaited the RPC with nothing but the client's 30 s header, and
  returned `null` for *every* failure. `injectedJavaScriptBeforeContentLoaded` applies to
  the **next** document, so a read that took 30 s did not delay the cookies — it lost
  them for the navigation the customer waited on, and 1688 drew its login wall in front of
  a staff member whose session was in the database. `fetchMarketplaceSession`
  (`src/lib/supabase.ts`) now races a 6 s sentinel (`MARKETPLACE_SESSION_TIMEOUT_MS`,
  the same `Promise.race` shape `src/api/translate.ts` uses, because supabase-js cannot be
  handed an `AbortSignal`), returns `{ session, failed, stale }` so **"we couldn't
  check" is not drawn as "not logged in"**, and keeps the last session read in an
  in-memory, per-marketplace cache — never persisted, never used when the server
  authoritatively says there is no session. The browser screen seeds its cookie script
  from that cache at first render (`peekMarketplaceSession`), so a second visit in the
  same app run injects the shared login *before* first paint instead of one navigation
  late, and `StaffMarketplaceCard` distinguishes `Active` / `Last known` / `Unknown` /
  `No Session` with the status chip as a retry. The now-unused `getMarketplaceSession`
  wrapper was deleted rather than left as a trap.
- **The capture form wiped itself while the customer typed.** `localListing` was built
  inline on every render of `[marketplace].tsx` — with `sourceId: String(Date.now())` —
  and this screen re-renders constantly (progress, price sweeps, FX rate, translation
  state, captcha status). `SmartProductForm` seeded qty, specs, weight, volume and price
  from `useEffect(…, [listing])`, so every parent render reset the sheet: the quantity a
  customer had just typed went back to the MOQ, the dollar box back to the converted
  capture. The listing is now `useMemo`'d on its page-level inputs, and the form's seed
  keys on a signature (`sourceId`, `url`, `title`) instead of object identity, so no
  parent can reset it by rebuilding the object. A later AI capture still re-seeds,
  because its signature genuinely changed.

**Proven by a new gate:** `npm run verify:session`
(`apps/mobile/scripts/verify-marketplace-session.mjs`) imports the real
`src/lib/supabase.ts` (Node type-stripping; only its three environment-boundary imports
are stubbed) and asserts 19 behaviours: the RPC name and its marketplace-only payload,
exact-marketplace + newest-row selection, zero rows as an answer rather than a failure,
an empty-cookies row likewise, RPC error / thrown read / hung read all reported as
`failed`, the sentinel being cleared, the shipped deadline bounded to 2–10 s, a failed
read serving the last-known session marked `stale`, an authoritative no-session answer
dropping the cache while a failure does not, `peekMarketplaceSession` being per
marketplace, `cookieInjectScript` emitting one escaped `document.cookie` write per pair
and nothing for no cookies, no table access anywhere in the module, plus the four
call-site shapes (seeded first render, `!res.failed` branch, memoised listing,
signature-keyed seed, four-state staff card).
**Negative control:** four separate mutations — a failed read reporting `failed:false`,
the deadline widened to 25 s, the cache write removed, the seed re-keyed on `listing` —
each turn the gate red (1, 1, 3 and 1 checks), and all three files came back
byte-identically (`supabase.ts` `7b5bf5e8a695cb9a`, `SmartProductForm.tsx`
`42839080377a16fb`).

**Considered and deliberately not touched.** `PRODUCT_CAPTURE_SCRIPT` and
`VISION_SNAPSHOT_SCRIPT` still read `innerText`, on purpose: the MOQ ladder grammar is
line-based (`1 Piece 12.5 yuan` / `2-4 Pieces 11.5 yuan`), and `textContent` flattens the
newline structure that makes a price ladder parseable. They run on an explicit tap, not on
a timer, so the layout cost is one-off and user-initiated. `getMarketplaceProducts`'s
`.select("*")` also stays: that table has rows from several column generations
(202408010014 vs 202609250004) and PostgREST fails an entire statement over one unknown
column, so naming columns would break the blocked-page fallback on whichever generation a
row belongs to.

---

## 2. AI translation is now self-healing and cheaper

Contract re-read against `apps/web/supabase/functions/ai-translate/index.ts`:
`{ texts, target_lang }` → `{ ok, results: [{ source, translated, cached }], counts }`,
with caps `MAX_TEXTS = 40`, `MAX_CHARS = 2000`, and a per-user limit that returns HTTP 429.

- **One pass = one paid call.** The in-page group size is 40, exactly the server cap, so a
  batch never splits into two billable requests. Text budget caps a page at ~3 calls.
- **Serialized, de-duplicated queue.** Translate requests from the page go into one queue
  drained one batch at a time instead of firing parallel functions for every message; the
  queue is dropped when the customer switches target language.
- **Hung calls can't stall the page.** Every request is time-boxed at 9 s.
- **Failures release the text.** This was a permanent one: a failed batch left its
  `data-cs-tr` stamps in place, so that text stayed Chinese for the rest of the page's
  life and its budget stayed spent. Now the app calls back into the page
  (`__csTranslateFailed`) which un-stamps those nodes, refunds their budget, and lets the
  collector retry them (up to 3 attempts, then it gives up so a dead server can't loop).
- **Rate limits are respected instead of abused.** A 429 now parks the remaining batches
  for 20 s; previously the loop hammered every queued batch through a closed window and
  then left the page untranslated anyway.
- **A retryable 503 parks 8 s, not 20.** The server gate (§5) answers 503 when it could not
  reach auth or read the profile row — a hiccup, not a closed quota window — so the client
  resumes far sooner than it would after a rate limit.
- **A failed batch still hands back its strings.** `translateTexts` documents "anything that
  could not be translated maps to itself", but the timeout / invoke-error / malformed-payload
  paths recorded the failure and left `map[text]` as `undefined`. The WebView screen wrote
  `map[t] || t` and hid it there; `src/lib/ai.ts` (`translateProductUncached`) reads
  `enMap[title] ?? ""` and so scored a timed-out batch as "no translation at all" — when
  only one language failed, product enrichment was thrown away instead of returning the
  original text with the language that did translate. Found by the new harness, fixed, and
  covered by it.

Verified in simulation: `npm run verify:translate` — 13 scenarios against the real module
(batching at the server cap, warm cache costing zero calls, per-language entries, oversized
text, de-duplication, concurrent sharing, the 9 s time-box, 429/503 parking, the map
contract). Not verified: a live round-trip against the deployed `ai-translate` function
(see §7).

**2.x The captcha guard had a hole, and the failure path is now executed.**
`AI_TRANSLATE_SCRIPT`'s `shouldSkip()` walked ancestors starting at `el.parentElement`,
which made the text node's *immediate* parent invisible to the check. Text written
directly inside a risk widget — 1688's slider label lives in `<div id="nc_1_wrapper">`
with the string as a direct child — and text directly inside a `<script>` was still
collected, translated and rewritten. That is precisely the class of node whose text the
risk engine fingerprints (the §"captcha swipe" regression) and whose rewrite breaks inline
JS. Fix: the walk starts at `el` itself, matching `inSkip()` in `webviewUsd.ts`, which
already did it correctly.
The same bug class in the USD overlay was already covered; both scripts now share one stub
DOM (`apps/mobile/scripts/lib/cs-test-dom.mjs`) so a fake page behaves identically for
prices, translation, and any script added later.
**Proven by a new gate:** `npm run verify:translate-inpage`
(`apps/mobile/scripts/verify-translate-inpage.mjs`) imports the real module, resolves its
one interpolation, compiles the injected bytes (a `new Script` check) and runs them against
that
document: one flat request per pass with every asked node stamped, the 40-text cap,
duplicate strings collapsing onto one request key with one answer reaching both nodes, an
already-known string applied for free, stamped nodes never re-requested, `__csTranslateFailed`
un-stamping + refunding budget + re-queueing, give-up after 3 failures, mixed batches keeping
the answered half, the 120-text page budget, language-switch restore, the risk-widget and
skip-tag guards, re-injection waking the shared task instead of stacking timers, the
private fallback's single timer, and a fresh SPA route resetting budget + cache. 15/15.
**Negative control:** walking `shouldSkip()` from `el.parentElement` again turns the
risk-widget and `<script>` scenarios red; the gate also fails if the template literal is
truncated by a stray backtick (a compile guard, since that only surfaces as a broken page
on a phone).

---

## 3. Roles: staff accounts that were locked out of their own app

The RLS function `is_staff_or_admin()` (`202610040003_rls_lockdown.sql`) accepts
`('staff','super_admin','admin')`. Both apps hard-coded their own lists that omitted the
legacy `admin` value, so those accounts read rows fine at the database and still saw
customer screens.

Fix: one documented predicate per app, mirroring the SQL —
`apps/mobile/src/lib/roles.ts` and `apps/web/src/lib/roles.ts` (`isStaffRole`,
`isSuperAdminRole`), with the ad-hoc `role === "staff" || role === "super_admin"`
comparisons in `store/staff.ts`, `app/staff/marketplaces.tsx`, `app/orders/[id].tsx`
replaced by it.

Second, worse staff bug — on the web admin: any hiccup while reading the profile row
(network blip, timeout, a hidden profile row) signed the staff member *out* and bounced
them to the login page, which reads as "my account lost its role". The gate now
distinguishes three outcomes: confirmed non-staff → sign out; server rejection → say so;
network failure → keep the session, show "Reconnecting to the server…", retry in 4 s.

**This is now a contract, not a convention.** `scripts/verify-role-vocabulary.mjs`
(`npm run verify:roles` from the repo root, hard step in the `guard` CI job) reads the role
list out of the *latest migration that re-creates the helper* — so the database stays the
source of truth and an old migration can never win — and requires `apps/mobile/src/lib/roles.ts`,
`apps/web/src/lib/roles.ts` and both `_shared/auth.ts` shorthands (`staffGate`,
`requireStaffOrAdmin`) to match it exactly. It also asserts the helper still carries
`SECURITY DEFINER` + a pinned `search_path` (without them a caller can shadow `auth`/`pg_temp`
mid-call and the gate is decorative), that both app helpers answer per-role exactly what SQL
would, that an unknown future role (`finance_manager`) fails closed on both clients, that the
super-admin lists agree with `is_super_admin()`, that mobile's explicit non-staff deny-list
never overlaps the staff vocabulary, and that no granular RBAC value leaks into a coarse
`user_role` gate. 9/9. **Negative control:** narrowing the mobile list back to the pre-audit
`staff`/`super_admin` pair turns 3 checks red — including the legacy-`admin` lockout itself —
and the file was restored byte-identically (sha256-verified).

---

## 4. Error handling: from invisible fallbacks to named, classifiable failures

~50 bare `catch {}` existed. The dangerous pattern was *data reads* — a failed read and
an empty table rendered the same screen, so "No orders yet" with the sad-cart illustration
appeared for customers who had paid orders. Concretely changed:

- `src/db/index.ts`: `classifyDbError()` + `logDbError(op, error, extra)` and 17 previously
  silent catches now report the operation they killed; a network classification also marks
  the offline cache, and `isBackendOnline()` pings `SUPABASE_URL` from config instead of a
  hard-coded project host.
- New `src/components/ui/ErrorState.tsx`: classifies network / permission / server / empty
  and renders bilingual copy plus a real **Try again**, with the raw error in small print.
- Wired where a failure was previously indistinguishable from emptiness:
  `app/(tabs)/orders.tsx`, `app/profile/order-history.tsx`.
- `app/marketplace/[marketplace].tsx`: `onError` now reads the native code and maps it —
  connection (-1/-2/-3/-106/-1001), server (-4/-6/-7/-105/-1009), TLS/certificate
  (-12/-1012/-1022/-2003) — and the retry card offers Try again / marketplace home /
  open in browser / go back. The silent `syncSession()` that stopped its own spinner now
  reports what failed.
- 20 more app-layer catches (auth profile upsert after signup, language persistence,
  recent marketplaces, notification prefs, favourites, payment prefs, referral
  clipboard/share, admin localStorage writes, OTA update check) now log a tagged warning.
  The signup one matters: a `profiles` upsert that fails leaves the account with no role,
  and RLS then hides every staff table — the "admin console is empty" symptom.

Remaining (deliberately untouched): in-page `catch` blocks inside the injected script
strings — those are per-node guards in third-party pages and must stay non-throwing.

---

## 4.5 Screen speed outside the WebView: bounded reads and URL-safe joins

"Load faster on every screen" is not only a WebView problem. Every list read that has
no ceiling downloads the whole table into one JS array, so the screen gets slower as
the business grows — a customer with 400 orders and an admin with 1 000 shipments feel
it, a brand-new account does not. Auditing `apps/mobile/src/db` and `apps/web/src` for
that shape found two real defects and one near-miss class.

**Mobile — two per-user reads had no cap.** `getPaymentsByUser()` selected the
customer's *entire* order history (every row, all columns it could reach) for the
payment-methods screen, and `getFavorites()` pulled `favorites` joined to
`source_products(*)` — a full product row per favourite — with no limit at all. Both
now carry explicit caps (`ORDER_QUERY_CAP` / `FAVORITES_QUERY_CAP`, 200, newest-first
where an order column is verified to exist) exported from `src/db/index.ts` so the next
read can reuse them. The favourites read deliberately got **no** `.order()`: favourites
are written as `{user_id, product_id}` only and the base table was never committed to
this repo, so ordering by a column that may not exist would fail the whole read and show
an empty wishlist — a silent-data-loss trade not worth a sort.

**Web admin — a decorative join could blank a whole console.** The Shipments screen
took every order id on its 1 000-row page and put them in one `.in("id", …)`. PostgREST
sends `.in()` values in the GET query string, so that is a ~37 KB request line: the
gateway answered 400, the base-table fallback failed on the identical oversized URL,
`data` came back `null`, and the table drew 1 000 shipments with no order link. Staff
read that as "these shipments were never linked to an order" — the same failed-read-
looks-like-empty-data class as §4, this time in Mission Control. Orders had the milder
version: `listOrders` enriched its 250-row window with two `.in()` lookups whose errors
were discarded, so a failure rendered as `Guest` in the Customer column and no
"Bought in" chips.

Fix, in `src/lib/admin/batched-join.ts` (new, and import-free so it can be tested
directly): split values into chunks of 50 (~1.9 KB of query string) and run them through
a pool of four. A page's enrichment is two round trips instead of one doomed request, a
chunk that fails contributes its rows' absence *and* a count of failures, and a rejected
promise counts as a failed chunk rather than a crashed join. `supabase-data.ts` now
routes enrichment through it (`selectInBatches`, `getOrderRefsByIds` with a per-batch
view→base-table step-down), and the failures reach the operator: `listOrders` returns
`notices`, and Orders and Shipments render them through the new
`components/admin/PartialJoinNotice.tsx` — same amber `role="status"` shape as the
existing `RowCapNotice`, so one signal means "this table is incomplete, and here is why".

**Not changed, and why.** The admin layout's five badge queries are
`.select("id", { count: "exact", head: true })` batched into a single `Promise.all` — no
rows move, already optimal. `staff_profiles` (a dozen rows) and `marketplace_accounts`
(one row per marketplace) are not worth a cap that could hide a staff account from its
own console. Reads whose id list comes from a bounded window (`.in("id", …)` over the
50-order Customer 360 window, or a `.eq("user_id", uid)`) are bounded by their caller and
were left alone rather than churned before release.

Verified by a fifth gate, `apps/web/scripts/verify-batched-join.mjs` (10 checks, wired as
a hard step in the `web-build` CI job): chunk size keeps the request line under the
budget, 1 000 ids become 20 chunks with every value queried exactly once, peak in-flight
stays at or below the pool size, one failing chunk still delivers the other 150 rows and
is counted, a thrown error fails only its chunk, total failure is distinguishable from an
empty table, and the notice wording distinguishes "all failed" from "3 of 5 groups".
Negative control (2026-10-14): `IN_CLAUSE_BATCH_SIZE = Number.MAX_SAFE_INTEGER` — the old
single oversized `.in()` — turns checks 1-7 red while the two source-shape checks stay
green; the file was restored byte-identically (sha256 `7605992f…` recorded before and
after). `tsc --noEmit` exit 0 in both apps, `eslint` clean on the new files, and
`expo export --platform android` exit 0 after the mobile caps.

---

## 4.6 Round trips a customer actually waits for, and one AI call that could not be reached

The bounded-read pass found the other half of "slow screens": not how much a query
downloads, but how many times the screen waits in line. Each fix below is one removed
round trip on a path a real customer walks, plus the failure handling that was missing
next to it.

**Cold start paid for two lookups in series.** `fetchProfile()` in `src/store/auth.ts`
read `profiles`, waited, then read `customer_profiles` for the city — and `getProfile()`
in `src/db/index.ts` repeated the identical serial pair for the profile screen. Both
tables are independent, so both reads are now issued in one `Promise.all`: the splash
gate waits for the slower query instead of the sum. `fetchProfile` also stopped
swallowing its failures — a `profiles` error is logged and returns `null`, but a failed
*city* read no longer discards the name and role that did load, because `role` is what
decides staff mode (see §3) and losing it silently logs a staff member in as a customer.

**Payment methods did the same.** `app/profile/payment-methods.tsx` awaited payment
history, then the stored preference, then saved methods. Now one
`Promise.allSettled([...])`, and `allSettled` specifically: one broken read used to skip
the reads after it in the same `try`, so a dead saved-methods query could blank the
payment history beside it.

**Order detail started its item read too late.** `getOrderById()` fetched the order, then
fetched its `order_items`. When the caller already passed a server uuid — the usual case
— the item query does not depend on the order query at all, so it is now created before
the order read is awaited and both fly together. An `order_items` failure is logged with
its message instead of rendering a paid order with no lines and no explanation.

**Mobile had the same oversized-`.in()` disease the web console just lost.** The
order-history fallback path pulled `order_items` for up to 200 order uuids in one `.in()`:
~7.4 KB of request line, which sits right at the 8 KB ceiling gateways typically enforce,
so the next order was one round trip away from paid orders rendering with no line items —
the Shipments symptom in §4.5, this time on a customer screen. `src/lib/in-batches.ts`
(new) carries the same chunk-of-50 / pool-of-four logic as the web helper and, like it,
reports `failedBatches` rather than an empty array. The two apps keep a copy each because
`packages/shared` is on neither app's module resolution path; 80 dependency-free lines is
cheaper than rewiring the monorepo before release. A partial failure is logged with the
`partialJoinNotice` sentence and is deliberately *not* a UI banner here: the list uses
items for a preview only, and the detail screen re-reads them per order.

**The wishlist was downloading the whole wishlist to answer yes/no.**
`app/product/[id].tsx` fetched `getFavorites(user.id)` — every saved row with its full
embedded product — on every product open, just to decide whether the heart is filled.
It now calls `isFavorite(userId, productId)`, one indexed lookup. The Account tab's saved
count likewise no longer needs the rows: `getFavoritesCount()` is a
`.select("id", { count: "exact", head: true })` with no row payload, and it returns
`null` — never `0` — when the read fails, with the stat rendering `—`. A network blip must
not tell a customer their saved items disappeared.

**`/track` told customers their order did not exist when the server was unreachable.**
The public tracking page probed two column shapes live, and a transport failure
(`Failed to fetch`, timeout, DNS) looked identical to a genuine miss, so it fell through
to "no order found". It now classifies the error (`isTransportError`), stops shape
probing the moment a read fails for connectivity reasons rather than schema reasons —
previously the second probe doubled the wait on exactly the network it was failing on —
and shows an amber "We could not reach the server… this is a connection problem, not a
missing order" card with a **Try again** button.

**Browser AI chat could not reach the function it was calling.** `apps/web/src/lib/ai/client.ts`
sent `apikey` but no `Authorization` header, while `apps/web/supabase/config.toml`
carries no `[functions.*]` override and Supabase's default is `verify_jwt = on` at the
gateway — so the request was rejected before `ai-chat` ever ran, and the caller saw a
silent `null` with no reason. The client now attaches the signed-in user's JWT (falling
back to the anon key, mirroring `edgeFetch`, which the repo documents as the sanctioned
transport), keeps its own client-side deadline that `edgeFetch` cannot provide (the
12s the quote form asks for, 30s by default), and classifies
every non-answer (`not_configured`, `offline`, `timeout`, `unauthorized`,
`rate_limited`, `server`, `empty`) into one `[ai-chat] no answer: <reason>` warning —
the reason only, never the conversation text. A missing env var now warns instead of
returning `null`, because "the AI button does nothing" was indistinguishable from "the AI
had nothing to say".

**Considered and deliberately not touched.** Two of the same audit's findings are real but
are the wrong trade two weeks before release. The home product grid and the orders list
build their cards with `.map()` inside a `ScrollView` (up to 200 rows), which is the
virtualisation argument for `FlatList` — but both sit at the bottom of an already-scrolling
screen, so a `FlatList` needs a nested-scroll host, a fixed height and a `getItemLayout`
to be worth it, and getting that wrong shows up as a home screen that cannot be dragged.
Neither list is network-bound any more (`getProducts` is served from the device cache
first), so the cost is JS render time, not waiting. Same for `getProducts`'
`.select("*")`: the product cards need most of the row, and a narrowed projection risks
`undefined` in a price or image path to save bytes the cache already avoids re-fetching.
Both are recorded as post-release work rather than silently left unfixed.

Verified by `apps/mobile/scripts/verify-in-batches.mjs` (15 checks, wired into
`npm run verify` and as its own hard CI step): a 50-uuid filter stays under 2.5 KB while
the 200-uuid version it replaced is shown to exceed 7 KB, chunks preserve order and never
duplicate, 200 ids become exactly 4 batches with each value queried once, peak in-flight
is bounded by the pool yet greater than one (serial fallback would defeat the point), one
rejected batch keeps the other 150 rows and is counted, a thrown error costs only its own
chunk, the two notice wordings distinguish "all failed" from "3 of 5 groups", and four
source-shape rules hold — enrichment goes through `runInBatches`, no variable-length
`.in()` survives in `src/db/index.ts`, partial failures are logged, the `order_items`
column list is declared in exactly one place, and `getOrderById` creates the item promise
before it awaits the order query. Negative control (2026-10-14): reverting
`.in("order_id", batch)` to `.in("order_id", ids)` turns 2 of 15 red, then the file is
restored and the gate prints its sha256 (`0da800864527d08c` after restore) so the restore
is provable rather than claimed. `tsc --noEmit` and `npm run verify` exit 0 in
`apps/mobile` (71 behaviours), and `expo export --platform android` exit 0.

The browser AI client got its own gate, `apps/web/scripts/verify-ai-client.mjs` (16 checks,
also a hard CI step and part of `npm run verify`): the signed-in JWT and the guest anon key
are both proven to be on the wire, the body carries the conversation plus `task` and omits
`temperature`/`max_tokens` unless asked, 401/403/429/500/503 each map to a distinct named
failure, `ok:false` and a whitespace answer are told apart, the deadline converts a hung
function into `timeout` and a `TypeError` into `offline`, a build with no public env pair
warns `not_configured` and spends zero requests, and the customer's message text never
appears in a log line. Negative control (2026-10-14): deleting the `Authorization` header —
the exact bug this section fixed — turns 3 of 16 red, and `client.ts` was restored
byte-identically (sha256 `e5323bc9…`). The harness itself was corrected under that control:
the Supabase stub was first installed after the module had already captured it, so every
session read threw into the anon fallback and the JWT check was passing vacuously.

---

## 4.7 The screen-by-screen sweep: money, privacy and "we couldn't read that"

§1–§4.6 were the WebView and the round trips. This section is what the same method found
when it was pointed at **every other screen in both apps** — the parts a customer only
notices when a number is wrong or something they saved is gone.

**Mobile — the basket belongs to an account, not to the device.** `src/store/cart.ts`
persisted under one AsyncStorage key for the whole phone. These devices are handed from one
person to the next and the cart FAB is visible to guests, so the next customer opened a
basket of lines they never added, priced for someone else. The entry is now namespaced
(`chinasuuq-cart:<uid>`, `chinasuuq-cart:guest`) and `setCartScope()` — called from
`store/auth.ts` at sign-in, session restore and sign-out — moves the pointer: signing in
re-reads that account's own entry, signing out blanks memory while the saved basket survives.
zustand writes on every `set()`, so the mid-switch blank would have been stored under the
*new* key and read straight back as an empty cart; writes are therefore frozen for the
duration of a switch, and only the **newest** switch releases the freeze (a sign-out
finishing late must not re-enable writes while a sign-in is still loading). The one
pre-existing device-wide entry is deleted on module load rather than adopted: nothing can say
whose it was, and handing it to whoever boots first is the leak being fixed. Trade-off, stated
plainly: an install that upgrades from before this change loses its on-device basket (the
server-side orders are untouched).

**Mobile — the three money numbers on a cart line describe one moment.** A re-add used to
merge them one field at a time (`cny || old`, `Math.max(oldUsd, newUsd)`, and an
`exchange_rate` stamped only when the line was first created), and checkout sends all three
to `createOrder`. A supplier price cut therefore billed the old high figure while the on-screen
preview showed the new one. Last write now wins as a set, gated on `freshCapture` — a re-add
that carries no price at all keeps the whole old trio instead of mixing one new number into
two stale ones. Quantity still just bumps.

**Mobile — each freight card quotes its own freight.** `app/cart/checkout.tsx` computed the
selected method's estimate and printed it on both cards, so a customer who chose sea because
it "looked like $15" paid the sea minimum on arrival while air was quoted beside it. The two
quotes are now computed once per cart in a `useMemo` and each card reads its own; the total
still uses the selected one. `src/lib/shipping.ts` itself was already honest per method — the
bug was purely in what the screen asked it for.

**Mobile — a failed read no longer pretends to be an empty shop.** `getOrderById` can now
report `readFailed` (`src/db/index.ts` `OrderLookupState`) and `app/orders/tracking.tsx`
draws "couldn't load / Try again" instead of "No order matches that reference" — the old
`catch → setNotFound(true)` told a customer their order had vanished during a network blip.
The same split went to `app/search/index.tsx` (a catalogue read that fails now says "Couldn't
load products" with a retry, instead of "No products found / try adjusting your search", which
sent people retyping queries instead of reconnecting), `app/notifications/index.tsx`
(`loadFailed` from the catch, plus "empty *and* the server is unreachable" from the happy
path), `app/profile/addresses.tsx` (the read in `db/` returns `{ addresses, failed }`, so a
rejected read is no longer "No addresses yet"), and `app/profile/add-address.tsx` /
`notifications/settings.tsx`, where a refused save or a rejected storage write no longer
reports success. `ErrorBoundary` gained a working `onReset` and a `RouteErrorBoundary` that
returns to the home tab, and the four highest-traffic routes now render inside one — before,
a render throw in a screen the customer was already in had no way back except killing the app.

**Web — the admin console fails closed.** `src/lib/admin/permissions.ts` collects the per-role
checks; when one of those reads *fails* it now returns `checksFailed` and `can()` refuses to
guess, instead of the old behaviour where a failed read looked like "no rows" and, combined
with the documented fail-open for a genuinely empty seed, left a staff account with an
editable console. A failure is not an empty seed: the banner (`permissionCheckFailureNotice`)
says which check could not be read and offers a reload, and the consumers
(`AiSettingsTab`, staff, payments) show it. The seed-empty fail-open is deliberately kept —
that is the documented bootstrap path for a fresh project.

**Web — reads that could have been a URL-length bomb, and one that was injection-shaped.**
Bulk product writes in `admin/(protected)/products/page.tsx` went to the server as one
`.in("id", ids)` of up to a thousand uuids — the same PostgREST request-line ceiling §4.5 hit
from the other side — and now go through `runBulkWrite()`, 50 ids per batch, 4 in flight,
with the failed batches reported to the operator rather than counted as deleted. Every
`.or(...)` search in `src/lib/admin/supabase-data.ts` now passes through the module's existing
`sanitizeOrFilter()` (the grammar escapes `,` `.` `(` `)`): a search term containing a comma
previously changed *which columns* the filter matched, not just what it matched. The
notifications recipient read is capped at `RECIPIENT_READ_CAP = 5000` and, when the cap bites,
spells out the shortfall through the shared `PartialJoinNotice` — "this send covered 5000 of
12400 customers, so 7400 received nothing", or, when even the total count was unreadable, that
the audience size is unverified — instead of quietly sending to the first 5000.

**Web — the quote must say when it is guessing.** `fx.fromLiveRow` used to mean "a rate exists",
which it always does because `lastGood` substitution keeps `cnyPerUsd` plausible after a failed
read; it now means "an active CNY→USD row was actually read". The two money-writing screens
(`quotes`, `sourcing`) gate on it, so a stale substituted rate cannot become a customer's price
without the operator seeing that the live rate was unreadable. `edgeFetch` in `src/lib/supabase.ts`
gained a deadline of its own (`DEFAULT_EDGE_TIMEOUT_MS = 35_000`, `deadlineSignal()` +
`EdgeTimeoutError`), so a hung edge function becomes a named failure the UI can show rather
than a spinner that never resolves. The budget is per-call overridable (`timeoutMs`, `0` to opt
out) but deliberately left at the default everywhere: every AI function already enforces its
own server-side deadline at 30 s or less (ai-proxy 30, ai-extraction 25, ai-chat 30,
ai-test-connection 15), so a client budget below ~30 s would cancel calls that were going to
succeed. The AI client keeps its own abort for the same reason (`ai/client.ts`, 30 s).
`AiShipmentConcierge` reads its collections through `readCollection<T>()` and returns *before*
prompting the model when a read failed — a concierge that could not see the shipments used to
answer about them anyway. `orders/page.tsx` clears its loading flag in `finally`, so a rejected
read leaves a retryable screen instead of a permanent skeleton.

**Verification:** `apps/mobile/scripts/verify-cart-and-states.mjs` (18 behaviours, `npm run
verify:states`, hard CI step) imports the real `src/store/cart.ts` and `src/lib/shipping.ts` —
rewriting only their AsyncStorage, FX-store and constants boundaries, keeping real `zustand`
and its persist middleware because *the middleware is the thing under test* — and drives
scope switches against a fake storage. It proves the legacy key is removed and never written
again, that A's basket survives A's sign-out, that B boots empty on the same device, that two
switches in a row leave the newest one unfrozen, that the money trio restamps together
(70 CNY at rate 10 → $7, not `max(10, 7)`), that a priceless re-add keeps the whole old trio,
and that air and sea differ on the same parcel ($42.50 vs $25 at 5 kg; $15 vs $25 at 0.5 kg).
The rest of the section is pinned as source rules on the real files, because those components
need a configured client to import at all: per-card freight quotes, `OrderLookupState`,
`loadFailed` on the three list screens (set *from* the failure, and the failure branch drawn
before the empty one), the `{ ok, error }` write signatures, `RouteErrorBoundary` on four
routes. Negative control (2026-10-14), each mutation restored byte-identically: un-scoping
`scopedCartKey` turns **5** checks red (`cart.ts` `f38ac032…`), reverting the USD merge to
`Math.max` 1, quoting air on the sea card 1 (`checkout.tsx` `4afaf4c3…`), and deleting the
search catch's `setLoadFailed(true)` 1 (`search/index.tsx` `ec89e6f5…`). The web half is pinned by `apps/web/scripts/verify-admin-guardrails.mjs`
(18 behaviours, `npm run verify:admin`, hard CI step), which imports the **real**
`src/lib/admin/permissions.ts` against a scripted PostgREST-shaped stub and executes the
decision table: a clean grant opens exactly its own section and no other; a failed role read
denies even though it looks like the unconfigured state that used to fail open; a null count
with no error is "unreadable", not "zero grants"; a genuinely empty permissions table keeps the
documented bootstrap fail-open; `super_admin` answers from the count read alone (no grant walk);
a failed check is **not cached**, so the next mount retries and can succeed, while a clean answer
is; `invalidatePermissions()` re-reads after a role change; a thrown read is a failed check; an
anonymous caller probes no staff table at all. The rest of the web fixes are source rules plus
one executed pure function: `sanitizeOrFilter` is lifted out of `supabase-data.ts` and *run*
(`"Hadija, Co (2024). v2\\x"` → escaped, `"spare part *"` untouched), every `ilike.${…}`
interpolation must be the safe `like`, both bulk actions go through `runBulkWrite` with no
whole-selection `.in("id", ids)` left, the capped broadcast banner is on screen, `fromLiveRow`
is false by construction and the two money screens gate on it, `edgeFetch` has a default
deadline that says *we* cut it off, the concierge returns before prompting on a failed read, and
orders clears its spinner in `finally`. Negative controls (2026-10-14), each restored
byte-identically: deleting `if (perm.checksFailed) return false` turns **3** red
(`permissions.ts` `1a405b38…`), deleting the bootstrap fail-open 1, caching a failed result 1,
`sanitizeOrFilter` returning the term unchanged 1 (`supabase-data.ts` `d8d46e3c…`),
`fromLiveRow: true` after a failed read 1 (`fx.ts` `eb9dae21…`), hiding the cap banner 1
(`notifications/page.tsx` `5ebc9820…`).

---

## 5. Server side: the AI functions and the staff gate (same audit, second half)

`apps/web/supabase/functions/` — 10 functions plus `_shared/auth.ts`.

**5.1 A whole role was locked out of the AI chat.** `ai-chat` gated on
`SIGNED_IN_ROLES = ["customer","staff","super_admin"]` — no legacy `admin`, no
`supplier`. Those accounts could open the assistant and see the input box, then got
`401 unauthorized` on every message, while `ai-vision`, `ai-translate` and the database
accepted the same user. Now the full live vocabulary, matching the other functions.

**5.2 Every denial used to be the same anonymous shrug.** `requireRole()` returned `null`
for four unrelated outcomes — not staff, expired token, Supabase auth unreachable, profile
row unreadable — and every function turned that into `401 unauthorized` with **nothing
logged**. In production that is a dead end: `function_edge_logs` shows a 401 and no reason.
The gate now classifies (`no_token | invalid_token | auth_unavailable | no_profile |
profile_unreadable | role_not_allowed`), logs the reason and the actual role server-side,
and answers **503 + `retryable: true`** for the two transient outcomes so the app keeps its
session instead of dropping a good login. Real denials still answer 401, now with a stable
code. Adopted at the call sites that staff and customers actually hit from the field:
`ai-translate`, `marketplace-session-sync`, `payment-reconcile`.

**5.3 A transient read failure could plant a duplicate marketplace account.**
`marketplace-session-sync` looked up "the shared, active row for 1688" and discarded the
query's error. On a read failure the lookup returned *no row*, so the next statement took
the **insert** branch and created a second shared account for that marketplace — and the
customer-facing session read then picks one of them, which is how a staff cookie sync can
appear to succeed while customers stay logged out. The lookup error is now checked and the
function refuses with 500 rather than guessing.

**5.4 Timings and shapes were already right** (verified, not changed): every outbound
provider call has `AbortSignal.timeout` (25–30 s), timeouts are classified by
`e.name === "TimeoutError"` — the `AbortSignal.timeout` detail that used to make a timeout
indistinguishable from a refusal — error bodies returned to callers are stable codes with
Postgres text logged server-side only, and `_shared/auth.ts` already matched the RLS
triple `staff | admin | super_admin`.

**Verification:** `deno check` over all 10 functions + `_shared` before vs after my edits —
11 errors on committed HEAD, 11 now, zero introduced (the pre-existing set is jsr
`supabase-js` generic-inference noise from duck-typed helper parameters, plus one
over-narrow object literal in `product-enrich`; all type-noise, no runtime defect). Every
function source also passes `node --experimental-strip-types --check`.

---

## 6. Repo arrangement and the CI gap

- **Nothing in CI looked at the edge functions.** A syntax error in an AI function could be
  merged and deployed unseen. Added an `edge-functions` job: a hard parse gate over every
  function source (no install, no network) plus an informational `deno check`, deliberately
  non-blocking until the pre-existing 11 are cleared — the comment states the count so the
  next person re-reads it before promoting the gate. Jobs now: `web-build`, `mobile-config`,
  `edge-functions`, `guard`; YAML validated.
- **The WebView scheduler had no regression gate at all.** Added a hard
  `node scripts/verify-cs-runtime.mjs` step between typecheck and the Metro bundle in the
  `mobile-config` job, so the backoff/retirement/hidden-pause behaviour the speed work rests
  on is re-proven on every push to `main` rather than only in this audit.
- **Same for the translation client.** `scripts/verify-translate-client.mjs` imports the real
  `src/api/translate.ts` through Node's type stripping, rewriting only its two import lines
  (Supabase + AsyncStorage) and driving a fake clock, so the batching, cache, de-duplication,
  9 s time-box and 429/503 parking are all executed rather than described. Added as a hard CI
  step after the WebView gate, and locally as `npm run verify` (typecheck + both harnesses).
  Negative control: reverting the §2 map-contract fix turns 3 of the 13 scenarios red.
- **Both in-page halves of the feature are gated too.** `scripts/verify-translate-inpage.mjs`
  (§2.x) and `scripts/verify-usd-inpage.mjs` (§1.4) are hard steps in `mobile-config` after
  the translation client, and all four gates plus typecheck now run behind one command:
  `npm run verify` (also `verify:translate-inpage` / `verify:usd` individually). They share
  `scripts/lib/cs-test-dom.mjs` — one duck-typed document, one stub `window.__cs` task
  registry, one sandbox builder — so a third in-page script gets a working fake page instead
  of a fourth hand-rolled one, and the fake page cannot drift between gates.
- **The web app had no executable gate at all** — only typecheck, an informational lint
  and the build. §4.5's batching rules therefore went into a Supabase-free module
  (`src/lib/admin/batched-join.ts`) with the first web gate beside it
  (`apps/web/scripts/verify-batched-join.mjs`, `npm run verify` → `verify:joins`), wired as
  a hard CI step between typecheck and build. Keeping the rules in an import-free module is
  what made that possible: the data layer itself cannot be loaded without a configured
  client.
- **§4.7's fixes would have had no gate at all.** Both apps gained a hard CI step for them:
  `verify:states` sits after the session bridge in `mobile-config` and executes the cart's
  account namespacing, the write freeze across a scope switch and the money trio against the
  real store plus real `zustand`; `verify:admin` sits after `verify:track` in `web-build` and
  executes the RBAC loader's deny/allow/bootstrap table against scripted PostgREST answers.
  Neither of those behaviours is reachable by `tsc`, `next build` or a phone tap in reasonable
  time — the leak needs two accounts on one device, and the fail-open needs a network failure
  during an admin login.
- **The staff-role vocabulary lives in four places**: `is_staff_or_admin()` in SQL  (authoritative), `_shared/auth.ts` for functions, `apps/mobile/src/lib/roles.ts`,
  `apps/web/src/lib/roles.ts`. They agree today and the §5.1 bug is exactly what happens
  when they don't — so `scripts/verify-role-vocabulary.mjs` (§3) now compares all four to
  the migration on every push, in the repo-wide `guard` job.
- **`packages/shared` is not imported by either app.** `apps/mobile` is not a root
  workspace member (`workspaces: ["apps/web","packages/*"]`) and reaches the shared types
  through its own `src/types` + `src/lib/constants` copies. So the granular `StaffRole`
  taxonomy in `packages/shared/types.ts` is documentation-grade only — nothing enforces it
  against the app code. Left as is: re-plumbing the workspace and Metro resolution right
  before a release is a bigger risk than the duplication it removes.
- **No tracked junk** — `.DS_Store`, the agent scratch dirs, `.next/`, `out/`, `.env.local`
  are all ignored, and the `guard` job keeps it that way.

**6.1 What the layout looks like after the audit.**
Four gate files were added, one screen file was deleted, and both apps now have their gates
beside the code they check:

- `apps/mobile/src/lib/in-batches.ts` — new, pure, zero imports (chunking + concurrency +
  the partial-join wording + the request-line byte probe). It is import-free specifically so
  `scripts/verify-in-batches.mjs` can execute it without a Supabase client. `apps/web` keeps
  its own copy of the same rules (`src/lib/admin/batched-join.ts`), because
  `packages/shared` is on neither app's resolution path (§6) and duplicating eight
  functions there would be the lesser evil against re-plumbing Metro before a release.
- `apps/mobile/scripts/verify-marketplace-session.mjs` — new gate for §1.5, run as
  `npm run verify:session` and as a hard CI step.
- `apps/mobile/scripts/verify-cart-and-states.mjs` — new gate for §4.7's mobile half
  (`npm run verify:states`, hard CI step). It needs real `zustand` and its `persist`
  middleware — the middleware is what decides when storage is written — so its type-stripped
  scratch copies live in `apps/mobile/.cs-gate-tmp/` rather than the OS temp dir, which is the
  only way `node_modules` resolution reaches the shipped package. (Node also refuses
  `--experimental-strip-types` for files *inside* `node_modules`, so it is a sibling of it.)
  The directory is gitignored and deleted on process exit.
- `apps/web/scripts/verify-admin-guardrails.mjs` — new gate for §4.7's web half
  (`npm run verify:admin`, hard CI step), same scratch-dir convention under `apps/web/`.
- `apps/web/scripts/verify-ai-client.mjs` and `apps/web/scripts/verify-track-errors.mjs` —
  the web app's second and third gates (`verify:ai`, `verify:track`). The `/track` failure
  classifier moved out of the page component into `src/lib/track/errors.ts` so it could be
  executed at all; a pure function inside a `'use client'` route is untestable without a
  renderer.
- `apps/mobile/App.tsx` — **deleted** (staged). `apps/mobile/package.json` sets
  `"main": "expo-router/entry"`, no file in the app imports `./App`, and the repo's own
  history shows why it existed: commit `efcb712` ("add App.tsx entry for Expo Router
  compatibility") added a second root while the router already owns one. Two roots mounting
  their own provider trees is how a screen ends up reading context that the real root never
  provided. `tsc --noEmit` and `npx expo export --platform android` both exit 0 with the
  file gone — the bundle is the check that matters here, not the compiler (§6.2).
- `apps/mobile/package.json` script order is now the order the gates run in:
  `start, android, ios, web, tsc, verify:webview, verify:translate, verify:translate-inpage,
  verify:usd, verify:inbatches, verify:session, verify:states, verify`. `verify` chains all
  seven plus typecheck, so one command is the whole mobile proof; `apps/web`'s `verify` chains
  four (`verify:joins, verify:ai, verify:track, verify:admin`).

**6.2 The verification rule this repo needs, stated once.**
For `apps/mobile`, `tsc --noEmit` passing is not evidence. Expo Router re-exports
`react-navigation`'s hooks, and an import written against the wrong one compiles cleanly and
then refuses to bundle in Metro — which is exactly the class of bug that produced the boot
crashes. So every mobile change in this audit was finished with
`npx expo export --platform android` and its Hermes bundle hash recorded, and the CI
`mobile-config` job ends with a Metro iOS export as a hard step (bundle directory must exist,
at least 5 files exported). Node gates that import `.ts` go through
`node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON`, and any
gate that touches an environment boundary (Supabase, AsyncStorage, expo-constants, `fetch`)
stubs only that boundary in a temp copy so the shipped logic is the logic under test.

---

## 7. Production hygiene

- `apps/web/supabase/migrations/20261003191547_fix-staff-role.DANGER.sql` was moved to
  `apps/web/supabase/oneoff-scripts/`. It contained `ALTER TABLE profiles DISABLE
  TRIGGER ALL` plus a `SECURITY DEFINER` function that force-sets a staff role and
  confirms an email — self-labelled "never applied to production" but sitting in the
  folder `supabase db push` executes.
- No build junk is tracked in git (covered by the `guard` job, §6).

**Verification done:** `npm run verify` in `apps/mobile` exit 0 — typecheck plus seven
executable gates over the real injected/client sources (10 scheduler + 13 translation-client
+ 15 in-page-translation + 18 USD-overlay + 15 bounded-`.in()` + 19 marketplace-session
+ 18 cart/freight/honest-state = 108). `npm run verify` in `apps/web` exit 0 — the §4.5
batched-join gate (10), the §4.6 AI-client gate (16), the `/track` failure-classifier gate (18)
and the §4.7 admin-guardrail gate (18) = 62 behaviours. `tsc --noEmit` exit 0 in both
apps. `expo export --platform android` → Hermes bundle, exit 0 (`entry-efc0da41…hbc`, 6.4 MB),
re-run after the §1.5 WebView-path, §4.6 round-trip, §4.7 cart/freight/search-screen and
`in-batches.ts` edits — this project's rule, since tsc passes on bundles Metro refuses.
`npm run build` in `apps/web` → exit 0, full static export (29/29 pages) including every
`/admin/*` route, run after the §4.5 data-layer, Orders/Shipments, `/track`, §4.7 admin
screens and `ai/client.ts` edits. Each gate has a negative
control recorded above: removing the scheduler backoff, reverting the §2 map contract,
reverting the §1.4 thousands grouping, walking `shouldSkip()` from the grandparent,
un-chunking the `.in()` joins, reverting `batch` to `ids` in the mobile order-items
lookup, deleting the AI client's `Authorization` header, weakening the `/track` transport
pattern, reporting a failed session read as `failed:false`, widening the session deadline
to 25 s, dropping the last-known-session cache write, re-keying the capture-form seed
on object identity, un-scoping the cart's storage key (5 checks), `Math.max` on the USD
merge, quoting air on the sea card, dropping the search catch's failure flag, deleting the
loader's `checksFailed` deny (3 checks), deleting its bootstrap fail-open, caching a failed
permission check, neutering `sanitizeOrFilter`, making `fromLiveRow` true after a failed read,
and hiding the capped-broadcast banner — each makes its gate exit 1, and every mutated source
file was restored byte-identically (sha256-verified: mobile `src/db/index.ts` `067b2492…`,
`src/lib/supabase.ts` `7b5bf5e8…`, `src/components/marketplace/SmartProductForm.tsx`
`4283908…`, `src/store/cart.ts` `f38ac032…`, `src/lib/shipping.ts` `c30f0dfc…`,
`app/cart/checkout.tsx` `4afaf4c3…`, `app/search/index.tsx` `ec89e6f5…`; web
`src/lib/ai/client.ts` `66e0d939…`, `src/lib/track/errors.ts` `b5ca1f97…`,
`src/lib/admin/permissions.ts` `1a405b38…`, `src/lib/fx.ts` `eb9dae21…`,
`src/lib/admin/supabase-data.ts` `d8d46e3c…`).
Three controls caught flaws in the harnesses themselves — installing the Supabase stub *after*
the module captured it made the signed-in-JWT check pass vacuously through the anon fallback
(the stub is now created before the import and mutated in place), pairing each Safari/undici
network wording with a `code` proved the `/track` fallback had been classifying them by
accident rather than by pattern, and the admin loader's headline "a failed role read denies"
check was passing without exercising the fail-closed rule at all (its scripted count read
answered 5, so the old code would have denied anyway — the scenario now answers count 0, which
is the state that used to fail open, and the control turns it red). `npm run verify:roles` from
the repo root adds 9 more checks (**179 behaviours total**) covering the staff-role vocabulary
across SQL, both apps and the edge functions, also with a negative control. `deno check` on the
edge functions shows zero new errors versus the committed baseline; the CI workflow parses with
4 jobs, the 13-step `mobile-config` job runs every mobile gate as a hard step, and the 13-step
`web-build` job (12 hard) runs the enrichment, AI-client, tracking and admin-guardrail gates
between typecheck and build. After the push that stopped being a prediction: GitHub Actions ran
the workflow on `d75318c` and all four jobs concluded `success`, including the Metro bundle step
that is this repo's only trustworthy mobile check (§6.2).

**Not verified — open gaps:**
1. No on-device run. The scheduler's behaviour *is* now proven in simulation (§1), and the
   no-refetch fix is visible in code, but the felt improvement still needs a phone pass on a
   1688 search page and a dollarstore product. Four checks make it a real pass: the page
   translates without a stall, a slide-captcha can be completed (nothing inside
   `#nc_1_wrapper` is rewritten), a grouped price such as `¥1,299` reads as ~$185 not
   cents, and the skeleton lifts while the marketplace's own ads and trackers are still
   spinning (§1.5) — then, as staff, open 1688 twice and confirm the second visit is already
   logged in on first paint rather than one navigation late. §8.4 is this list as a step.
2. The in-page translation pipeline and the failure path are now executed by a harness
   (§2.x), and the price overlay by another (§1.4). What no simulation can prove is the
   RN↔WebView round-trip on a real phone: `postMessage` arrival, the app's serialized queue
   calling the *deployed* `ai-translate`, and the injected `__csApplyTranslations` /
   `__csTranslateFailed` calls landing on the live document. That is gap 1's device pass.
3. Supabase MCP calls (`list_projects`, `execute_sql`) returned "MCP tool invocation did
   not complete" for the whole session, so live `profiles.role` distribution, the deployed
   `ai-translate` body, and the end-to-end translation round-trip are read from repo
   migrations/source, not production.
4. **The edge-function fixes in §5 are repo-only.** They change how the server answers, so
   they do nothing for customers until deployed (`ai-chat`, `ai-translate`,
   `marketplace-session-sync`, `payment-reconcile`, `_shared/auth.ts`). The web app was
   deployed on 2026-10-14; the functions were not (§8.3 is still gated on Supabase access —
   the connector went unavailable for this session entirely, so the deploy path itself is
   unverified).
5. Carried-over release actions: rotate the `sk-H5qx` AI key and the
   dollarstore password, re-sync dollarstore cookies, build the mobile binary. **The web bundle
   is no longer on this list — it was published to `chinasuuq.com` on 2026-10-14 (§8.7).**
6. `apps/mobile` version is still `1.0.3` (§8.8). The audit itself is committed and pushed
   (`d75318c` on `origin/main`, §8.2), so there is now a "before" to revert to.
7. Cosmetic debt deliberately not churned right before a release: ~40 unused local
   imports/vars flagged by `tsc --noUnusedLocals` (mostly `React` under the automatic JSX
   runtime, which is this codebase's convention), and 11 pre-existing `deno check` errors.
   `apps/mobile/app/marketplace/[marketplace].tsx` also still defines a
   `requestSourcing`/tip-dismiss handler that no UI element calls — left in place because
   deleting an un-wired feature is a product decision, not a cleanup.
8. **§4.7 is proven in simulation, on a device it is still a screenshot away from.** The
   mobile gate executes the real store and the real `zustand` persist middleware, and the web
   gate executes the real RBAC loader, but neither renders a screen. The phone pass that turns
   them into observed behaviour is the same one gap 1 asks for, plus three checks: sign in as A,
   add an item, sign out and sign in as B on the same device and confirm B's cart tab opens
   empty (and that A's item is back when A returns); open checkout with two cart lines whose
   supplier freight differs and confirm the air and sea cards show *different* totals instead of
   one number duplicated; then kill the network (or point the app at a dead URL) and confirm
   Search, Notifications, Addresses and Order tracking each render their failed branch —
   "Catalogue unavailable"/"Couldn't load … Try again", "Couldn't load your notifications",
   "Couldn't load your addresses", the retryable tracking card — instead of "No products
   found", "No notifications yet", "No addresses yet" or "Order Not Found". Wishlist, Order
   history and the home trending strip carry the same split from earlier in this audit and are
   worth a glance in the same pass.
   That last one is the customer-facing version of the whole §4.7 theme, and it is exactly the
   statement a simulation cannot make about a real screen.
9. **The cart upgrade path loses one basket, deliberately, and nobody has watched it happen.**
   `verify:states` proves the legacy device-wide key is deleted on module load and never written
   again, and §4.7 states the trade-off in words — but no one has upgraded a real install that
   had items in it and seen the customer's reaction. If a pre-release pass decides that is too
   rough, the alternative is a one-time "your saved basket was cleared for account privacy"
   notice on first launch, which is a product decision, not a cleanup, and is not built.
10. **The admin-console fix is client code, so it is as repo-only as §5 until the bundle is
    rebuilt.** Gap 5 already records the pending web rebuild; this is the part of it that
    matters for fail-closed: the deployed console today still reads a dropped permissions call
    as "zero grants" and hands every signed-in staff member AI-key editing and payment
    verification. Nothing changes for operators until `verify:admin`'s module is actually in a
    served bundle — the gate proves the code is right, not that it is live.
11. **FOUND AFTER THE 2026-10-14 PRODUCTION DEPLOY — the site's HTML pages are served without
    the security headers the repo believes they have.** `vercel.json` is the authoritative
    header source (with `output: "export"` Next emits no `headers()` and never runs `proxy.ts`,
    as `next.config.ts` says in its own comment), and measured against the live deployment the
    `/:path*` block that carries CSP, `X-Frame-Options`, `X-Content-Type-Options`,
    `Referrer-Policy` and `Permissions-Policy` **does reach asset routes but not page routes**:
    `/app/chinasuuq.apk`, `/images/*` and `/_next/static/*` all answer with the full CSP, while
    `/`, `/quote/`, `/track/` and `/admin/staff/` answer with none of it — only Vercel's own
    `strict-transport-security: max-age=63072000` (not the repo's
    `includeSubDomains; preload` value) and no `X-Robots-Tag`. `/admin/staff/` additionally
    came back `cache-control: public, max-age=0, must-revalidate` instead of the declared
    `no-store, no-cache, must-revalidate, private`, and `/track/` took the last matching rule's
    `s-maxage=86400`. The exact precedence rule is NOT settled by this evidence: `/track/`
    clearly took the last matching block (the public-page `Cache-Control`), while
    `/admin/staff/` matches only the generic and the admin blocks yet answered with neither
    block's cache value — which suggests a framework default outranks `vercel.json` on some HTML
    routes. Either way the conclusion is the same: a generic `/:path*` block cannot be relied on
    to decorate page routes. What this costs today: the admin console and login pages have no
    `frame-ancestors` / `X-Frame-Options` (a clickjacking surface on the page that takes a staff
    password), no CSP on any HTML document, and admin HTML is cacheable and indexable instead of
    `no-store` + `noindex`. The fix is mechanical — give every rule that matches a page its own
    copy of the security headers — and it has to be verified the way this was found, by reading
    response headers off a deployed page (if `vercel.json` still loses to the framework, the
    headers move to the Vercel project's own configuration). Needs another production deploy,
    so it is not attempted here.

**Closed by the 2026-10-14 deploy (this list used to include it as gap 10):** "the
admin-console fix is repo-only". The deployed console used to read a dropped permissions call
as "zero grants" and hand every signed-in staff member AI-key editing and payment
verification; `vercel deploy --prod` shipped the fail-closed loader together with the `/track`
failure classifier, and §8.7 records the proof taken off the served chunks rather than the
repo.

---

## 8. Ship order — the gated actions, in dependency order

**Status at the end of 2026-10-14:** the owner authorised "commit, push, Vercel the website", so
**8.1, 8.2 and 8.7 are DONE** and each records its evidence below. Everything else on this list
still needs a separate go-ahead or a physical device — 8.3 (edge functions), 8.4 (phone pass),
8.5/8.6 (credentials), 8.8 (binary), and the header fix that 8.7's verification uncovered (§7
gap 11). The order is not cosmetic: deploying the server fixes before the device pass means
testing code that is not running, and rebuilding the web bundle before rotating the exposed key
ships a bundle that still carries a published secret's consequences.

**8.1 DONE — repo re-proved before shipping.** `npm run verify:roles` (9), `apps/mobile`
`npm run verify` (typecheck + 7 gates, 108 behaviours), `apps/web` `npm run verify` (62
behaviours) all exit 0. On GitHub after the push, CI ran the whole chain as the authoritative
check — `Mobile — Expo typecheck + Metro bundle`, `Web — typecheck, lint, build`,
`Supabase Edge Functions — parse gate`, `Repo hygiene guard` — and all four jobs concluded
`success` (run `38600610155`).

**8.2 DONE — committed and pushed.** `d75318c` ("fix: deep audit — WebView speed, AI
translation, honest failures, staff RBAC"), 89 files, +9,193/−786, pushed to `origin/main`.
Before committing, the staged diff was scanned for credentials: the only key-shaped strings
added are a fake `…\.sig` test JWT inside a gate fixture and reads of
`process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`, and no `.env`, service-account or PEM path is
tracked. This commit is the "before" a bad deploy gets reverted to.

**8.3 Deploy the five changed functions** — `ai-chat`, `ai-translate`,
`marketplace-session-sync`, `payment-reconcile`, plus the shared gate `_shared/auth.ts`.
The functions live in `apps/web/supabase/functions/` and the repo tracks **no** `config.toml`
and no project link, so the deploy runs through the Supabase dashboard (or a CLI
`functions deploy` pointed at the project ref already in `apps/web/next.config.ts`) — **which
of those is available is unverified: the Supabase MCP was dead for this whole session and an
earlier audit recorded every Management API token on record returning 401.**
Checks that prove it landed (all three are §5's bugs, all three are invisible until deployed):
a `supplier`-role account opens the AI assistant and gets an answer instead of `401` (§5.1);
`function_edge_logs` shows a *reason* on a denial instead of a bare 401 (§5.2); a staff
session sync that cannot read the existing row refuses with 500 instead of creating a second
shared account (§5.3). Also confirm the gateway's `verify_jwt` setting was not changed by the
deploy — the functions do their own role gate and depend on that setting staying as it is.

**8.4 On-device pass (gap 1 + gap 8, in one sitting).** A USB phone or an EAS preview build:
gap 1's WebView checks (translates without a stall, the slide-captcha is still draggable,
`¥1,299` reads as ~$185, the skeleton lifts while the marketplace's own trackers spin, and a
staff second visit is logged in on first paint), then gap 8's screen checks (per-account
basket, two different freight numbers, and Search / Notifications / Addresses / Tracking
saying "Try again" instead of "nothing found" with the network off). Android is the cheap
route — `expo run:ios --device` needs an Apple team, and the last time this was checked the
Expo account had none linked and App Store Expo Go was pinned to SDK 54, so an iPhone pass is
a signing question for the owner before it is a testing one.

**8.5 Rotate the exposed credentials** — the `sk-H5qx…` AI provider key and the dollarstore
password. Rotation is only *finished* when the new values are saved through Admin → AI
settings (the stored-key path) and `ai-test-connection` answers green, and when a dollarstore
login with the new password works; rotating without re-saving leaves the app broken in a
different way.

**8.6 Re-sync the dollarstore cookies** *after* 8.5 — the stored cookie is the old password's
session, so syncing first and rotating second re-creates the exact logout this step is meant
to fix. Staff → marketplaces screen, then repeat 8.4's second-visit check for dollarstore.

**8.7 DONE — web bundle rebuilt and published to production, and verified as actually live.**
`vercel deploy --prod` built and aliased the static export (deployment
`chinasuuq-dw375gffp`, `https://chinasuuq.com` ready in ~3 min, exit 0, 29 routes exported).
The project has **no** Vercel environment variables, which is fine only because
`next.config.ts` hardcodes the public Supabase URL and anon key — worth remembering if a real
secret ever needs to reach the bundle. Verification was done against the served bytes, not the
repo: a cache-busted `GET /track/` came back `x-vercel-cache: MISS` with
`last-modified: 14 Oct 2026 16:47:52 GMT` (the new build), and its page chunk
`/_next/static/chunks/app/(public)/track/page-aab5245935e37d6b.js` contains both
`We could not reach the server` and `Order not found` — the two states gap 10 says a customer
used to get conflated. `admin/(protected)/staff/page-a7c207dcadede4b9.js` contains the
fail-closed notice wording, so the permission loader that denies on a dropped read is the code
operators now get. **What this step's own verification then discovered is §7 gap 11**: the same
headers say every *page* route is served without the `vercel.json` CSP / `X-Frame-Options` /
`nosniff` block that the assets do get, so fixing the header rules is an open deploy of its own.
Cache behaviour measured as expected for public pages (`max-age=0, must-revalidate,
s-maxage=86400, stale-while-revalidate=604800`), which is why any future check of a page change
must be a cache-busted request or a purge — reloading a tab that is already open can show the
old bundle for hours.

**8.8 Bump the mobile version and build the binaries — and understand what the bump does.**
`apps/mobile/package.json` and `app.json` both still say `1.0.3`; `runtimeVersion.policy` is
`appVersion`, so moving to `1.0.4` opens a **new** update channel: installs already on 1.0.3
keep receiving their own channel's over-the-air updates and will not pick up 1.0.4's JS until
someone installs the new binary. Pick the profile by what you need to hand out: `preview`
builds an **APK** (`distribution: internal`) — that is the file to replace at the site's
`/app/chinasuuq.apk` — while `production` builds an **AAB** for Play with `autoIncrement`, and
`eas.json` sets `cli.appVersionSource: "remote"`, so build numbers live in the EAS project
rather than in this repo. Then say in the staff group which version fixes the shared-device basket (§4.7) — the fix is only felt after an install.

**8.9 After any staff change:** the role vocabulary is checked by `npm run verify:roles`, and
the permission loader's cache is per signed-in user id, so a role edit is seen by that user on
their next mount or "Check again" — the operators who need to *lose* access must reload the
console, not just be edited in the database.

