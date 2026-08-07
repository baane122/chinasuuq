"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { cn, formatUSD, formatDate } from "@/lib/utils";
import { Search, CreditCard, Loader2, CheckCircle2, XCircle, Clock, Plus, Pencil, Trash2 } from "lucide-react";
import type { Payment } from "@/types";
import Modal from "@/components/admin/Modal";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { useToast } from "@/components/admin/Toast";
import FormInput from "@/components/admin/FormInput";

const statusTabs = ["All", "Pending", "Confirmed", "Failed"] as const;

const statusColors: Record<string, string> = {
  pending: "bg-amber-50 text-amber-600",
  confirmed: "bg-green-50 text-green-600",
  failed: "bg-red-50 text-red-600",
  refunded: "bg-purple-50 text-purple-600",
};

const methodLabels: Record<string, string> = {
  zaad: "ZAAD",
  edahab: "Edahab",
  premier: "Premier",
  evc_plus: "EVC Plus",
  sahal: "Sahal",
  bank_transfer: "Bank Transfer",
  manual: "Manual",
};

const METHODS = ["zaad", "edahab", "premier", "evc_plus", "sahal", "bank_transfer", "manual"] as const;
const STATUSES = ["pending", "confirmed", "failed", "refunded"] as const;

const emptyForm = {
  order_id: "",
  amount: "",
  currency: "USD",
  method: "zaad" as string,
  reference: "",
  status: "pending" as string,
};

export default function PaymentsPage() {
  const { success, error: toastError } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<string>("All");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // Modal / form state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState({ ...emptyForm });
  const [formLoading, setFormLoading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Delete state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchPayments = async () => {
    try {
      setIsLoading(true);
      const { data, error: err } = await supabase
        .from("payments")
        .select("*")
        .order("created_at", { ascending: false });

      if (err) throw err;
      setPayments((data as Payment[]) || []);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load payments");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const filteredPayments = useMemo(() => {
    return payments.filter((payment) => {
      const matchesSearch =
        search === "" ||
        payment.reference.toLowerCase().includes(search.toLowerCase()) ||
        payment.order_id.toLowerCase().includes(search.toLowerCase()) ||
        payment.method.toLowerCase().includes(search.toLowerCase());

      const matchesTab =
        activeTab === "All" || payment.status === activeTab.toLowerCase();

      return matchesSearch && matchesTab;
    });
  }, [payments, search, activeTab]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { All: payments.length };
    payments.forEach((p) => {
      const key = p.status.charAt(0).toUpperCase() + p.status.slice(1);
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [payments]);

  // ── Open create modal ──
  const openCreate = () => {
    setModalMode("create");
    setEditId(null);
    setForm({ ...emptyForm });
    setModalOpen(true);
  };

  // ── Open edit modal ──
  const openEdit = (payment: Payment) => {
    setModalMode("edit");
    setEditId(payment.id);
    setForm({
      order_id: payment.order_id,
      amount: String(payment.amount),
      currency: payment.currency,
      method: payment.method,
      reference: payment.reference,
      status: payment.status,
    });
    setModalOpen(true);
  };

  // ── Submit create / edit ──
  const handleFormSubmit = async () => {
    if (!form.order_id || !form.amount || !form.reference) {
      toastError("Please fill in all required fields");
      return;
    }

    setFormLoading(true);
    try {
      const payload = {
        order_id: form.order_id,
        amount: parseFloat(form.amount),
        currency: form.currency,
        method: form.method,
        reference: form.reference,
        status: form.status,
      };

      if (modalMode === "create") {
        const { error: insertError } = await supabase
          .from("payments")
          .insert(payload);

        if (insertError) throw insertError;
        success("Payment recorded successfully");
      } else {
        // Edit mode
        const { error: updateError } = await supabase
          .from("payments")
          .update(payload)
          .eq("id", editId);

        if (updateError) throw updateError;
        success("Payment updated successfully");
      }

      setModalOpen(false);
      await fetchPayments();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to save payment");
    } finally {
      setFormLoading(false);
    }
  };

  // ── Inline status change ──
  const handleStatusChange = async (paymentId: string, newStatus: string) => {
    try {
      const updateData: Record<string, string | null> = { status: newStatus };
      if (newStatus === "confirmed") {
        const { data: { user } } = await supabase.auth.getUser();
        updateData.verified_by = user?.id ?? null;
        updateData.verified_at = new Date().toISOString();
      }

      const { error: updateError } = await supabase
        .from("payments")
        .update(updateData)
        .eq("id", paymentId);

      if (updateError) throw updateError;

      setPayments((prev) =>
        prev.map((p) =>
          p.id === paymentId
            ? {
                ...p,
                status: newStatus as Payment["status"],
                ...(newStatus === "confirmed"
                  ? { verified_by: updateData.verified_by as string, verified_at: updateData.verified_at as string }
                  : {}),
              }
            : p
        )
      );

      success(`Payment status updated to ${newStatus}`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  // ── Confirm delete ──
  const openDelete = (payment: Payment) => {
    setDeleteTarget(payment);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const { error: deleteError } = await supabase
        .from("payments")
        .delete()
        .eq("id", deleteTarget.id);

      if (deleteError) throw deleteError;

      success("Payment deleted successfully");
      setDeleteOpen(false);
      setDeleteTarget(null);
      await fetchPayments();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to delete payment");
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-sm text-dark-400">Loading payments...</p>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (fetchError) {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-sm text-red-600">{fetchError}</p>
        <button onClick={() => window.location.reload()} className="mt-3 text-sm font-medium text-brand-500 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-900">Payments</h1>
          <p className="text-sm text-dark-400">Review and manage customer payments</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 transition-all shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Record Payment
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-white border border-dark-100/50 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-dark-900">{tabCounts["Pending"] || 0}</p>
              <p className="text-xs text-dark-400">Pending Verification</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-dark-100/50 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-dark-900">
                {formatUSD(
                  payments
                    .filter((p) => p.status === "confirmed")
                    .reduce((sum, p) => sum + p.amount, 0)
                )}
              </p>
              <p className="text-xs text-dark-400">Confirmed Total</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-dark-100/50 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <XCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-dark-900">{tabCounts["Failed"] || 0}</p>
              <p className="text-xs text-dark-400">Failed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-400" />
        <input
          type="text"
          placeholder="Search by reference, order ID, or method..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-full rounded-xl border border-dark-100 bg-white pl-10 pr-4 text-sm text-dark-900 placeholder:text-dark-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
        />
      </div>

      {/* Status tabs */}
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
            {tabCounts[tab] !== undefined && (
              <span className={cn(
                "ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs",
                activeTab === tab ? "bg-brand-500 text-white" : "bg-dark-200/50 text-dark-500"
              )}>
                {tabCounts[tab]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Payments table */}
      <div className="rounded-2xl bg-white border border-dark-100/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-50 bg-dark-50/50">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Reference
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Order
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Method
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Status
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
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <CreditCard className="mx-auto h-10 w-10 text-dark-300" />
                    <p className="mt-2 text-sm font-medium text-dark-400">
                      {search || activeTab !== "All" ? "No payments match your filters" : "No payments yet"}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredPayments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-dark-50/50 transition-colors">
                    <td className="px-6 py-3.5">
                      <span className="text-sm font-medium text-dark-900 font-mono">{payment.reference}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm text-brand-500 font-mono text-xs">{payment.order_id.slice(0, 8)}...</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm font-semibold text-dark-900">{formatUSD(payment.amount)}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm text-dark-600">{methodLabels[payment.method] || payment.method}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <select
                        value={payment.status}
                        onChange={(e) => handleStatusChange(payment.id, e.target.value)}
                        className={cn(
                          "rounded-lg border-0 px-2.5 py-1 text-xs font-medium capitalize focus:outline-none focus:ring-2 focus:ring-brand-500/30 cursor-pointer",
                          statusColors[payment.status] || "bg-dark-50 text-dark-500"
                        )}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm text-dark-400">{formatDate(payment.created_at ?? new Date().toISOString())}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(payment)}
                          className="rounded-lg p-1.5 text-dark-400 hover:bg-dark-50 hover:text-brand-500 transition-all"
                          title="Edit payment"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openDelete(payment)}
                          className="rounded-lg p-1.5 text-dark-400 hover:bg-red-50 hover:text-red-500 transition-all"
                          title="Delete payment"
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

      {/* ── Create / Edit Modal ── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalMode === "create" ? "Record Payment" : "Edit Payment"}
        onConfirm={handleFormSubmit}
        confirmText={modalMode === "create" ? "Record Payment" : "Save Changes"}
        confirmLoading={formLoading}
      >
        <div className="space-y-4">
          <FormInput
            label="Order ID"
            name="order_id"
            value={form.order_id}
            onChange={(v) => setForm((f) => ({ ...f, order_id: v }))}
            placeholder="e.g. ORD-001"
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Amount"
              name="amount"
              type="number"
              value={form.amount}
              onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
              placeholder="0.00"
              required
              min={0}
              step={0.01}
            />
            <FormInput
              label="Currency"
              name="currency"
              value={form.currency}
              onChange={(v) => setForm((f) => ({ ...f, currency: v }))}
              placeholder="USD"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="method" className="block text-sm font-medium text-dark-700">
              Method <span className="text-red-500">*</span>
            </label>
            <select
              id="method"
              name="method"
              value={form.method}
              onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
              className="w-full rounded-xl border border-dark-200 bg-white px-3.5 py-2.5 text-sm text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {methodLabels[m]}
                </option>
              ))}
            </select>
          </div>
          <FormInput
            label="Reference"
            name="reference"
            value={form.reference}
            onChange={(v) => setForm((f) => ({ ...f, reference: v }))}
            placeholder="e.g. TXN-12345"
            required
          />
          <div className="space-y-1.5">
            <label htmlFor="form-status" className="block text-sm font-medium text-dark-700">
              Status
            </label>
            <select
              id="form-status"
              name="form-status"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className="w-full rounded-xl border border-dark-200 bg-white px-3.5 py-2.5 text-sm text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* ── Delete Confirm Dialog ── */}
      <ConfirmDialog
        open={deleteOpen}
        title="Delete Payment"
        message={
          deleteTarget
            ? `Are you sure you want to delete payment ${deleteTarget.reference} for ${formatUSD(deleteTarget.amount)}? This action cannot be undone.`
            : ""
        }
        onCancel={() => {
          setDeleteOpen(false);
          setDeleteTarget(null);
        }}
        onConfirm={handleDelete}
        confirmText="Delete"
        loading={deleteLoading}
        danger
      />
    </div>
  );
}