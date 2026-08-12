"use client";
import { useState, useMemo } from "react";
import { useAdminData } from "@/lib/admin/store";
import { DataTable, Column } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, Package, CreditCard, MapPin, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminOrder } from "@/lib/admin/types";

export default function OrdersPage() {
  const { orders, updateOrderStatus } = useAdminData();
  const [selected, setSelected] = useState<AdminOrder | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    if (statusFilter === "all") return orders;
    return orders.filter((o) => o.status === statusFilter);
  }, [orders, statusFilter]);

  const columns: Column<AdminOrder>[] = [
    { key: "reference", label: "Order", sortable: true, render: (r) => <span className="font-semibold text-dark-900">{r.reference}</span> },
    { key: "customer_name", label: "Customer", sortable: true, render: (r) => (
      <div>
        <p className="font-medium text-dark-900">{r.customer_name}</p>
        <p className="text-xs text-dark-900/45">{r.city}</p>
      </div>
    )},
    { key: "items", label: "Items", sortable: false, className: "hidden lg:table-cell", render: (r) => <span className="text-dark-900/60">{r.items.length} items</span> },
    { key: "total_usd", label: "Total", sortable: true, render: (r) => <span className="font-semibold text-dark-900">${r.total_usd.toLocaleString()}</span> },
    { key: "status", label: "Status", sortable: true, render: (r) => <StatusBadge status={r.status} /> },
    { key: "payment_status", label: "Payment", sortable: true, className: "hidden lg:table-cell", render: (r) => <StatusBadge status={r.payment_status} /> },
    { key: "shipping_method", label: "Mode", sortable: true, className: "hidden lg:table-cell", render: (r) => <StatusBadge status={r.shipping_method} /> },
    { key: "updated_at", label: "Updated", sortable: true, className: "hidden xl:table-cell", render: (r) => <span className="text-dark-900/50">{new Date(r.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span> },
  ];

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: orders.length };
    orders.forEach((o) => { counts[o.status] = (counts[o.status] || 0) + 1; });
    return counts;
  }, [orders]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-dark-900">Orders</h1>
        <p className="text-sm text-dark-900/50">Track and manage customer orders</p>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {["all", "awaiting_payment", "paid", "purchasing", "in_warehouse", "in_transit", "customs", "out_for_delivery", "delivered", "refunded"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition",
              statusFilter === s ? "border-brand-500 bg-brand-500 text-white" : "border-dark-900/10 bg-white text-dark-900/60 hover:border-brand-500/30"
            )}
          >
            {s === "all" ? "All" : s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            {statusCounts[s] !== undefined && (
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", statusFilter === s ? "bg-white/20" : "bg-dark-900/5")}>{statusCounts[s]}</span>
            )}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        searchKeys={["reference", "customer_name", "city", "notes"]}
        onRowClick={setSelected}
      />

      {/* Order detail drawer */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/40" onClick={() => setSelected(null)} />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-dark-900/5 px-6 py-4">
                <h2 className="text-lg font-bold text-dark-900">{selected.reference}</h2>
                <button onClick={() => setSelected(null)} className="rounded-lg p-1.5 text-dark-900/50 hover:bg-dark-50"><X className="h-5 w-5" /></button>
              </div>
              <div className="flex-1 space-y-5 p-6">
                {/* Status & Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={selected.status} />
                  <StatusBadge status={selected.payment_status} />
                  <StatusBadge status={selected.shipping_method} />
                </div>
                <div className="flex gap-2">
                  {(["paid", "purchasing", "in_warehouse", "in_transit", "customs", "out_for_delivery", "delivered"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => { updateOrderStatus(selected.id, s); setSelected({ ...selected, status: s }); }}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                        selected.status === s ? "border-brand-500 bg-brand-500 text-white" : "border-dark-900/10 text-dark-900/60 hover:border-brand-500/30"
                      )}
                    >
                      {s.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>

                {/* Details */}
                <div className="rounded-2xl bg-dark-50 p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600"><Package className="h-5 w-5" /></div>
                    <div>
                      <p className="text-xs text-dark-900/45">Customer</p>
                      <p className="text-sm font-semibold">{selected.customer_name}</p>
                      <p className="text-xs text-dark-900/45">{selected.customer_phone} · {selected.city}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600"><CreditCard className="h-5 w-5" /></div>
                    <div>
                      <p className="text-xs text-dark-900/45">Total</p>
                      <p className="text-sm font-semibold">${selected.total_usd.toLocaleString()}</p>
                      <p className="text-xs text-dark-900/45">Shipping: ${selected.shipping_usd} · Weight: {selected.weight_kg}kg</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600"><MapPin className="h-5 w-5" /></div>
                    <div>
                      <p className="text-xs text-dark-900/45">Shipping</p>
                      <p className="text-sm font-semibold">{selected.shipping_method === "air" ? "Air Freight" : "Sea Freight"}</p>
                      <p className="text-xs text-dark-900/45">{selected.eta ? `ETA: ${new Date(selected.eta).toLocaleDateString("en-GB")}` : "No ETA set"}</p>
                    </div>
                  </div>
                </div>

                {/* Items */}
                {selected.items.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-dark-900">Items ({selected.items.length})</h3>
                    <div className="space-y-2">
                      {selected.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between rounded-xl bg-dark-50 p-3">
                          <div>
                            <p className="text-sm font-medium text-dark-900">{item.product_title}</p>
                            {item.variant && <p className="text-xs text-dark-900/45">{item.variant}</p>}
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">${item.total_usd}</p>
                            <p className="text-xs text-dark-900/45">×{item.quantity}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tracking */}
                {selected.tracking && selected.tracking.length > 0 && (() => {
                  const tracking = selected.tracking!;
                  return (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-dark-900">Tracking Timeline</h3>
                      <div className="space-y-0">
                        {tracking.map((event, i) => (
                          <div key={i} className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-white">
                                <Clock3 className="h-3.5 w-3.5" />
                              </div>
                              {i < tracking.length - 1 && <div className="mt-1 h-6 w-px bg-brand-200" />}
                            </div>
                            <div className="pb-4">
                              <p className="text-sm font-medium text-dark-900">{event.status}</p>
                              <p className="text-xs text-dark-900/45">{event.location} · {new Date(event.time).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Notes */}
                {selected.notes && (
                  <div className="rounded-2xl bg-amber-50 p-4">
                    <p className="text-xs font-semibold text-amber-700">Notes</p>
                    <p className="mt-1 text-sm text-amber-800">{selected.notes}</p>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
