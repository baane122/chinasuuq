"use client";

/**
 * Shared constants + honest formatters for the Trending (Mission Control) screen.
 *
 * The numbers here are NOT invented — every weight and the 3-day half-life mirror
 * `supabase/migrations/202609250002_trending_products.sql`, which is the real
 * definition of `fn_trending_products`. We restate them in words so a staff member
 * reads the same formula the database runs, instead of trusting an opaque "score".
 *
 * HONESTY RULES that the rest of the folder depends on:
 *  - A pin (`source === "pinned"`) is a human choice, never organic popularity.
 *  - `sales_count` (best-seller fallback) is a number copied off 1688/Taobao that
 *    means "sold on THAT marketplace" — not ChinaSuuq engagement. Labelled as such.
 *  - A failed read and an empty ledger are different sentences, never both "0".
 *  - The score is weight × decay over a window, so raw event counts shown here do
 *    NOT add up to the score — the phrasing says that instead of implying it.
 */

import type {
  CatalogProduct,
  Locale,
  ProductEventType,
  TrendingSource,
} from "@/lib/catalog";

/** The four event types `product_events` records and `fn_trending_products` weights. */
export const EVENT_WEIGHTS: { type: ProductEventType; weight: number; label: string }[] = [
  { type: "view", weight: 1, label: "View" },
  { type: "search_click", weight: 2, label: "Search click" },
  { type: "add_to_cart", weight: 4, label: "Add to cart" },
  { type: "order", weight: 8, label: "Order" },
];

export const EVENT_WEIGHT_MAP: Record<ProductEventType, number> = {
  view: 1,
  search_click: 2,
  add_to_cart: 4,
  order: 8,
};

export const EVENT_LABEL: Record<ProductEventType, string> = {
  view: "View",
  search_click: "Search click",
  add_to_cart: "Add to cart",
  order: "Order",
};

export function isProductEventType(value: string | null | undefined): value is ProductEventType {
  return value === "view" || value === "search_click" || value === "add_to_cart" || value === "order";
}

/**
 * Time-window chips. The RPC clamps `p_days` to [1, 90] (see `greatest(1, least(…, 90))`),
 * so a value above 90 is silently served as 90 — the "90d" chip is therefore the widest
 * honest window and "All" is NOT offered (there is no way to ask for an unbounded window).
 */
export const WINDOWS: { days: number; label: string; caption: string }[] = [
  { days: 1, label: "24h", caption: "the last 24 hours" },
  { days: 7, label: "7d", caption: "the last 7 days" },
  { days: 30, label: "30d", caption: "the last 30 days" },
  { days: 90, label: "90d", caption: "the last 90 days (the ranking's widest window)" },
];

export function windowCaption(days: number): string {
  return WINDOWS.find((w) => w.days === days)?.caption ?? `the last ${days} days`;
}

/** ISO timestamp `days` before now, for ledger window filters. */
export function windowStartIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/** One line a staff member can read instead of a bare score number. */
export const SCORE_FORMULA =
  "Score = view×1 + search click×2 + add-to-cart×4 + order×8, each multiplied by a 3-day half-life " +
  "so a week-old action counts far less than a fresh one.";

/** Marketplace display + a stable chip tone. Values match source_products.marketplace. */
export const MARKETPLACE_OPTIONS: { value: string; label: string }[] = [
  { value: "1688", label: "1688" },
  { value: "taobao", label: "Taobao" },
  { value: "yiwugo", label: "YiwuGo" },
  { value: "chinagoods", label: "ChinaGoods" },
  { value: "chinasuuq", label: "ChinaSuuq" },
];

/** Badge copy + tone per trending source. A pin must never read as organic. */
export const SOURCE_META: Record<
  TrendingSource,
  { label: string; badge: string; title: string }
> = {
  pinned: {
    label: "Staff pick",
    badge: "bg-brand-500/10 text-brand-700 border-brand-500/30 dark:text-brand-300",
    title: "A staff member pinned this — it is a human choice, not customer behaviour.",
  },
  behaviour: {
    label: "Trending by views",
    badge: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300",
    title: "Ranked from real product_events activity in this window.",
  },
  bestseller: {
    label: "Best seller on 1688",
    badge: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
    title:
      "No pins and no recorded activity, so this is ordered by sales_count — a number copied from the Chinese marketplace meaning 'sold there', NOT ChinaSuuq engagement.",
  },
};

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US");
}

export function formatScore(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toFixed(2);
}

/**
 * Bilingual title pair for a card. English first for the operator, Somali second
 * when it exists. Falls back to the original (usually Chinese) title the importer
 * stored so a card is never blank, then to the product id.
 */
export function titlePair(p: CatalogProduct): { primary: string; secondary: string | null } {
  const en = (p.title_english ?? "").trim();
  const so = (p.title_somali ?? "").trim();
  const orig = (p.title_original ?? "").trim();
  const primary = en || so || orig || `Product ${p.id.slice(0, 8)}`;
  // Secondary is a DIFFERENT non-empty string than the primary.
  const secondary = [so, en, orig].find((t) => t && t !== primary) ?? null;
  return { primary, secondary };
}

export function pickDisplayTitle(p: CatalogProduct, locale: Locale): string {
  if (locale === "so") {
    return (p.title_somali ?? "").trim() || (p.title_english ?? "").trim() || (p.title_original ?? "").trim() || p.id.slice(0, 8);
  }
  return (p.title_english ?? "").trim() || (p.title_somali ?? "").trim() || (p.title_original ?? "").trim() || p.id.slice(0, 8);
}

/** Price in USD when we have a real estimate, else CNY, else an honest "no price". */
export function priceLabel(p: CatalogProduct): { text: string; approx: boolean } {
  if (p.priceUsd !== null) return { text: `$${p.priceUsd.toFixed(2)}`, approx: false };
  if (p.priceCnyMin !== null) return { text: `¥${p.priceCnyMin.toFixed(0)}`, approx: true };
  return { text: "No price", approx: false };
}

/** "2h ago"-style freshness for `curation.pinned_at`; "—" for missing/invalid. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const mins = Math.floor((Date.now() - t) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Who pinned it, from the value `writeTrendingCuration` stored in `pinned_by`. */
export function pinnerLabel(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "a staff member";
  // A stored email reads better than a uuid; anything else is shown as-is.
  if (s.includes("@")) return s.split("@")[0];
  return s;
}

/**
 * A raw event mix for one product, from the ledger. Counts are RAW (one row each);
 * the score additionally applies weight × decay, so these do not sum to the score.
 * Returns null when there is nothing to say.
 */
export function describeEventMix(counts: Partial<Record<ProductEventType, number>>): string | null {
  const parts = EVENT_WEIGHTS.map(({ type, label }) => {
    const n = counts[type] ?? 0;
    return n > 0 ? `${n} ${label.toLowerCase() + (n === 1 ? "" : "s")}` : null;
  }).filter((x): x is string => Boolean(x));
  return parts.length ? parts.join(" · ") : null;
}

/** Best available image for a product; null renders the placeholder. */
export function bestImage(p: CatalogProduct): string | null {
  return p.primaryImage ?? null;
}
