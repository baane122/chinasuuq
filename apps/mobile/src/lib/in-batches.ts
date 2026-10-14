/**
 * in-batches.ts — bounded `.in()` reads for PostgREST.
 *
 * WHY THIS EXISTS: Supabase serialises `.in(col, values)` into the GET request
 * line as `col=in.(v1,v2,…)`. The list length is therefore the request line
 * length, and gateways commonly cap a request line at 8 KB — over that they
 * answer 400/414 without running the query at all. On 2026-10-14 the same
 * shape broke two screens:
 *
 *   • web Shipments: ~1 000 order uuids ≈ 37 KB → every join failed, and the
 *     retry failed identically, so all rows looked unlinked.
 *   • mobile order history: the fallback path pulled `order_items` for up to
 *     200 uuids ≈ 7.4 KB — one more order away from the same wall, and the
 *     symptom would be paid orders rendering with no line items.
 *
 * So no call site hands PostgREST a variable-length list again: values are
 * chunked to `IN_CLAUSE_BATCH_SIZE` (50 uuids ≈ 1.9 KB, comfortably inside the
 * ceiling) and a small worker pool keeps the whole thing to about one
 * round-trip of wall time.
 *
 * A failed batch is reported as `failedBatches`, never as an empty result. That
 * distinction is the point: "the server refused" must not be rendered as "there
 * is no data", which is how a lookup failure turns into a customer being told
 * their order is empty.
 *
 * Mirrors apps/web/src/lib/admin/batched-join.ts. Each app keeps its own copy
 * because `packages/shared` is not on either app's module resolution path —
 * duplicating 80 dependency-free lines is cheaper than rewiring the monorepo
 * two weeks before release.
 *
 * Pure by design: no React Native, no Supabase client, so the behaviour can be
 * executed by `npm run verify:inbatches` on a laptop with no device.
 */

export const IN_CLAUSE_BATCH_SIZE = 50;
export const IN_CLAUSE_CONCURRENCY = 4;

export type BatchResult<R> = {
  rows: R[];
  /** Batches that returned an error or no response at all. */
  failedBatches: number;
  /** Batches that were attempted. */
  batches: number;
};

/** Split into ordered groups of at most `size`; never reorders or duplicates. */
export function chunk<T>(values: readonly T[], size = IN_CLAUSE_BATCH_SIZE): T[][] {
  if (size < 1) throw new Error(`chunk size must be >= 1, got ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

/**
 * Run `query` once per chunk with at most `concurrency` in flight.
 *
 * `query` resolves to `{ data, error }` (the PostgREST shape) or throws; either
 * way a failing chunk costs only its own rows.
 */
export async function runInBatches<T, R>({
  values,
  query,
  batchSize = IN_CLAUSE_BATCH_SIZE,
  concurrency = IN_CLAUSE_CONCURRENCY,
  onBatchError,
}: {
  values: readonly T[];
  query: (batch: T[]) => Promise<{ data: R[] | null; error?: { message: string } | null }>;
  batchSize?: number;
  concurrency?: number;
  onBatchError?: (batchNumber: number, batches: number, message: string) => void;
}): Promise<BatchResult<R>> {
  const batches = chunk(values, batchSize);
  if (batches.length === 0) return { rows: [], failedBatches: 0, batches: 0 };

  const results: Array<{ data: R[] | null; error?: { message: string } | null } | null> =
    new Array(batches.length).fill(null);

  // Workers take the next free index rather than a pre-sliced share, so one
  // slow batch cannot stall a whole worker while the others sit idle.
  let next = 0;
  const worker = async () => {
    for (;;) {
      const idx = next++;
      if (idx >= batches.length) return;
      try {
        results[idx] = await query(batches[idx]);
      } catch (e) {
        results[idx] = {
          data: null,
          error: { message: e instanceof Error ? e.message : String(e) },
        };
      }
    }
  };
  const workers = Math.min(concurrency, batches.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));

  const rows: R[] = [];
  let failedBatches = 0;
  results.forEach((res, idx) => {
    // `null` means the worker never recorded an outcome — treat it as a
    // failure, not as "no rows for these ids".
    if (!res || res.error) {
      failedBatches++;
      onBatchError?.(
        idx + 1,
        batches.length,
        String(res?.error?.message ?? "no response from this batch")
      );
      return;
    }
    rows.push(...((res.data ?? []) as R[]));
  });

  return { rows, failedBatches, batches: batches.length };
}

/**
 * Operator/developer-facing sentence for a partial join, or `null` when
 * everything loaded. Wording deliberately separates "we could not read it" from
 * "it does not exist".
 */
export function partialJoinNotice(label: string, failedBatches: number, batches: number): string | null {
  if (!failedBatches) return null;
  return failedBatches === batches
    ? `${label} could not be loaded from the server, so the related columns are blank on every row — that is a lookup failure, not missing data.`
    : `${label} loaded only partly (${batches - failedBatches} of ${batches} groups): some rows show a blank value even though the data exists.`;
}

/** Approximate length of the `column=in.(…)` filter in the request line. */
export function inClauseRequestBytes(column: string, values: readonly string[]): number {
  return `${column}=in.(${values.join(",")})`.length;
}
