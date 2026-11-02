"use client";

/**
 * Trending insights — the three questions the shelf cannot answer by itself.
 *
 *   1. IS THE SHELF FILLING ITSELF?  A ring of the 12 home slots split into staff
 *      picks and organic cards, plus the count of slots that render NOTHING.
 *   2. WHERE IS DEMAND COMING FROM? Exact head-counts per marketplace and per
 *      event type over the selected window.
 *   3. WHAT IS MOVING?              This window vs the equally long window before
 *      it, in raw actions, biggest movement first (a collapse counts).
 *
 * HONESTY RULES ENFORCED HERE
 *  - Every panel has its OWN loading and error state. A dead read never renders as
 *    a row of zeros, and a panel that failed says which half failed.
 *  - Momentum is raw counts, never scores, and a previous window of zero reads as
 *    "new" instead of an infinite percentage.
 *  - The "slots that render nothing" number is derived from the same merge rule the
 *    home page uses (pins → behaviour → best sellers) and is labelled that way.
 *  - No conversion rate is shown. The ledger view drops `session_id`, so orders
 *    divided by views would be a ratio of two unrelated totals.
 *  - Everything is read-only. Opening a product from here is a link, so no fake
 *    view event is written into the production ledger.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ExternalLink,
  ImageOff,
  Languages,
  Loader2,
  RefreshCw,
  Target,
} from "lucide-react";
import type { CatalogProduct } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { SectionCard, SkeletonBlock } from "@/components/admin/ui";
import { formatNumber, pickDisplayTitle, windowCaption } from "./helpers";
import {
  RPC_MAX_DAYS,
  SHELF_ISSUE_LABEL,
  SHELF_TARGET,
  shareOf,
  shelfFill,
  shelfHealth,
  type Breakdown,
  type ShelfIssue,
} from "@/lib/admin/trendingInsights";
import {
  fetchDemandMix,
  fetchMomentum,
  type DemandMix,
  type MomentumResult,
} from "@/lib/admin/trendingInsightsLive";

/** A marketplace's chip colour. Unknown keys fall back to neutral, never guessed. */
const MARKET_TONE: Record<string, string> = {
  "1688": "bg-orange-500",
  taobao: "bg-rose-500",
  yiwugo: "bg-sky-500",
  chinagoods: "bg-violet-500",
  chinasuuq: "bg-emerald-500",
  unknown: "bg-dark-900/25 dark:bg-neutral-600",
};

const EVENT_TONE: Record<string, string> = {
  view: "bg-sky-500",
  search_click: "bg-violet-500",
  add_to_cart: "bg-amber-500",
  order: "bg-emerald-500",
};

const EVENT_LABEL: Record<string, string> = {
  view: "View",
  search_click: "Search click",
  add_to_cart: "Add to cart",
  order: "Order",
};

const ISSUE_ICON: Record<ShelfIssue, typeof ImageOff> = {
  no_photo: ImageOff,
  no_somali_title: Languages,
  no_price: Target,
  not_active: AlertTriangle,
};

function toneFor(key: string, map: Record<string, string>): string {
  return map[key] ?? "bg-dark-900/25 dark:bg-neutral-600";
}

/**
 * One measured dimension. The residual row is what keeps the bars honest: it is
 * the part of the true total we did not enumerate, so the list always adds up.
 */
function BreakdownBars({
  breakdown,
  map,
  labels,
}: {
  breakdown: Breakdown;
  map: Record<string, string>;
  labels?: Record<string, string>;
}) {
  if (breakdown.error) {
    return (
      <p className="flex items-start gap-1.5 rounded-xl border border-error/25 bg-error/5 px-3 py-2 text-[11px] text-error">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        This split could not be read ({breakdown.error}). That is a dead read, not zero activity.
      </p>
    );
  }

  const rows = [
    ...breakdown.rows.map((r) => ({ key: r.key, label: labels?.[r.key] ?? r.key, count: r.count, residual: false })),
    ...(breakdown.residual > 0
      ? [{ key: "__residual", label: breakdown.residualLabel, count: breakdown.residual, residual: true }]
      : []),
  ];

  if (breakdown.total === 0) {
    return (
      <p className="text-[12px] leading-relaxed text-dark-900/45 dark:text-neutral-500">
        The read succeeded and this window has no recorded events, so there is nothing to split.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-dark-900/[0.06] dark:bg-white/[0.08]">
        {rows.map((r) => (
          <span
            key={r.key}
            className={cn("h-full", r.residual ? "bg-dark-900/20 dark:bg-neutral-600" : toneFor(r.key, map))}
            style={{ width: `${shareOf(r.count, breakdown.total) * 100}%` }}
            title={`${r.label}: ${formatNumber(r.count)}`}
          />
        ))}
      </div>
      <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2 text-[11px]">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", r.residual ? "bg-dark-900/20 dark:bg-neutral-600" : toneFor(r.key, map))} />
            <span className="min-w-0 flex-1 truncate text-dark-900/60 dark:text-neutral-400">{r.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-dark-900 dark:text-neutral-100">
              {formatNumber(r.count)}
            </span>
            <span className="w-10 shrink-0 text-right tabular-nums text-dark-900/40 dark:text-neutral-500">
              {Math.round(shareOf(r.count, breakdown.total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The 12 home slots, split by who filled them. */
function FillRing({
  pinned,
  available,
  capped,
  loading,
}: {
  pinned: number;
  /** Organic cards the feed can supply right now. */
  available: number;
  /** True when the feed was read with a limit below the shelf target, so
   *  `available` is a floor rather than a measurement. */
  capped: boolean;
  loading: boolean;
}) {
  const fill = useMemo(() => shelfFill(pinned, available), [pinned, available]);
  if (loading) return <SkeletonBlock className="h-32" />;

  const used = fill.pinned + fill.organic;
  const pct = Math.round((used / fill.target) * 100);

  return (
    <div className="flex items-center gap-4">
      <div
        className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(#f97316 0 ${shareOf(fill.pinned, fill.target) * 100}%, #38bdf8 ${
            shareOf(fill.pinned, fill.target) * 100
          }% ${shareOf(used, fill.target) * 100}%, rgba(120,113,108,0.14) ${shareOf(used, fill.target) * 100}% 100%)`,
        }}
        role="img"
        aria-label={`${used} of ${fill.target} home slots filled`}
      >
        <div className="flex h-[74px] w-[74px] flex-col items-center justify-center rounded-full bg-white dark:bg-dark-900">
          <span className="text-lg font-bold leading-none text-dark-900 dark:text-neutral-100">{pct}%</span>
          <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-dark-900/40 dark:text-neutral-500">
            filled
          </span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5 text-[11px]">
        <p className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-dark-900/60 dark:text-neutral-400">
            <span className="h-2 w-2 rounded-full bg-orange-500" /> Staff picks
          </span>
          <span className="font-semibold tabular-nums text-dark-900 dark:text-neutral-100">{fill.pinned}</span>
        </p>
        <p className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-dark-900/60 dark:text-neutral-400">
            <span className="h-2 w-2 rounded-full bg-sky-500" /> Organic
          </span>
          <span className="font-semibold tabular-nums text-dark-900 dark:text-neutral-100">
            {capped ? "≥" : ""}
            {fill.organic}
          </span>
        </p>
        <p className="flex items-center justify-between gap-2 border-t border-dark-900/[0.06] pt-1.5 dark:border-white/[0.08]">
          <span className="text-dark-900/60 dark:text-neutral-400">Empty slots</span>
          <span
            className={cn(
              "font-semibold tabular-nums",
              fill.short > 0 ? "text-warning" : "text-success"
            )}
          >
            {fill.short}
          </span>
        </p>
        {fill.short > 0 && (
          <p className="text-[10px] leading-relaxed text-dark-900/45 dark:text-neutral-500">
            The home shelf shows {SHELF_TARGET} cards; {fill.short} will render nothing until more is pinned or
            more activity is recorded.
          </p>
        )}
        {capped && (
          <p className="text-[10px] leading-relaxed text-dark-900/45 dark:text-neutral-500">
            The feed was read with a {SHELF_TARGET}-card preview limit, so the organic count is a floor — raise
            the limit on Publish preview to measure it exactly.
          </p>
        )}
      </div>
    </div>
  );
}

/** One row of "what is moving". Raw counts, so the comparison is fair. */
function MomentumList({
  result,
  loading,
  error,
  onRetry,
}: {
  result: MomentumResult | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-12" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-wrap items-start gap-2 rounded-xl border border-error/25 bg-error/5 px-3 py-2.5 text-[11px] text-error">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p className="flex-1">{error} This is a dead read, not a quiet week.</p>
        <button onClick={onRetry} className="admin-btn-outline h-7 shrink-0 px-2.5 text-[11px]">
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      </div>
    );
  }
  if (!result || result.rows.length === 0) {
    return (
      <p className="rounded-xl border border-dark-900/[0.06] bg-warm-50 px-3 py-2.5 text-[11px] leading-relaxed text-dark-900/55 dark:border-white/[0.06] dark:bg-dark-800/60 dark:text-neutral-400">
        The ranking read succeeded and returned no products for either window. Momentum needs recorded events
        before it can say anything.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {result.rows.map((m) => {
        const rising = m.delta > 0;
        const flat = m.delta === 0;
        return (
          <div
            key={m.productId}
            className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-warm-50 dark:hover:bg-dark-800/60"
          >
            <span className="h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-warm-100 dark:bg-dark-800">
              {m.imageUrl ? (

                <img src={m.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center">
                  <ImageOff className="h-3.5 w-3.5 text-dark-900/25 dark:text-neutral-600" />
                </span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-dark-900 dark:text-neutral-100" title={m.name}>
                {m.name}
              </p>
              <p className="truncate text-[10px] text-dark-900/45 dark:text-neutral-500">
                {m.marketplace} · {formatNumber(m.recent)} now vs {formatNumber(m.previous)} before
              </p>
            </div>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
                flat
                  ? "bg-dark-900/[0.06] text-dark-900/50 dark:bg-white/10 dark:text-neutral-400"
                  : rising
                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
                    : "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
              )}
            >
              {flat ? "no change" : rising ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {flat
                ? ""
                : m.deltaPct === null
                  ? "new"
                  : `${m.deltaPct > 0 ? "+" : ""}${Math.round(m.deltaPct)}%`}
            </span>
            <Link
              href={`/admin/products?q=${encodeURIComponent(m.name)}`}
              className="shrink-0 text-dark-900/25 transition-colors hover:text-brand-500 dark:text-neutral-600"
              title="Open in Products"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        );
      })}
      <p className="pt-1 text-[10px] leading-relaxed text-dark-900/40 dark:text-neutral-500">
        Compared as <span className="font-semibold">raw actions</span> over{" "}
        {result.recentDays === 1 ? "the last 24 hours" : `the last ${result.recentDays} days`} vs{" "}
        {result.previousDays === 1 ? "the 24 hours before" : `the ${result.previousDays} days before`}.
        {result.truncated && ` The window was shortened to ${RPC_MAX_DAYS / 2} days so the two halves stay equal.`}
        {" "}The score decays with age, so it is deliberately not compared across windows.
      </p>
    </div>
  );
}

export default function TrendingInsights({
  pins,
  availableOrganic,
  organicCapped,
  pinsLoading,
  days,
  refreshKey,
  locale,
  onPreviewProduct,
}: {
  /** The persisted shelf, so "filled" means actually published. */
  pins: CatalogProduct[];
  /** How many organic cards the feed could supply right now. */
  availableOrganic: number;
  /** True when the feed's read limit was below the shelf target. */
  organicCapped: boolean;
  pinsLoading: boolean;
  days: number;
  refreshKey: number;
  locale: "en" | "so";
  onPreviewProduct: (product: CatalogProduct) => void;
}) {
  const [mix, setMix] = useState<DemandMix | null>(null);
  const [mixLoading, setMixLoading] = useState(true);
  const [mixError, setMixError] = useState<string | null>(null);

  const [momentum, setMomentum] = useState<MomentumResult | null>(null);
  const [momentumLoading, setMomentumLoading] = useState(true);
  const [momentumError, setMomentumError] = useState<string | null>(null);

  /**
   * `announce` is false on the effect path: the panels already start in their
   * loading state, so setting it again inside the effect body would be a
   * synchronous state write during render-then-effect and a cascading re-render.
   * A button press does need it, because the previous answer is still on screen.
   */
  const loadMix = useCallback(async (announce = false) => {
    if (announce) {
      setMixLoading(true);
      setMixError(null);
    }
    try {
      const res = await fetchDemandMix(days);
      if (!res.ok) {
        setMix(null);
        setMixError(res.reason);
        return;
      }
      setMixError(null);
      setMix(res.data);
    } catch (e) {
      setMix(null);
      setMixError(e instanceof Error ? e.message : "The ledger could not be read.");
    } finally {
      setMixLoading(false);
    }
  }, [days]);

  const loadMomentum = useCallback(async (announce = false) => {
    if (announce) {
      setMomentumLoading(true);
      setMomentumError(null);
    }
    try {
      const res = await fetchMomentum(days, 8);
      if (!res.ok) {
        setMomentum(null);
        setMomentumError(res.reason);
        return;
      }
      setMomentumError(null);
      setMomentum(res.data);
    } catch (e) {
      setMomentum(null);
      setMomentumError(e instanceof Error ? e.message : "The ranking could not be read.");
    } finally {
      setMomentumLoading(false);
    }
  }, [days]);

  /**
   * Kick both reads off in parallel. They stay separate panels because one can be
   * a dead read while the other still has an answer; neither waits for the other.
   *
   * The awaits come first and the state writes after them, so no render commit is
   * followed by a synchronous setState. Both panels start in their loading state,
   * so the first paint is already correct.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.all([loadMix(), loadMomentum()]);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMix, loadMomentum, refreshKey]);

  const health = useMemo(() => shelfHealth(pins), [pins]);
  const issueRows = health.rows.slice(0, 4);
  const totalIssues = health.rows.reduce((n, r) => n + r.issues.length, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* ─── 1. Fill ─────────────────────────────────────────────── */}
      <SectionCard
        title="Shelf fill"
        subtitle={`${SHELF_TARGET} cards is what the home section shows. Pins fill first, then the behaviour ranking.`}
        className="lg:col-span-1"
      >
        <div className="space-y-4">
          <FillRing
            pinned={pins.length}
            available={availableOrganic}
            capped={organicCapped}
            loading={pinsLoading}
          />
          <div className="rounded-xl border border-dark-900/[0.06] bg-warm-50 px-3 py-2.5 dark:border-white/[0.06] dark:bg-dark-800/60">
            <p className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-dark-900/55 dark:text-neutral-400">Pinned but incomplete</span>
              <span className={cn("font-bold tabular-nums", totalIssues > 0 ? "text-warning" : "text-success")}>
                {totalIssues}
              </span>
            </p>
            {totalIssues > 0 ? (
              <ul className="mt-1.5 space-y-1">
                {issueRows.map((r) => {
                  const product = pins.find((p) => p.id === r.id);
                  return (
                    <li key={r.id} className="flex items-start gap-1.5 text-[10px] leading-relaxed text-dark-900/55 dark:text-neutral-400">
                      <span className="min-w-0 flex-1 truncate">
                        {product ? pickDisplayTitle(product, locale) : r.title}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {r.issues.map((issue) => {
                          const Icon = ISSUE_ICON[issue];
                          return <Icon key={issue} className="h-3 w-3 text-warning" aria-label={SHELF_ISSUE_LABEL[issue]} />;
                        })}
                      </span>
                      {product && (
                        <button
                          onClick={() => onPreviewProduct(product)}
                          className="shrink-0 text-[10px] font-semibold text-brand-600 hover:underline dark:text-brand-400"
                        >
                          Fix
                        </button>
                      )}
                    </li>
                  );
                })}
                {health.rows.length > issueRows.length && (
                  <li className="text-[10px] text-dark-900/40 dark:text-neutral-500">
                    +{health.rows.length - issueRows.length} more
                  </li>
                )}
              </ul>
            ) : (
              <p className="mt-1 text-[10px] leading-relaxed text-dark-900/45 dark:text-neutral-500">
                Every pinned product has a photo, a Somali title, a price and an active status.
              </p>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ─── 2. Demand mix ───────────────────────────────────────── */}
      <SectionCard
        title="Where demand comes from"
        subtitle={`Exact counts ${windowCaption(days)} — per marketplace and per recorded action.`}
        className="lg:col-span-1"
        actions={
          <button onClick={() => void loadMix(true)} disabled={mixLoading} className="admin-btn-ghost h-7 px-2 text-[11px]">
            {mixLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </button>
        }
      >
        <div className="space-y-4">
          {mixLoading && !mix ? (
            <div className="space-y-3">
              <SkeletonBlock className="h-2" />
              <SkeletonBlock className="h-16" />
              <SkeletonBlock className="h-16" />
            </div>
          ) : mixError ? (
            <div className="flex flex-wrap items-start gap-2 rounded-xl border border-error/25 bg-error/5 px-3 py-2.5 text-[11px] text-error">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p className="flex-1">{mixError}</p>
              <button onClick={() => void loadMix(true)} className="admin-btn-outline h-7 shrink-0 px-2.5 text-[11px]">
                Retry
              </button>
            </div>
          ) : mix ? (
            <>
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-dark-900/60 dark:text-neutral-300">
                  <BarChart3 className="h-3.5 w-3.5 text-brand-500" /> By marketplace
                </p>
                <BreakdownBars breakdown={mix.byMarketplace} map={MARKET_TONE} />
              </div>
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-dark-900/60 dark:text-neutral-300">
                  <Activity className="h-3.5 w-3.5 text-brand-500" /> By action
                </p>
                <BreakdownBars breakdown={mix.byEvent} map={EVENT_TONE} labels={EVENT_LABEL} />
              </div>
              <p className="text-[10px] leading-relaxed text-dark-900/40 dark:text-neutral-500">
                Actions are not visitors: the ledger records at most one action of each type per product per 60
                seconds, so these totals are recorded actions, not unique people.
              </p>
            </>
          ) : null}
        </div>
      </SectionCard>

      {/* ─── 3. Momentum ─────────────────────────────────────────── */}
      <SectionCard
        title="What is moving"
        subtitle="This window vs the one before it, in raw actions. Biggest movement first."
        className="lg:col-span-1"
        actions={
          <button
            onClick={() => void loadMomentum(true)}
            disabled={momentumLoading}
            className="admin-btn-ghost h-7 px-2 text-[11px]"
          >
            {momentumLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </button>
        }
      >
        <div>
          <MomentumList
            result={momentum}
            loading={momentumLoading}
            error={momentumError}
            onRetry={() => void loadMomentum(true)}
          />
        </div>
      </SectionCard>
    </div>
  );
}
