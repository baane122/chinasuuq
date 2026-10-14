/**
 * URL-safe batching for Supabase `.in()` lookups.
 *
 * PostgREST puts `.in()` values in the GET query string, so the size of a
 * decorated join is decided by the size of the list it follows. The Shipments
 * console used to hand it every order id on a 1 000-row page: a ~37 KB request
 * line, a 400 from the gateway, a fallback that failed on the same oversized
 * URL, and a screen where no shipment appeared to have an order. A blank cell
 * was indistinguishable from a failed lookup.
 *
 * This module holds the two rules that keep that from coming back —
 * chunk values so each request line stays small, and run the chunks with
 * bounded concurrency so a page's enrichment costs two round trips instead of
 * twenty queued requests — with no Supabase import, so they can be verified
 * directly (apps/web/scripts/verify-batched-join.mjs).
 */

/**
 * 50 UUIDs ≈ 1.9 KB of query string — comfortably inside what a proxy will
 * accept as a request line, and small enough that one bad chunk cannot poison
 * the rest of the join.
 */
export const IN_CLAUSE_BATCH_SIZE = 50;

/**
 * Chrome multiplexes only a handful of requests per host; firing every chunk
 * at once just moves the queueing into the browser and risks timeout noise on
 * the later ones.
 */
export const IN_CLAUSE_CONCURRENCY = 4;

export type BatchedJoinResult<R> = {
  rows: R[];
  /** Chunks whose query failed — never silently folded into "no rows found". */
  failedBatches: number;
  /** Total chunks, so callers can tell "all failed" from "one of twenty failed". */
  batches: number;
};

/** Split `values` into at most `size`-long chunks, preserving order. */
export function chunk<T>(values: readonly T[], size = IN_CLAUSE_BATCH_SIZE): T[][] {
  if (size < 1) throw new Error(`chunk size must be >= 1, got ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

/**
 * Run `query` once per chunk with at most `IN_CLAUSE_CONCURRENCY` in flight.
 *
 * `query` returns the raw PostgREST shape; a chunk that errors contributes no
 * rows and increments `failedBatches`, and `onBatchError` is called so the
 * caller can log or surface it. Returning the failure count rather than
 * throwing is deliberate: a decorative join must not blank the whole list, but
 * it must also never claim success when it only got a third of the way there.
 */
export async function runInBatches<T, R>({
  values,
  query,
  batchSize = IN_CLAUSE_BATCH_SIZE,
  concurrency = IN_CLAUSE_CONCURRENCY,
  onBatchError,
}: {
  values: readonly T[];
  query: (batch: T[]) => Promise<{ data: R[] | null; error: { message?: string } | null }>;
  batchSize?: number;
  concurrency?: number;
  onBatchError?: (batchIndex: number, batchCount: number, message: string) => void;
}): Promise<BatchedJoinResult<R>> {
  const batches = chunk(values, batchSize);
  if (!batches.length) return { rows: [], failedBatches: 0, batches: 0 };

  const results: ({ data: R[] | null; error: { message?: string } | null } | null)[] =
    new Array(batches.length).fill(null);

  // Workers pick the next free index; keeps the pool full without waiting for
  // a whole wave of slow chunks to finish.
  let next = 0;
  const worker = async () => {
    for (;;) {
      const idx = next++;
      if (idx >= batches.length) return;
      try {
        results[idx] = await query(batches[idx]);
      } catch (e) {
        // A rejected promise is still a failed chunk, not a crashed join.
        results[idx] = {
          data: null,
          error: { message: e instanceof Error ? e.message : String(e) },
        };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, batches.length) }, () => worker())
  );

  const rows: R[] = [];
  let failedBatches = 0;
  results.forEach((res, idx) => {
    if (!res || res.error) {
      failedBatches++;
      onBatchError?.(idx + 1, batches.length, String(res?.error?.message ?? "no response"));
      return;
    }
    rows.push(...((res.data || []) as R[]));
  });

  return { rows, failedBatches, batches: batches.length };
}

/**
 * Plain-language warning for a join that did not fully resolve, written for the
 * staff member reading the table rather than for the console.
 */
export function partialJoinNotice(
  label: string,
  failedBatches: number,
  batches: number
): string | null {
  if (!failedBatches) return null;
  return failedBatches === batches
    ? `${label} could not be loaded from the server, so the related columns are blank on every row — that is a lookup failure, not missing data.`
    : `${label} loaded only partly (${batches - failedBatches} of ${batches} groups): some rows show a blank value even though the data exists.`;
}
