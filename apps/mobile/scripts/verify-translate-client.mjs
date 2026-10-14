/**
 * verify-translate-client.mjs — executable proof for the AI translation client.
 *
 * WHY THIS EXISTS: audit 2026-10-14 rewrote the app half of translation
 * (src/api/translate.ts): one batch per paid call, in-flight de-duplication, a
 * 9s time-box on a hung edge function, a release list so failed text is retried
 * instead of staying Chinese forever, and parking on 429/503 instead of
 * hammering a closed rate-limit window. `tsc` proves the types and `expo export`
 * proves it bundles. Neither proves any of that behaviour, and none of it can be
 * checked on a phone in reasonable time. So this file imports the REAL module
 * (Node type-stripping, no copy) against stubbed Supabase + storage, drives a
 * fake clock, and fails loudly if a behaviour regresses.
 *
 * Run from apps/mobile:  npm run verify:translate
 * No device, no network, no paid provider call. Non-zero exit on any failure.
 */

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const SRC = join(process.cwd(), "src", "api", "translate.ts");
const dir = mkdtempSync(join(tmpdir(), "cs-translate-verify-"));

// The module has exactly two imports, both environment boundaries. Rewriting
// only those two lines keeps every line of real logic under test intact.
const source = readFileSync(SRC, "utf8")
  .replace('import AsyncStorage from "@react-native-async-storage/async-storage";', "const AsyncStorage = globalThis.__storage;")
  .replace('import { supabase } from "@/lib/supabase";', "const supabase = globalThis.__supabase;");
assert.ok(!/from "@react-native-async-storage/.test(source), "AsyncStorage import stub failed");
assert.ok(!/from "@\/lib\/supabase"/.test(source), "supabase import stub failed");
const modulePath = join(dir, "translate.ts");
writeFileSync(modulePath, source);

// ── fake clock ────────────────────────────────────────────────────────────────
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
let now = 1_000_000;
let seq = 0;
let pending = [];
const schedule = (fn, ms = 0) => {
  const t = { fn, at: now + Math.max(0, ms | 0), id: ++seq, cancelled: false };
  pending.push(t);
  return t.id;
};
globalThis.setTimeout = schedule;
globalThis.clearTimeout = (id) => {
  const t = pending.find((x) => x.id === id);
  if (t) t.cancelled = true;
};
Date.now = () => now;

function yieldMicrotasks(rounds = 12) {
  let p = Promise.resolve();
  for (let i = 0; i < rounds; i++) p = p.then(() => realSetTimeout(() => {}, 0));
  return p;
}

/** Move the clock forward, firing due timers in chronological order. */
async function advance(ms) {
  // Let already-resolved promises run first. The module schedules its 9s timer
  // only after awaiting the AsyncStorage read, so jumping the clock before that
  // microtask turn would register the timer at (new now + 9000) — past every
  // later advance() — and the scenario would hang instead of proving anything.
  await yieldMicrotasks();
  const target = now + ms;
  let guard = 0;
  while (guard++ < 5000) {
    const due = pending.filter((t) => !t.cancelled && t.at <= target).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    pending = pending.filter((t) => t !== due);
    now = due.at;
    due.fn();
    await yieldMicrotasks();
  }
  now = target;
  await yieldMicrotasks();
}

// ── stubs ─────────────────────────────────────────────────────────────────────
function makeStubs(handler) {
  const calls = [];
  const storage = new Map();
  globalThis.__storage = {
    getItem: async (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: async (k, v) => {
      storage.set(k, v);
    },
    removeItem: async (k) => storage.delete(k),
  };
  globalThis.__supabase = {
    functions: {
      invoke: async (_name, opts) => {
        calls.push({ at: now, texts: opts.body.texts, lang: opts.body.target_lang });
        return handler(opts.body, calls.length);
      },
    },
  };
  return { calls, storage };
}

// A fresh module instance per scenario: cache, in-flight map and the rate-limit
// park are module state, and none of it must leak between tests.
let instance = 0;
async function freshTranslate(handler) {
  const stubs = makeStubs(handler);
  instance += 1;
  const mod = await import(pathToFileURL(modulePath).href + "?v=" + instance);
  return { mod, ...stubs };
}

const ok = (texts, lang) => ({
  data: { ok: true, results: texts.map((t) => ({ source: t, translated: `[${lang}] ${t}`, cached: false })) },
});

const results = [];
function dumpAndExit() {
  for (const [status, name] of results) {
    console.log(`${status === "PASS" ? "  ok  " : " FAIL "} ${name}`);
  }
  console.log("\nABORTED: a scenario stalled waiting on the fake clock.");
  process.exit(1);
}
async function check(name, fn) {
  if (process.env.CS_VERIFY_VERBOSE) console.error("running: " + name);
  // Watchdog: the fake clock means a stalled scenario awaits a timer that never
  // advances, which would otherwise hang the run with no output at all.
  const watchdog = realSetTimeout(() => {
    console.error("STALL in scenario: " + name);
    dumpAndExit();
  }, 20000);
  try {
    await fn();
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + " :: " + (e && (e.message || e))]);
  } finally {
    realClearTimeout(watchdog);
  }
}

// ── scenarios ─────────────────────────────────────────────────────────────────

await check("85 strings cost 3 paid calls, each at the server cap of 40", async () => {
  const texts = Array.from({ length: 85 }, (_, i) => "item " + i);
  const { mod, calls } = await freshTranslate((body) => ok(body.texts, body.target_lang));
  const out = await mod.translateTextsDetailed(texts, "so");
  assert.equal(calls.length, 3, `expected 3 calls, got ${calls.length}`);
  assert.deepEqual(calls.map((c) => c.texts.length), [40, 40, 5]);
  assert.equal(Object.keys(out.map).length, 85);
  assert.equal(out.failed.length, 0);
  assert.equal(calls[0].lang, "so");
});

await check("warm strings never hit the network again", async () => {
  const texts = ["alpha", "beta", "gamma"];
  const { mod, calls } = await freshTranslate((body) => ok(body.texts, body.target_lang));
  await mod.translateTextsDetailed(texts, "en");
  const before = calls.length;
  const second = await mod.translateTextsDetailed(texts, "en");
  assert.equal(calls.length, before, "a fully cached list still made a network call");
  assert.equal(second.map.alpha, "[en] alpha");
  assert.equal(second.failed.length, 0);
});

await check("a different language is a different cache entry", async () => {
  const { mod, calls } = await freshTranslate((body) => ok(body.texts, body.target_lang));
  await mod.translateTextsDetailed(["halo"], "en");
  await mod.translateTextsDetailed(["halo"], "so");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((c) => c.lang), ["en", "so"]);
});

await check("strings the server refuses (>2000 chars) are not sent at all", async () => {
  const long = "x".repeat(2001);
  const { mod, calls } = await freshTranslate((body) => ok(body.texts, body.target_lang));
  const out = await mod.translateTextsDetailed([long, "short"], "en");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].texts, ["short"]);
  assert.equal(out.map[long], long, "an over-length string must map to itself");
});

await check("duplicates and blanks collapse before the network", async () => {
  const { mod, calls } = await freshTranslate((body) => ok(body.texts, body.target_lang));
  await mod.translateTextsDetailed(["a", "a", " a ", "  ", "b"], "en");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].texts, ["a", "b"]);
});

await check("an empty list and a blank language cost nothing", async () => {
  const { mod, calls } = await freshTranslate(() => {
    throw new Error("must not be called");
  });
  const a = await mod.translateTextsDetailed([], "en");
  const b = await mod.translateTextsDetailed(["x"], "");
  assert.equal(calls.length, 0);
  assert.equal(a.map["x"], undefined);
  assert.equal(b.failed.length, 0, "a blank language must not be reported as a failure");
});

await check("two identical concurrent requests share one call", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const { mod, calls } = await freshTranslate(async (body) => {
    await gate;
    return ok(body.texts, body.target_lang);
  });
  const texts = ["dup1", "dup2"];
  const p1 = mod.translateTextsDetailed(texts, "en");
  const p2 = mod.translateTextsDetailed(texts, "en");
  await yieldMicrotasks();
  release();
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(calls.length, 1, `identical in-flight batches cost ${calls.length} calls`);
  assert.equal(r1.map.dup1, "[en] dup1");
  assert.equal(r2.map.dup1, "[en] dup1");
});

await check("a refused batch reports exactly its own strings as failed", async () => {
  const { mod, calls } = await freshTranslate(() => ({ data: null, error: { message: "FunctionsHttpError: 500" } }));
  const texts = ["one", "two"];
  const out = await mod.translateTextsDetailed(texts, "en");
  assert.equal(calls.length, 1);
  assert.deepEqual(out.failed.sort(), ["one", "two"]);
  assert.equal(out.map.one, "one", "failed text must map to the original so the UI still renders");
});

await check("a 429 parks the remaining batches instead of spending the window", async () => {
  const { mod, calls } = await freshTranslate((body, n) => {
    if (n === 1) return { data: null, error: { context: { response: { status: 429 } }, message: "rate limited" } };
    return ok(body.texts, body.target_lang);
  });
  const texts = Array.from({ length: 81 }, (_, i) => "t" + i); // 3 batches
  const p = mod.translateTextsDetailed(texts, "en");
  await yieldMicrotasks();
  assert.equal(calls.length, 1, "the second batch fired immediately after a 429");
  await advance(19_000);
  assert.equal(calls.length, 1, "batches resumed before the 20s park elapsed");
  await advance(2_000);
  const out = await p;
  assert.ok(calls.length >= 2, `after the park no batch resumed (calls=${calls.length})`);
  assert.equal(out.map.t80, "[en] t80", "text queued behind the park must still be translated");
});

await check("a retryable 503 parks briefly, not for a whole rate-limit window", async () => {
  const { mod, calls } = await freshTranslate((body, n) => {
    if (n === 1) return { data: null, error: { context: { response: { status: 503 } }, message: "service_unavailable" } };
    return ok(body.texts, body.target_lang);
  });
  const texts = Array.from({ length: 81 }, (_, i) => "u" + i);
  const p = mod.translateTextsDetailed(texts, "en");
  await yieldMicrotasks();
  await advance(7_000);
  assert.equal(calls.length, 1, "503 resumed too early");
  await advance(2_000);
  await p;
  assert.ok(calls.length >= 2, "the 8s transient park never released the queue");
});

await check("a hung edge function is abandoned at 9s and its text is released", async () => {
  const { mod, calls } = await freshTranslate((body, n) => {
    if (n === 1) return new Promise(() => {}); // never resolves
    return ok(body.texts, body.target_lang);
  });
  const texts = Array.from({ length: 41 }, (_, i) => "h" + i); // batch 1 hangs, batch 2 must still go
  const p = mod.translateTextsDetailed(texts, "en");
  await advance(8_000);
  assert.equal(calls.length, 1, "the hung batch was abandoned before the 9s time-box");
  const settled = await Promise.race([
    p.then(() => "done"),
    yieldMicrotasks().then(() => "pending"),
  ]);
  assert.equal(settled, "pending", "the loop resolved before the timeout fired");
  await advance(2_000);
  const out = await p;
  assert.equal(out.failed.length, 40, `expected the 40 hung strings released, got ${out.failed.length}`);
  assert.ok(out.failed.includes("h0") && out.failed.includes("h39"));
  assert.equal(out.map.h0, "h0", "a timed-out string must still map to its original text");
  assert.ok(!out.failed.includes("h40"), "the healthy second batch must not be marked failed");
  assert.equal(out.map.h40, "[en] h40");
});

await check("a malformed payload (no results array) counts as a failure", async () => {
  const { mod } = await freshTranslate(() => ({ data: { ok: false, error: "provider_down" }, error: null }));
  const out = await mod.translateTextsDetailed(["z"], "en");
  assert.deepEqual(out.failed, ["z"]);
  assert.equal(out.map.z, "z");
});

await check("translateTexts keeps its original map-only contract", async () => {
  const { mod } = await freshTranslate((body) => ok(body.texts, body.target_lang));
  const map = await mod.translateTexts(["k"], "en");
  assert.equal(map.k, "[en] k");
  assert.equal(map.missing, undefined);
});

// ── report ────────────────────────────────────────────────────────────────────
globalThis.setTimeout = realSetTimeout;
globalThis.clearTimeout = realClearTimeout;

let failed = 0;
for (const [status, name] of results) {
  if (status === "FAIL") failed++;
  console.log(`${status === "PASS" ? "  ok  " : " FAIL "} ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} translation-client behaviours verified against src/api/translate.ts.`);
process.exit(failed ? 1 : 0);
