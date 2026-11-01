import { describe, expect, it, vi } from "vitest";
import { chunk, runInBatches, partialJoinNotice, IN_CLAUSE_BATCH_SIZE } from "@/lib/admin/batched-join";

/**
 * Bounded `.in()` reads.
 *
 * Supabase serialises `.in(col, values)` into the GET request line, so the list
 * length IS the URL length. On 2026-10-14 the Shipments console put ~1 000 order
 * ids into one call (~37 KB) and the gateway answered 400 — then the fallback
 * failed identically, so every shipment rendered with no order link. A failed
 * lookup drawn as missing data is the failure mode these tests exist to prevent.
 */

describe("chunk", () => {
  it("splits without losing, reordering or duplicating", () => {
    const values = Array.from({ length: 123 }, (_, i) => `id-${i}`);
    const batches = chunk(values, 50);
    expect(batches.map((b) => b.length)).toEqual([50, 50, 23]);
    expect(batches.flat()).toEqual(values);
  });

  it("returns one batch when the input fits, and none when it is empty", () => {
    expect(chunk(["a", "b"], 50)).toEqual([["a", "b"]]);
    expect(chunk([], 50)).toEqual([]);
  });

  it("refuses a size that would loop forever", () => {
    expect(() => chunk([1, 2, 3], 0)).toThrow(/chunk size must be >= 1/);
    expect(() => chunk([1, 2, 3], -1)).toThrow(/chunk size must be >= 1/);
  });
});

describe("runInBatches", () => {
  it("returns every row in batch order when nothing fails", async () => {
    const values = Array.from({ length: 120 }, (_, i) => i);
    const result = await runInBatches({
      values,
      query: async (batch) => ({ data: batch.map((n) => ({ id: n })), error: null }),
    });
    expect(result.batches).toBe(3); // 50 + 50 + 20
    expect(result.failedBatches).toBe(0);
    expect(result.rows.map((r) => r.id)).toEqual(values);
  });

  it("costs only the failing batch's rows", async () => {
    const values = Array.from({ length: 120 }, (_, i) => i);
    const result = await runInBatches({
      values,
      query: async (batch) => {
        if (batch.includes(60)) return { data: null, error: { message: "400 Bad Request" } };
        return { data: batch.map((n) => ({ id: n })), error: null };
      },
    });
    expect(result.batches).toBe(3);
    expect(result.failedBatches).toBe(1);
    // The 50 rows in the failed batch are absent; the other 70 survive.
    expect(result.rows).toHaveLength(70);
  });

  it("counts a thrown query as a failed batch, not as an empty answer", async () => {
    const onBatchError = vi.fn();
    const result = await runInBatches({
      values: [1, 2, 3],
      query: async () => {
        throw new Error("Failed to fetch");
      },
      onBatchError,
    });
    expect(result.failedBatches).toBe(1);
    expect(result.batches).toBe(1);
    expect(result.rows).toEqual([]);
    expect(onBatchError).toHaveBeenCalledWith(1, 1, "Failed to fetch");
  });

  it("counts an unresolved worker as a failure rather than zero rows", async () => {
    // `null` means "no recorded outcome" — the distinction this module exists for.
    const onBatchError = vi.fn();
    const result = await runInBatches({
      values: [1],
      query: (async () => null) as unknown as () => Promise<{ data: null; error: null }>,
      onBatchError,
    });
    expect(result.failedBatches).toBe(1);
    expect(onBatchError).toHaveBeenCalledWith(1, 1, "no response from this batch");
  });

  it("never exceeds the concurrency cap", async () => {
    let inFlight = 0;
    let peak = 0;
    const values = Array.from({ length: 400 }, (_, i) => i);
    await runInBatches({
      values,
      batchSize: 10,
      concurrency: 4,
      query: async (batch) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight--;
        return { data: batch.map((n) => ({ id: n })), error: null };
      },
    });
    expect(peak).toBeLessThanOrEqual(4);
  });

  it("does nothing and reports no batches for an empty input", async () => {
    const query = vi.fn();
    const result = await runInBatches({ values: [], query });
    expect(result).toEqual({ rows: [], failedBatches: 0, batches: 0 });
    expect(query).not.toHaveBeenCalled();
  });
});

describe("partialJoinNotice", () => {
  it("says nothing when everything loaded", () => {
    expect(partialJoinNotice("Order lines", 0, 5)).toBeNull();
  });

  it("distinguishes a total failure from a partial one", () => {
    const total = partialJoinNotice("Order lines", 5, 5);
    const partial = partialJoinNotice("Order lines", 1, 5);
    expect(total).toMatch(/could not be loaded/i);
    expect(total).toMatch(/not missing data/i);
    expect(partial).toMatch(/loaded only partly/i);
    expect(partial).toMatch(/4 of 5/);
  });
});

describe("the default batch size stays inside a gateway request line", () => {
  it("50 uuids is ~1.9 KB, well under the ~8 KB ceiling that broke production", () => {
    const ids = Array.from(
      { length: IN_CLAUSE_BATCH_SIZE },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`
    );
    const requestLine = `GET /rest/v1/admin_order_items_view?select=id&order_id=in.(${ids.join(",")})`;
    expect(requestLine.length).toBeLessThan(4096);
    // And the size that DID break it is over the ceiling — proving the threshold
    // in this test is the real one, not a number that happens to pass.
    const thousand = Array.from({ length: 1000 }, () => ids[0]);
    const brokenLine = `GET /rest/v1/x?order_id=in.(${thousand.join(",")})`;
    expect(brokenLine.length).toBeGreaterThan(8000);
  });
});
