/**
 * verify-cart-and-states.mjs — executable proof for the money and privacy
 * rules that a typecheck cannot see.
 *
 * WHY THIS EXISTS: audit 2026-10-14's second sweep (the one that looked at
 * every screen rather than the WebView) found three things that are invisible
 * to `tsc` and expensive to a customer:
 *   1. the cart persisted under ONE AsyncStorage key for the whole device, so
 *      on the shared phones this market runs on, the next person to open the
 *      app saw someone else's basket and totals;
 *   2. re-adding a line merged its three money numbers independently
 *      (`cny || old`, `Math.max(oldUsd, newUsd)`, an `exchange_rate` stamped
 *      only on the first add) and checkout sends all three to `createOrder`,
 *      so a price cut billed at the old high figure and the server's recompute
 *      disagreed with the preview on screen;
 *   3. checkout quoted the SELECTED freight method's price on BOTH freight
 *      cards, so a customer who picked sea because it "looked like $15" paid a
 *      different number on arrival.
 * This file imports the REAL `src/store/cart.ts` and `src/lib/shipping.ts`
 * through Node's type stripping — rewriting only their environment-boundary
 * imports (AsyncStorage, the FX store, the constants module) — switches cart
 * scopes the way `store/auth.ts` does, and then pins the honest-state rules
 * the sibling fixes in this sweep introduced.
 *
 * Run from apps/mobile:  npm run verify:states
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

// ── temp copies (inside apps/mobile so node_modules resolution works) ─────────
// Node refuses `--experimental-strip-types` for anything under node_modules, so
// the scratch dir is a sibling of it instead — resolution still walks up into
// apps/mobile/node_modules, which is where the REAL zustand lives. Ignored in
// .gitignore (`apps/mobile/.cs-gate-tmp/`) and removed in `finally`, so a crash
// cannot leave anything in the tree.
const TMP = join(ROOT, ".cs-gate-tmp");
mkdirSync(TMP, { recursive: true });
process.on("exit", () => rmSync(TMP, { recursive: true, force: true }));

const CART_SRC = "src/store/cart.ts";
const SHIPPING_SRC = "src/lib/shipping.ts";
const cartOriginal = read(CART_SRC);
const shippingOriginal = read(SHIPPING_SRC);

// The real persisted key name, read from the constants module the app ships —
// so renaming it there renames it here, and the gate cannot drift.
const CART_KEY = cartOriginal.match(/CART_STORAGE_KEY\s*=\s*"([^"]+)"/)?.[1]
  ?? read("src/lib/constants.ts").match(/CART_STORAGE_KEY\s*=\s*"([^"]+)"/)?.[1];
assert.ok(CART_KEY, "CART_STORAGE_KEY could not be found in src/lib/constants.ts");

const cartSource = cartOriginal
  .replace('import AsyncStorage from "@react-native-async-storage/async-storage";', "const AsyncStorage = globalThis.__storage;")
  .replace('import { getFxSync } from "@/lib/exchange";', "const getFxSync = () => globalThis.__fx();")
  .replace('import { CART_STORAGE_KEY } from "@/lib/constants";', `const CART_STORAGE_KEY = ${JSON.stringify(CART_KEY)};`);
assert.ok(!cartSource.includes("@react-native-async-storage"), "AsyncStorage stub failed");
// The store itself and its persist middleware must stay the real npm modules —
// the middleware is the thing that decides WHEN storage is written.
assert.ok(/from "zustand"/.test(cartSource) && /from "zustand\/middleware"/.test(cartSource), "zustand must stay the real module");
assert.ok(cartSource.includes("createJSONStorage"), "the real persist adapter must stay under test");

const shippingSource = shippingOriginal.replace(
  'import { getFxSync } from "./exchange";',
  "const getFxSync = () => globalThis.__fx();"
);

const cartPath = join(TMP, "cart.ts");
const shippingPath = join(TMP, "shipping.ts");
writeFileSync(cartPath, cartSource);
writeFileSync(shippingPath, shippingSource);

// ── stubs ─────────────────────────────────────────────────────────────────────
function makeStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  const writes = [];
  const removes = [];
  globalThis.__storage = {
    getItem: async (k) => (data.has(k) ? data.get(k) : null),
    // Recorded synchronously: the gate asserts on WHEN a write is allowed, not
    // only on what it eventually contains.
    setItem: async (k, v) => {
      data.set(k, v);
      writes.push(k);
    },
    removeItem: async (k) => {
      removes.push(k);
      data.delete(k);
    },
  };
  return {
    data,
    writes,
    removes,
    raw: (k) => data.get(k) ?? null,
    json: (k) => {
      const v = data.get(k);
      return v ? JSON.parse(v) : null;
    },
  };
}

/** The FX store is an environment boundary here (it talks to Supabase). */
let fxRate = 7;
globalThis.__fx = () => ({ cnyPerUsd: fxRate, usdPerCny: 1 / fxRate });

const flush = async (rounds = 8) => {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setImmediate(r));
};

const product = (over = {}) => ({
  id: "p1",
  title_english: "Steel pot",
  marketplace: "1688",
  price_cny_min: 70,
  price_cny_max: 70,
  price_usd_estimated: 10,
  stock_status: "in_stock",
  sales_count: 1,
  images: [],
  variants: [],
  attributes: {},
  ...over,
});

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(["ok", name]);
  } catch (e) {
    results.push(["FAIL", `${name} — ${String(e?.message ?? e).split("\n")[0].slice(0, 220)}`]);
  }
};

let instance = 0;
/** Fresh module instance: scope pointer, freeze flag and switch counter are module state. */
async function freshCart(seed = {}) {
  const storage = makeStorage(seed);
  instance += 1;
  const mod = await import(pathToFileURL(cartPath).href + "?v=" + instance);
  await flush();
  return { mod, storage };
}

// ── 1. the basket belongs to an account, not to the device ───────────────────
await check("module load drops the legacy device-wide basket instead of handing it to whoever boots", async () => {
  const { storage } = await freshCart({ [CART_KEY]: JSON.stringify({ state: { items: [] }, version: 0 }) });
  assert.ok(storage.removes.includes(CART_KEY), "the unscoped key must be removed: no way to tell whose it was");
  assert.ok(!storage.writes.includes(CART_KEY), "nothing may ever write the bare key again");
});

await check("a guest basket lives in its own namespace", async () => {
  const { mod, storage } = await freshCart();
  mod.useCartStore.getState().addItem(product(), 1, {}, {});
  await flush();
  const key = `${CART_KEY}:guest`;
  assert.ok(storage.writes.includes(key), `expected a write to ${key}, saw ${storage.writes.join(",")}`);
  assert.equal(storage.json(key).state.items.length, 1);
});

await check("signing in reads THAT account's basket and leaves memory empty while switching", async () => {
  const aKey = `${CART_KEY}:user-a`;
  const { mod, storage } = await freshCart({
    [aKey]: JSON.stringify({
      state: {
        items: [
          {
            id: "cart-1",
            product_id: "kept",
            quantity: 3,
            product: product({ id: "kept", title_english: "Account A line" }),
            selected_options: {},
            price_cny_snapshot: 70,
            price_usd_estimated: 10,
            exchange_rate: 7,
          },
        ],
      },
      version: 0,
    }),
  });
  await mod.setCartScope("user-a");
  await flush();
  assert.equal(mod.useCartStore.getState().items.length, 1, "A's own basket must come back");
  assert.equal(mod.useCartStore.getState().items[0].product_id, "kept");
  // The blank that happens mid-switch must never land in A's entry.
  assert.equal(storage.json(aKey).state.items.length, 1, "the frozen write is what protects the basket");
});

await check("signing out blanks memory WITHOUT overwriting the account's saved basket", async () => {
  const { mod, storage } = await freshCart();
  const aKey = `${CART_KEY}:user-a`;
  await mod.setCartScope("user-a");
  mod.useCartStore.getState().addItem(product(), 2, {}, {});
  await flush();
  assert.equal(storage.json(aKey).state.items.length, 1);
  await mod.setCartScope(null);
  await flush();
  assert.equal(mod.useCartStore.getState().items.length, 0, "the next person on this phone sees nothing");
  assert.equal(storage.json(aKey).state.items.length, 1, "and the owner still has their basket");
});

await check("the next account on the same device never sees the previous one's lines", async () => {
  const { mod, storage } = await freshCart();
  await mod.setCartScope("user-a");
  mod.useCartStore.getState().addItem(product({ id: "secret", title_english: "Account A only" }), 1, {}, {});
  await flush();
  await mod.setCartScope("user-b");
  await flush();
  assert.deepEqual(mod.useCartStore.getState().items, [], "B starts empty");
  assert.equal(storage.json(`${CART_KEY}:guest`), null);
  const bWrites = storage.writes.filter((k) => k === `${CART_KEY}:user-b`);
  assert.equal(bWrites.length, 0, "an empty B must not be persisted over anything");
});

await check("two switches in a row: the newest scope wins and writes resume", async () => {
  const { mod, storage } = await freshCart();
  const both = Promise.all([mod.setCartScope("user-c"), mod.setCartScope("user-d")]);
  await both;
  await flush();
  mod.useCartStore.getState().addItem(product(), 1, {}, {});
  await flush();
  assert.ok(
    storage.writes.includes(`${CART_KEY}:user-d`),
    `the freeze must be released by the newest switch; writes were ${storage.writes.join(",")}`
  );
  assert.ok(!storage.writes.includes(`${CART_KEY}:user-c`), "the superseded switch must not persist under its own key");
});

await check("the same scope twice is a no-op, so a re-render cannot blank the basket", async () => {
  const { mod } = await freshCart();
  await mod.setCartScope("user-a");
  mod.useCartStore.getState().addItem(product(), 1, {}, {});
  await mod.setCartScope("user-a");
  assert.equal(mod.useCartStore.getState().items.length, 1);
});

// ── 2. the three money numbers describe ONE moment ───────────────────────────
await check("a re-add restamps CNY, USD and the rate together (no max, no stale rate)", async () => {
  const { mod } = await freshCart();
  fxRate = 7;
  mod.useCartStore.getState().addItem(product({ price_cny_min: 70, price_cny_max: 70 }), 1, {}, { exchange_rate: 7 });
  mod.useCartStore.getState().addItem(product({ price_cny_min: 70, price_cny_max: 70 }), 1, {}, { exchange_rate: 10 });
  const line = mod.useCartStore.getState().items[0];
  assert.equal(line.quantity, 2, "quantity still just bumps");
  assert.equal(line.exchange_rate, 10, "the rate the customer was just shown");
  assert.equal(line.price_cny_snapshot, 70);
  assert.equal(line.price_usd_estimated, 7, "70 CNY at 10 — a price cut must not bill the old high figure");
});

await check("a re-add with no price at all keeps the whole old trio instead of mixing", async () => {
  const { mod } = await freshCart();
  fxRate = 7;
  mod.useCartStore.getState().addItem(product({ price_cny_min: 70, price_cny_max: 70 }), 1, {}, { exchange_rate: 7 });
  mod
    .useCartStore.getState()
    .addItem(product({ price_cny_min: 0, price_cny_max: 0, price_usd_estimated: 0 }), 1, {}, { exchange_rate: 99 });
  const line = mod.useCartStore.getState().items[0];
  assert.equal(line.exchange_rate, 7, "a priceless re-add is not a new capture");
  assert.equal(line.price_usd_estimated, 10);
  assert.equal(line.quantity, 2);
});

// ── 3. freight is quoted per method ──────────────────────────────────────────
let shipping;
await check("shipping.ts loads with the FX store stubbed", async () => {
  shipping = await import(pathToFileURL(shippingPath).href);
  assert.equal(typeof shipping.getShippingEstimates, "function");
});

await check("air and sea are different numbers for the same weight", async () => {
  fxRate = 7;
  const [air, sea] = shipping.getShippingEstimates(
    { weight_kg: 5, domestic_shipping_cny: 0, marketplace: "1688" },
    1
  );
  assert.equal(air.costUSD, 42.5, "max(5kg x 8.50, 15)");
  assert.equal(sea.costUSD, 25, "max(max(5,10) x 2.20, 25) — the minimum, not the air figure");
  assert.notEqual(air.costUSD, sea.costUSD);
});

await check("the two minimum charges still differ on a light parcel", async () => {
  const [air, sea] = shipping.getShippingEstimates(
    { weight_kg: 0.5, domestic_shipping_cny: 0, marketplace: "1688" },
    1
  );
  assert.equal(air.costUSD, 15);
  assert.equal(sea.costUSD, 25);
});

await check("the CNY figure follows the live rate, not a literal", async () => {
  fxRate = 8;
  const [air] = shipping.getShippingEstimates(
    { weight_kg: 5, domestic_shipping_cny: 0, marketplace: "1688" },
    1
  );
  assert.equal(air.costCNY, 340, "42.5 USD at 8 CNY/USD");
});

// ── 4. the call sites that make the above reachable ──────────────────────────
const checkoutText = read("app/cart/checkout.tsx");
const trackingText = read("app/orders/tracking.tsx");
const searchText = read("app/search/index.tsx");
const notifText = read("app/notifications/index.tsx");
const settingsText = read("app/notifications/settings.tsx");
const addressesText = read("app/profile/addresses.tsx");
const addAddressText = read("app/profile/add-address.tsx");
const boundaryText = read("src/components/ui/ErrorBoundary.tsx");
const dbText = read("src/db/index.ts");

await check("checkout quotes each freight card its own price", async () => {
  assert.match(checkoutText, /const shippingQuotes = useMemo\(/, "both methods must be computed per cart");
  assert.match(checkoutText, /shippingQuoteText\(shippingQuotes\.air\)/);
  assert.match(checkoutText, /shippingQuoteText\(shippingQuotes\.sea\)/);
  const airAt = checkoutText.indexOf("shippingQuotes.air");
  const seaAt = checkoutText.indexOf("shippingQuotes.sea");
  assert.ok(airAt !== seaAt, "one card per value, never the same variable twice");
});

await check("a failed order lookup is not drawn as a missing order", async () => {
  assert.match(dbText, /export interface OrderLookupState/, "getOrderById must be able to say it could not read");
  assert.match(dbText, /lookup\?: OrderLookupState/);
  assert.match(trackingText, /loadFailed/);
  assert.match(trackingText, /Try again/);
  assert.ok(!/catch[\s\S]{0,120}setNotFound\(true\)/.test(trackingText), "the catch must not render Not Found");
});

await check("list screens separate empty from unreadable", async () => {
  for (const [name, text] of [
    ["search", searchText],
    ["notifications", notifText],
    ["addresses", addressesText],
  ]) {
    assert.match(text, /const \[loadFailed, setLoadFailed\]/, `${name} needs a failed state distinct from empty`);
    // Set from the read's own verdict — `true` in the catch, or an expression
    // built from the read's failure flag / an online probe. A flag that is only
    // ever declared and set false is the dead code this gate exists to catch.
    const setFromFailure =
      /setLoadFailed\(\s*true\s*\)/.test(text) ||
      /setLoadFailed\([^)]*(?:failed|isBackendOnline)[^)]*\)/i.test(text);
    assert.ok(setFromFailure, `${name} must mark the flag FROM the failed read, not only declare it`);
    assert.match(text, /loadFailed \?|loadFailed &&/, `${name} must render it`);
    assert.match(text, /Try again|retryLabel|actionLabel|setReloadTick/, `${name} must give a way to retry`);
  }
  // Order matters: the failure branch must be tested BEFORE the empty one, or a
  // failed read still shows "No products found / adjust your search".
  assert.match(
    searchText,
    /loadFailed \? \([\s\S]{0,1600}\) : filteredProducts\.length === 0/,
    "search must draw the failed read, not the empty illustration"
  );
  assert.match(addAddressText, /if \(!res\.ok\)|!result\.ok|\.ok\b/, "a failed save must not alert Saved");
  assert.match(settingsText, /catch/, "a storage write that fails must roll the switch back");
});

await check("address writes report what the server did", async () => {
  assert.match(dbText, /export async function saveAddress[\s\S]{0,400}Promise<\{ ok: boolean/);
  assert.match(dbText, /export async function deleteAddress[\s\S]{0,400}Promise<\{ ok: boolean/);
  assert.match(dbText, /export interface AddressRead/);
});

await check("a screen crash lands on a boundary with a way back", async () => {
  assert.match(boundaryText, /onReset/);
  assert.match(boundaryText, /export function RouteErrorBoundary|export const RouteErrorBoundary/);
  for (const route of ["app/cart/index.tsx", "app/search/index.tsx", "app/orders/[id].tsx", "app/product/[id].tsx"]) {
    assert.match(read(route), /<RouteErrorBoundary>/, `${route} must render inside a boundary`);
  }
});

// ── report ────────────────────────────────────────────────────────────────────
rmSync(TMP, { recursive: true, force: true });
const failed = results.filter(([s]) => s === "FAIL");
for (const [status, name] of results) console.log(`  ${status === "ok" ? "ok  " : "FAIL"} ${name}`);
console.log(
  `\n${results.length - failed.length}/${results.length} cart, freight and honest-state behaviours verified against the real modules.`
);
console.log(
  `source sha256 cart=${createHash("sha256").update(cartOriginal).digest("hex").slice(0, 16)} shipping=${createHash(
    "sha256"
  )
    .update(shippingOriginal)
    .digest("hex")
    .slice(0, 16)}`
);
if (failed.length) process.exit(1);
