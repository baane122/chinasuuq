"use client";

/**
 * Publish preview — what the customer home trending shelf will render, right now.
 *
 * It calls the SAME `fetchTrendingFeed()` the live `TrendingProducts.tsx` section
 * calls, so this is not a mock: the order you see is the order the customer gets.
 * The home pins days=7 and limit=12, and the controls here expose exactly those
 * two knobs (plus locale) so staff can see how the shelf reads at other sizes
 * before trusting the defaults.
 *
 * The card is a faithful-but-static preview. It deliberately does NOT reuse the
 * customer `ProductCard`, because that component records a `view` event every time
 * it scrolls into view — rendering it inside Mission Control would write fake
 * customer activity into the production ledger. Nothing on this screen writes.
 *
 * Order shown is the merge order the foundation guarantees:
 *   1. staff pins (rank order)  2. behaviour ranking  3. marketplace best-sellers
 * and each card is labelled with which bucket it landed in, so a pin never reads
 * as organic demand.
 */

import { RefreshCw, Loader2, Eye, DatabaseBackup, ArrowDownWideNarrow } from "lucide-react";
import type { Locale, TrendingFeed, TrendingItem } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/admin/ui";
import { SourceBadge, TrendingThumb } from "./bits";
import {
  formatNumber,
  formatScore,
  pickDisplayTitle,
  priceLabel,
  WINDOWS,
} from "./helpers";

/** The live home renders 7 days / 12 cards — surfaced so the default is not a guess. */
const LIVE_DEFAULTS = { days: 7, limit: 12 };
const LIMIT_OPTIONS = [6, 12, 20, 30];

const ORDER_STEPS = [
  { key: "pinned", text: "Staff picks, in the exact order you set" },
  { key: "behaviour", text: "Behaviour ranking to fill the remaining slots" },
  { key: "bestseller", text: "Marketplace best sellers only if the shelf would be empty" },
] as const;

function customerLabel(item: TrendingItem): string {
  if (item.source === "pinned") return "Selected for you";
  if (item.source === "bestseller") {
    const market = item.product.marketplace ?? "";
    return market && market !== "unknown" ? `Best seller on ${market}` : "Best seller";
  }
  return typeof item.eventCount === "number" && item.eventCount > 0
    ? `Trending · ${formatNumber(item.eventCount)} view${item.eventCount === 1 ? "" : "s"}`
    : "Trending by views";
}

function PreviewCard({ item, index, locale }: { item: TrendingItem; index: number; locale: Locale }) {
  const { product } = item;
  const { text: price, approx } = priceLabel(product);
  const title = pickDisplayTitle(product, locale);
  const secondary =
    locale === "so"
      ? (product.title_english ?? "").trim()
      : (product.title_somali ?? "").trim();

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-dark-900/[0.06] bg-white shadow-sm dark:border-white/[0.08] dark:bg-dark-900">
      {/* Home render position */}
      <span className="absolute left-2 top-2 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-dark-900/70 px-1.5 text-[11px] font-bold text-white backdrop-blur">
        {index + 1}
      </span>
      <div className="absolute right-2 top-2 z-10">
        <SourceBadge source={item.source} />
      </div>

      <TrendingThumb product={product} className="aspect-[4/5] w-full" rounded="rounded-none" alt={title} />

      <div className="flex flex-1 flex-col p-3">
        <p className="line-clamp-2 min-h-[2.5em] text-xs font-semibold leading-snug text-dark-900 dark:text-neutral-100" title={title}>
          {title}
        </p>
        {secondary && secondary !== title && (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-dark-900/45 dark:text-neutral-500" title={secondary}>
            {secondary}
          </p>
        )}
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-sm font-bold text-dark-900 dark:text-neutral-100">{price}</span>
          {approx && <span className="text-[10px] font-medium text-dark-900/40">CNY</span>}
        </div>
        <p className="mt-1.5 text-[10px] font-medium text-brand-600 dark:text-brand-400">{customerLabel(item)}</p>
        {item.source === "behaviour" && item.score !== null && (
          <p className="mt-0.5 text-[10px] text-dark-900/45 dark:text-neutral-500" title="Weighted, decayed score from the event ledger">
            score {formatScore(item.score)}
          </p>
        )}
      </div>
    </div>
  );
}

export default function PublishPreview({
  days,
  onChangeDays,
  limit,
  onChangeLimit,
  locale,
  onChangeLocale,
  feed,
  loading,
  error,
  onRetry,
}: {
  days: number;
  onChangeDays: (days: number) => void;
  limit: number;
  onChangeLimit: (limit: number) => void;
  locale: Locale;
  onChangeLocale: (locale: Locale) => void;
  /** Owned by the page: the same feed read that fills the KPI strip, so the two
   *  can never disagree about what the home page serves. */
  feed: TrendingFeed | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const items = feed?.items ?? [];
  const isLiveHomeDefaults = days === LIVE_DEFAULTS.days && limit === LIVE_DEFAULTS.limit;

  return (
    <div className="space-y-4">
      {/* Controls: the two knobs the public section actually exposes */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Preview window">
            <div className="flex flex-wrap items-center gap-1.5">
              {WINDOWS.map((w) => (
                <button
                  key={w.days}
                  onClick={() => onChangeDays(w.days)}
                  aria-pressed={w.days === days}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                    w.days === days
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-dark-900/10 bg-white text-dark-900/60 hover:border-dark-900/25 dark:border-white/10 dark:bg-dark-900 dark:text-neutral-400"
                  )}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
          <label className="inline-flex items-center gap-1.5 text-xs text-dark-900/55 dark:text-neutral-400">
            Cards
            <select
              value={String(limit)}
              onChange={(e) => onChangeLimit(Number(e.target.value))}
              className="h-8 rounded-lg border border-dark-900/10 bg-white px-2 text-xs font-semibold focus:border-brand-500 focus:outline-none dark:border-white/10 dark:bg-dark-800 dark:text-neutral-200"
            >
              {LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div role="group" aria-label="Preview language" className="inline-flex overflow-hidden rounded-lg border border-dark-900/10 dark:border-white/10">
            {(["en", "so"] as Locale[]).map((l) => (
              <button
                key={l}
                onClick={() => onChangeLocale(l)}
                aria-pressed={locale === l}
                className={cn(
                  "px-2.5 py-1 text-xs font-semibold transition-colors",
                  locale === l ? "bg-brand-500 text-white" : "bg-white text-dark-900/55 dark:bg-dark-900 dark:text-neutral-400"
                )}
              >
                {l === "en" ? "EN" : "SO"}
              </button>
            ))}
          </div>
        </div>
        <button onClick={onRetry} disabled={loading} className="admin-btn-outline h-9 px-3 text-xs">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
        </button>
      </div>

      {/* Merge order explainer + a truth about the live defaults */}
      <div className="flex flex-wrap items-start gap-x-6 gap-y-2 rounded-xl border border-dark-900/[0.06] bg-warm-50 px-4 py-3 text-[11px] dark:border-white/[0.06] dark:bg-dark-800/60">
        <span className="inline-flex items-center gap-1.5 font-semibold text-dark-900/70 dark:text-neutral-200">
          <ArrowDownWideNarrow className="h-3.5 w-3.5 text-brand-500" /> Fill order
        </span>
        {ORDER_STEPS.map((s, i) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-dark-900/55 dark:text-neutral-400">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-500/15 text-[10px] font-bold text-brand-600">{i + 1}</span>
            {s.text}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-dark-900/45 dark:text-neutral-500">
        {isLiveHomeDefaults ? (
          <span className="inline-flex items-center gap-1.5 text-success">
            <Eye className="h-3.5 w-3.5" /> This is exactly what the live customer home shows — 7-day window, 12 cards.
          </span>
        ) : (
          <span>
            Preview at your chosen settings. The live home currently uses {LIVE_DEFAULTS.days}-day / {LIVE_DEFAULTS.limit}-card defaults.
          </span>
        )}
      </p>

      {feed && feed.servedFrom === "cache" && (
        <p className="inline-flex items-center gap-2 rounded-xl border border-warning/25 bg-warning/5 px-3 py-2 text-xs text-warning">
          <DatabaseBackup className="h-3.5 w-3.5" />
          The ranking RPC was unreachable, so this is the last feed we saved — not a live read.
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: Math.min(limit, 8) }).map((_, i) => (
            <SkeletonBlock key={i} className="h-56" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={`${error} — the trending feed could not be reached. This is a failed read, not an empty shelf.`} onRetry={onRetry} />
      ) : feed && feed.behaviourError && items.length > 0 && feed.pinnedCount > 0 ? (
        // Pins saved the shelf even though behaviour was dead — say so, honestly.
        <p className="rounded-xl border border-warning/25 bg-warning/5 px-3 py-2 text-[11px] text-warning">
          Staff picks are showing, but the behaviour ranking was unreachable ({feed.behaviourError}), so no organic
          cards could fill the remaining slots.
        </p>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <div className="rounded-2xl border border-dark-900/[0.06] bg-white dark:border-white/[0.08] dark:bg-dark-900">
          <EmptyState
            image="/admin/empty_products.webp"
            compact
            title="The shelf would render empty"
            subtitle="Nothing is pinned, no customer activity is recorded yet, and there are no active products to fall back to best sellers. Until a pin exists or events accumulate, the home trending section shows its own empty state."
          />
        </div>
      ) : (
        !loading &&
        !error &&
        feed && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((item, i) => (
                <PreviewCard key={item.product.id} item={item} index={i} locale={locale} />
              ))}
            </div>
            <p className="text-[11px] text-dark-900/45 dark:text-neutral-500">
              {feed.pinnedCount > 0 && `${feed.pinnedCount} staff ${feed.pinnedCount === 1 ? "pick" : "picks"} at the front. `}
              {feed.behaviourLive && `${items.filter((i) => i.source === "behaviour").length} behaviour-ranked cards. `}
              {items.some((i) => i.source === "bestseller") && (
                <span className="text-warning">
                  {items.filter((i) => i.source === "bestseller").length} best-seller fallback cards (1688 sales counts, not ChinaSuuq demand).
                </span>
              )}
            </p>
          </>
        )
      )}
    </div>
  );
}
