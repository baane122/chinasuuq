"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { DataTable, Column } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { KPICard } from "@/components/admin/KPICard";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Package, CreditCard, MapPin, Clock3, Loader2, AlertCircle,
  CheckSquare, Square, Printer, Truck, User, Phone, CalendarDays,
  ChevronRight, ExternalLink, RefreshCw, Check, ArrowRight
} from "lucide-react";
import { cn, formatUSD, formatDate, formatDateTime } from "@/lib/utils";
import { listOrders, updateOrder } from "@/lib/admin/supabase-data";
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

export default function OrdersPage() {
  const { success, error: toastError } = useToast();

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  // Bulk
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkTargetStatus, setBulkTargetStatus] = useState("confirmed");

  // Date range
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Bulk confirm
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  const load = useCallback(async (s?: string) => {
    setLoading(true);
    setError(null);
    const res = await listOrders({ status: s === "all" ? undefined : s, search });
    if (res.ok) {
      setOrders(res.orders);
    } else {
      setError(res.error || "Failed to load orders");
    }
    setLoading(false);
  }, [search]);

  useEffect(() => {
    load(statusFilter);
  }, [statusFilter, load]);

  /* ── Filtered ──────────────────────────────────────────────── */

  const filtered = useMemo(() => {
    let result = orders;
    if (statusFilter !== "all") {
      result = result.filter((o) => o.status === statusFilter);
    }
    if (dateFrom) {
      result = result.filter((o) => o.created_at && o.created_at.slice(0, 10) >= dateFrom);
    }
    if (dateTo) {
      result = result.filter((o) => o.created_at && o.created_at.slice(0, 10) <= dateTo);
    }
    return result;
  }, [orders, statusFilter, dateFrom, dateTo]);

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
    for (const id of ids) {
      await updateOrder(id, { status: bulkTargetStatus });
    }
    setOrders((prev) => prev.map((o) => selectedIds.has(o.id) ? { ...o, status: bulkTargetStatus } : o));
    success(`${ids.length} order(s) updated to ${bulkTargetStatus.replace(/_/g, " ")}`);
    setSelectedIds(new Set());
    setBulkStatusOpen(false);
    setBulkConfirmOpen(false);
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
          <p className="font-medium text-dark-900">{r.customer_name || "Guest"}</p>
          <p className="text-xs text-dark-900/45">{r.phone || r.city || "—"}</p>
        </div>
      ),
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-dark-900">Orders</h1>
          <p className="text-sm text-dark-900/50">Track and manage customer orders</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-xl border border-dark-900/10 bg-white px-3 py-1.5 text-xs outline-none focus:border-brand-500"
            placeholder="From"
          />
          <span className="text-dark-300 text-xs">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-xl border border-dark-900/10 bg-white px-3 py-1.5 text-xs outline-none focus:border-brand-500"
            placeholder="To"
          />
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KPICard title="Total Orders" value={kpis.total} icon={Package} color="brand" delay={0} />
        <KPICard title="Pending" value={kpis.pending} icon={Clock3} color="amber" delay={1} />
        <KPICard title="Active" value={kpis.active} icon={RefreshCw} color="sky" delay={2} />
        <KPICard title="Delivered" value={kpis.delivered} icon={Check} color="emerald" delay={3} />
        <KPICard title="Revenue" value={formatUSD(kpis.revenue)} icon={CreditCard} color="violet" delay={4} />
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4" />
          <span>{error}</span>
        </div>
      ) : null}

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
                        {s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
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

      {/* ── Status filter tabs ── */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition",
              statusFilter === s
                ? "border-brand-500 bg-brand-500 text-white"
                : "border-dark-900/10 bg-white text-dark-900/60 hover:border-brand-500/30"
            )}
          >
            {s === "all" ? "All" : s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            {statusCounts[s] !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px]",
                  statusFilter === s ? "bg-white/20" : "bg-dark-900/5"
                )}
              >
                {statusCounts[s]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-dark-900/50">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading orders…
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          searchKeys={["order_number", "reference", "customer_name", "city", "phone", "recipient_name"]}
          onRowClick={setSelected}
        />
      )}

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
                      {selected.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      {getStatusGroup(selected.status) !== "terminal" && (
                        <>
                          {" → "}
                          {STATUS_FLOW[Math.min(STATUS_FLOW.indexOf(selected.status) + 1, STATUS_FLOW.length - 1)]
                            .replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
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
                          ?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
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
                          <span className="flex-1">{s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
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
    </div>
  );
}
