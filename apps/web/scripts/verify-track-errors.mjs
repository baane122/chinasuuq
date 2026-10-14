/**
 * verify-track-errors.mjs — executable proof for the /track failure classifier.
 *
 * WHY THIS EXISTS: `/track` is public and it probes two possible column shapes
 * for an order, so "no row matched" and "the request never reached Postgres"
 * both arrive as a thrown/empty result. Until now the page treated them
 * identically, which means a customer with a paid, shipped order was told — in
 * their own language — that the order does not exist. That message sends them to
 * WhatsApp support; the correct message is "we could not connect, try again".
 *
 * The classifier is pure, so this file runs the REAL module and pins the
 * boundary: which supabase-js shapes count as transport, which count as a real
 * database answer, and that the page still routes through it instead of
 * re-growing a local copy.
 *
 * Run from apps/web:  npm run verify:track
 * No browser, no network. Non-zero exit on any failure.
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const LIB = join(process.cwd(), "src", "lib", "track", "errors.ts");
const PAGE = join(process.cwd(), "src", "app", "(public)", "track", "page.tsx");

const libText = readFileSync(LIB, "utf8");
const pageText = readFileSync(PAGE, "utf8");
const { isTransportError } = await import(pathToFileURL(LIB).href);

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

console.log("track: the request never got an answer (must NOT say 'not found')");

for (const [label, err] of [
  ["supabase-js TypeError", new TypeError("Failed to fetch")],
  ["fetch failed", { message: "fetch failed" }],
  ["RN network error", { message: "Network request failed" }],
  ["dns failure", { message: "getaddrinfo ENOTFOUND project.supabase.co" }],
  ["connection reset", { message: "read ECONNRESET" }],
  ["timeout", { message: "request timed out" }],
  ["abort", { name: "AbortError", message: "The operation was aborted" }],
  ["service unreachable", { message: "Service Unreachable" }],
]) {
  await check(`${label} is transport`, async () => {
    assert.equal(isTransportError(err), true);
  });
}

await check("an error object with no shape at all is treated as transport", async () => {
  // Bias matters: a false "try again" costs one tap, a false "does not exist"
  // costs a support ticket and a customer's confidence in the whole app.
  assert.equal(isTransportError({ message: "something went weird" }), true);
});

await check("engine-specific wordings are named, not rescued by the fallback", async () => {
  // Each of these carries a `code`, so the "no database answer" fallback CANNOT
  // classify it — only the pattern list above can. Safari says "Load failed",
  // iOS/React Native says "The network connection was lost.", undici says
  // "fetch failed". A real Postgres answer always has a SQL/PostgREST code, so
  // pairing a transport phrase with a code is the strictest test of the list.
  assert.equal(isTransportError({ message: "fetch failed", code: "systemError" }), true);
  assert.equal(isTransportError({ message: "Load failed", code: 23 }), true);
  assert.equal(
    isTransportError({ message: "The network connection was lost.", code: -1005 }),
    true
  );
});

console.log("track: Postgres DID answer (must be allowed to say 'not found')");

for (const [label, err] of [
  ["PGRST116 no rows", { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }],
  ["column does not exist", { code: "42703", message: 'column "reference" does not exist', hint: "Perhaps you meant orders.reference" }],
  ["permission denied by RLS", { code: "42501", message: "permission denied for view order_tracking_public" }],
  ["syntax error", { code: "42601", message: "syntax error at or near", details: "parse failed at position 12" }],
]) {
  await check(`${label} is NOT transport`, async () => {
    assert.equal(isTransportError(err), false);
  });
}

await check("no error at all is not transport", async () => {
  assert.equal(isTransportError(null), false);
  assert.equal(isTransportError(undefined), false);
  // A truthy-but-empty error object carries no database answer, so the
  // documented bias applies: it is treated as transport, not as "not found".
  assert.equal(isTransportError({}), true);
});

console.log("track/page.tsx: the fix stays wired");

await check("the page imports the classifier instead of re-growing a local copy", () => {
  assert.match(pageText, /import \{ isTransportError \} from "@\/lib\/track\/errors";/);
  assert.ok(
    !/function isTransportError/.test(pageText),
    "a second copy in the page would drift from the gated one"
  );
});

await check("unreachable is a distinct UI state from not-found", () => {
  assert.match(pageText, /const \[unreachable, setUnreachable\] = useState\(false\)/);
  assert.match(pageText, /setUnreachable\(true\)/);
  assert.ok(
    /!order && !searching && !notFound && !unreachable/.test(pageText),
    "the empty state must not render while the server is unreachable"
  );
  assert.match(pageText, /Try again/, "an unreachable page must offer the one action that helps");
});

await check("shape probing stops as soon as the network is the problem", () => {
  // Without this the page fires a second doomed query on the connection that
  // just failed, doubling the wait before the honest message appears.
  assert.match(
    pageText,
    /if \(row \|\| sawTransportFailure\) break|&& !sawTransportFailure/,
    "the second column-shape probe must be skipped on a transport failure"
  );
});

console.log("");
if (failures) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log(`${ran}/${ran} checks passed against src/lib/track/errors.ts.`);
console.log(`source sha256 ${createHash("sha256").update(libText).digest("hex").slice(0, 16)} (record this before any negative control)`);
