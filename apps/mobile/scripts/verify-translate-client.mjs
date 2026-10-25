/**
 * verify-translate-client.mjs — executable proof for the translation client.
 *
 * WHAT THIS NOW COVERS: src/api/translate.ts resolves translation through
 * Google's free `gtx` endpoint (the owner's decision — the paid ai-translate
 * edge function is out of the mobile path). The behaviours that made this gate
 * exist are still the behaviours under test — batching at the cap, a warm cache
 * costing zero calls, a time-box on a hung request, parking instead of hammering
 * a closed rate-limit window, in-flight de-duplication, and a failed batch
 * mapping to its originals instead of rendering blank — plus the new ones: the
 * language-code mapping, the so -> en degradation, the split-retry when a batch
 * does not come back 1:1, and the circuit breaker that stops asking for the rest
 * of the session once the endpoint proves unreachable.
 *
 * `tsc` proves the types and `expo export` proves it bundles. Neither proves any
 * of that, and none of it can be checked on a phone in reasonable time. So this
 * file imports the REAL module (Node type-stripping, no copy) against a stubbed
 * fetch + storage, drives a fake clock, and fails loudly if a behaviour regresses.
 *
 * ── NO NETWORK ─────────────────────────────────────────────────────────────────
 * fetch() is stubbed on globalThis BEFORE the module is imported and every call
 * is validated against the gtx endpoint allowlist, so a real request cannot leak
 * out of this run: an unexpected host/path throws, and the 4 real `*.google.com`
 * connection failures on the machine this gate was written on are exactly the
 * bug this stub exists to catch (without it the scenarios stall on live sockets).
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
const rawSource = readFileSync(SRC, "utf8");

// ── the paid path must be GONE from the client, not merely bypassed ────────────
// An import that still hands translation to supabase.functions.invoke would keep
// paying for every string the free endpoint already answers. Prose may still
// name the old function (this file explains why it went), so the check is on the
// call sites, not the words.
assert.ok(!/from\s+"@\/lib\/supabase"/.test(rawSource), "translate.ts still imports supabase");
assert.ok(!/functions\s*\.\s*invoke|\binvoke\(/.test(rawSource), "translate.ts still invokes an edge function");
assert.ok(!/["']ai-translate["']/.test(rawSource), "translate.ts still names the paid function as a call target");
assert.ok(!/supabase/i.test(rawSource.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")), "supabase survives outside comments");
assert.ok(/translate\.googleapis\.com\/translate_a\/single/.test(rawSource), "translate.ts no longer uses the gtx endpoint");
assert.ok(!/[?&]key=|AIza[0-9A-Za-z_-]{4,}|sk-[A-Za-z0-9]{8,}/.test(rawSource), "translate.ts carries an API key");

// The module's only environment boundary is AsyncStorage; fetch is stubbed on
// globalThis. If a second import appears, this harness must be taught to stub it
// rather than importing app code (and live network) into Node.
assert.deepEqual(
  rawSource.split("\n").filter((line) => /^import /.test(line)).map((l) => l.trim()),
  ['import AsyncStorage from "@react-native-async-storage/async-storage";'],
  "src/api/translate.ts gained or changed an import — update this harness to stub it"
);
const source = rawSource.replace(
  'import AsyncStorage from "@react-native-async-storage/async-storage";',
  "const AsyncStorage = globalThis.__storage;"
);
assert.ok(!/from "@react-native-async-storage/.test(source), "AsyncStorage import stub failed");
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
  // Let already-resolved promises run first. The module schedules its socket cap
  // only after awaiting the AsyncStorage read, so jumping the clock before that
  // microtask turn would register the timer at (new now + 6000) — past every
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
const ALLOWED_HOST = "https://translate.googleapis.com";
const ALLOWED_PATH = "/translate_a/single";

// Belt for the "no network" claim in the header: Node has a real fetch, so any
// call made before a scenario installed its stub is a bug, not a test.
globalThis.fetch = async () => {
  throw new Error("fetch was called before the harness installed its stub");
};

/**
 * gtx's documented response: data[0] is a list of
 * [translatedChunk, originalChunk, matchedTranslation, errorLevel, probability]
 * rows whose first fields concatenate into the whole translation. The default
 * shape prints the batch delimiter as a segment of its own, which is the case
 * the client must split back into one answer per sent string.
 */
function gtxBody(texts, lang, shape = "segment-delimiter") {
  const segments = [];
  texts.forEach((text, i) => {
    const translated = `[${lang}] ${text}`;
    const last = i === texts.length - 1;
    if (shape === "segment-delimiter") {
      segments.push([translated, text]);
      if (!last) segments.push(["\n", "\n"]);
    } else if (shape === "inline-delimiter") {
      // Google folds the newline into the end of the item's own row.
      segments.push([last ? translated : translated + "\n", last ? text : text + "\n"]);
    } else if (shape === "source-side-only") {
      // The newline survives only on the source side: splitting the translation
      // alone is impossible, the segment walk has to align on the original text.
      segments.push([translated, last ? text : text + "\n"]);
    } else if (shape === "passthrough") {
      // The endpoint declines the language and returns the input unchanged.
      segments.push([text, text]);
      if (!last) segments.push(["\n", "\n"]);
    } else {
      throw new Error("unknown gtx shape: " + shape);
    }
  });
  return [segments, null, "zh-CN", null, null];
}

const jsonResponse = (payload, status = 200) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => payload,
});

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
  globalThis.fetch = async (rawUrl, init) => {
    const url = new URL(String(rawUrl));
    // A real socket here is the bug this stub exists to prevent.
    if (url.origin !== ALLOWED_HOST || url.pathname !== ALLOWED_PATH) {
      throw new Error(`translate.ts left the gtx endpoint: ${String(rawUrl)}`);
    }
    if (url.searchParams.get("client") !== "gtx") throw new Error("gtx client parameter missing");
    for (const [name, value] of url.searchParams.entries()) {
      if (/key|token|secret|auth/i.test(name)) throw new Error(`credential parameter on the wire: ${name}`);
      if (/sk-[A-Za-z0-9]{8,}|AIza[0-9A-Za-z_-]{4,}/.test(value)) throw new Error("API key in the query");
    }
    const texts = String(url.searchParams.get("q") ?? "").split("\n");
    const lang = url.searchParams.get("tl");
    calls.push({ at: now, texts, lang, sl: url.searchParams.get("sl"), chars: texts.join("\n").length });

    const reply = handler({ texts, lang, calls: calls.length }, calls.length);
    if (reply === "hang") {
      // A socket that never answers AND ignores the abort signal: only the
      // module's own time-box can get the caller out of this.
      return new Promise(() => {});
    }
    if (reply === "hang-until-abort") {
      // The honest network model: fetch rejects with AbortError when the signal
      // fires, which is how the per-request socket cap actually behaves.
      return new Promise((resolve, reject) => {
        const signal = init && init.signal;
        if (!signal) return resolve(jsonResponse(gtxBody(texts, lang)));
        signal.onabort = () => {
          const error = new Error("The operation was aborted");
          error.name = "AbortError";
          reject(error);
        };
      });
    }
    return reply;
  };
  return { calls, storage };
}

// A fresh module instance per scenario: cache, in-flight map, the rate-limit park
// and the circuit breaker are module state, and none of it must leak between
// tests.
let instance = 0;
async function freshTranslate(handler) {
  const stubs = makeStubs(handler);
  instance += 1;
  const mod = await import(pathToFileURL(modulePath).href + "?v=" + instance);
  return { mod, ...stubs };
}

const ok = (texts, lang) => jsonResponse(gtxBody(texts, lang));
const httpError = (status) => ({ status, ok: false, json: async () => ({}) });

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

await check("85 strings cost 3 requests, each at the cap of 40", async () => {
  const texts = Array.from({ length: 85 }, (_, i) => "item " + i);
  const { mod, calls } = await freshTranslate(({ texts: t, lang }) => ok(t, lang));
  const out = await mod.translateTextsDetailed(texts, "so");
  assert.equal(calls.length, 3, `expected 3 requests, got ${calls.length}`);
  assert.deepEqual(calls.map((c) => c.texts.length), [40, 40, 5]);
  assert.equal(Object.keys(out.map).length, 85);
  assert.equal(out.failed.length, 0);
  assert.equal(calls[0].lang, "so");
});

await check("a batch is also cut by bytes, because gtx is a GET", async () => {
  // 40 x 2000 chars would be an ~80 KB query line the endpoint refuses.
  const texts = Array.from({ length: 20 }, (_, i) => "行".repeat(1500) + i);
  const { mod, calls } = await freshTranslate(({ texts: t, lang }) => ok(t, lang));
  const out = await mod.translateTextsDetailed(texts, "en");
  assert.ok(calls.length > 1, `a ${texts.length}-string batch went out as one URL`);
  for (const call of calls) {
    assert.ok(call.texts.length <= 40, `a request carried ${call.texts.length} strings`);
    assert.ok(call.chars < 8000, `a request URL carried ${call.chars} chars`);
  }
  assert.equal(out.failed.length, 0, "every byte-capped batch must still be served");
});

await check("warm strings never hit the network again", async () => {
  const texts = ["alpha", "beta", "gamma"];
  const { mod, calls } = await freshTranslate(({ texts: t, lang }) => ok(t, lang));
  await mod.translateTextsDetailed(texts, "en");
  const before = calls.length;
  const second = await mod.translateTextsDetailed(texts, "en");
  assert.equal(calls.length, before, "a fully cached list still made a network call");
  assert.equal(second.map.alpha, "[en] alpha");
  assert.equal(second.failed.length, 0);
});

await check("a different language is a different cache entry", async () => {
  const { mod, calls } = await freshTranslate(({ texts: t, lang }) => ok(t, lang));
  await mod.translateTextsDetailed(["halo"], "en");
  await mod.translateTextsDetailed(["halo"], "so");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((c) => c.lang), ["en", "so"]);
});

await check("app language codes map to Google's (so stays so, zh becomes zh-CN)", async () => {
  const seen = [];
  const { mod } = await freshTranslate(({ texts, lang }) => {
    seen.push(lang);
    return ok(texts, lang);
  });
  await mod.translateTextsDetailed(["测试商品"], "so");
  await mod.translateTextsDetailed(["测试商品"], "en");
  await mod.translateTextsDetailed(["test item"], "zh");
  await mod.translateTextsDetailed(["测试商品"], "sw");
  assert.deepEqual(seen, ["so", "en", "zh-CN", "sw"], "Google's codes are not the app's codes");
});

await check("a declined Somali degrades to English, not to nothing", async () => {
  const { mod, calls } = await freshTranslate(({ texts, lang }) => {
    // Google hands the Chinese back for `so` (an identity answer is not an
    // answer) and translates normally for `en`.
    if (lang === "so") return jsonResponse(gtxBody(texts, lang, "passthrough"));
    return ok(texts, lang);
  });
  const out = await mod.translateTextsDetailed(["全新上市", "工厂直销"], "so");
  assert.ok(calls.some((c) => c.lang === "en"), "the so pass never fell back to English");
  assert.equal(out.map["全新上市"], "[en] 全新上市", "a declined Somali must render as English");
  assert.equal(out.map["工厂直销"], "[en] 工厂直销");
  assert.equal(out.failed.length, 0, "a degraded answer must not be reported as a failure");
});

await check("a degraded Somali answer is cached under Somali, so it costs nothing twice", async () => {
  let soRequests = 0;
  const { mod, calls } = await freshTranslate(({ texts, lang }) => {
    if (lang === "so") {
      soRequests++;
      return jsonResponse(gtxBody(texts, lang, "passthrough"));
    }
    return ok(texts, lang);
  });
  await mod.translateTextsDetailed(["海运双清"], "so");
  const requestsBefore = calls.length;
  const again = await mod.translateTextsDetailed(["海运双清"], "so");
  assert.equal(calls.length, requestsBefore, "the degraded answer was not remembered");
  assert.equal(again.map["海运双清"], "[en] 海运双清");
  assert.equal(soRequests, 1, "the declined Somali was asked again after being answered");
});

await check("every delimiter shape the endpoint prints comes back one-per-string", async () => {
  for (const shape of ["segment-delimiter", "inline-delimiter", "source-side-only"]) {
    const { mod, calls } = await freshTranslate(({ texts, lang }) =>
      jsonResponse(gtxBody(texts, lang, shape))
    );
    const texts5 = Array.from({ length: 5 }, (_, i) => "商品" + i);
    const out = await mod.translateTextsDetailed(texts5, "en");
    assert.equal(calls.length, 1, `${shape}: the batch was split even though it parsed`);
    assert.equal(out.failed.length, 0, `${shape}: strings were reported failed`);
    for (const text of texts5) {
      assert.equal(out.map[text], `[en] ${text}`, `${shape}: ${text} came back misaligned`);
    }
  }
});

await check("a batch that does not split 1:1 is retried in bounded chunks", async () => {
  // The pathological response: the delimiter vanished from BOTH sides, which is
  // what a control-character joiner would hit. Guessing a split would put one
  // product's title on another product's row, so the client must retry instead.
  const { mod, calls } = await freshTranslate(({ texts, lang }) => {
    const merged = [[texts.map((t) => `[${lang}] ${t}`).join(" | "), texts.join("")]];
    return jsonResponse([merged, null, "zh-CN"]);
  });
  const texts4 = ["测试一", "测试二", "测试三", "测试四"];
  const out = await mod.translateTextsDetailed(texts4, "en");
  assert.ok(calls.length >= 2, "an unparseable batch was accepted as an answer");
  assert.ok(calls.length <= 6, `the split-retry was not bounded (${calls.length} requests)`);
  for (const text of texts4) {
    assert.ok(String(out.map[text]).includes(text), `${text} lost its translation: ${out.map[text]}`);
  }
  assert.equal(out.failed.length, 0, `texts still reported failed after a converging retry`);
});

await check("strings longer than 2000 chars are not sent at all", async () => {
  const long = "x".repeat(2001);
  const { mod, calls } = await freshTranslate(({ texts, lang }) => ok(texts, lang));
  const out = await mod.translateTextsDetailed([long, "short"], "en");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].texts, ["short"]);
  assert.equal(out.map[long], long, "an over-length string must map to itself");
  assert.equal(out.failed.length, 0, "a string we deliberately skip is not a failure");
});

await check("duplicates and blanks collapse before the network", async () => {
  const { mod, calls } = await freshTranslate(({ texts, lang }) => ok(texts, lang));
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
  const { mod, calls } = await freshTranslate(async ({ texts, lang }) => {
    await gate;
    return ok(texts, lang);
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
  const { mod, calls } = await freshTranslate(() => httpError(500));
  const texts = ["one", "two"];
  const out = await mod.translateTextsDetailed(texts, "en");
  assert.equal(calls.length, 1);
  assert.deepEqual(out.failed.sort(), ["one", "two"]);
  assert.equal(out.map.one, "one", "failed text must map to the original so the UI still renders");
});

await check("a thrown fetch (blocked network) fails the batch, it never throws", async () => {
  const { mod, calls } = await freshTranslate(() => {
    throw new TypeError("Network request failed");
  });
  const out = await mod.translateTextsDetailed(["a", "b"], "en");
  assert.equal(calls.length, 1);
  assert.deepEqual(out.failed.sort(), ["a", "b"]);
  assert.equal(out.map.a, "a");
});

await check("a malformed payload (no segment array) counts as a failure", async () => {
  const { mod } = await freshTranslate(() => jsonResponse({ error: "provider_down" }));
  const out = await mod.translateTextsDetailed(["z"], "en");
  assert.deepEqual(out.failed, ["z"]);
  assert.equal(out.map.z, "z");
});

await check("translateTexts keeps its original map-only contract", async () => {
  const { mod } = await freshTranslate(({ texts, lang }) => ok(texts, lang));
  const map = await mod.translateTexts(["k"], "en");
  assert.equal(map.k, "[en] k");
  assert.equal(map.missing, undefined);
});

await check("a 429 is retried once, then parks the queue for 20s", async () => {
  const { mod, calls } = await freshTranslate(({ texts, lang }, n) => {
    if (n === 1) return httpError(429);
    return ok(texts, lang);
  });
  const texts = Array.from({ length: 81 }, (_, i) => "t" + i); // 3 batches
  const p = mod.translateTextsDetailed(texts, "en");
  await yieldMicrotasks();
  assert.equal(calls.length, 1, "the 429 retry did not wait for its backoff");
  await advance(2_000);
  assert.equal(calls.length, 2, `the bounded 429 retry never ran (calls=${calls.length})`);
  // The 20s park set by the 429 protects the REST of the queue: batch 2 must
  // not go out before the window opens.
  await advance(17_000);
  assert.equal(calls.length, 2, "later batches resumed before the 20s park elapsed");
  await advance(3_000);
  const out = await p;
  assert.ok(calls.length >= 3, `after the park no batch resumed (calls=${calls.length})`);
  assert.equal(out.map.t80, "[en] t80", "text queued behind the park must still be translated");
});

await check("a second 429 gives up for this batch instead of hammering", async () => {
  const { mod, calls } = await freshTranslate(() => httpError(429));
  const texts = Array.from({ length: 41 }, (_, i) => "r" + i);
  const p = mod.translateTextsDetailed(texts, "en");
  await advance(60_000);
  const out = await p;
  // 1 attempt + 1 retry for batch 1, then the park releases and batch 2 pays
  // its own 1 + 1. Never more than MAX_429_RETRIES+1 per batch.
  assert.equal(calls.length, 4, `429 retries were not bounded (calls=${calls.length})`);
  assert.equal(out.failed.length, 41);
  assert.equal(out.map.r40, "r40", "a rate-limited string must still render as its original");
});

await check("a retryable 503 parks briefly, not for a whole rate-limit window", async () => {
  const { mod, calls } = await freshTranslate(({ texts, lang }, n) => {
    if (n === 1) return httpError(503);
    return ok(texts, lang);
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

await check("a hung socket is cut by the 6s cap and the next batch still goes", async () => {
  const { mod, calls } = await freshTranslate(({ texts, lang }, n) =>
    n === 1 ? "hang-until-abort" : ok(texts, lang)
  );
  const texts = Array.from({ length: 41 }, (_, i) => "s" + i); // batch 1 hangs
  const p = mod.translateTextsDetailed(texts, "en");
  await advance(5_000);
  const settled = await Promise.race([
    p.then(() => "done"),
    yieldMicrotasks().then(() => "pending"),
  ]);
  assert.equal(settled, "pending", "the batch resolved before the socket cap");
  await advance(2_000);
  const out = await p;
  assert.equal(out.failed.length, 40, `expected the 40 hung strings released, got ${out.failed.length}`);
  assert.ok(out.failed.includes("s0") && out.failed.includes("s39"));
  assert.equal(out.map.s0, "s0", "a timed-out string must still map to its original text");
  assert.ok(!out.failed.includes("s40"), "the healthy second batch must not be marked failed");
  assert.equal(out.map.s40, "[en] s40");
});

await check("a request that ignores the abort is still abandoned at 9s", async () => {
  const { mod, calls } = await freshTranslate(({ texts, lang }, n) =>
    n === 1 ? "hang" : ok(texts, lang)
  );
  const texts = Array.from({ length: 41 }, (_, i) => "h" + i);
  const p = mod.translateTextsDetailed(texts, "en");
  await advance(8_000);
  const settled = await Promise.race([
    p.then(() => "done"),
    yieldMicrotasks().then(() => "pending"),
  ]);
  assert.equal(settled, "pending", "the loop resolved before the 9s time-box fired");
  await advance(2_000);
  const out = await p;
  assert.equal(out.failed.length, 40, `expected the 9s box to release 40 strings, got ${out.failed.length}`);
  assert.equal(out.map.h40, "[en] h40", "the queue must resume after an abandoned batch");
  assert.ok(calls.length >= 2, "no batch went out after the abandoned one");
});

await check("the circuit breaker stops translation for the rest of the session", async () => {
  const { mod, calls } = await freshTranslate(() => {
    throw new TypeError("Network request failed");
  });
  const texts = Array.from({ length: 161 }, (_, i) => "b" + i); // 5 batches
  const out = await mod.translateTextsDetailed(texts, "en");
  assert.equal(calls.length, 3, `the breaker did not trip after 3 failures (calls=${calls.length})`);
  assert.equal(typeof mod.isTranslationDisabled, "function", "isTranslationDisabled is not exported");
  assert.equal(mod.isTranslationDisabled(), true, "the breaker stayed closed");
  assert.equal(out.failed.length, 161, "a blocked endpoint must still account for every string");
  assert.equal(out.map.b0, "b0", "text must map to its original, never to blank");
  const before = calls.length;
  const second = await mod.translateTextsDetailed(["late", "strings"], "en");
  assert.equal(calls.length, before, "translation kept hammering a blocked endpoint");
  assert.deepEqual(second.failed.sort(), ["late", "strings"]);
  assert.equal(second.map.late, "late", "a tripped breaker still renders the original text");
});

await check("a success clears the failure streak (no breaker on a flaky network)", async () => {
  const { mod, calls } = await freshTranslate(({ texts, lang }, n) => {
    if (n % 2 === 1) throw new TypeError("Network request failed");
    return ok(texts, lang);
  });
  const texts = Array.from({ length: 160 }, (_, i) => "f" + i); // 4 batches, alternating
  const out = await mod.translateTextsDetailed(texts, "en");
  assert.equal(mod.isTranslationDisabled(), false, "intermittent failures must not open the breaker");
  assert.equal(calls.length, 4, `the loop stopped early (calls=${calls.length})`);
  assert.equal(out.map.f159, "[en] f159", "the batch after a failure streak of 1 must still be served");
  assert.equal(out.failed.length, 80, "only the two refused batches may be failed");
});

await check("a quota refusal (429) parks but never opens the breaker", async () => {
  const { mod } = await freshTranslate(() => httpError(429));
  const p = mod.translateTextsDetailed(["q1", "q2"], "en");
  await advance(60_000);
  const out = await p;
  assert.equal(mod.isTranslationDisabled(), false, "rate limiting is not unreachability");
  assert.deepEqual(out.failed.sort(), ["q1", "q2"]);
});

await check("the AsyncStorage mirror survives a reload and never re-requests", async () => {
  const handler = ({ texts, lang }) => ok(texts, lang);
  const first = await freshTranslate(handler);
  await first.mod.translateTextsDetailed(["持久缓存"], "en");
  const persisted = first.storage.get("chinasuuq-translate-cache");
  assert.ok(persisted && persisted.includes("持久缓存"), "the answer was not persisted");
  assert.ok(!/sk-|AIza/.test(persisted), "a credential landed in the persisted cache");

  // Same storage, brand-new module: the warm string must cost zero requests.
  const second = await freshTranslate(handler);
  second.storage.set("chinasuuq-translate-cache", persisted);
  const out = await second.mod.translateTextsDetailed(["持久缓存"], "en");
  assert.equal(second.calls.length, 0, "a persisted translation was re-requested");
  assert.equal(out.map["持久缓存"], "[en] 持久缓存");
});

// ── report ────────────────────────────────────────────────────────────────────
globalThis.setTimeout = realSetTimeout;
globalThis.clearTimeout = realClearTimeout;

let failed = 0;
for (const [status, name] of results) {
  if (status === "FAIL") failed++;
  console.log(`${status === "PASS" ? "  ok  " : " FAIL "} ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} translation-client behaviours verified against src/api/translate.ts (fetch stubbed: no device, no network, no paid provider call).`);
process.exit(failed ? 1 : 0);
