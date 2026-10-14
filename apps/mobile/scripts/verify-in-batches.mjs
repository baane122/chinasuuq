/**
 * verify-in-batches.mjs — executable proof for bounded `.in()` reads on mobile.
 *
 * WHY THIS EXISTS: PostgREST puts `.in(col, values)` into the GET request line,
 * so a variable-length uuid list is a variable-length URL. Order history pulls
 * `order_items` for up to 200 orders at once (~7.4 KB of request line) — right
 * at the 8 KB ceiling gateways usually enforce, where the server answers 400
 * before touching Postgres and the screen shows paid orders with no line items.
 * The web Shipments screen already hit exactly this and lost every join.
 *
 * `tsc` proves the types and `expo export` proves it bundles. Neither proves
 * that a batch failure keeps the other batches, that concurrency stays bounded,
 * or that a call site has not slipped back to one giant `.in()`. This file runs
 * the REAL module (Node type-stripping, no copy) against a fake query function,
 * then reads db/index.ts as text and fails on the forbidden shapes.
 *
 * Run from apps/mobile:  npm run verify:inbatches
 * No device, no network, no paid provider call. Non-zero exit on any failure.
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const MODULE = join(process.cwd(), "src", "lib", "in-batches.ts");
const DB = join(process.cwd(), "src", "db", "index.ts");

const m = await import(pathToFileURL(MODULE).href);
const dbSrc = readFileSync(DB, "utf8");

let failures = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (e) {
    failures++;
    console.error(`FAIL  ${name}\n      ${e.message}`);
    process.exitCode = 1;
  }
};

const uuid = (i) =>
  `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const uuids = (n) => Array.from({ length: n }, (_, i) => uuid(i));

console.log("in-batches: request-line safety");

await check("a batch of 50 uuids stays far below the 4 KB request-line budget", () => {
  const bytes = m.inClauseRequestBytes("order_id", uuids(m.IN_CLAUSE_BATCH_SIZE));
  assert.ok(bytes < 2500, `50 uuids cost ${bytes} bytes`);
  // The full list this guard replaced must be demonstrated as the problem.
  const whole = m.inClauseRequestBytes("order_id", uuids(200));
  assert.ok(whole > 7000, `expected ~7.4 KB for 200 uuids, got ${whole}`);
});

await check("chunk keeps order, never duplicates or drops a value", () => {
  const values = uuids(137);
  const flat = m.chunk(values).flat();
  assert.deepEqual(flat, values);
  assert.equal(new Set(flat).size, 137);
  assert.deepEqual(m.chunk([]), []);
  assert.equal(m.chunk(values).length, 3);
});

await check("chunk rejects a zero/negative size instead of looping forever", () => {
  assert.throws(() => m.chunk([1, 2, 3], 0), /must be >= 1/);
  assert.throws(() => m.chunk([1, 2, 3], -1), /must be >= 1/);
});

console.log("in-batches: batching behaviour");

await check("200 ids are queried as 4 batches, each value exactly once", async () => {
  const seen = [];
  const res = await m.runInBatches({
    values: uuids(200),
    query: async (batch) => {
      seen.push(...batch);
      return { data: batch.map((id) => ({ order_id: id })), error: null };
    },
  });
  assert.equal(res.batches, 4);
  assert.equal(res.failedBatches, 0);
  assert.equal(seen.length, 200);
  assert.equal(new Set(seen).size, 200);
  assert.equal(res.rows.length, 200);
});

await check("in-flight work is bounded by IN_CLAUSE_CONCURRENCY and still parallel", async () => {
  let inFlight = 0;
  let peak = 0;
  await m.runInBatches({
    values: uuids(20),
    batchSize: 1,
    query: async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
      return { data: [], error: null };
    },
  });
  assert.ok(peak <= m.IN_CLAUSE_CONCURRENCY, `peak ${peak} exceeded ${m.IN_CLAUSE_CONCURRENCY}`);
  assert.ok(peak > 1, "batches ran serially — the screen would wait for all of them");
});

await check("empty values make zero requests", async () => {
  let calls = 0;
  const res = await m.runInBatches({
    values: [],
    query: async () => {
      calls++;
      return { data: [], error: null };
    },
  });
  assert.equal(calls, 0);
  assert.deepEqual(res, { rows: [], failedBatches: 0, batches: 0 });
});

console.log("in-batches: a failed batch is not empty data");

await check("one rejected batch reports failure and keeps the other rows", async () => {
  const errors = [];
  const res = await m.runInBatches({
    values: uuids(200),
    batchSize: 50,
    query: async (batch) => {
      if (batch[0] === uuid(50)) {
        return { data: null, error: { message: "400 request line too long" } };
      }
      return { data: batch.map((id) => ({ order_id: id })), error: null };
    },
    onBatchError: (n, total, msg) => errors.push(`${n}/${total}:${msg}`),
  });
  assert.equal(res.batches, 4);
  assert.equal(res.failedBatches, 1);
  assert.equal(res.rows.length, 150);
  assert.deepEqual(errors, ["2/4:400 request line too long"]);
});

await check("a thrown error fails only its own chunk", async () => {
  const res = await m.runInBatches({
    values: uuids(100),
    query: async (batch) => {
      if (batch[0] === uuid(0)) throw new Error("socket hang up");
      return { data: batch.map((id) => ({ order_id: id })), error: null };
    },
  });
  assert.equal(res.failedBatches, 1);
  assert.equal(res.rows.length, 50);
});

await check("every batch failing is worded as a lookup failure, not missing data", () => {
  const msg = m.partialJoinNotice("Order line items", 4, 4);
  assert.match(msg, /could not be loaded from the server/);
  assert.match(msg, /lookup failure, not missing data/);
});

await check("partial failure reports how much did load", () => {
  const msg = m.partialJoinNotice("Order line items", 2, 5);
  assert.match(msg, /loaded only partly \(3 of 5 groups\)/);
  assert.equal(m.partialJoinNotice("Order line items", 0, 5), null);
});

console.log("db/index.ts: call-site rules");

await check("order_items enrichment goes through runInBatches", () => {
  assert.match(dbSrc, /from "@\/lib\/in-batches"/, "db/index.ts must import the batching helper");
  assert.ok(
    /runInBatches<string, any>\(\{[\s\S]{0,700}\.in\("order_id", batch\)/.test(dbSrc),
    "the order_items join must query a `batch`, not a raw id list"
  );
});

await check("no variable-length .in() survives in the repository", () => {
  const offenders = [];
  const re = /\.in\(\s*"([a-z_]+)"\s*,\s*([^)]+)\)/g;
  for (const match of dbSrc.matchAll(re)) {
    const arg = match[2].trim();
    if (arg !== "batch" && !/^\[/.test(arg)) offenders.push(`${match[1]} <- ${arg}`);
  }
  assert.deepEqual(offenders, [], `raw .in() lists can outgrow the request line: ${offenders.join(", ")}`);
});

await check("a failed line-item batch is logged, not swallowed", () => {
  assert.match(
    dbSrc,
    /if \(joined\.failedBatches\)[\s\S]{0,300}partialJoinNotice\("Order line items"/,
    "partial line-item failures must be reported"
  );
});

await check("order item columns are declared once, not duplicated per query", () => {
  const literal = '"id, order_id, product_id, product_name, quantity, unit_price';
  const uses = dbSrc.split(literal).length - 1;
  assert.equal(uses, 1, `expected the column list in exactly one place, found ${uses}`);
});

await check("uuid lookups start the item read before the order read resolves", () => {
  const fn = dbSrc.slice(
    dbSrc.indexOf("export async function getOrderById"),
    dbSrc.indexOf("export async function", dbSrc.indexOf("export async function getOrderById") + 10)
  );
  const itemsAt = fn.indexOf("const itemsPromise");
  const orderAwaitedAt = fn.indexOf("await query");
  assert.ok(itemsAt >= 0, "getOrderById must pre-create the items promise");
  assert.ok(orderAwaitedAt >= 0, "getOrderById must await the order query");
  assert.ok(itemsAt < orderAwaitedAt, "the two reads must be issued before either is awaited");
});

console.log("");
if (failures) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
// The hash lets a negative-control run prove the file was restored untouched.
console.log(`All in-batches checks passed. source sha256 ${createHash("sha256").update(dbSrc).digest("hex").slice(0, 16)}`);
