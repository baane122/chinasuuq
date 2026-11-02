"use client";

/**
 * The I/O half of the Trending insights: the same pure rules as
 * `./trendingInsights`, wired to the two reads the console already trusts.
 *
 * Split from the pure module on purpose — the arithmetic is unit-tested with no
 * Supabase client and no environment, which is only possible if the module under
 * test never imports one. This file is the only place a fetch lives.
 *
 * Two failure rules carried over from the rest of the console:
 *  - a failed read is never rendered as a zero; each caller gets a `Result` and
 *    the panel names the failed half
 *  - a partly failed breakdown keeps its own `error` while the other dimension
 *    still renders, because the two are separate questions
 */

import { fetchBehaviourTrending, type Result } from "@/lib/catalog";
import { supabase } from "@/lib/supabase";
import {
  buildBreakdown,
  computeMomentum,
  EVENT_TYPES,
  MARKETPLACE_KEYS,
  RPC_MAX_DAYS,
  type DemandMix,
  type MomentumResult,
} from "./trendingInsights";

export * from "./trendingInsights";

type LedgerQuery = ReturnType<typeof baseQuery>;

/** Head-count one filter. Returns `count`, or the PostgREST message on failure. */
async function headCount(
  days: number,
  apply?: (q: LedgerQuery) => LedgerQuery
): Promise<{ count: number; error: string | null }> {
  const q = apply ? apply(baseQuery(days)) : baseQuery(days);
  const { count, error } = await q;
  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}

function baseQuery(days: number) {
  return supabase
    .from("admin_product_events_view")
    .select("id", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - days * 86_400_000).toISOString());
}

/**
 * Exact head-counts per marketplace and per event type. Two dimensions, read in
 * parallel; a dimension that fails carries its own error and an empty row list,
 * which the panel renders as "could not read", never as zero.
 */
export async function fetchDemandMix(days: number): Promise<Result<DemandMix>> {
  const totalRes = await headCount(days);
  if (totalRes.error) {
    return { ok: false, reason: `The ledger could not be read (${totalRes.error}).` };
  }

  const [marketCounts, eventCounts] = await Promise.all([
    Promise.all(
      MARKETPLACE_KEYS.map(async (key) => {
        const res = await headCount(days, (q) => q.eq("marketplace_key", key));
        return { key, ...res };
      })
    ),
    Promise.all(
      EVENT_TYPES.map(async (key) => {
        const res = await headCount(days, (q) => q.eq("event_type", key));
        return { key, ...res };
      })
    ),
  ]);

  const marketError = marketCounts.find((r) => r.error)?.error ?? null;
  const eventError = eventCounts.find((r) => r.error)?.error ?? null;
  const total = totalRes.count;

  return {
    ok: true,
    data: {
      days,
      byMarketplace: marketError
        ? { total, rows: [], residual: 0, residualLabel: "Other keys", error: marketError }
        : buildBreakdown(total, marketCounts.filter((r) => !r.error), "Other keys"),
      byEvent: eventError
        ? { total, rows: [], residual: 0, residualLabel: "Other events", error: eventError }
        : buildBreakdown(total, eventCounts.filter((r) => !r.error), "Other events"),
    },
  };
}

/**
 * Momentum = this window vs the equally long window before it, in raw actions.
 * Two RPC reads at `days` and `2×days`. Above 45 days the second read would be
 * clamped to 90 by the RPC, so `days` is reduced to 45 and `truncated` says so —
 * comparing 90 days against 30 would be an unfair ratio dressed as momentum.
 */
export async function fetchMomentum(days: number, limit = 8): Promise<Result<MomentumResult>> {
  const recentDays = Math.max(1, Math.min(days, RPC_MAX_DAYS / 2));
  const [recentRes, widerRes] = await Promise.all([
    fetchBehaviourTrending(recentDays, 100),
    fetchBehaviourTrending(recentDays * 2, 100),
  ]);
  if (recentRes.error) {
    return { ok: false, reason: `The ranking RPC could not be read (${recentRes.error}).` };
  }
  if (widerRes.error) {
    return { ok: false, reason: `The previous-window ranking could not be read (${widerRes.error}).` };
  }
  return {
    ok: true,
    data: {
      rows: computeMomentum(recentRes.rows, widerRes.rows, limit),
      recentDays,
      previousDays: recentDays,
      truncated: days > RPC_MAX_DAYS / 2,
      considered: new Set([...recentRes.rows, ...widerRes.rows].map((r) => r.product_id)).size,
    },
  };
}
