"use client";

/**
 * Customer 360 — one customer's real history, in one drawer.
 *
 * The operator's ask is "make the admin very clear what every customer bought,
 * from which app", so this panel is built entirely out of rows that exist:
 *
 *   admin_customers_view   profile, tier, and the customer_profiles rollups
 *                          (total_orders / total_spent_usd) — DB-owned numbers
 *   admin_orders_view      every order for that profile_id (newest 200), with
 *                          status, payment and the order total actually stored
 *   admin_order_items_view per-line provenance: which marketplace each line was
 *                          bought in, quantity, unit/line price, cost, source URL
 *                          — read for the newest 50 orders, and the panel says
 *                          so whenever that left lines unread
 *
 * Nothing here is estimated. Where a figure cannot be answered — an order whose
 * lines never recorded a marketplace — the panel says "not recorded" instead of
 * guessing from the customer's city, which is the bug the provenance migration
 * replaced. Aggregations over the fetched orders are labelled "this view" and
 * bounded by the 200-order window they were computed from, so they can never be
 * mistaken for a lifetime total.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Loader2, MapPin, Phone, Mail, ExternalLink, ShoppingBag,
  ChevronDown, ImageOff, Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn, formatUSD, formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/admin/StatusBadge";

const ORDER_WINDOW = 200;

/**
 * PostgREST answers with at most 1000 rows and never says so, so the line-item
 * fetch is bounded to stay under the cap: provenance is read for the newest
 * LINE_ITEM_ORDER_WINDOW orders, and a response that still hits the cap is
 * reported as incomplete instead of shown as the whole history.
 */
const LINE_ITEM_ORDER_WINDOW = 50;
const LINE_ITEM_ROW_CAP = 1000;

interface LineRow {
  id: string;
  order_id: string;
  product_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_price: number | null;
  cost_price: number | null;
  unit_price_cny: number | null;
  exchange_rate: number | null;
  marketplace_key: string;
  marketplace_name: string;
  source_url: string | null;
  origin: string | null;
  is_sourced: boolean;
  is_purchased: boolean;
  is_received: boolean;
  is_inspected: boolean;
}

interface OrderRow {
  id: string;
  order_number: string | null;
  reference: string | null;
  status: string | null;
  payment_status: string | null;
  shipping_method: string | null;
  subtotal: number | null;
  total: number | null;
  created_at: string | null;
}

interface CustomerProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  tier: string | null;
  customer_type: string | null;
  business_name: string | null;
  total_orders: number | null;
  total_spent: number | null;
  created_at: string | null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function orderLabel(o: OrderRow): string {
  return o.order_number || o.reference || o.id.slice(0, 8);
}

export default function Customer360Drawer({
  customerId,
  fallbackName,
  onClose,
  footer,
}: {
  customerId: string | null | undefined;
  /** Shown when the profile row could not be read (e.g. opened from an order). */
  fallbackName?: string;
  onClose: () => void;
  /** Page-specific extras (the customers list keeps its staff notes here). */
  footer?: React.ReactNode;
}) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [lineOrdersSkipped, setLineOrdersSkipped] = useState(false);
  const [lineRowsCapped, setLineRowsCapped] = useState(false);

  /**
   * `stale` reports whether the caller abandoned this run — the operator opened
   * another customer while a round trip was still in flight — in which case
   * none of the responses below may touch state.
   */
  const load = useCallback(
    async (stale: () => boolean = () => false) => {
      if (!customerId) return;
      setIsLoading(true);
      setError(null);
      setLineOrdersSkipped(false);
      setLineRowsCapped(false);
      try {
        // Profile and orders are independent reads; awaiting them in series costs
        // a full browser round trip of dead time.
        const [profileRes, ordersRes] = await Promise.all([
          supabase
            .from("admin_customers_view")
            .select(
              "id, full_name, email, phone, city, tier, customer_type, business_name, total_orders, total_spent, created_at"
            )
            .eq("id", customerId)
            .maybeSingle(),
          supabase
            .from("admin_orders_view")
            .select(
              "id, order_number, reference, status, payment_status, shipping_method, subtotal, total, created_at"
            )
            .eq("profile_id", customerId)
            .order("created_at", { ascending: false })
            .limit(ORDER_WINDOW),
        ]);
        if (stale()) return;
        if (profileRes.error) throw profileRes.error;
        setProfile((profileRes.data as CustomerProfile) || null);

        if (ordersRes.error) throw ordersRes.error;
        const fetchedOrders = (ordersRes.data as OrderRow[]) || [];
        setOrders(fetchedOrders);
        setTruncated(fetchedOrders.length >= ORDER_WINDOW);

        if (fetchedOrders.length === 0) {
          setLines([]);
          return;
        }
        const lineOrders = fetchedOrders.slice(0, LINE_ITEM_ORDER_WINDOW);
        setLineOrdersSkipped(fetchedOrders.length > lineOrders.length);
        const { data: lineData, error: lineError } = await supabase
          .from("admin_order_items_view")
          .select(
            "id, order_id, product_name, quantity, unit_price, total_price, cost_price, unit_price_cny, exchange_rate, marketplace_key, marketplace_name, source_url, origin, is_sourced, is_purchased, is_received, is_inspected"
          )
          .in("order_id", lineOrders.map((o) => o.id))
          .limit(LINE_ITEM_ROW_CAP);
        if (stale()) return;
        if (lineError) throw lineError;
        const fetchedLines = (lineData as LineRow[]) || [];
        setLineRowsCapped(fetchedLines.length >= LINE_ITEM_ROW_CAP);
        setLines(fetchedLines);
      } catch (e) {
        if (!stale()) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!stale()) setIsLoading(false);
      }
    },
    [customerId]
  );

  useEffect(() => {
    setExpanded(null);
    let cancelled = false;
    load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  /* ── Derived, from the rows above and nothing else ───────────── */

  const linesByOrder = useMemo(() => {
    const map = new Map<string, LineRow[]>();
    for (const line of lines) {
      const list = map.get(line.order_id) || [];
      list.push(line);
      map.set(line.order_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => String(a.product_name || "").localeCompare(String(b.product_name || "")));
    }
    return map;
  }, [lines]);

  /** The orders the line-item fetch covered; the rest have unknown lines. */
  const fetchedLineOrderIds = useMemo(
    () => new Set(orders.slice(0, LINE_ITEM_ORDER_WINDOW).map((o) => o.id)),
    [orders]
  );

  const appMix = useMemo(() => {
    const map = new Map<string, { name: string; lines: number; units: number; money: number }>();
    for (const line of lines) {
      const key = line.marketplace_key || "unknown";
      const known = key !== "unknown";
      const entry = map.get(key) || {
        name: known ? line.marketplace_name || key : "Not recorded",
        lines: 0,
        units: 0,
        money: 0,
      };
      entry.lines += 1;
      entry.units += num(line.quantity) ?? 0;
      entry.money += num(line.total_price) ?? 0;
      map.set(key, entry);
    }
    return [...map.values()].sort(
      (a, b) => b.money - a.money || b.lines - a.lines
    );
  }, [lines]);

  const viewTotals = useMemo(() => {
    const counted = orders.filter(
      (o) => !["cancelled", "canceled", "refunded", "cancelled_refunded"].includes(
        String(o.status || "").toLowerCase()
      )
    );
    const spend = counted.reduce((s, o) => s + (num(o.total) ?? 0), 0);
    const dates = orders
      .map((o) => o.created_at)
      .filter((d): d is string => Boolean(d))
      .sort();
    return {
      orders: orders.length,
      countedOrders: counted.length,
      spend,
      aov: counted.length ? spend / counted.length : null,
      first: dates[0] ?? null,
      last: dates[dates.length - 1] ?? null,
      lineCount: lines.length,
      unattributedLines: lines.filter(
        (l) => !l.marketplace_key || l.marketplace_key === "unknown"
      ).length,
    };
  }, [orders, lines]);

  const appFilterCounts = appMix;
  const maxAppMoney = appFilterCounts.length
    ? Math.max(...appFilterCounts.map((a) => a.money), 1)
    : 1;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-dark-950/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-warm-50 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={`Customer history for ${profile?.full_name || fallbackName || "customer"}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-dark-900/[0.06] bg-white px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-base font-bold text-brand-600">
              {(profile?.full_name || fallbackName || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-dark-900">
                {profile?.full_name || fallbackName || "Customer"}
              </h2>
              <p className="truncate text-xs text-dark-900/45">
                {profile?.phone || profile?.email || fallbackName || ""}
                {profile?.city ? ` · ${profile.city}` : ""}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-dark-900/40 transition-colors hover:bg-dark-900/5 hover:text-dark-900"
            aria-label="Close customer history"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {!customerId ? (
            <p className="rounded-xl bg-white p-4 text-sm text-dark-900/55 ring-1 ring-dark-900/[0.06]">
              This order has no linked customer id, so there is no account history
              to read. The order row itself is still available in the orders list.
            </p>
          ) : isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-20" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-xl border border-error/20 bg-error/5 p-4">
              <p className="text-sm font-semibold text-error">Could not load history</p>
              <p className="mt-1 text-xs text-dark-900/55">{error}</p>
              <button onClick={() => load()} className="admin-btn-outline mt-3 h-8 px-3 text-xs">
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* Profile facts, straight from admin_customers_view */}
              <div className="rounded-2xl bg-white p-4 ring-1 ring-dark-900/[0.06]">
                <p className="text-[11px] font-bold uppercase tracking-wider text-dark-900/40">
                  Profile
                </p>
                {profile ? (
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-dark-900/70">
                    {profile.phone && (
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-dark-900/30" /> {profile.phone}
                      </span>
                    )}
                    {profile.email && (
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-dark-900/30" /> {profile.email}
                      </span>
                    )}
                    {profile.city && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-dark-900/30" /> {profile.city}
                      </span>
                    )}
                    {profile.customer_type && (
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-dark-900/30" />
                        {profile.customer_type}
                        {profile.business_name ? ` · ${profile.business_name}` : ""}
                      </span>
                    )}
                    {profile.tier && (
                      <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-bold uppercase text-warning">
                        {profile.tier}
                      </span>
                    )}
                    {profile.created_at && (
                      <span className="text-xs text-dark-900/45">
                        Joined {formatDate(profile.created_at)}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-dark-900/50">
                    No profile row was returned for this id.
                  </p>
                )}
              </div>

              {/* Numbers: two sources, both attributed */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric
                  label="Orders"
                  hint="orders in this view"
                  value={String(viewTotals.orders)}
                />
                <Metric
                  label="Line items"
                  hint="recorded in order_items"
                  value={String(viewTotals.lineCount)}
                />
                <Metric
                  label="Spend"
                  hint="sum of these order totals"
                  value={formatUSD(viewTotals.spend)}
                />
                <Metric
                  label="Avg order"
                  hint="spend ÷ non-cancelled orders"
                  value={viewTotals.aov === null ? "—" : formatUSD(viewTotals.aov)}
                />
              </div>

              <div className="rounded-2xl bg-white p-4 ring-1 ring-dark-900/[0.06]">
                <p className="text-[11px] font-bold uppercase tracking-wider text-dark-900/40">
                  First &amp; last order
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-dark-900/75">
                  <span>
                    First:{" "}
                    <b className="text-dark-900">
                      {viewTotals.first ? formatDate(viewTotals.first) : "—"}
                    </b>
                  </span>
                  <span>
                    Last:{" "}
                    <b className="text-dark-900">
                      {viewTotals.last ? formatDate(viewTotals.last) : "—"}
                    </b>
                  </span>
                  {profile?.total_orders !== null && profile?.total_orders !== undefined && (
                    <span className="text-xs text-dark-900/45">
                      customer_profiles rollup: {profile.total_orders} orders ·{" "}
                      {formatUSD(num(profile.total_spent) ?? 0)} lifetime
                    </span>
                  )}
                </div>
                {truncated && (
                  <p className="mt-2 text-[11px] text-warning">
                    Showing the newest {ORDER_WINDOW} orders only — the counts above
                    are for that window, not the whole account.
                  </p>
                )}
              </div>

              {/* Where they buy */}
              <div className="rounded-2xl bg-white p-4 ring-1 ring-dark-900/[0.06]">
                <p className="text-[11px] font-bold uppercase tracking-wider text-dark-900/40">
                  Bought in
                </p>
                <p className="mt-0.5 text-[11px] text-dark-900/45">
                  Per-line source recorded on order_items — {viewTotals.lineCount}{" "}
                  {viewTotals.lineCount === 1 ? "line" : "lines"}
                </p>
                {appMix.length === 0 ? (
                  <p className="mt-3 text-sm text-dark-900/50">
                    No line items were recorded for these orders, so the source app
                    is unknown for every line.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {appMix.map((app) => (
                      <li key={app.name}>
                        <div className="flex items-baseline justify-between gap-3 text-xs">
                          <span
                            className={cn(
                              "truncate font-semibold",
                              app.name === "Not recorded"
                                ? "text-dark-900/40"
                                : "text-dark-900"
                            )}
                          >
                            {app.name}
                          </span>
                          <span className="shrink-0 tabular-nums text-dark-900/50">
                            {app.lines} {app.lines === 1 ? "line" : "lines"} · {app.units}{" "}
                            units · {formatUSD(app.money)}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-dark-100">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              app.name === "Not recorded" ? "bg-dark-300" : "bg-brand-500"
                            )}
                            style={{ width: `${Math.max((app.money / maxAppMoney) * 100, 3)}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {viewTotals.unattributedLines > 0 && (
                  <p className="mt-3 text-[11px] text-dark-900/45">
                    {viewTotals.unattributedLines} line(s) predate per-line
                    provenance, so their app was never stored.
                  </p>
                )}
                {(lineRowsCapped || lineOrdersSkipped) && (
                  <p className="mt-3 text-[11px] text-warning">
                    {lineRowsCapped &&
                      `The line-item fetch stopped at ${LINE_ITEM_ROW_CAP} rows, so the apps above are a partial list. `}
                    {lineOrdersSkipped &&
                      `Provenance is fetched for the newest ${LINE_ITEM_ORDER_WINDOW} orders of the ${viewTotals.orders} in this view; older orders show no lines here.`}
                  </p>
                )}
              </div>

              {/* Orders, expandable to their lines */}
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-dark-900/40">
                  Order history
                </p>
                {orders.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-xl bg-white p-4 text-sm text-dark-900/50 ring-1 ring-dark-900/[0.06]">
                    <ShoppingBag className="h-4 w-4" />
                    This customer has no orders yet.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {orders.map((order) => {
                      const orderLines = linesByOrder.get(order.id) || [];
                      const apps = [
                        ...new Set(
                          orderLines
                            .map((l) => l.marketplace_key)
                            .filter((k) => k && k !== "unknown")
                        ),
                      ];
                      const open = expanded === order.id;
                      return (
                        <li
                          key={order.id}
                          className="overflow-hidden rounded-xl bg-white ring-1 ring-dark-900/[0.06]"
                        >
                          <button
                            onClick={() => setExpanded(open ? null : order.id)}
                            className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                            aria-expanded={open}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-dark-900">
                                {orderLabel(order)}
                              </p>
                              <p className="text-[11px] text-dark-900/45">
                                {order.created_at ? formatDate(order.created_at) : "—"} ·{" "}
                                {orderLines.length
                                  ? `${orderLines.length} ${orderLines.length === 1 ? "line" : "lines"}`
                                  : fetchedLineOrderIds.has(order.id)
                                    ? "no lines"
                                    : "lines not loaded"}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-wrap justify-end gap-1">
                              {apps.length === 0 ? (
                                <span className="rounded-md bg-dark-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-dark-900/45">
                                  app ?
                                </span>
                              ) : (
                                apps.map((app) => (
                                  <span
                                    key={app}
                                    className="rounded-md bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700"
                                  >
                                    {app}
                                  </span>
                                ))
                              )}
                            </div>
                            <span className="shrink-0 text-right">
                              <span className="block text-sm font-bold text-dark-900">
                                {formatUSD(num(order.total) ?? 0)}
                              </span>
                              <StatusBadge status={order.status || ""} />
                            </span>
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 shrink-0 text-dark-900/30 transition-transform",
                                open && "rotate-180"
                              )}
                            />
                          </button>

                          <AnimatePresence initial={false}>
                            {open && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.18 }}
                                className="overflow-hidden border-t border-dark-900/[0.06] bg-warm-50"
                              >
                                {orderLines.length === 0 ? (
                                  <p className="px-3 py-3 text-xs text-dark-900/50">
                                    {fetchedLineOrderIds.has(order.id)
                                      ? "No line items recorded for this order."
                                      : `This order is older than the newest ${LINE_ITEM_ORDER_WINDOW} in this view, so its line items were not fetched.`}
                                  </p>
                                ) : (
                                  <ul className="divide-y divide-dark-900/[0.05]">
                                    {orderLines.map((line) => {
                                      const unknownApp =
                                        !line.marketplace_key ||
                                        line.marketplace_key === "unknown";
                                      return (
                                        <li
                                          key={line.id}
                                          className="flex items-start gap-3 px-3 py-2.5"
                                        >
                                          {line.source_url ? (
                                            <a
                                              href={line.source_url}
                                              target="_blank"
                                              rel="noopener noreferrer nofollow"
                                              className="mt-0.5 shrink-0 text-brand-600 hover:underline"
                                              title="Open the original listing"
                                            >
                                              <ExternalLink className="h-3.5 w-3.5" />
                                            </a>
                                          ) : (
                                            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-dark-900/25">
                                              <ImageOff className="h-3.5 w-3.5" />
                                            </span>
                                          )}
                                          <div className="min-w-0 flex-1">
                                            <p className="truncate text-[13px] font-medium text-dark-900">
                                              {line.product_name || "Unnamed item"}
                                            </p>
                                            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-dark-900/50">
                                              <span
                                                className={cn(
                                                  "rounded-md px-1.5 py-0.5 font-bold uppercase tracking-wide",
                                                  unknownApp
                                                    ? "bg-dark-100 text-dark-900/45"
                                                    : "bg-brand-500/10 text-brand-700"
                                                )}
                                              >
                                                {unknownApp ? "not recorded" : line.marketplace_name}
                                              </span>
                                              <span>
                                                {line.quantity ?? 1} × {formatUSD(num(line.unit_price) ?? 0)}
                                              </span>
                                              {num(line.unit_price_cny) !== null && (
                                                <span>¥{num(line.unit_price_cny)}</span>
                                              )}
                                              {num(line.exchange_rate) !== null && (
                                                <span>
                                                  @ {num(line.exchange_rate)} ¥/${" "}
                                                  <span title="How many CNY one US dollar bought when this line was purchased. A later rate change cannot rewrite it.">
                                                    (fixed at purchase)
                                                  </span>
                                                </span>
                                              )}
                                            </p>
                                          </div>
                                          <span className="shrink-0 text-right text-[13px] font-bold text-dark-900">
                                            {formatUSD(num(line.total_price) ?? 0)}
                                          </span>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {footer}
            </>
          )}
        </div>
      </motion.aside>
    </>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-dark-900/[0.06]">
      <p className="truncate text-[10px] font-bold uppercase tracking-wider text-dark-900/40">
        {label}
      </p>
      <p className="mt-1 truncate text-lg font-bold leading-none text-dark-900">{value}</p>
      <p className="mt-1 text-[10px] text-dark-900/40">{hint}</p>
    </div>
  );
}

/** Column descriptor used by the customers list to open this drawer. */
export type Customer360Target = { id: string; name?: string } | null;
