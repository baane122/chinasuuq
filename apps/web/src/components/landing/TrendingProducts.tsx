"use client";

/**
 * The home trending shelf — rewritten on top of `fetchTrendingFeed()`.
 *
 * What this replaces: the old section called `supabase.rpc("fn_trending_products")`
 * itself, declared an `"error"` status it could never reach (its loader returned
 * `null` on failure and the caller painted that as `"empty"`), ignored the TTL it
 * had defined, and printed a flame badge for every card. With the production ledger
 * at 0 rows and a dead RPC, all of that looked identical: "No trending products
 * this week" — a sentence about customer demand that was actually a database
 * failure. Now:
 *
 *   loading      → skeletons
 *   live         → feed from the database, each card labelled with why it is here
 *   cache        → the last feed we managed to save, said out loud, TTL honoured
 *   empty        → nothing pinned AND nothing watched: a fact about the shelf
 *   unavailable  → the RPC's own error message plus a retry, never blamed on data
 *
 * Pinned picks are labelled "Selected for you" — staff curation is not organic
 * demand and must never claim the flame. The flame number only appears when the
 * behaviour ledger really returned an event count.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Flame, ArrowRight, Loader2, RefreshCw, WifiOff, DatabaseBackup } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  TRENDING_CACHE_TTL_MS,
  fetchTrendingFeed,
  type Locale,
  type TrendingFeed,
  type TrendingItem,
} from "@/lib/catalog";
import ProductCard from "./ProductCard";

const DAYS = 7;
const LIMIT = 12;

/** Kept outside the component so navigating home → catalog → home does not re-hit
 *  the database, and so the TTL actually means something instead of being a
 *  constant nothing reads. */
let sessionCache: { feed: TrendingFeed; at: number; locale: Locale } | null = null;

type Status = "loading" | "live" | "cache" | "empty" | "unavailable";

export default function TrendingProducts() {
  const { t, locale } = useI18n();
  const [feed, setFeed] = useState<TrendingFeed | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [reason, setReason] = useState<string | null>(null);
  const [partial, setPartial] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requestRef = useRef(0);

  const load = useCallback(
    async (force: boolean) => {
      const loc: Locale = locale === "so" ? "so" : "en";
      if (
        !force &&
        sessionCache &&
        sessionCache.locale === loc &&
        Date.now() - sessionCache.at < TRENDING_CACHE_TTL_MS
      ) {
        setFeed(sessionCache.feed);
        setStatus(sessionCache.feed.items.length === 0 ? "empty" : "live");
        setPartial(null);
        return;
      }

      const id = ++requestRef.current;
      if (force) setRefreshing(true);
      else setStatus("loading");

      const res = await fetchTrendingFeed({ days: DAYS, limit: LIMIT, locale: loc });
      if (id !== requestRef.current) return;
      setRefreshing(false);

      if (!res.ok) {
        setStatus("unavailable");
        setReason(res.reason);
        return;
      }

      sessionCache = { feed: res.data, at: Date.now(), locale: loc };
      setFeed(res.data);
      setPartial(res.partial ?? null);
      setStatus(res.data.servedFrom === "cache" ? "cache" : res.data.items.length === 0 ? "empty" : "live");
    },
    [locale]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const sourceLabel = (item: TrendingItem): string => {
    if (item.source === "pinned") return t("trending.selectedForYou");
    if (item.source === "bestseller") {
      const market = item.product.marketplace ?? "";
      return market && market !== "unknown"
        ? t("trending.bestsellerOn").replace("{market}", market)
        : t("trending.bestseller");
    }
    return typeof item.eventCount === "number" && item.eventCount > 0
      ? t("trending.byViewsCount").replace("{n}", String(item.eventCount))
      : t("trending.byViews");
  };

  const items = feed?.items ?? [];

  /** The only flame allowed on the shelf: a real count from the event ledger. */
  const behaviourCount =
    feed && feed.behaviourLive ? items.filter((i) => i.source === "behaviour").length : 0;

  return (
    <section id="trending" className="relative bg-warm-50 px-4 py-16 sm:px-6 lg:px-8 lg:py-20 dark:bg-dark-900">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-24 -top-24 h-[500px] w-[500px] rounded-full bg-brand-500/[0.04] blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-[400px] w-[400px] rounded-full bg-brand-500/[0.03] blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1280px]">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="mb-8 flex flex-wrap items-start justify-between gap-4 lg:mb-10"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10">
              <Flame className="h-4.5 w-4.5 text-brand-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold leading-tight text-dark-900 sm:text-2xl lg:text-3xl dark:text-dark-50">
                {t("trending.title")}
              </h2>
              <p className="mt-0.5 text-sm text-dark-900/50 dark:text-dark-300">{t("trending.subtitle")}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-brand-500/15 bg-brand-500/[0.08] px-3 py-1 text-xs font-medium text-brand-700 sm:inline-flex dark:text-brand-300">
              {t("trending.window").replace("{days}", String(DAYS))}
            </span>
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-full border border-dark-900/10 bg-white px-3 py-1 text-xs font-medium text-dark-900/60 transition-colors hover:border-brand-500/40 hover:text-brand-600 disabled:opacity-60 dark:border-white/10 dark:bg-dark-900 dark:text-dark-200"
              title={t("trending.refreshTip")}
            >
              {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {t("common.retry")}
            </button>
          </div>
        </motion.div>

        {/* One truthful line about where the shelf came from, never a claim of
            demand we did not measure. */}
        {status === "cache" && (
          <p className="mb-4 inline-flex items-center gap-2 rounded-xl border border-warning/25 bg-warning/5 px-3 py-2 text-xs text-warning">
            <DatabaseBackup className="h-3.5 w-3.5" />
            {partial === "cache older than TTL" ? t("trending.cacheStale") : t("trending.cacheServed")}
          </p>
        )}

        {status === "loading" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-dark-900/7 bg-white dark:border-white/10 dark:bg-dark-900">
                <div className="skeleton aspect-[4/5] rounded-none" />
                <div className="space-y-2 p-3">
                  <div className="h-3.5 w-3/4 rounded-lg bg-warm-200 dark:bg-dark-800" />
                  <div className="h-3 w-1/2 rounded-lg bg-warm-200 dark:bg-dark-800" />
                </div>
              </div>
            ))}
          </div>
        )}

        {status === "unavailable" && (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-error/25 bg-error/[0.04] px-4 py-12 text-center">
            <WifiOff className="mb-3 h-7 w-7 text-error/60" />
            <p className="text-sm font-semibold text-dark-900/70 dark:text-dark-100">{t("trending.unavailable")}</p>
            <p className="mt-1 max-w-md font-mono text-[11px] text-dark-900/45 dark:text-dark-300">{reason}</p>
            <button
              type="button"
              onClick={() => void load(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-dark-900/10 bg-white px-4 py-2 text-xs font-semibold text-dark-900/70 transition-colors hover:border-brand-500/40 hover:text-brand-600 dark:border-white/10 dark:bg-dark-900 dark:text-dark-100"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t("common.retry")}
            </button>
          </div>
        )}

        {status === "empty" && (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-dark-900/10 bg-white px-4 py-14 text-center dark:border-white/10 dark:bg-dark-900">
            <Flame className="mb-3 h-7 w-7 text-dark-900/20" />
            <p className="text-sm font-semibold text-dark-900/70 dark:text-dark-100">{t("trending.emptyTitle")}</p>
            <p className="mt-1 max-w-md text-xs text-dark-900/45 dark:text-dark-300">
              {t("trending.emptyBody")}
              {feed?.behaviourError && ` — ${feed.behaviourError}`}
            </p>
            <a
              href="#download"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
            >
              {t("trending.getTheApp")}
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        )}

        {(status === "live" || status === "cache") && items.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:gap-4">
              {items.map((item, i) => (
                <ProductCard key={item.product.id} product={item.product} index={i} sourceLabel={sourceLabel(item)} />
              ))}
            </div>

            <p className="mt-5 text-[11px] text-dark-900/40 dark:text-dark-300">
              {feed && feed.pinnedCount > 0 && t("trending.pinnedNote").replace("{n}", String(feed.pinnedCount))}
              {behaviourCount > 0 && (
                <> {t("trending.behaviourNote").replace("{n}", String(behaviourCount))}</>
              )}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
