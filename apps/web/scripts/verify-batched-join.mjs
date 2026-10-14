#!/usr/bin/env node
/**
 * Gate: admin list enrichment must never hand PostgREST an oversized `.in()`.
 *
 * The customer-visible bug (2026-10-14, Shipments console):
 *   order ids for a whole page — up to 1 000 — went into ONE `.in()` call.
 *   PostgREST puts those values in the GET query string, so the request line
 *   grew to ~37 KB, the gateway answered 400, the base-table retry failed on
 *   the same oversized URL, `data` came back null, and the page drew every
 *   shipment with no order link. Staff concluded the shipments were unlinked;
 *   the database said otherwise. A failed read and an empty read looked alike.
 *
 * These checks pin the rules that fix it, against the real module:
 *   - values are split so no chunk can exceed the URL-safe batch size
 *   - every value is queried exactly once, in order
 *   - concurrency is bounded (no twenty-request thundering herd)
 *   - a rejected promise counts as a failed chunk, not a crashed join
 *   - failures are REPORTED (failedBatches + onBatchError), never folded into
 *     "zero rows found"
 *   - the staff-facing notice distinguishes "all failed" from "one of twenty"
 *
 * Negative control (2026-10-14): setting IN_CLAUSE_BATCH_SIZE to
 * Number.MAX_SAFE_INTEGER in src/lib/admin/batched-join.ts — i.e. sending the
 * whole list in one `.in()` again — turns checks 1-7 red while the two source
 * checks stay green, proving the behavioural half is what does the work.
 * Restore is verified by sha256.
 *
 * Run: npm run verify:joins --workspace=apps/web   (or: cd apps/web && npm run verify:joins)
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const modulePath = join(here, "..", "src", "lib", "admin", "batched-join.ts");

const {
  IN_CLAUSE_BATCH_SIZE,
  IN_CLAUSE_CONCURRENCY,
  chunk,
  runInBatches,
  partialJoinNotice,
} = await import(modulePath);

let passed = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok  ${name}`);
    passed++;
  } catch (err) {
    console.error(`FAIL ${name}\n     ${err.message}`);
    process.exitCode = 1;
  }
};

const uuid = (i) =>
  `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const ids = (n) => Array.from({ length: n }, (_, i) => uuid(i));

console.log("batched-join — URL-safe enrichment for admin list pages");

/* ── 1. the batch size is a URL budget, not a style preference ───── */
await check("batch size is small enough to keep the request line under ~2 KB", () => {
  assert.ok(
    IN_CLAUSE_BATCH_SIZE >= 10 && IN_CLAUSE_BATCH_SIZE <= 100,
    `IN_CLAUSE_BATCH_SIZE is ${IN_CLAUSE_BATCH_SIZE}; the whole point is a short query string`
  );
  // 36-char uuid + comma, plus the column/table/select overhead of the query.
  const worstQueryString = IN_CLAUSE_BATCH_SIZE * 37;
  assert.ok(
    worstQueryString < 4096,
    `one batch would emit ${worstQueryString} chars of filter — a request line a proxy may reject`
  );
});

/* ── 2. chunking ─────────────────────────────────────────────────── */
await check("chunk splits evenly, keeps order, and never drops or duplicates a value", () => {
  const values = ids(1000);
  const batches = chunk(values);
  assert.equal(batches.length, 20, "1000 ids must become 20 chunks");
  assert.ok(batches.every((b) => b.length <= IN_CLAUSE_BATCH_SIZE));
  assert.deepEqual(batches.flat(), values, "flattened chunks must equal the input");
  assert.equal(chunk(values)[0][0], values[0]);
  assert.equal(chunk([]).length, 0, "empty input makes no chunks");
  assert.equal(chunk(["a"], 1).length, 1);
  assert.throws(() => chunk(["a"], 0), /size must be >= 1/);
});

/* ── 3. every value is looked up exactly once ────────────────────── */
await check("runInBatches queries each value exactly once across chunks", async () => {
  const values = ids(1000);
  const seen = [];
  const res = await runInBatches({
    values,
    query: async (batch) => {
      seen.push(...batch);
      return { data: batch.map((id) => ({ id })), error: null };
    },
  });
  assert.equal(seen.length, 1000);
  assert.deepEqual([...seen].sort(), [...values].sort());
  assert.equal(new Set(seen).size, 1000, "a value queried twice means a chunking bug");
  assert.equal(res.rows.length, 1000);
  assert.equal(res.failedBatches, 0);
  assert.equal(res.batches, 20);
});

/* ── 4. bounded concurrency ──────────────────────────────────────── */
await check("in-flight queries never exceed the pool size", async () => {
  let inFlight = 0;
  let peak = 0;
  await runInBatches({
    values: ids(1000),
    query: async (batch) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { data: batch, error: null };
    },
  });
  assert.ok(
    peak <= IN_CLAUSE_CONCURRENCY,
    `peak in-flight was ${peak}; a 1000-id page fired ${peak} requests at once`
  );
  assert.ok(peak > 1, "the pool should still parallelise — serial batching is just slow");
});

/* ── 5. a failed chunk is reported, not hidden ───────────────────── */
await check("one failing chunk keeps the other rows and is counted", async () => {
  const errors = [];
  const res = await runInBatches({
    values: ids(200),
    query: async (batch) => {
      if (batch[0].endsWith("0050")) return { data: null, error: { message: "400 request line too long" } };
      return { data: batch.map((id) => ({ id })), error: null };
    },
    onBatchError: (idx, total, message) => errors.push({ idx, total, message }),
  });
  assert.equal(res.batches, 4);
  assert.equal(res.failedBatches, 1, "a swallowed failure is the bug this gate exists for");
  assert.equal(res.rows.length, 150);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].idx, 2);
  assert.equal(errors[0].total, 4);
  assert.match(errors[0].message, /request line too long/);
});

/* ── 6. a thrown error is still just one failed chunk ────────────── */
await check("a rejected query fails only its chunk instead of crashing the join", async () => {
  const res = await runInBatches({
    values: ids(120),
    query: async (batch) => {
      if (batch[0].endsWith("0000")) throw new TypeError("fetch failed");
      return { data: batch.map((id) => ({ id })), error: null };
    },
  });
  assert.equal(res.failedBatches, 1);
  assert.equal(res.rows.length, 70, "the three healthy chunks must still deliver rows");
});

/* ── 7. all chunks failing is a distinct, louder signal ──────────── */
await check("total join failure is distinguishable from an empty table", async () => {
  const res = await runInBatches({
    values: ids(1000),
    query: async () => ({ data: null, error: { message: "400" } }),
  });
  assert.equal(res.rows.length, 0);
  assert.equal(res.failedBatches, 20);
  assert.equal(res.batches, 20);
  const notice = partialJoinNotice("Order references", res.failedBatches, res.batches);
  assert.match(notice, /could not be loaded from the server/);
  assert.match(notice, /lookup failure, not missing data/);
});

/* ── 8. the notices staff actually read ──────────────────────────── */
await check("partialJoinNotice: silent when complete, specific when partial, absent when empty", () => {
  assert.equal(partialJoinNotice("Customer names", 0, 5), null);
  const partial = partialJoinNotice("Customer names", 2, 5);
  assert.match(partial, /loaded only partly \(3 of 5 groups\)/);
  assert.match(partial, /even though the data exists/);
  const all = partialJoinNotice("Customer names", 5, 5);
  assert.match(all, /every row/);
});

/* ── 9. no page may build a raw variable-length `.in()` again ────── */
await check("admin pages route list-sized joins through the batched helper", () => {
  const files = [
    join(here, "..", "src", "lib", "admin", "supabase-data.ts"),
    join(here, "..", "src", "app", "admin", "(protected)", "shipments", "page.tsx"),
  ];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const match of src.matchAll(/\.in\(\s*["'][^"']+["']\s*,\s*([A-Za-z_$][\w$.]*)/g)) {
      const variable = match[1];
      assert.ok(
        variable === "batch" || file.endsWith("batched-join.ts"),
        `${file.split("/src/")[1]} calls .in("${variable}") directly — a list-sized query string can come back`
      );
    }
  }
});

/* ── 10. the helper is what the pages use ────────────────────────── */
await check("Shipments enrichment uses the batched data-layer helper", () => {
  const page = readFileSync(
    join(here, "..", "src", "app", "admin", "(protected)", "shipments", "page.tsx"),
    "utf8"
  );
  assert.match(page, /getOrderRefsByIds\(/);
  assert.match(page, /PartialJoinNotice/);
  assert.ok(
    !/admin_orders_view[\s\S]{0,120}\.in\(/.test(page),
    "the Shipments page must not query the orders view with its own .in() again"
  );
});

if (!process.exitCode) {
  console.log(`\n${passed}/10 checks passed`);
  console.log(
    `source sha256 ${createHash("sha256").update(readFileSync(modulePath)).digest("hex").slice(0, 16)} (record this before any negative control)`
  );
} else {
  console.error("\nFAILED");
}
