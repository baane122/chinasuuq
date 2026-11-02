/**
 * Insights behind the Trending screen — the arithmetic the shelf itself cannot show.
 *
 * WHAT THIS ADDS, AND WHY IT NEEDED ITS OWN FILE
 * The Trending page already answers "what is on the shelf". It could not answer
 * "is the shelf filling itself", "which marketplace is our demand actually
 * coming from", or "which product is rising right now". Those three answers are
 * computed here from data the console already reads (the ledger view and the
 * ranking RPC), which keeps every new number traceable to a row instead of to a
 * dashboard's opinion.
 *
 * HONESTY RULES — the reason this module is pure and tested
 *  1. Momentum is measured in RAW EVENT COUNTS, never in scores. The score decays
 *     with age, so `score(14d) - score(7d)` would under-count the older week and
 *     make every product look like it is rising. Counts have no such bias.
 *  2. A breakdown is a set of EXACT head-counts plus the residual of the true
 *     total, so a marketplace key we did not name appears as "other keys" rather
 *     than silently vanishing from a total that claims to be everything.
 *  3. A partly failed read is still a failed read FOR THAT DIMENSION. Each
 *     dimension carries its own error; the UI shows the half it has and names the
 *     half it does not.
 *  4. No conversion rate is computed from event totals. `admin_product_events_view`
 *     drops `session_id`, so "12 orders / 400 views" is not a conversion rate — it
 *     is two unrelated totals, and the UI says exactly that.
 */

import type { TrendingRpcRow } from "@/lib/catalog";

/** The home section's card count — the shelf's own target, not an invented one. */
export const SHELF_TARGET = 12;

/** Mirrors the widest window `fn_trending_products` accepts (its own `least(…, 90)`). */
export const RPC_MAX_DAYS = 90;

/** Keys the app writes into `product_events.marketplace_key`. */
export const MARKETPLACE_KEYS = ["1688", "taobao", "yiwugo", "chinagoods", "chinasuuq", "unknown"] as const;

export const EVENT_TYPES = ["view", "search_click", "add_to_cart", "order"] as const;
export type EventTypeKey = (typeof EVENT_TYPES)[number];

export interface CountRow {
  key: string;
  count: number;
}

/**
 * One measured dimension: exact counts per named key, plus the row that makes the
 * list add up to `total`. `error` is set when the head-counts could not be read —
 * `rows` is then empty and the caller must not render a zero.
 */
export interface Breakdown {
  total: number;
  rows: CountRow[];
  /** Events whose key is not in the named list (or a key we could not count). */
  residual: number;
  residualLabel: string;
  error: string | null;
}

/** Share of the total, 0–1. Returns 0 for an empty total rather than NaN. */
export function shareOf(count: number, total: number): number {
  if (!Number.isFinite(count) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(1, count / total));
}

/**
 * Build a breakdown from a true total and the counts we managed to measure.
 *
 * `countedTotal` is what the named keys summed to; the difference from `total` is
 * real data we did not enumerate (another marketplace key), so it is surfaced as
 * its own row instead of being folded into the largest one.
 */
export function buildBreakdown(
  total: number,
  counts: CountRow[],
  residualLabel = "Other keys"
): Breakdown {
  const named = counts.filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
  const summed = named.reduce((n, r) => n + r.count, 0);
  return {
    total: Math.max(total, summed),
    rows: named,
    residual: Math.max(0, total - summed),
    residualLabel,
    error: null,
  };
}

export interface MomentumRow {
  productId: string;
  name: string;
  marketplace: string;
  imageUrl: string | null;
  /** Events in the recent window. */
  recent: number;
  /** Events in the equally long window immediately before it. */
  previous: number;
  /** recent - previous. */
  delta: number;
  /** Percent change, or null when the previous window was empty (there is no
   *  percentage of zero — the row reads "new", not "+∞%"). */
  deltaPct: number | null;
  /** The decayed score for the recent window, shown as context, never compared. */
  score: number;
}

/**
 * Recent vs previous window, from two RPC answers over the SAME ranking.
 *
 * `wider` must be the read with double the recent window; a product present in
 * `wider` but not `recent` is falling to zero, and a product present in `recent`
 * but not `wider` cannot happen (the wider window contains the recent one) — the
 * fallback below treats it as new instead of throwing.
 */
export function computeMomentum(
  recent: TrendingRpcRow[],
  wider: TrendingRpcRow[],
  limit = 8
): MomentumRow[] {
  const recentById = new Map(recent.map((r) => [r.product_id, r]));
  const widerById = new Map(wider.map((r) => [r.product_id, r]));
  const ids = new Set<string>([...recentById.keys(), ...widerById.keys()]);

  const rows: MomentumRow[] = [];
  for (const id of ids) {
    const now = recentById.get(id);
    const all = widerById.get(id) ?? now;
    if (!all) continue;
    const recentCount = Math.max(0, Number(now?.event_count ?? 0));
    const totalCount = Math.max(recentCount, Number(all.event_count ?? 0));
    const previous = Math.max(0, totalCount - recentCount);
    rows.push({
      productId: id,
      name: now?.name ?? all.name ?? "Untitled product",
      marketplace: now?.marketplace ?? all.marketplace ?? "unknown",
      imageUrl: now?.image_url ?? all.image_url ?? null,
      recent: recentCount,
      previous,
      delta: recentCount - previous,
      deltaPct: previous > 0 ? ((recentCount - previous) / previous) * 100 : null,
      score: Number(now?.score ?? 0),
    });
  }

  // Biggest absolute movement first: a product that fell 40 actions is as much a
  // signal as one that gained 40, and hiding the fall would sell a half-truth.
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.recent - a.recent);
  return rows.slice(0, limit);
}

export type ShelfIssue = "no_photo" | "no_somali_title" | "no_price" | "not_active";

export const SHELF_ISSUE_LABEL: Record<ShelfIssue, string> = {
  no_photo: "No photo",
  no_somali_title: "No Somali title",
  no_price: "No price",
  not_active: "Not active",
};

export interface ShelfHealthRow {
  id: string;
  title: string;
  issues: ShelfIssue[];
}

export interface ShelfHealth {
  total: number;
  clean: number;
  counts: Record<ShelfIssue, number>;
  rows: ShelfHealthRow[];
}

/** What a pinned card is missing, from the product row itself (no extra reads). */
export function shelfHealth(
  items: Array<{
    id: string;
    title: string;
    images: string[];
    title_somali?: string | null;
    priceUsd?: number | null;
    priceCnyMin?: number | null;
    status?: string | null;
  }>
): ShelfHealth {
  const counts: Record<ShelfIssue, number> = {
    no_photo: 0,
    no_somali_title: 0,
    no_price: 0,
    not_active: 0,
  };
  const rows: ShelfHealthRow[] = [];
  for (const p of items) {
    const issues: ShelfIssue[] = [];
    if (!p.images || p.images.length === 0) issues.push("no_photo");
    if (!(p.title_somali ?? "").trim()) issues.push("no_somali_title");
    if (p.priceUsd === null || p.priceUsd === undefined) {
      if (p.priceCnyMin === null || p.priceCnyMin === undefined) issues.push("no_price");
    }
    if ((p.status ?? "active") !== "active") issues.push("not_active");
    for (const issue of issues) counts[issue] += 1;
    if (issues.length > 0) rows.push({ id: p.id, title: p.title, issues });
  }
  return { total: items.length, clean: items.length - rows.length, counts, rows };
}

export interface ShelfFill {
  target: number;
  pinned: number;
  organic: number;
  short: number;
}

/**
 * How many of the home shelf's slots are actually filled, and by what. `short` is
 * the number of slots that will render nothing — the number a staff member can
 * act on by pinning something.
 */
export function shelfFill(pinned: number, available: number, target = SHELF_TARGET): ShelfFill {
  const p = Math.max(0, pinned);
  const a = Math.max(0, available);
  const filled = Math.min(target, p + a);
  return {
    target,
    pinned: Math.min(p, target),
    organic: Math.max(0, filled - Math.min(p, target)),
    short: Math.max(0, target - filled),
  };
}

/** Where demand came from, per dimension. Both dimensions total the same events. */
export interface DemandMix {
  days: number;
  byMarketplace: Breakdown;
  byEvent: Breakdown;
}

export interface MomentumResult {
  rows: MomentumRow[];
  recentDays: number;
  previousDays: number;
  /** True when the window had to be shortened because the RPC caps at 90 days. */
  truncated: boolean;
  /** Products the RPC returned in either window (capped at 100 per window). */
  considered: number;
}
