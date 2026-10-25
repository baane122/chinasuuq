"use client";

/**
 * Event ledger — the raw `product_events` feed behind the trending ranking.
 *
 * Where the leaderboard above shows a weighted, decayed score, this panel shows
 * the un-varnished rows: one line per recorded customer action, newest first, so
 * staff can confirm the pipeline is actually writing events (or see that it is
 * not). Only the columns `admin_product_events_view` exposes are selected — never
 * `session_id`, which the view deliberately drops because it is not operational
 * data for a staff screen.
 *
 * Honesty rules carried through the whole folder:
 *  - A failed read and an empty ledger get DIFFERENT sentences. An error here is a
 *    dead read, not "no activity"; production currently has zero event rows, so the
 *    empty branch explains that views/carts are now recorded and the list will fill.
 *  - No event is drawn as a chart or turned into a number the row does not carry.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, Loader2, ListChecks } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { ProductEventType } from "@/lib/catalog";
import { FilterChips, EmptyState, SkeletonTable } from "@/components/admin/ui";
import { TableControls } from "@/components/admin/TableControls";
import { useTablePrefs } from "@/components/admin/useTablePrefs";
import { cn } from "@/lib/utils";
import {
  EVENT_LABEL,
  isProductEventType,
  windowCaption,
  windowStartIso,
  WINDOWS,
  timeAgo,
} from "./helpers";

const ROW_LIMIT = 100;

interface EventRow {
  id: string;
  product_id: string | null;
  event_type: string | null;
  marketplace_key: string | null;
  created_at: string | null;
  product_name: string | null;
}

type TypeFilter = "all" | ProductEventType;

/** Flat, honest chip tone per event type (no invented meaning beyond the action). */
const TYPE_TONE: Record<ProductEventType, string> = {
  view: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  search_click: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  add_to_cart: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  order: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All events" },
  { value: "view", label: EVENT_LABEL.view },
  { value: "search_click", label: EVENT_LABEL.search_click },
  { value: "add_to_cart", label: EVENT_LABEL.add_to_cart },
  { value: "order", label: EVENT_LABEL.order },
];

const COLUMNS = [
  { key: "when", label: "When" },
  { key: "type", label: "Event" },
  { key: "product", label: "Product" },
  { key: "marketplace", label: "Marketplace" },
  { key: "link", label: "Open" },
];

export default function EventLedger({
  refreshKey,
  days,
  onChangeDays,
}: {
  refreshKey: number;
  days: number;
  onChangeDays: (days: number) => void;
}) {
  const prefs = useTablePrefs("trending-ledger");
  const [rows, setRows] = useState<EventRow[]>([]);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let query = supabase
      .from("admin_product_events_view")
      .select("id,product_id,event_type,marketplace_key,created_at,product_name")
      .gte("created_at", windowStartIso(days))
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT);
    if (typeFilter !== "all") query = query.eq("event_type", typeFilter);

    const { data, error: qError } = await query;
    if (qError) {
      setError(qError.message);
      setRows([]);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as EventRow[]);
    setLoading(false);
  }, [days, typeFilter]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const emptyForWindow = !loading && !error && rows.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Event type">
            <FilterChips<TypeFilter>
              options={TYPE_OPTIONS}
              value={typeFilter}
              onChange={(v) => setTypeFilter(v)}
            />
          </div>
          <div role="group" aria-label="Ledger window" className="flex items-center gap-1">
            {WINDOWS.map((w) => (
              <button
                key={w.days}
                onClick={() => onChangeDays(w.days)}
                aria-pressed={w.days === days}
                className={cn(
                  "rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors",
                  w.days === days
                    ? "border-brand-500 bg-brand-500 text-white"
                    : "border-dark-900/10 bg-white text-dark-900/55 hover:border-dark-900/25 dark:border-white/10 dark:bg-dark-900 dark:text-neutral-400"
                )}
                title={`Events from ${w.caption}`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TableControls columns={COLUMNS} prefs={prefs} />
          <button onClick={() => void load()} disabled={loading} className="admin-btn-outline h-9 px-3 text-xs">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-dark-900/[0.06] bg-white shadow-sm dark:border-white/[0.08] dark:bg-dark-900">
          <SkeletonTable rows={8} />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-dark-900/[0.06] bg-white shadow-sm dark:border-white/[0.08] dark:bg-dark-900">
          <EmptyState
            image="/admin/empty_generic.webp"
            compact
            title="The event ledger could not be reached"
            subtitle={`${error} — this is a failed read, not an empty ledger. Try Refresh.`}
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
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-500 dark:bg-sky-500/15">
              <ListChecks className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold text-dark-900 dark:text-neutral-100">
              No events recorded {windowCaption(days)}
            </p>
            <p className="max-w-md text-[13px] leading-relaxed text-dark-900/55 dark:text-neutral-400">
              The read succeeded — there is simply nothing in this window yet. The website and app now write
              product views and add-to-cart events, so this ledger fills up as real browsing happens. Widen the
              window or check again later.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-dark-900/[0.06] bg-white shadow-sm dark:border-white/[0.08] dark:bg-dark-900">
          <table className={cn("admin-table min-w-full w-full", prefs.className, prefs.tableClassName)}>
            <thead>
              <tr>
                {!prefs.isHidden("when") && <th>When</th>}
                {!prefs.isHidden("type") && <th>Event</th>}
                {!prefs.isHidden("product") && <th>Product</th>}
                {!prefs.isHidden("marketplace") && <th className="hidden md:table-cell">Marketplace</th>}
                {!prefs.isHidden("link") && <th className="w-16 text-right"><span className="sr-only">Open</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-900/[0.04]">
              {rows.map((r) => {
                const type = isProductEventType(r.event_type) ? r.event_type : null;
                const name = r.product_name || (r.product_id ? `Product ${r.product_id.slice(0, 8)}` : "Deleted product");
                return (
                  <tr key={r.id}>
                    {!prefs.isHidden("when") && (
                      <td className="whitespace-nowrap text-xs text-dark-900/60 dark:text-neutral-400" title={r.created_at ?? undefined}>
                        {r.created_at ? timeAgo(r.created_at) : "—"}
                      </td>
                    )}
                    {!prefs.isHidden("type") && (
                      <td>
                        {type ? (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                              TYPE_TONE[type]
                            )}
                          >
                            {EVENT_LABEL[type]}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-dark-900/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-dark-900/50 dark:bg-white/10 dark:text-neutral-400">
                            {r.event_type ?? "unknown"}
                          </span>
                        )}
                      </td>
                    )}
                    {!prefs.isHidden("product") && (
                      <td>
                        <span className="line-clamp-1 max-w-[280px] text-sm text-dark-900 dark:text-neutral-100" title={name}>
                          {name}
                        </span>
                      </td>
                    )}
                    {!prefs.isHidden("marketplace") && (
                      <td className="hidden text-xs text-dark-900/60 md:table-cell dark:text-neutral-400">
                        {r.marketplace_key || "unknown"}
                      </td>
                    )}
                    {!prefs.isHidden("link") && (
                      <td className="text-right">
                        {r.product_id ? (
                          <Link
                            href={`/admin/products?q=${encodeURIComponent(name)}`}
                            className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400"
                            title="Find in Products"
                          >
                            Open
                          </Link>
                        ) : (
                          <span className="text-[11px] text-dark-900/30 dark:text-neutral-600">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t border-dark-900/[0.06] px-4 py-2.5 text-[11px] text-dark-900/45 dark:border-white/[0.06] dark:text-neutral-500">
            Showing the most recent {rows.length} event{rows.length === 1 ? "" : "s"}
            {rows.length >= ROW_LIMIT ? " (the view caps at 100 rows — narrow the window to see earlier ones)" : ""}.
            Each row is one raw action; the trending score weights and decays them.
          </div>
        </div>
      )}
    </div>
  );
}
