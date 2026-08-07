"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { cn, formatUSD, formatDate } from "@/lib/utils";
import {
  Search,
  ShoppingCart,
  Loader2,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import type { Order, OrderStatus } from "@/types";
import Modal from "@/components/admin/Modal";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import FormInput from "@/components/admin/FormInput";
import { useToast } from "@/components/admin/Toast";

// ─── Extended type to include customer_id from DB ────────────────────────────
interface OrderRow extends Order {
  customer_id?: string;
}

// ─── All 17 pipeline statuses ────────────────────────────────────────────────
const ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "purchasing",
  "purchased",
  "in_transit_china",
  "warehouse",
  "inspection",
  "consolidated",
  "shipped",
  "in_transit",
  "arrived_somalia",
  "customs",
  "ready_for_pickup",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

const statusColors: Record<string, string> = {
  pending: "bg-amber-50 text-amber-600",
  confirmed: "bg-blue-50 text-blue-600",
  purchasing: "bg-indigo-50 text-indigo-600",
  purchased: "bg-indigo-50 text-indigo-600",
  in_transit_china: "bg-orange-50 text-orange-600",
  warehouse: "bg-purple-50 text-purple-600",
  inspection: "bg-purple-50 text-purple-600",
  consolidated: "bg-purple-50 text-purple-600",
  shipped: "bg-green-50 text-green-600",
  in_transit: "bg-cyan-50 text-cyan-600",
  arrived_somalia: "bg-teal-50 text-teal-600",
  customs: "bg-amber-50 text-amber-600",
  ready_for_pickup: "bg-blue-50 text-blue-600",
  out_for_delivery: "bg-indigo-50 text-indigo-600",
  delivered: "bg-green-50 text-green-600",
  cancelled: "bg-red-50 text-red-600",
};

const statusTabs = [
  "All",
  "Pending",
  "Processing",
  "Shipped",
  "Delivered",
] as const;

function getStatusGroup(status: string): string {
  if (["pending", "confirmed"].includes(status)) return "Pending";
  if (
    [
      "purchasing",
      "purchased",
      "in_transit_china",
      "warehouse",
      "inspection",
      "consolidated",
    ].includes(status)
  )
    return "Processing";
  if (["shipped", "in_transit", "arrived_somalia", "customs"].includes(status))
    return "Shipped";
  if (
    ["ready_for_pickup", "out_for_delivery", "delivered"].includes(status)
  )
    return "Delivered";
  return "Pending";
}

function statusLabel(s: OrderStatus): string {
  return s.replace(/_/g, " ");
}

// ─── Create form initial state ───────────────────────────────────────────────
interface CreateFormData {
  reference: string;
  customer_id: string;
  shipping_method: string;
  currency: string;
  total_usd: string;
}

const emptyCreate: CreateFormData = {
  reference: "",
  customer_id: "",
  shipping_method: "air",
  currency: "USD",
  total_usd: "",
};

// ─── Edit form initial state ─────────────────────────────────────────────────
interface EditFormData {
  reference: string;
  shipping_method: string;
  currency: string;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function OrdersPage() {
  const { success, error: toastError } = useToast();

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<string>("All");

  // ── Create modal state ───────────────────────────────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormData>(emptyCreate);
  const [createLoading, setCreateLoading] = useState(false);

  // ── Edit modal state ─────────────────────────────────────────────────────
  const [editOrder, setEditOrder] = useState<OrderRow | null>(null);
  const [editForm, setEditForm] = useState<EditFormData>({
    reference: "",
    shipping_method: "air",
    currency: "USD",
  });
  const [editLoading, setEditLoading] = useState(false);

  // ── Delete confirm state ─────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<OrderRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setOrders((data as OrderRow[]) || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load orders"
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // ── Filters ──────────────────────────────────────────────────────────────
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        search === "" ||
        order.reference.toLowerCase().includes(search.toLowerCase()) ||
        order.id.toLowerCase().includes(search.toLowerCase());
      const matchesTab =
        activeTab === "All" || getStatusGroup(order.status) === activeTab;
      return matchesSearch && matchesTab;
    });
  }, [orders, search, activeTab]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { All: orders.length };
    orders.forEach((order) => {
      const group = getStatusGroup(order.status);
      counts[group] = (counts[group] || 0) + 1;
    });
    return counts;
  }, [orders]);

  // ── CREATE ───────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!createForm.reference.trim()) {
      toastError("Reference is required");
      return;
    }
    try {
      setCreateLoading(true);
      const { error: insertError } = await supabase.from("orders").insert({
        reference: createForm.reference.trim(),
        customer_id: createForm.customer_id.trim() || null,
        shipping_method: createForm.shipping_method,
        currency: createForm.currency.trim() || "USD",
        total_usd: createForm.total_usd ? Number(createForm.total_usd) : 0,
        status: "pending" as OrderStatus,
        payment_status: "pending",
      });

      if (insertError) throw insertError;

      success("Order created successfully");
      setShowCreateModal(false);
      setCreateForm(emptyCreate);
      fetchOrders();
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Failed to create order"
      );
    } finally {
      setCreateLoading(false);
    }
  };

  // ── STATUS UPDATE (inline pipeline) ──────────────────────────────────────
  const handleStatusChange = async (
    orderId: string,
    newStatus: string
  ) => {
    try {
      const { error: updateError } = await supabase
        .from("orders")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", orderId);

      if (updateError) throw updateError;

      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, status: newStatus as OrderStatus }
            : o
        )
      );
      success(`Status updated to ${statusLabel(newStatus as OrderStatus)}`);
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Failed to update status"
      );
    }
  };

  // ── EDIT ─────────────────────────────────────────────────────────────────
  const openEdit = (order: OrderRow) => {
    setEditOrder(order);
    setEditForm({
      reference: order.reference,
      shipping_method: order.shipping_method,
      currency: order.currency,
    });
  };

  const handleEdit = async () => {
    if (!editOrder || !editForm.reference.trim()) {
      toastError("Reference is required");
      return;
    }
    try {
      setEditLoading(true);
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          reference: editForm.reference.trim(),
          shipping_method: editForm.shipping_method,
          currency: editForm.currency.trim() || "USD",
          updated_at: new Date().toISOString(),
        })
        .eq("id", editOrder.id);

      if (updateError) throw updateError;

      success("Order updated successfully");
      setEditOrder(null);
      fetchOrders();
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Failed to update order"
      );
    } finally {
      setEditLoading(false);
    }
  };

  // ── DELETE ───────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleteLoading(true);
      const { error: deleteError } = await supabase
        .from("orders")
        .delete()
        .eq("id", deleteTarget.id);

      if (deleteError) throw deleteError;

      success("Order deleted successfully");
      setDeleteTarget(null);
      fetchOrders();
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Failed to delete order"
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Loading / Error states ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-sm text-dark-400">Loading orders...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 text-sm font-medium text-brand-500 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-900">Orders</h1>
          <p className="text-sm text-dark-400">
            Track and manage all customer orders
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Order
        </button>
      </div>

      {/* ── Search ──────────────────────────────────────────────────────── */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-400" />
        <input
          type="text"
          placeholder="Search by order reference..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-full rounded-xl border border-dark-100 bg-white pl-10 pr-4 text-sm text-dark-900 placeholder:text-dark-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
        />
      </div>

      {/* ── Status tabs ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 rounded-xl bg-dark-50 p-1 overflow-x-auto">
        {statusTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all",
              activeTab === tab
                ? "bg-white text-dark-900 shadow-sm"
                : "text-dark-400 hover:text-dark-600"
            )}
          >
            {tab}
            <span
              className={cn(
                "ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs",
                activeTab === tab
                  ? "bg-brand-500 text-white"
                  : "bg-dark-200/50 text-dark-500"
              )}
            >
              {tabCounts[tab] || 0}
            </span>
          </button>
        ))}
      </div>

      {/* ── Orders table ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-dark-100/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-50 bg-dark-50/50">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Reference
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Total
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Payment
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Shipping
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Date
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-dark-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-50">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <ShoppingCart className="mx-auto h-10 w-10 text-dark-300" />
                    <p className="mt-2 text-sm font-medium text-dark-400">
                      {search || activeTab !== "All"
                        ? "No orders match your filters"
                        : "No orders yet"}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-dark-50/50 transition-colors"
                  >
                    {/* Reference */}
                    <td className="px-6 py-3.5">
                      <span className="text-sm font-medium text-brand-500">
                        {order.reference}
                      </span>
                    </td>

                    {/* Customer ID */}
                    <td className="px-6 py-3.5">
                      <span className="text-sm text-dark-500 font-mono text-xs">
                        {order.customer_id
                          ? order.customer_id.slice(0, 8) + "..."
                          : "—"}
                      </span>
                    </td>

                    {/* Total */}
                    <td className="px-6 py-3.5">
                      <span className="text-sm font-medium text-dark-900">
                        {formatUSD(order.total_usd)}
                      </span>
                    </td>

                    {/* Status — inline <select> for pipeline updates */}
                    <td className="px-6 py-3.5">
                      <div className="relative">
                        <select
                          value={order.status}
                          onChange={(e) =>
                            handleStatusChange(order.id, e.target.value)
                          }
                          className={cn(
                            "appearance-none cursor-pointer rounded-full px-2.5 py-1 pr-6 text-xs font-medium capitalize border-0 focus:outline-none focus:ring-2 focus:ring-brand-500/30",
                            statusColors[order.status] ||
                              "bg-dark-50 text-dark-500"
                          )}
                          style={{
                            backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                            backgroundPosition: "right 4px center",
                            backgroundRepeat: "no-repeat",
                            backgroundSize: "14px 14px",
                          }}
                        >
                          {ORDER_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {statusLabel(s)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>

                    {/* Payment status */}
                    <td className="px-6 py-3.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                          order.payment_status === "confirmed"
                            ? "bg-green-50 text-green-600"
                            : order.payment_status === "pending"
                            ? "bg-amber-50 text-amber-600"
                            : "bg-red-50 text-red-600"
                        )}
                      >
                        {order.payment_status}
                      </span>
                    </td>

                    {/* Shipping method */}
                    <td className="px-6 py-3.5">
                      <span className="text-sm text-dark-500 capitalize">
                        {order.shipping_method}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="px-6 py-3.5">
                      <span className="text-sm text-dark-400">
                        {formatDate(
                          order.created_at ?? new Date().toISOString()
                        )}
                      </span>
                    </td>

                    {/* Actions: Edit + Delete */}
                    <td className="px-6 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(order)}
                          className="rounded-lg p-1.5 text-dark-400 hover:bg-blue-50 hover:text-blue-500 transition-all"
                          title="Edit order"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(order)}
                          className="rounded-lg p-1.5 text-dark-400 hover:bg-red-50 hover:text-red-500 transition-all"
                          title="Delete order"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════
          CREATE ORDER MODAL
          ═══════════════════════════════════════════════════════════════════ */}
      <Modal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setCreateForm(emptyCreate);
        }}
        title="Create Order"
        onConfirm={handleCreate}
        confirmText="Create Order"
        confirmLoading={createLoading}
      >
        <div className="space-y-4">
          <FormInput
            label="Order Reference"
            name="reference"
            value={createForm.reference}
            onChange={(v) =>
              setCreateForm((p) => ({ ...p, reference: v }))
            }
            placeholder="e.g. CS-2026-00001"
            required
          />
          <FormInput
            label="Customer ID"
            name="customer_id"
            value={createForm.customer_id}
            onChange={(v) =>
              setCreateForm((p) => ({ ...p, customer_id: v }))
            }
            placeholder="UUID of customer"
          />

          {/* Shipping method select — matching project styling */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-dark-700">
              Shipping Method <span className="text-red-500">*</span>
            </label>
            <select
              value={createForm.shipping_method}
              onChange={(e) =>
                setCreateForm((p) => ({
                  ...p,
                  shipping_method: e.target.value,
                }))
              }
              className="w-full rounded-xl border border-dark-200 bg-white px-3.5 py-2.5 text-sm text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            >
              <option value="air">Air</option>
              <option value="sea">Sea</option>
              <option value="land">Land</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Currency"
              name="currency"
              value={createForm.currency}
              onChange={(v) =>
                setCreateForm((p) => ({ ...p, currency: v }))
              }
              placeholder="USD"
            />
            <FormInput
              label="Total (USD)"
              name="total_usd"
              type="number"
              value={createForm.total_usd}
              onChange={(v) =>
                setCreateForm((p) => ({ ...p, total_usd: v }))
              }
              placeholder="0.00"
              min={0}
              step={0.01}
            />
          </div>
        </div>
      </Modal>

      {/* ═════════════════════════════════════════════════════════════════════
          EDIT ORDER MODAL
          ═══════════════════════════════════════════════════════════════════ */}
      <Modal
        open={!!editOrder}
        onClose={() => setEditOrder(null)}
        title="Edit Order"
        onConfirm={handleEdit}
        confirmText="Save Changes"
        confirmLoading={editLoading}
      >
        <div className="space-y-4">
          <FormInput
            label="Order Reference"
            name="reference"
            value={editForm.reference}
            onChange={(v) =>
              setEditForm((p) => ({ ...p, reference: v }))
            }
            required
          />

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-dark-700">
              Shipping Method
            </label>
            <select
              value={editForm.shipping_method}
              onChange={(e) =>
                setEditForm((p) => ({
                  ...p,
                  shipping_method: e.target.value,
                }))
              }
              className="w-full rounded-xl border border-dark-200 bg-white px-3.5 py-2.5 text-sm text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            >
              <option value="air">Air</option>
              <option value="sea">Sea</option>
              <option value="land">Land</option>
            </select>
          </div>

          <FormInput
            label="Currency"
            name="currency"
            value={editForm.currency}
            onChange={(v) =>
              setEditForm((p) => ({ ...p, currency: v }))
            }
          />
        </div>
      </Modal>

      {/* ═════════════════════════════════════════════════════════════════════
          DELETE CONFIRM DIALOG
          ═══════════════════════════════════════════════════════════════════ */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Order"
        message={`Are you sure you want to delete order "${deleteTarget?.reference}"? This action cannot be undone.`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        confirmText="Delete"
        loading={deleteLoading}
        danger
      />
    </div>
  );
}
