"use client";

/**
 * Live behaviour leaderboard — `fn_trending_products` over the real event ledger.
 *
 * Every number here is engagement, not a staff choice, and it is kept visually apart
 * from the shelf above it. The score is shown with the actual formula from the
 * migration; the per-product "raw mix" comes from `admin_product_events_view` (the
 * staff-only ledger) and is labelled as RAW counts, because the score additionally
 * multiplies each event by its weight and a 3-day decay — the counts do NOT add up
 * to the score, and pretending otherwise would be a lie about the math.
 *
 * Empty state honesty: `product_events` currently has 0 rows in production. When the
 * window returns nothing this panel says there is no recorded activity yet and that
 * the web + app now write view/cart events so it fills in over time. It never draws a
 * chart or a score out of an empty table.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Pin, RefreshCw, Flame } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchBehaviourTrending, type TrendingRpcRow, type ProductEventType } from "@/lib/catalog";
import { FilterChips, EmptyState, SkeletonTable } from "@/components/admin/ui";
import { TableControls } from "@/components/admin/TableControls";
import { useTablePrefs } from "@/components/admin/useTablePrefs";
import { cn } from "@/lib/utils";
import { ScoreLegend } from "./bits";
import {
  describeEventMix,
  formatNumber,
  formatScore,
  SCORE_FORMULA,
  windowCaption,
  windowStartIso,
  WINDOWS,
  EVENT_WEIGHTS,
} from "./helpers";

const LEADERBOARD_LIMIT = 25;

type MixMap = Record<string, Partial<Record<ProductEventType, number>>>;

const COLUMNS = [
  { key: "product", label: "Product" },
  { key: "marketplace", label: "Marketplace" },
  { key: "score", label: "Score" },
  { key: "events", label: "Events" },
  { key: "mix", label: "Raw activity mix" },
  { key: "pin", label: "Pin to shelf" },
  { key: "link", label: "Open" },
];

export default function BehaviourLeaderboard({
  days,
  onChangeDays,
  refreshKey,
  pinnedRank,
  onPin,
}: {
  days: number;
  onChangeDays: (days: number) => void;
  refreshKey: number;
  /** Product id → shelf position, so a row can say "already on the shelf · #3". */
  pinnedRank?: Map<string, number>;
  /** Pin this ranked product to the staff shelf. Absent = read-only panel. */
  onPin?: (productId: string) => Promise<boolean>;
}) {
  const prefs = useTablePrefs("trending-behaviour");
  const [rows, setRows] = useState<TrendingRpcRow[]>([]);
  const [mix, setMix] = useState<MixMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mixPartial, setMixPartial] = useState(false);
  const [pinning, setPinning] = useState<string | null>(null);
  const [pinnedLocally, setPinnedLocally] = useState<Set<string>>(new Set());

  // The parent's shelf data can lag a write by a render; remember our own success
  // so the button cannot be pressed twice into a duplicate pin.
  const alreadyOnShelf = useCallback(
    (id: string) => (pinnedRank?.has(id) ?? false) || pinnedLocally.has(id),
    [pinnedRank, pinnedLocally]
  );

  const pin = useCallback(
    async (id: string) => {
      if (!onPin || pinning) return;
      setPinning(id);
      try {
        const ok = await onPin(id);
        if (ok) setPinnedLocally((prev) => new Set(prev).add(id));
      } finally {
        setPinning(null);
      }
    },
    [onPin, pinning]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMixPartial(false);
    const res = await fetchBehaviourTrending(days, LEADERBOARD_LIMIT);
    if (res.error) {
      setError(res.error);
      setRows([]);
      setLoading(false);
      return;
    }
    setRows(res.rows);
    setLoading(false);

    // Derive the raw per-type event mix from the staff-only ledger for these products.
    const ids = res.rows.map((r) => r.product_id).filter(Boolean);
    if (ids.length === 0) {
      setMix({});
      return;
    }
    const { data, error: mixError } = await supabase
      .from("admin_product_events_view")
      .select("product_id,event_type")
      .gte("created_at", windowStartIso(days))
      .in("product_id", ids)
      .limit(6000);
    if (mixError) {
      // The score column still shows; only the human-readable mix is unavailable.
      setMix({});
      setMixPartial(true);
      return;
    }
    const acc: MixMap = {};
    for (const raw of (data ?? []) as { product_id: string | null; event_type: string }[]) {
      if (!raw.product_id || !raw.event_type) continue;
      const bucket = (acc[raw.product_id] ??= {});
      bucket[raw.event_type as ProductEventType] = (bucket[raw.event_type as ProductEventType] ?? 0) + 1;
    }
    setMix(acc);
  }, [days]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const emptyForWindow = !loading && !error && rows.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Behaviour window">
          <FilterChips<string>
            options={WINDOWS.map((w) => ({ value: String(w.days), label: w.label }))}
            value={String(days)}
            onChange={(v) => onChangeDays(Number(v))}
          />
        </div>
        <div className="flex items-center gap-2">
          <TableControls columns={COLUMNS} prefs={prefs} />
          <button onClick={() => void load()} disabled={loading} className="admin-btn-outline h-9 px-3 text-xs">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
          </button>
        </div>
      </div>

      <ScoreLegend text={SCORE_FORMULA} />

      {mixPartial && !loading && !error && rows.length > 0 && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          The raw activity mix could not be read from the event ledger right now, so the mix column is empty —
          the score and event counts above still reflect the live ranking.
        </p>
      )}

      {loading ? (
        <div className="rounded-2xl border border-dark-900/[0.06] bg-white shadow-sm dark:border-white/[0.08] dark:bg-dark-900">
          <SkeletonTable />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-dark-900/[0.06] bg-white shadow-sm dark:border-white/[0.08] dark:bg-dark-900">
          <EmptyState
            image="/admin/empty_generic.webp"
            compact
            title="The trending ranking could not be reached"
            subtitle={`${error} — this is a failed read, not zero activity. Try Refresh.`}
            action={
              <button onClick={() => void load()} className="admin-btn-outline">
                <RefreshCw className="h-4 w-4" /> Retry
              </button>
            }
          />
        </div>
      ) : emptyForWindow ? (
        <div className="rounded-2xl border border-dark-900/[0.06] bg-white p-6 shadow-sm dark:border-white/[0.08] dark:bg-dark-900">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-500/15">
              <Flame className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold text-dark-900 dark:text-neutral-100">
              No customer activity recorded {windowCaption(days)}
            </p>
            <p className="max-w-md text-[13px] leading-relaxed text-dark-900/55 dark:text-neutral-400">
              This is an empty ledger, not a broken one. The website and app now write product views and
              add-to-cart events, so this ranking fills itself in as real browsing happens. There is nothing
              to chart yet.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-dark-900/[0.06] bg-white shadow-sm dark:border-white/[0.08] dark:bg-dark-900">
          <table className={cn("admin-table min-w-full w-full", prefs.className, prefs.tableClassName)}>
            <thead>
              <tr>
                <th className="w-10">#</th>
                {!prefs.isHidden("product") && <th>Product</th>}
                {!prefs.isHidden("marketplace") && <th className="hidden md:table-cell">Marketplace</th>}
                {!prefs.isHidden("score") && <th>Score</th>}
                {!prefs.isHidden("events") && <th>Events</th>}
                {!prefs.isHidden("mix") && <th className="hidden lg:table-cell">Raw activity mix</th>}
                {!prefs.isHidden("pin") && (
                  <th className="w-28 text-right">
                    <span className="sr-only">Pin to shelf</span>
                  </th>
                )}
                {!prefs.isHidden("link") && <th className="w-16 text-right"><span className="sr-only">Open</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-900/[0.04]">
              {rows.map((r, i) => {
                // Narrowed inline: the RPC's price columns are nullable and a
                // hoisted boolean does not carry that narrowing into the ternary.
                const price =
                  r.price_usd !== null && r.price_usd !== undefined
                    ? `$${r.price_usd.toFixed(2)}`
                    : r.price_cny !== null && r.price_cny !== undefined
                      ? `¥${r.price_cny.toFixed(0)}`
                      : "No price";
                const mixText = describeEventMix(mix[r.product_id] ?? {});
                return (
                  <tr key={r.product_id}>
                    <td className="text-xs font-bold text-dark-900/35">{i + 1}</td>
                    {!prefs.isHidden("product") && (
                      <td>
                        <div className="flex items-center gap-2.5">
                          {r.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.image_url}
                              alt={r.name}
                              loading="lazy"
                              className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-dark-900/[0.06]"
                            />
                          ) : (
                            <div className="h-9 w-9 shrink-0 rounded-lg bg-warm-100 dark:bg-dark-800" />
                          )}
                          <span className="line-clamp-2 max-w-[240px] font-medium text-dark-900 dark:text-neutral-100" title={r.name}>
                            {r.name}
                          </span>
                        </div>
                      </td>
                    )}
                    {!prefs.isHidden("marketplace") && (
                      <td className="hidden text-xs text-dark-900/60 md:table-cell dark:text-neutral-400">
                        {r.marketplace} · {price}
                      </td>
                    )}
                    {!prefs.isHidden("score") && (
                      <td className="font-bold tabular-nums text-brand-600 dark:text-brand-400">{formatScore(r.score)}</td>
                    )}
                    {!prefs.isHidden("events") && (
                      <td className="tabular-nums text-dark-900/70 dark:text-neutral-300">{formatNumber(r.event_count)}</td>
                    )}
                    {!prefs.isHidden("mix") && (
                      <td className="hidden text-[11px] text-dark-900/55 lg:table-cell dark:text-neutral-400">
                        {mixText ?? "—"}
                      </td>
                    )}
                    {!prefs.isHidden("pin") && (
                      <td className="text-right">
                        {onPin ? (
                          alreadyOnShelf(r.product_id) ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-[10px] font-semibold text-green-700 dark:bg-green-500/15 dark:text-green-300">
                              <Check className="h-3 w-3" />
                              On shelf{pinnedRank?.get(r.product_id) ? ` · #${pinnedRank.get(r.product_id)}` : ""}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void pin(r.product_id)}
                              disabled={pinning !== null}
                              title="Add this ranked product to the staff-picked shelf"
                              className="admin-btn-outline inline-flex h-7 items-center gap-1 px-2 text-[11px]"
                            >
                              {pinning === r.product_id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Pin className="h-3 w-3" />
                              )}
                              Pin
                            </button>
                          )
                        ) : (
                          <span className="text-[11px] text-dark-900/35">—</span>
                        )}
                      </td>
                    )}
                    {!prefs.isHidden("link") && (
                      <td className="text-right">
                        <Link
                          href={`/admin/products?q=${encodeURIComponent(r.name)}`}
                          className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400"
                          title="Find in Products"
                        >
                          Open
                        </Link>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t border-dark-900/[0.06] px-4 py-2.5 text-[11px] text-dark-900/45 dark:border-white/[0.06] dark:text-neutral-500">
            Weights — {EVENT_WEIGHTS.map((w) => `${w.label} ${w.weight}×`).join(" · ")}. Ranked by score, then event
            count, then product id. Only active products appear.
          </div>
        </div>
      )}
    </div>
  );
}
