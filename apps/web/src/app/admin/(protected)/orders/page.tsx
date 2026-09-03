"use client";
import { useState, useEffect, useMemo } from "react";
import { DataTable, Column } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { motion, AnimatePresence } from "framer-motion";
import { X, Package, CreditCard, MapPin, Clock3, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { listOrders, updateOrder } from "@/lib/admin/supabase-data";
import type { OrderStatus } from "@/lib/admin/types";

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

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async (s?: string) => {
    setLoading(true);
    setError(null);
    const res = await listOrders({ status: s === "all" ? undefined : s, search });
    if (res.ok) {
      setOrders(res.orders);
    } else {
      setError(res.error || "Failed to load orders");
    }
    setLoading(false);
  };

  useEffect(() => {
    load(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return orders;
    return orders.filter((o) => o.status === statusFilter);
  }, [orders, statusFilter]);

  const columns: Column<any>[] = [
    {
      key: "order_number",
      label: "Order",
      sortable: true,
      render: (r) => <span className="font-semibold text-dark-900">{r.order_number || r.reference || r.id?.slice(0, 8)}</span>,
    },
    {
      key: "customer_name",
      label: "Customer",
      sortable: true,
      render: (r) => (
        <div>
          <p className="font-medium text-dark-900">{r.customer_name || "Guest"}</p>
          <p className="text-xs text-dark-900/45">{r.city || "—"}</p>
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
      render: (r) => <span className="font-semibold text-dark-900">${(r.total || 0).toLocaleString()}</span>,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (r) => <StatusBadge status={r.status} />,
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
        <span className="text-dark-900/50">
          {r.created_at
            ? new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
            : "—"}
        </span>
      ),
    },
  ];

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: orders.length };
    orders.forEach((o) => {
      counts[o.status] = (counts[o.status] || 0) + 1;
    });
    return counts;
  }, [orders]);

  const setStatus = async (id: string, newStatus: string) => {
    setSaving(true);
    const res = await updateOrder(id, { status: newStatus });
    if (res.ok) {
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o)));
      if (selected?.id === id) setSelected({ ...selected, status: newStatus });
    } else {
      alert(res.error || "Failed to update status");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-dark-900">Orders</h1>
          <p className="text-sm text-dark-900/50">Track and manage customer orders</p>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") load(statusFilter);
          }}
          placeholder="Search order #, customer, phone…"
          className="rounded-xl border border-dark-900/10 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-500"
        />
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Status filter tabs */}
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

      {/* Order detail drawer */}
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
              <div className="flex items-center justify-between border-b border-dark-900/5 px-6 py-4">
                <h2 className="text-lg font-bold text-dark-900">
                  {selected.order_number || selected.id.slice(0, 8)}
                </h2>
                <button
                  onClick={() => setSelected(null)}
                  className="rounded-lg p-1.5 text-dark-900/50 hover:bg-dark-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 space-y-5 p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={selected.status} />
                  <StatusBadge status={selected.payment_status} />
                  <StatusBadge status={selected.shipping_method} />
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold text-dark-900/50">Advance status</p>
                  <div className="flex flex-wrap gap-2">
                    {["paid", "purchasing", "in_warehouse", "in_transit", "customs_hold", "out_for_delivery", "delivered"].map((s) => (
                      <button
                        key={s}
                        onClick={() => setStatus(selected.id, s)}
                        disabled={saving}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                          selected.status === s
                            ? "border-brand-500 bg-brand-500 text-white"
                            : "border-dark-900/10 text-dark-900/60 hover:border-brand-500/30"
                        )}
                      >
                        {s.replace(/_/g, " ")}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl bg-dark-50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
                      <Package className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs text-dark-900/45">Customer</p>
                      <p className="text-sm font-semibold">{selected.customer_name || "Guest"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs text-dark-900/45">Total</p>
                      <p className="text-sm font-semibold">${(selected.total || 0).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs text-dark-900/45">City</p>
                      <p className="text-sm font-semibold">{selected.city || "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
                      <Clock3 className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs text-dark-900/45">Created</p>
                      <p className="text-sm font-semibold">
                        {selected.created_at
                          ? new Date(selected.created_at).toLocaleString()
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
