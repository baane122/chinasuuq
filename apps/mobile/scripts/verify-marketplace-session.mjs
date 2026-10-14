/**
 * verify-marketplace-session.mjs — executable proof for the shared-login
 * bridge that decides whether a marketplace page renders as staff or as a
 * logged-out stranger.
 *
 * WHY THIS EXISTS: audit 2026-10-14 found `getMarketplaceSession` awaiting the
 * RPC with no deadline of its own — bounded only by the client's 30s header.
 * Because `injectedJavaScriptBeforeContentLoaded` applies to the NEXT document,
 * a hung read on Somali mobile data did not delay the cookies, it lost them for
 * the navigation the customer actually waited on: 1688 rendered its login wall
 * in front of a staff member whose session was sitting in the database. The
 * same `return null` also reported a network failure as "No Session", which
 * tells staff to log in again over a read that simply failed.
 *
 * This file imports the REAL module (Node type-stripping; only its three
 * environment-boundary imports are stubbed) plus the two screens and the
 * capture form as text, and fails loudly if any of it regresses. Nothing here
 * needs a device, a network, or a paid call.
 *
 * Run from apps/mobile:  npm run verify:session
 */

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const ROOT = process.cwd();
const SRC = join(ROOT, "src", "lib", "supabase.ts");
const SCREEN = join(ROOT, "app", "marketplace", "[marketplace].tsx");
const FORM = join(ROOT, "src", "components", "marketplace", "SmartProductForm.tsx");
const CARD = join(ROOT, "src", "components", "staff", "StaffMarketplaceCard.tsx");

const original = readFileSync(SRC, "utf8");
// Exactly the three environment boundaries get replaced; every line of real
// logic stays the line that ships.
const source = original
  .replace('import { createClient } from "@supabase/supabase-js";', "const createClient = globalThis.__createClient;")
  .replace('import AsyncStorage from "@react-native-async-storage/async-storage";', "const AsyncStorage = globalThis.__storage;")
  .replace('import Constants from "expo-constants";', "const Constants = globalThis.__constants;");
for (const left of ["@supabase/supabase-js", "@react-native-async-storage", "expo-constants"]) {
  assert.ok(!source.includes(left), `stubbing the ${left} import failed`);
}
const dir = mkdtempSync(join(tmpdir(), "cs-session-verify-"));
const modulePath = join(dir, "supabase.ts");
writeFileSync(modulePath, source);

// ── stubs ─────────────────────────────────────────────────────────────────────
globalThis.__storage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};
globalThis.__constants = {
  expoConfig: { extra: { supabaseUrl: "https://stub.test", supabaseAnonKey: "stub-anon" } },
};

/**
 * One client per module instance. `state.rpc` is read at CALL time, so a
 * scenario can flip the same instance from healthy to failing — which is the
 * only way to test the cache, because the cache is module state.
 */
let instance = 0;
async function fresh(rpc) {
  const state = { rpc };
  const calls = [];
  globalThis.__createClient = () => ({
    rpc: (...args) => {
      calls.push(args);
      return state.rpc(...args);
    },
    functions: { invoke: async () => ({ data: { ok: true } }) },
  });
  instance += 1;
  const mod = await import(pathToFileURL(modulePath).href + "?v=" + instance);
  return { mod, calls, state };
}

const row = (marketplace, cookies, updated, health = "ok") => ({
  marketplace,
  cookies,
  cookies_updated_at: updated,
  health,
});
const FRESH = [row("1688", "cookie2=abc; _tb_token_=xyz", "2026-10-14T09:00:00Z")];
const healthy = (data) => async () => ({ data, error: null });

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(["ok", name]);
  } catch (e) {
    // assert.match dumps the whole file on failure; the reason is what a
    // engineer needs at a glance, so the message is clipped.
    const message = String(e?.message ?? e).split("\n")[0].slice(0, 240);
    results.push(["FAIL", `${name} — ${message}`]);
  }
}

// 1. the happy path still returns a usable session, from the right RPC
await check("a stored session is returned with its cookies and age", async () => {
  const { mod, calls } = await fresh(healthy(FRESH));
  const res = await mod.fetchMarketplaceSession("1688");
  assert.equal(res.failed, false);
  assert.equal(res.stale, false);
  assert.equal(res.session.cookies, "cookie2=abc; _tb_token_=xyz");
  assert.equal(res.session.cookiesUpdatedAt, "2026-10-14T09:00:00Z");
  assert.equal(res.session.health, "ok");
  assert.deepEqual(calls[0], ["get_marketplace_session", { p_marketplace: "1688" }]);
});

// 2. row selection: exact marketplace first, newest first
await check("the exact marketplace wins and the newest refresh beats older rows", async () => {
  const { mod } = await fresh(
    healthy([
      row("taobao", "t=other", "2026-01-01T00:00:00Z"),
      row("1688", "a=older", "2026-09-01T00:00:00Z"),
      row("1688", "a=newest", "2026-10-14T00:00:00Z"),
    ])
  );
  const res = await mod.fetchMarketplaceSession("1688");
  assert.equal(res.session.cookies, "a=newest");
});

// 3. guests and empty stores are an ANSWER, not a failure
await check("zero rows is reported as no session, not as a failed read", async () => {
  const { mod } = await fresh(healthy([]));
  const res = await mod.fetchMarketplaceSession("1688");
  assert.equal(res.session, null);
  assert.equal(res.failed, false);
  assert.equal(res.stale, false);
});

await check("a row with no cookies is no session, not a malformed success", async () => {
  const { mod } = await fresh(healthy([row("1688", "", "2026-10-14T09:00:00Z")]));
  const res = await mod.fetchMarketplaceSession("1688");
  assert.equal(res.session, null);
  assert.equal(res.failed, false);
});

// 4. the audit's principle: a failed read must not look like a missing login
await check("an RPC error is reported as failed, not as no session", async () => {
  const { mod } = await fresh(async () => ({ data: null, error: { message: "permission denied" } }));
  const res = await mod.fetchMarketplaceSession("1688");
  assert.equal(res.failed, true);
  assert.equal(res.stale, false);
  assert.equal(res.session, null);
  assert.match(res.error, /permission denied/);
});

await check("a thrown read is caught and reported as failed", async () => {
  const { mod } = await fresh(async () => {
    throw new Error("Network request failed");
  });
  const res = await mod.fetchMarketplaceSession("1688");
  assert.equal(res.failed, true);
  assert.equal(res.session, null);
});

// 5. the time-box — the fix itself
await check("a hung RPC is abandoned at the deadline instead of holding the screen", async () => {
  const { mod } = await fresh(() => new Promise(() => {}));
  const t0 = Date.now();
  const res = await mod.fetchMarketplaceSession("1688", 60);
  const waited = Date.now() - t0;
  assert.equal(res.failed, true);
  assert.match(res.error, /timed out after 60ms/);
  assert.ok(waited < 5000, `the deadline did not fire (waited ${waited}ms)`);
});

await check("the deadline never leaks its timer, so cleared or not the read still finishes", async () => {
  const { mod } = await fresh(healthy(FRESH));
  const res = await mod.fetchMarketplaceSession("1688", 30000);
  assert.equal(res.failed, false);
  assert.ok(/if \(timer\) clearTimeout\(timer\)/.test(original), "the raced sentinel must be cancelled");
});

await check("the shipped deadline is long enough for 3G and short enough to matter", async () => {
  const { mod } = await fresh(healthy(FRESH));
  assert.ok(
    mod.MARKETPLACE_SESSION_TIMEOUT_MS >= 2000,
    "below 2s a real read on mobile data becomes a login wall"
  );
  assert.ok(
    mod.MARKETPLACE_SESSION_TIMEOUT_MS <= 10000,
    "above 10s the cookies miss the navigation they were fetched for"
  );
});

// 6. a failed read keeps what this app run already had — and says so
await check("after a good read, a failed read serves the last-known session marked stale", async () => {
  const { mod, state } = await fresh(healthy(FRESH));
  await mod.fetchMarketplaceSession("1688");
  state.rpc = async () => {
    throw new Error("offline");
  };
  const res = await mod.fetchMarketplaceSession("1688");
  assert.equal(res.failed, true);
  assert.equal(res.stale, true);
  assert.equal(res.session.cookies, "cookie2=abc; _tb_token_=xyz");
});

await check("an authoritative no-session answer drops the cache; a failure does not", async () => {
  const { mod, state } = await fresh(healthy(FRESH));
  await mod.fetchMarketplaceSession("taobao");
  assert.ok(mod.peekMarketplaceSession("taobao"), "seeded by the first read");
  // A session a staff member deleted, or an RPC whose rows were revoked, must
  // not keep browsing the marketplace in memory for the rest of the app run.
  state.rpc = healthy([]);
  await mod.fetchMarketplaceSession("taobao");
  assert.equal(mod.peekMarketplaceSession("taobao"), null, "no session means no cached cookies");
  state.rpc = async () => ({ data: null, error: { message: "boom" } });
  await mod.fetchMarketplaceSession("taobao");
  assert.equal(mod.peekMarketplaceSession("taobao"), null, "a failed read must not resurrect a revoked session");
});

// 7. the synchronous seed the WebView needs before first paint
await check("peekMarketplaceSession hands the cached session to a repeat visit", async () => {
  const { mod } = await fresh(healthy(FRESH));
  assert.equal(mod.peekMarketplaceSession("1688"), null, "nothing is known before the first read");
  await mod.fetchMarketplaceSession("1688");
  assert.equal(mod.peekMarketplaceSession("1688").cookies, "cookie2=abc; _tb_token_=xyz");
  assert.equal(mod.peekMarketplaceSession("dollarstore"), null, "the cache is per marketplace");
});

// 8. cookies reach the document as assignments, nothing else
await check("cookieInjectScript emits one escaped document.cookie write per pair", async () => {
  const { mod } = await fresh(healthy(FRESH));
  const js = mod.cookieInjectScript("a=1; b=2 ; c=3");
  assert.equal((js.match(/document\.cookie=/g) || []).length, 3);
  assert.ok(js.startsWith("(function(){") && js.endsWith("true;"), "must be a self-contained IIFE returning true");
  assert.equal(mod.cookieInjectScript(""), "", "no cookies means no script, not an empty IIFE");
  assert.ok(js.includes('"a=1"'), "values are JSON-escaped, not interpolated raw");
});

// 9. the module cannot read credentials at all
await check("the session bridge touches no table, and its RPC carries no identity", async () => {
  // Comments name the tables this module is NOT allowed to read, so the rules
  // below run on the code with comment BLOCKS and whole-line comments removed.
  // Deliberately not stripping after code: `https://` literals would be cut.
  const code = original
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|--)/.test(line))
    .join("\n");
  assert.ok(!/\.from\(/.test(code), "src/lib/supabase.ts must not query tables directly");
  assert.ok(!/\.select\(/.test(code), "no column list belongs in this module");
  assert.ok(!/marketplace_accounts/.test(code), "accounts are the edge function's business, not the app's");
  const rpcCalls = code.match(/\.rpc\([\s\S]*?\)/g) ?? [];
  assert.ok(rpcCalls.length > 0, "the session RPC call disappeared");
  for (const call of rpcCalls) {
    assert.match(call, /p_marketplace/, `unexpected RPC payload: ${call}`);
    assert.ok(!/username|password|token/i.test(call), `the RPC payload must carry only the marketplace: ${call}`);
  }
});

// 10. call-site shapes that make the above reachable from the product
const screenText = readFileSync(SCREEN, "utf8");
const formText = readFileSync(FORM, "utf8");
const cardText = readFileSync(CARD, "utf8");

await check("the browser screen seeds its cookies from the cache, not from a round trip", async () => {
  assert.match(
    screenText,
    /useState\(\(\)\s*=>[\s\S]{0,500}peekMarketplaceSession\(/,
    "sessionCookieScript must be seeded at first render"
  );
});

await check("only an authoritative answer wipes an injected session", async () => {
  const guard = /else if \(!res\.failed\) \{/;
  assert.match(screenText, guard, "the screen must branch on whether the read actually failed");
  const at = screenText.search(guard);
  const window = screenText.slice(at, at + 900);
  assert.match(
    window,
    /setSessionCookieScript\(""\)/,
    "an authoritative no-session answer must clear the seeded cookies (within 900 chars of the branch)"
  );
  assert.ok(!screenText.includes("getMarketplaceSession("), "the screen must not use the null-on-failure helper");
});

await check("the capture form seeds per page, not per render", async () => {
  assert.match(screenText, /const localListing: CapturedListing = useMemo\(/, "localListing must be memoised");
  assert.match(formText, /const seedKey = listing \?/, "the form needs a page-level seed signature");
  assert.match(formText, /\}, \[seedKey\]\);/, "seeding must key on the signature");
  assert.ok(!/\}, \[listing\]\);/.test(formText), "keying on the object re-wipes qty, specs and price mid-typing");
});

await check("the staff card distinguishes unknown from no session", async () => {
  assert.ok(cardText.includes("fetchMarketplaceSession("));
  assert.match(cardText, /"Unknown"/);
  assert.match(cardText, /"Last known"/);
  assert.ok(!cardText.includes("getMarketplaceSession("), "a failed read must not render as No Session");
});

await check("the dead null-on-failure helper is gone, not left as a trap", async () => {
  assert.ok(!/export async function getMarketplaceSession/.test(original), "two ways to ask, one of them lying");
});

// ── report ────────────────────────────────────────────────────────────────────
const failed = results.filter(([s]) => s === "FAIL");
for (const [status, name] of results) {
  console.log(`  ${status === "ok" ? "ok  " : "FAIL"} ${name}`);
}
console.log(
  `\n${results.length - failed.length}/${results.length} marketplace-session behaviours verified against src/lib/supabase.ts.`
);
console.log(`source sha256 ${createHash("sha256").update(original).digest("hex").slice(0, 16)}`);
if (failed.length) process.exit(1);
