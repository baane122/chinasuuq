/**
 * verify-ai-client.mjs — executable proof for the browser AI client.
 *
 * WHY THIS EXISTS: the public quote assistant and the shipment concierge looked
 * broken to customers because `apps/web/src/lib/ai/client.ts` sent an `apikey`
 * header and NO Authorization header, while Supabase edge functions default to
 * `verify_jwt = on` — so the gateway answered 401 before `ai-chat` ran, and the
 * caller got a silent `null`. `tsc` proves the types and `next build` proves it
 * exports; neither proves the request that leaves the browser is the one the
 * gateway accepts, that a 429 is distinguishable from a dead server, or that the
 * conversation is never written to the console. This imports the REAL module
 * (Node type-stripping, with only its single `../supabase` import stubbed)
 * against a fake fetch, and fails loudly if any of that regresses.
 *
 * Run from apps/web:  npm run verify:ai
 * No browser, no network, no paid provider call. Non-zero exit on any failure.
 */

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const SRC = join(process.cwd(), "src", "lib", "ai", "client.ts");
const srcText = readFileSync(SRC, "utf8");
const dir = mkdtempSync(join(tmpdir(), "cs-ai-client-verify-"));
const MOD = join(dir, "client.ts");

// Exactly one import, one environment boundary. Rewriting that single line
// keeps every header, deadline and branch of the real module under test.
writeFileSync(MOD, srcText.replace('import { supabase } from "../supabase";', "const supabase = globalThis.__supabase;"));

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCIsInVzZXJfaWQiOiJ1LTEifQ.sig";
const ANON = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.anon";

// The stubbed import is evaluated when the module loads, so the object has to
// exist BEFORE the dynamic import below — replacing it later would leave the
// module holding `undefined`, every session read would throw into the anon
// fallback, and the signed-in check would pass for the wrong reason.
globalThis.__supabase = { auth: { getSession: async () => ({ data: { session: null } }) } };

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co/";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON;

const m = await import(pathToFileURL(MOD).href);

let failures = 0;
let ran = 0;
const check = async (name, fn) => {
  ran++;
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (e) {
    failures++;
    console.error(`FAIL  ${name}\n      ${e.message}`);
    process.exitCode = 1;
  }
};

/** Install a fake session + a scripted fetch; returns what the client sent. */
function harness({ session = undefined, respond, fetchImpl } = {}) {
  const sent = { calls: [], headers: [], body: null, url: null };
  globalThis.__supabase.auth.getSession = async () => {
    if (session instanceof Error) throw session;
    return { data: { session: session ?? null } };
  };
  globalThis.fetch = fetchImpl ?? (async (url, init) => {
    sent.calls.push(url);
    sent.url = url;
    sent.headers = init?.headers ?? {};
    sent.body = init?.body ? JSON.parse(init.body) : null;
    return respond(init);
  });
  return sent;
}

const json = (payload, status = 200) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
});

const okAnswer = (content) => json({ ok: true, content });

/** Capture console.warn lines so the failure taxonomy is observable. */
function captureWarnings(run) {
  const lines = [];
  const real = console.warn;
  console.warn = (...a) => lines.push(a.map(String).join(" "));
  return run()
    .then(
      () => lines,
      () => lines
    )
    .finally(() => {
      console.warn = real;
    });
}

const messages = [{ role: "user", content: "how long is sea freight to Mogadishu?" }];

console.log("ai client: the request the gateway actually accepts");

await check("a signed-in caller sends their JWT as Bearer, plus apikey, to functions/v1/ai-chat", async () => {
  const sent = harness({ session: { access_token: JWT }, respond: okAnswer("About 30 days.") });
  const out = await m.aiChat({ messages });
  assert.equal(out, "About 30 days.");
  assert.equal(sent.url, "https://project.supabase.co/functions/v1/ai-chat");
  assert.equal(sent.headers.Authorization, `Bearer ${JWT}`);
  assert.equal(sent.headers.apikey, ANON);
  assert.equal(sent.headers["Content-Type"], "application/json");
});

await check("a guest sends the anon key as Bearer — never an empty or missing header", async () => {
  const sent = harness({ respond: okAnswer("Hello!") });
  await m.aiChat({ messages });
  assert.equal(sent.headers.Authorization, `Bearer ${ANON}`, "no Authorization is what made the gateway 401");
});

await check("a broken session read still sends a usable Bearer", async () => {
  const sent = harness({ session: new Error("storage unavailable"), respond: okAnswer("Hi") });
  const out = await m.aiChat({ messages });
  assert.equal(out, "Hi");
  assert.equal(sent.headers.Authorization, `Bearer ${ANON}`);
});

await check("the body carries the conversation and the task, and only the options asked for", async () => {
  const sent = harness({ respond: okAnswer("x") });
  await m.aiChat({ messages });
  assert.deepEqual(sent.body.messages, messages);
  assert.equal(sent.body.task, "concierge");
  assert.ok(!("temperature" in sent.body), "temperature must be server-decided unless asked");
  assert.ok(!("max_tokens" in sent.body));

  const sent2 = harness({ respond: okAnswer("x") });
  await m.aiChat({ messages, temperature: 0.2, maxTokens: 300 });
  assert.equal(sent2.body.temperature, 0.2);
  assert.equal(sent2.body.max_tokens, 300);
});

console.log("ai client: every failure is a named reason, not a silence");

for (const [status, reason] of [
  [401, "unauthorized"],
  [403, "unauthorized"],
  [429, "rate_limited"],
  [500, "server"],
  [503, "server"],
]) {
  await check(`HTTP ${status} is reported as ${reason}`, async () => {
    harness({ respond: json({ error: "no" }, status) });
    const warnings = await captureWarnings(async () => {
      assert.equal(await m.aiChat({ messages }), null);
    });
    assert.match(warnings.join("\n"), new RegExp(`\\[ai-chat\\] no answer: ${reason}`));
  });
}

await check("a 200 with ok:false is a server failure, not an empty answer", async () => {
  const warnings = await captureWarnings(async () => {
    harness({ respond: json({ ok: false, error: "provider down" }) });
    assert.equal(await m.aiChat({ messages }), null);
  });
  assert.match(warnings.join("\n"), /no answer: server/);
});

await check("an empty or whitespace answer is reported as empty", async () => {
  const warnings = await captureWarnings(async () => {
    harness({ respond: okAnswer("   ") });
    assert.equal(await m.aiChat({ messages }), null);
  });
  assert.match(warnings.join("\n"), /no answer: empty/);
});

await check("a hung function is cut off at the deadline and labelled timeout", async () => {
  harness({
    fetchImpl: async (url, init) =>
      new Promise((_, reject) => {
        init.signal.addEventListener("abort", () => {
          const e = new Error("The operation was aborted");
          e.name = "AbortError";
          reject(e);
        });
      }),
  });
  const warnings = await captureWarnings(async () => {
    assert.equal(await m.aiChat({ messages, timeoutMs: 10 }), null);
  });
  assert.match(warnings.join("\n"), /no answer: timeout/);
});

await check("a network TypeError is labelled offline, so the UI can say check your connection", async () => {
  harness({
    fetchImpl: async () => {
      throw new TypeError("Failed to fetch");
    },
  });
  const warnings = await captureWarnings(async () => {
    assert.equal(await m.aiChat({ messages }), null);
  });
  assert.match(warnings.join("\n"), /no answer: offline/);
});

await check("a build without the public env pair says not_configured and sends nothing", async () => {
  const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const savedKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let calls = 0;
  harness({ fetchImpl: async () => { calls++; return { ok: true, status: 200, json: async () => ({}) }; } });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
  try {
    const warnings = await captureWarnings(async () => {
      assert.equal(await m.aiChat({ messages }), null);
    });
    assert.match(warnings.join("\n"), /not_configured/);
    assert.equal(calls, 0, "must not spend a request on a build that cannot be authorised");
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = savedKey;
  }
});

await check("the customer's conversation is never written to the console", async () => {
  const secret = "my address is Hodan zone, phone +252-611-000-111";
  const warnings = await captureWarnings(async () => {
    harness({ respond: json({ error: "quota" }, 500) });
    await m.aiChat({ messages: [{ role: "user", content: secret }] });
  });
  assert.ok(!warnings.join("\n").includes(secret), "PII leaked into a log line");
  assert.ok(warnings.length > 0, "the failure should still be diagnosable");
});

console.log("ai client: response parsing");

await check("extractJson reads fenced JSON past prose and returns null on junk", () => {
  assert.deepEqual(m.extractJson('Here you go:\n```json\n{"total": 12}\n```\nThanks!'), { total: 12 });
  assert.deepEqual(m.extractJson('prefix [1,2,3] suffix'), [1, 2, 3]);
  assert.equal(m.extractJson("no structure here"), null);
  assert.equal(m.extractJson(""), null);
  assert.equal(m.extractJson("{ broken"), null);
});

console.log("");
if (failures) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log(`${ran}/${ran} checks passed against src/lib/ai/client.ts.`);
console.log(`source sha256 ${createHash("sha256").update(srcText).digest("hex").slice(0, 16)} (record this before any negative control)`);
