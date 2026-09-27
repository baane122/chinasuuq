"use client";
import { Suspense, useState, useEffect, useMemo, useCallback } from "react";
import { DataTable, Column } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { PageHeader, StatCard, PageGrid, FilterChips, TableShell, SkeletonTable, EMPTY_IMAGES } from "@/components/admin/ui";
import { TableControls } from "@/components/admin/TableControls";
import { useUrlFilters, useDebouncedFilterValue } from "@/components/admin/useUrlFilters";
import { useTablePrefs } from "@/components/admin/useTablePrefs";
import Customer360Drawer from "@/components/admin/Customer360Drawer";
import { useLiveVersion } from "@/lib/admin/live-store";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Package, CreditCard, MapPin, Clock3, Loader2,
  CheckSquare, Square, Printer, Truck, User, Phone, CalendarDays,
  ChevronRight, ExternalLink, RefreshCw, Check, ArrowRight, Download, RotateCcw
} from "lucide-react";
import { cn, formatUSD, formatDate, formatDateTime } from "@/lib/utils";
import { listOrders, updateOrder } from "@/lib/admin/supabase-data";
import { ORDERS_CSV_COLUMNS, downloadCsv, stamp, toCsv } from "@/lib/admin/csv";
import OrderProvenance from "@/components/admin/OrderProvenance";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { useToast } from "@/components/admin/Toast";

/* ── Status workflow constants ────────────────────────────────── */

const STATUSES: string[] = [
  "all",
  "pending",
  "confirmed",
  "awaiting_payment",
  "paid",
  "purchasing",
  "purchased",
  "in_warehouse",
  "inspection_passed",
  "consolidated",
  "shipped",
  "in_transit",
  "customs_hold",
  "arrived_somalia",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

const STATUS_FLOW = [
  "pending",
  "confirmed",
  "awaiting_payment",
  "paid",
  "purchasing",
  "purchased",
  "in_warehouse",
  "inspection_passed",
  "consolidated",
  "shipped",
  "in_transit",
  "customs_hold",
  "arrived_somalia",
  "out_for_delivery",
  "delivered",
];

const STATUS_GROUPS: Record<string, { label: string; statuses: string[] }> = {
  ordering: { label: "Ordering", statuses: ["pending", "confirmed", "awaiting_payment", "paid"] },
  processing: { label: "Processing", statuses: ["purchasing", "purchased", "in_warehouse", "inspection_passed", "consolidated"] },
  shipping: { label: "Shipping", statuses: ["shipped", "in_transit", "customs_hold", "arrived_somalia", "out_for_delivery", "delivered"] },
  terminal: { label: "Terminal", statuses: ["delivered", "cancelled"] },
};

function getStatusGroup(status: string): string {
  for (const [key, group] of Object.entries(STATUS_GROUPS)) {
    if (group.statuses.includes(status)) return key;
  }
  return "unknown";
}

function getProgressPercent(status: string): number {
  if (status === "cancelled") return 0;
  const idx = STATUS_FLOW.indexOf(status);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / STATUS_FLOW.length) * 100);
}

/* ── Component ────────────────────────────────────────────────── */

/**
 * Filters live in the query string, not in component state, so a filtered view
 * can be reloaded, bookmarked or pasted to a colleague. Keys and their defaults:
 * module scope keeps the object identity stable for the hook.
 *   status  order status chip        q  free-text search (server-side ilike)
 *   app     marketplace of any line  from/to  created-at window (client-side)
 */
const FILTER_DEFAULTS = { status: "all", q: "", app: "", from: "", to: "" };

const ORDER_COLUMNS: { key: string; label: string }[] = [
  { key: "order_number", label: "Order" },
  { key: "customer_name", label: "Customer" },
  { key: "apps", label: "Bought in" },
  { key: "shipping_method", label: "Mode" },
  { key: "total", label: "Total" },
  { key: "status", label: "Status" },
  { key: "payment_status", label: "Payment" },
  { key: "created_at", label: "Created" },
];

export default function OrdersPage() {
  // useSearchParams() inside a statically prerendered page must sit under a
  // Suspense boundary, otherwise `next export` bails the whole route to CSR.
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-dark-900/[0.06] bg-white shadow-sm">
          <SkeletonTable />
        </div>
      }
    >
      <OrdersPageContent />
    </Suspense>
  );
}

function OrdersPageContent() {
  const { success, error: toastError } = useToast();

  const { values, set, setMany, reset, isFiltered } = useUrlFilters(FILTER_DEFAULTS);
  const tablePrefs = useTablePrefs("orders");
  // Orders list only needs order writes; payments and notifications used to
  // re-pull this whole table on every burst.
  const liveVersion = useLiveVersion(["orders"]);

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [customer360, setCustomer360] = useState<{ id: string; name?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const statusFilter = values.status;
  const appFilter = values.app;

  // Bulk
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkTargetStatus, setBulkTargetStatus] = useState("confirmed");

  // Date range (from the URL)
  const dateFrom = values.from;
  const dateTo = values.to;

  // The search box is drafted locally and committed to the URL debounced, so
  // typing does not push one history entry per keystroke.
  const commitSearch = useCallback((v: string) => set("q", v), [set]);
  const [search, setSearch] = useDebouncedFilterValue(values.q, commitSearch);

  // Bulk confirm
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  const committedSearch = values.q;

  const load = useCallback(async (status?: string, q?: string) => {
    setLoading(true);
    setError(null);
    const res = await listOrders({ status: status === "all" ? undefined : status, search: q });
    if (res.ok) {
      setOrders(res.orders);
    } else {
      setError(res.error || "Failed to load orders");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(statusFilter, committedSearch);
    // liveVersion re-reads the list when realtime confirms a write elsewhere.
  }, [statusFilter, committedSearch, load, liveVersion]);

  /* ── Filtered ──────────────────────────────────────────────── */

  const filtered = useMemo(() => {
    let result = orders;
    if (statusFilter !== "all") {
      result = result.filter((o) => o.status === statusFilter);
    }
    if (appFilter) {
      result = result.filter(
        (o) => Array.isArray(o.apps) && o.apps.some((a: string) => a === appFilter)
      );
    }
    if (dateFrom) {
      result = result.filter((o) => o.created_at && o.created_at.slice(0, 10) >= dateFrom);
    }
    if (dateTo) {
      result = result.filter((o) => o.created_at && o.created_at.slice(0, 10) <= dateTo);
    }
    return result;
  }, [orders, statusFilter, appFilter, dateFrom, dateTo]);

  /**
   * Apps offered by the "which app" filter, and how many loaded orders contain
   * them. Read straight off the line provenance this page already fetched, so
   * an app only appears when a line really recorded it.
   */
  const appOptions = useMemo(() => {
    const counts = new Map<string, number>();
    orders.forEach((o) => {
      for (const app of (Array.isArray(o.apps) ? o.apps : [])) {
        counts.set(app, (counts.get(app) || 0) + 1);
      }
    });
    return [...counts.entries()]
      .map(([app, count]) => ({ app, count }))
      .sort((a, b) => b.count - a.count);
  }, [orders]);

  /* ── KPIs ──────────────────────────────────────────────────── */

  const kpis = useMemo(() => {
    const total = orders.length;
    const pending = orders.filter((o) => ["pending", "awaiting_payment"].includes(o.status)).length;
    const active = orders.filter((o) => !["delivered", "cancelled"].includes(o.status)).length;
    const delivered = orders.filter((o) => o.status === "delivered").length;
    const revenue = orders.reduce((s, o) => s + (o.total || 0), 0);
    return { total, pending, active, delivered, revenue };
  }, [orders]);

  /* ── Status counts ─────────────────────────────────────────── */

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: orders.length };
    orders.forEach((o) => {
      counts[o.status] = (counts[o.status] || 0) + 1;
    });
    return counts;
  }, [orders]);

  /* ── Status update ─────────────────────────────────────────── */

  /**
   * Customer 360 needs the customer's profile id, not the name: admin_orders_view
   * exposes it as profile_id. An order with no linked profile says so instead of
   * matching on a name, which is how two customers called Abdi got mixed.
   */
  const openCustomer = (order: any) => {
    const id = order?.profile_id || order?.customer_id;
    if (id) setCustomer360({ id, name: order.customer_name || undefined });
    else toastError("This order has no linked customer profile, so there is no account history to open.");
  };

  const setStatus = async (id: string, newStatus: string) => {
    setSaving(true);
    const res = await updateOrder(id, { status: newStatus });
    if (res.ok) {
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o)));
      if (selected?.id === id) setSelected({ ...selected, status: newStatus });
      success(`Order status updated to ${newStatus.replace(/_/g, " ")}`);
    } else {
      toastError(res.error || "Failed to update status");
    }
    setSaving(false);
  };

  /* ── Advance status (workflow) ─────────────────────────────── */

  const advanceStatus = async (id: string, currentStatus: string) => {
    const idx = STATUS_FLOW.indexOf(currentStatus);
    if (idx < 0 || idx >= STATUS_FLOW.length - 1) return;
    const next = STATUS_FLOW[idx + 1];
    await setStatus(id, next);
  };

  /* ── Bulk actions ──────────────────────────────────────────── */

  const allVisibleSelected = filtered.length > 0 && filtered.every((o) => selectedIds.has(o.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((o) => o.id)));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const handleBulkStatusUpdate = async () => {
    const ids = Array.from(selectedIds);
    // The result of each write is counted instead of assumed: the old version
    // patched the rows in local state whether or not Supabase accepted them, so
    // a rejected update still rendered as done until the next reload.
    setSaving(true);
    const results = await Promise.all(
      ids.map((id) => updateOrder(id, { status: bulkTargetStatus }))
    );
    const written = results.filter((r) => r.ok).length;
    const failed = results.find((r) => !r.ok)?.error;
    await load(statusFilter, committedSearch);
    if (written < ids.length) {
      toastError(`${ids.length - written} of ${ids.length} order(s) were not updated${failed ? `: ${failed}` : ""}`);
    } else {
      success(`${written} order(s) updated to ${bulkTargetStatus.replace(/_/g, " ")}`);
    }
    setSelectedIds(new Set());
    setBulkStatusOpen(false);
    setBulkConfirmOpen(false);
    setSaving(false);
  };

  /* ── Print Invoice ─────────────────────────────────────────── */

  const printInvoice = (order: any) => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head><title>Invoice ${order.order_number || order.id?.slice(0, 8)}</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 40px; color: #111; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #FF5A0A; padding-bottom: 16px; margin-bottom: 24px; }
        .logo { font-size: 24px; font-weight: bold; color: #FF5A0A; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th, td { padding: 8px 12px; border: 1px solid #e5e5e5; text-align: left; font-size: 13px; }
        th { background: #f5f5f5; font-weight: 600; }
        .total { font-size: 18px; font-weight: bold; text-align: right; margin-top: 16px; }
        .footer { margin-top: 32px; font-size: 11px; color: #999; text-align: center; }
        @media print { body { padding: 20px; } }
      </style></head><body>
      <div class="header">
        <div>
          <div class="logo">ChinaSuuq</div>
          <div style="font-size: 12px; color: #666; margin-top: 4px;">China-to-Somalia Sourcing Platform</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 20px; font-weight: bold;">INVOICE</div>
          <div style="font-size: 13px; color: #666;">${order.order_number || order.reference || order.id?.slice(0, 8)}</div>
          <div style="font-size: 13px; color: #666;">${order.created_at ? new Date(order.created_at).toLocaleDateString() : ""}</div>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px;">
        <div>
          <h3 style="font-size: 12px; text-transform: uppercase; color: #999; margin-bottom: 8px;">Bill To</h3>
          <div style="font-size: 14px;">${order.customer_name || "Guest"}</div>
          <div style="font-size: 13px; color: #666;">${order.phone || order.recipient_name || ""}</div>
          <div style="font-size: 13px; color: #666;">${order.city || ""}</div>
        </div>
        <div>
          <h3 style="font-size: 12px; text-transform: uppercase; color: #999; margin-bottom: 8px;">Order Details</h3>
          <div style="font-size: 13px;"><strong>Shipping:</strong> ${(order.shipping_method || "").toUpperCase()}</div>
          <div style="font-size: 13px;"><strong>Status:</strong> ${(order.status || "").replace(/_/g, " ")}</div>
          <div style="font-size: 13px;"><strong>Payment:</strong> ${(order.payment_status || "").replace(/_/g, " ")}</div>
        </div>
      </div>
      <table>
        <tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>
        <tr><td>${order.target_marketplace || "—"}</td><td>1</td><td>${formatUSD(order.total || 0)}</td><td>${formatUSD(order.total || 0)}</td></tr>
      </table>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div></div>
        <div>
          <div style="font-size: 13px;">Subtotal: ${formatUSD(order.subtotal || 0)}</div>
          <div style="font-size: 13px;">Shipping: ${formatUSD(order.shipping_cost || 0)}</div>
          <div style="font-size: 13px;">Service Fee: ${formatUSD(order.service_fee || 0)}</div>
          <div class="total">Total: ${formatUSD(order.total || 0)}</div>
        </div>
      </div>
      <div class="footer">
        <p>Thank you for your order! &mdash; ChinaSuuq</p>
        <p>Questions? Contact us on WhatsApp</p>
      </div>
      </body></html>
    `);
    w.document.close();
    w.print();
  };

  /* ── Table columns ─────────────────────────────────────────── */

  const columns: Column<any>[] = [
    {
      key: "order_number",
      label: "Order",
      sortable: true,
      fixed: true,
      render: (r) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); toggleSelect(r.id); }}
            className="shrink-0"
          >
            {selectedIds.has(r.id) ? (
              <CheckSquare className="h-4 w-4 text-brand-500" />
            ) : (
              <Square className="h-4 w-4 text-dark-300 hover:text-dark-500" />
            )}
          </button>
          <span className="font-semibold text-dark-900">{r.order_number || r.reference || r.id?.slice(0, 8)}</span>
        </div>
      ),
    },
    {
      key: "customer_name",
      label: "Customer",
      sortable: true,
      render: (r) => (
        <div>
          {/* Clicking the name opens the customer's whole history with per-line
              provenance, instead of only this one order. */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              openCustomer(r);
            }}
            className="font-medium text-dark-900 underline-offset-2 hover:text-brand-600 hover:underline"
            title="Open customer history"
          >
            {r.customer_name || "Guest"}
          </button>
          <p className="text-xs text-dark-900/45">{r.phone || r.city || "—"}</p>
        </div>
      ),
    },
    {
      key: "apps",
      label: "Bought in",
      className: "hidden lg:table-cell",
      fixed: true,
      render: (r) => {
        const apps: string[] = Array.isArray(r.apps) ? r.apps : [];
        if (apps.length === 0) {
          return (
            <span
              className="text-xs text-dark-900/35"
              title="No line items were recorded for this order, so its source apps are unknown."
            >
              not recorded
            </span>
          );
        }
        return (
          <div className="flex flex-wrap items-center gap-1">
            {apps.map((app) => (
              <span
                key={app}
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  app === "unknown"
                    ? "bg-dark-100 text-dark-900/45"
                    : "bg-brand-500/10 text-brand-700"
                )}
                title={
                  app === "unknown"
                    ? "This line predates per-item provenance."
                    : app
                }
              >
                {app === "unknown" ? "?" : app}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: "shipping_method",
      label: "Mode",
      sortable: true,
      className: "hidden lg:table-cell",
      render: (r) => <StatusBadge status={r.shipping_method} />,
    },
    {
      key: "total",
      label: "Total",
      sortable: true,
      render: (r) => <span className="font-semibold text-dark-900">{formatUSD(r.total || 0)}</span>,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (r) => {
        const progress = getProgressPercent(r.status);
        return (
          <div className="space-y-1">
            <StatusBadge status={r.status} />
            {r.status !== "cancelled" && r.status !== "delivered" && (
              <div className="h-1 w-16 rounded-full bg-dark-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "payment_status",
      label: "Payment",
      sortable: true,
      className: "hidden lg:table-cell",
      render: (r) => <StatusBadge status={r.payment_status} />,
    },
    {
      key: "created_at",
      label: "Created",
      sortable: true,
      className: "hidden xl:table-cell",
      render: (r) => (
        <span className="text-dark-900/50 text-xs">
          {r.created_at
            ? new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
            : "—"}
        </span>
      ),
    },
  ];

  /* ── Render ────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <PageHeader
        title="Orders"
        subtitle="Manage and fulfil customer orders from China to Somalia"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() =>
                downloadCsv(
                  `chinasuuq-orders-${stamp()}`,
                  toCsv(ORDERS_CSV_COLUMNS, filtered)
                )
              }
              disabled={filtered.length === 0}
              className="flex items-center gap-2 rounded-xl border border-dark-900/10 bg-white px-3 py-1.5 text-xs font-medium text-dark-600 transition-colors hover:bg-dark-50 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              Export {filtered.length}
            </button>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => set("from", e.target.value)}
              className="rounded-xl border border-dark-900/10 bg-white px-3 py-1.5 text-xs outline-none focus:border-brand-500"
              aria-label="Created from"
              placeholder="From"
            />
            <span className="text-dark-300 text-xs">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => set("to", e.target.value)}
              className="rounded-xl border border-dark-900/10 bg-white px-3 py-1.5 text-xs outline-none focus:border-brand-500"
              aria-label="Created to"
              placeholder="To"
            />
            {isFiltered && (
              <button
                onClick={() => {
                  reset();
                  setSearch("");
                }}
                className="flex items-center gap-1.5 rounded-xl border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100"
                title="Clears every filter and the query string"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset filters
              </button>
            )}
          </div>
        }
      />

      {/* ── KPIs ──
          These five cards describe the rows THIS list loaded (the newest page of
          orders matching the filters), and the label says so. The lifetime
          numbers with real previous-period deltas come from admin_kpis() and live
          on the dashboard — repeating them here over a filtered page would put two
          different "revenue" figures in front of the operator. */}
      <PageGrid className="sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="In this view" value={kpis.total} icon={Package} tone="brand" delay={0} />
        <StatCard label="Pending (view)" value={kpis.pending} icon={Clock3} tone="warning" delay={1} />
        <StatCard label="Active (view)" value={kpis.active} icon={RefreshCw} tone="info" delay={2} />
        <StatCard label="Delivered (view)" value={kpis.delivered} icon={Check} tone="success" delay={3} />
        <StatCard label="Revenue (view)" value={formatUSD(kpis.revenue)} icon={CreditCard} tone="violet" delay={4} />
      </PageGrid>

      {/* ── Bulk Actions ── */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3"
          >
            <CheckSquare className="h-5 w-5 text-brand-500" />
            <span className="text-sm font-semibold text-brand-700">{selectedIds.size} selected</span>
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <button
                  onClick={() => setBulkStatusOpen(!bulkStatusOpen)}
                  className="flex items-center gap-1.5 rounded-lg border border-brand-300 bg-white px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
                >
                  Bulk Status Update
                </button>
                {bulkStatusOpen && (
                  <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-xl border border-dark-100 bg-white py-1 shadow-lg max-h-64 overflow-y-auto">
                    {STATUSES.filter((s) => s !== "all").map((s) => (
                      <button
                        key={s}
                        onClick={() => { setBulkTargetStatus(s); setBulkConfirmOpen(true); setBulkStatusOpen(false); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-dark-600 hover:bg-brand-50 hover:text-brand-700"
                      >
                        {s.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="rounded-lg p-1.5 text-dark-400 hover:bg-dark-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Status filter chips ── */}
      <FilterChips<string>
        options={STATUSES.map((s) => ({
          value: s,
          label: s === "all" ? "All" : s.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
          count: statusCounts[s],
        }))}
        value={statusFilter}
        onChange={(s) => set("status", s)}
      />

      {/* ── Which app the order's lines were bought in ── */}
      {appOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-dark-900/40">
            Bought in
          </span>
          <FilterChips<string>
            options={[
              { value: "", label: "Any app", count: orders.length },
              ...appOptions.map(({ app, count }) => ({
                value: app,
                label: app === "unknown" ? "not recorded" : app,
                count,
              })),
            ]}
            value={appFilter}
            onChange={(v) => set("app", v)}
          />
        </div>
      )}

      {/* ── Table ── */}
      <TableShell
        isLoading={loading}
        error={error}
        errorRetry={() => load(statusFilter, committedSearch)}
        hasData={filtered.length > 0}
        filtered={statusFilter !== "all" || !!appFilter || !!dateFrom || !!dateTo || !!committedSearch}
        emptyImage={EMPTY_IMAGES.orders}
        emptyTitle="No orders yet"
        emptySubtitle="Orders placed by customers will appear here in real time."
      >
        <DataTable
          columns={columns}
          data={filtered}
          onRowClick={setSelected}
          search={search}
          onSearchChange={setSearch}
          density={tablePrefs.density}
          hiddenKeys={tablePrefs.hidden}
          exportRows={() =>
            downloadCsv(`chinasuuq-orders-${stamp()}`, toCsv(ORDERS_CSV_COLUMNS, filtered))
          }
          toolbar={<TableControls columns={ORDER_COLUMNS} prefs={tablePrefs} />}
        />
      </TableShell>

      {/* ── Order Detail Drawer ── */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setSelected(null)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl"
            >
              {/* Drawer header */}
              <div className="flex items-center justify-between border-b border-dark-900/5 px-6 py-4">
                <div>
                  <h2 className="text-lg font-bold text-dark-900">
                    {selected.order_number || selected.id.slice(0, 8)}
                  </h2>
                  <p className="text-xs text-dark-900/40">
                    {selected.created_at ? formatDateTime(selected.created_at) : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => printInvoice(selected)}
                    className="rounded-lg p-2 text-dark-400 hover:bg-dark-50 hover:text-brand-500 transition-colors"
                    title="Print Invoice"
                  >
                    <Printer className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setSelected(null)}
                    className="rounded-lg p-2 text-dark-900/50 hover:bg-dark-50"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 space-y-5 p-6">
                {/* Status badges */}
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={selected.status} />
                  <StatusBadge status={selected.payment_status} />
                  <StatusBadge status={selected.shipping_method} />
                </div>

                {/* Progress bar */}
                {selected.status !== "cancelled" && (
                  <div className="rounded-xl bg-dark-50 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-dark-500">Order Progress</span>
                      <span className="text-xs font-bold text-brand-600">{getProgressPercent(selected.status)}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-dark-100 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600"
                        initial={{ width: 0 }}
                        animate={{ width: `${getProgressPercent(selected.status)}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                      />
                    </div>
                    <p className="mt-2 text-[10px] text-dark-400">
                      {selected.status.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                      {getStatusGroup(selected.status) !== "terminal" && (
                        <>
                          {" → "}
                          {STATUS_FLOW[Math.min(STATUS_FLOW.indexOf(selected.status) + 1, STATUS_FLOW.length - 1)]
                            .replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                        </>
                      )}
                    </p>
                  </div>
                )}

                {/* Quick action: advance */}
                {selected.status !== "delivered" && selected.status !== "cancelled" && (
                  <button
                    onClick={() => advanceStatus(selected.id, selected.status)}
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/50 px-4 py-3 text-sm font-semibold text-brand-600 hover:bg-brand-50 transition-colors"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Advance to {STATUS_FLOW[Math.min(STATUS_FLOW.indexOf(selected.status) + 1, STATUS_FLOW.length - 1)]
                          ?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                )}

                {/* Full status timeline */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-dark-900/50 uppercase tracking-wider">Status Workflow</p>
                  <div className="space-y-1">
                    {STATUS_FLOW.map((s, idx) => {
                      const currentIdx = STATUS_FLOW.indexOf(selected.status);
                      const isCompleted = idx <= currentIdx;
                      const isCurrent = idx === currentIdx;
                      const isCancelled = selected.status === "cancelled";

                      return (
                        <button
                          key={s}
                          onClick={() => !saving && setStatus(selected.id, s)}
                          disabled={saving}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-all text-left",
                            isCurrent && !isCancelled
                              ? "bg-brand-50 text-brand-700 border border-brand-200"
                              : isCompleted && !isCancelled
                                ? "bg-emerald-50 text-emerald-700"
                                : "text-dark-400 hover:bg-dark-50"
                          )}
                        >
                          <div className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-full shrink-0",
                            isCompleted && !isCancelled
                              ? "bg-emerald-500 text-white"
                              : "bg-dark-100 text-dark-400"
                          )}>
                            {isCompleted && !isCancelled ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <span className="h-2 w-2 rounded-full bg-dark-300" />
                            )}
                          </div>
                          <span className="flex-1">{s.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</span>
                          {isCurrent && !isCancelled && (
                            <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-bold text-white">CURRENT</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Customer info */}
                <div className="space-y-3 rounded-2xl bg-dark-50 p-4">
                  <p className="text-xs font-semibold text-dark-900/50 uppercase tracking-wider">Order Details</p>
                  <div className="space-y-3">
                    {[
                      { icon: User, label: "Customer", value: selected.customer_name || "Guest" },
                      { icon: Phone, label: "Phone", value: selected.phone || selected.recipient_name || "—" },
                      { icon: MapPin, label: "City", value: selected.city || "—" },
                      { icon: CreditCard, label: "Total", value: formatUSD(selected.total || 0) },
                      { icon: Truck, label: "Shipping", value: (selected.shipping_method || "—").toUpperCase() },
                      { icon: CalendarDays, label: "Created", value: selected.created_at ? formatDateTime(selected.created_at) : "—" },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600">
                          <item.icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[10px] text-dark-900/40 uppercase tracking-wider">{item.label}</p>
                          <p className="text-sm font-semibold text-dark-900">{item.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Items & source: what was bought, in which app */}
                <OrderProvenance orderId={selected.id} />

                {/* Shipping breakdown */}
                <div className="space-y-3 rounded-2xl bg-white border border-dark-100/50 p-4">
                  <p className="text-xs font-semibold text-dark-900/50 uppercase tracking-wider">Payment Breakdown</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-dark-500">Subtotal</span><span className="font-medium">{formatUSD(selected.subtotal || 0)}</span></div>
                    <div className="flex justify-between"><span className="text-dark-500">Shipping</span><span className="font-medium">{formatUSD(selected.shipping_cost || 0)}</span></div>
                    <div className="flex justify-between"><span className="text-dark-500">Service Fee</span><span className="font-medium">{formatUSD(selected.service_fee || 0)}</span></div>
                    <div className="border-t border-dark-100 pt-2 flex justify-between font-bold text-dark-900">
                      <span>Total</span>
                      <span className="text-brand-600">{formatUSD(selected.total || 0)}</span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => printInvoice(selected)}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-dark-100 bg-white px-4 py-2.5 text-sm font-medium text-dark-600 hover:bg-dark-50 transition-colors"
                  >
                    <Printer className="h-4 w-4" />
                    Print Invoice
                  </button>
                  {selected.phone && (
                    <a
                      href={`https://wa.me/${selected.phone.replace(/[^0-9]/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 transition-colors"
                    >
                      <Phone className="h-4 w-4" />
                      WhatsApp
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Bulk Confirm Dialog ── */}
      <ConfirmDialog
        open={bulkConfirmOpen}
        title="Bulk Update Status"
        message={`Update ${selectedIds.size} order(s) to "${bulkTargetStatus.replace(/_/g, " ")}"?`}
        onCancel={() => setBulkConfirmOpen(false)}
        onConfirm={handleBulkStatusUpdate}
        confirmText="Update All"
        loading={saving}
        danger={false}
      />

      {/* ── Customer 360 (real order + per-line provenance history) ── */}
      <AnimatePresence>
        {customer360 && (
          <Customer360Drawer
            customerId={customer360.id}
            fallbackName={customer360.name}
            onClose={() => setCustomer360(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
