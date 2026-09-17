"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { cn, formatUSD, formatDate, formatDateTime } from "@/lib/utils";
import {
  Loader2, CheckCircle2, XCircle, Clock, Plus, Pencil, Trash2,
  TrendingUp, Download, Check, RefreshCw
} from "lucide-react";
import type { Payment } from "@/types";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { useToast } from "@/components/admin/Toast";
import FormInput from "@/components/admin/FormInput";
import { PageHeader, StatCard, PageGrid, SectionCard, SearchInput, FilterChips, TableShell, EMPTY_IMAGES, SidePanel } from "@/components/admin/ui";
import { motion, AnimatePresence } from "framer-motion";

/* ── Constants ─────────────────────────────────────────────────── */

const statusTabs = ["All", "Pending", "Confirmed", "Failed", "Refunded"] as const;

const statusColors: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  confirmed: "bg-green-50 text-green-700 border-green-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  refunded: "bg-purple-50 text-purple-700 border-purple-200",
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

const methodColors: Record<string, string> = {
  zaad: "bg-blue-50 text-blue-700 border-blue-200",
  edahab: "bg-emerald-50 text-emerald-700 border-emerald-200",
  premier: "bg-violet-50 text-violet-700 border-violet-200",
  evc_plus: "bg-orange-50 text-orange-700 border-orange-200",
  sahal: "bg-cyan-50 text-cyan-700 border-cyan-200",
  bank_transfer: "bg-sky-50 text-sky-700 border-sky-200",
  manual: "bg-gray-50 text-gray-700 border-gray-200",
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

/* ── Component ─────────────────────────────────────────────────── */

export default function PaymentsPage() {
  const { success, error: toastError } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<string>("All");

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

  // Reconciliation
  const [reconcileMode, setReconcileMode] = useState(false);
  const [reconcileSelected, setReconcileSelected] = useState<Set<string>>(new Set());

  /* ── Fetch ──────────────────────────────────────────────────── */

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

  useEffect(() => { fetchPayments(); }, []);

  /* ── Filter ─────────────────────────────────────────────────── */

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

  /* ── KPIs ──────────────────────────────────────────────────── */

  const kpis = useMemo(() => {
    const total = payments.length;
    const pending = payments.filter((p) => p.status === "pending");
    const confirmed = payments.filter((p) => p.status === "confirmed");
    const failed = payments.filter((p) => p.status === "failed");
    const refunded = payments.filter((p) => p.status === "refunded");

    const totalConfirmed = confirmed.reduce((s, p) => s + p.amount, 0);
    const totalPending = pending.reduce((s, p) => s + p.amount, 0);
    const totalFailed = failed.reduce((s, p) => s + p.amount, 0);
    const totalRefunded = refunded.reduce((s, p) => s + p.amount, 0);

    // By method
    const byMethod: Record<string, { count: number; total: number }> = {};
    confirmed.forEach((p) => {
      if (!byMethod[p.method]) byMethod[p.method] = { count: 0, total: 0 };
      byMethod[p.method].count++;
      byMethod[p.method].total += p.amount;
    });

    // Today
    const today = new Date().toISOString().slice(0, 10);
    const todayPayments = confirmed.filter((p) => (p.created_at || "").slice(0, 10) === today);
    const todayTotal = todayPayments.reduce((s, p) => s + p.amount, 0);

    return {
      total, pending: pending.length, confirmed: confirmed.length,
      failed: failed.length, refunded: refunded.length,
      totalConfirmed, totalPending, totalFailed, totalRefunded,
      byMethod, todayTotal, todayCount: todayPayments.length,
    };
  }, [payments]);

  /* ── Tab counts ─────────────────────────────────────────────── */

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { All: payments.length };
    payments.forEach((p) => {
      const key = p.status.charAt(0).toUpperCase() + p.status.slice(1);
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [payments]);

  /* ── Form handlers ──────────────────────────────────────────── */

  const openCreate = () => {
    setModalMode("create");
    setEditId(null);
    setForm({ ...emptyForm });
    setModalOpen(true);
  };

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
        const { error: insertError } = await supabase.from("payments").insert(payload);
        if (insertError) throw insertError;
        success("Payment recorded successfully");
      } else {
        const { error: updateError } = await supabase
          .from("payments").update(payload).eq("id", editId);
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

  /* ── Status change ─────────────────────────────────────────── */

  const handleStatusChange = async (paymentId: string, newStatus: string) => {
    try {
      const updateData: Record<string, string | null> = { status: newStatus };
      if (newStatus === "confirmed") {
        const { data: { user } } = await supabase.auth.getUser();
        updateData.verified_by = user?.id ?? null;
        updateData.verified_at = new Date().toISOString();
      }
      const { error: updateError } = await supabase
        .from("payments").update(updateData).eq("id", paymentId);
      if (updateError) throw updateError;

      setPayments((prev) =>
        prev.map((p) =>
          p.id === paymentId
            ? { ...p, status: newStatus as Payment["status"], ...(newStatus === "confirmed" ? { verified_by: updateData.verified_by as string, verified_at: updateData.verified_at as string } : {}) }
            : p
        )
      );
      success(`Payment status updated to ${newStatus}`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  /* ── Bulk reconcile ────────────────────────────────────────── */

  const handleBulkConfirm = async () => {
    const ids = Array.from(reconcileSelected);
    for (const id of ids) {
      await handleStatusChange(id, "confirmed");
    }
    success(`${ids.length} payment(s) confirmed`);
    setReconcileSelected(new Set());
    setReconcileMode(false);
  };

  /* ── Delete ─────────────────────────────────────────────────── */

  const openDelete = (payment: Payment) => {
    setDeleteTarget(payment);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const { error: deleteError } = await supabase
        .from("payments").delete().eq("id", deleteTarget.id);
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

  /* ── Export ─────────────────────────────────────────────────── */

  const handleExport = () => {
    const headers = ["Reference", "Order ID", "Amount", "Currency", "Method", "Status", "Verified At", "Date"];
    const rows = filteredPayments.map((p) => [
      p.reference, p.order_id, String(p.amount), p.currency,
      methodLabels[p.method] || p.method, p.status,
      p.verified_at ? formatDateTime(p.verified_at) : "",
      p.created_at ? formatDate(p.created_at) : "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    success(`Exported ${filteredPayments.length} payments`);
  };

  /* ── Render ─────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <PageHeader
        title="Payments"
        subtitle="Customer payments — Zaad, Edahab, EVC Plus, bank transfer & crypto"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={handleExport} className="admin-btn-outline">
              <Download className="h-4 w-4" />
              Export
            </button>
            <button onClick={openCreate} className="admin-btn-primary">
              <Plus className="h-4 w-4" />
              Record Payment
            </button>
          </div>
        }
      />

      {/* ── KPI Stats ── */}
      <PageGrid>
        <StatCard label="Pending Verification" value={formatUSD(kpis.totalPending)} deltaLabel={`${kpis.pending} payments awaiting review`} icon={Clock} tone="warning" delay={0} />
        <StatCard label="Confirmed Revenue" value={formatUSD(kpis.totalConfirmed)} deltaLabel={`${kpis.confirmed} payments verified`} icon={CheckCircle2} tone="success" delay={1} />
        <StatCard label="Failed" value={kpis.failed} deltaLabel={formatUSD(kpis.totalFailed)} icon={XCircle} tone="error" delay={2} />
        <StatCard label="Today's Revenue" value={formatUSD(kpis.todayTotal)} deltaLabel={`${kpis.todayCount} payments today`} icon={TrendingUp} tone="brand" delay={3} />
      </PageGrid>

      {/* ── Revenue by Method ── */}
      <SectionCard title="Confirmed Revenue by Method" subtitle="Where your verified revenue comes from">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {METHODS.map((m) => {
            const data = kpis.byMethod[m] || { count: 0, total: 0 };
            return (
              <div key={m} className="rounded-lg bg-warm-100 px-3 py-2 text-center">
                <p className="text-[10px] font-semibold text-dark-900/40 uppercase">{methodLabels[m]}</p>
                <p className="text-sm font-bold text-dark-900 mt-1">{formatUSD(data.total)}</p>
                <p className="text-[10px] text-dark-900/30">{data.count} txns</p>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* ── Search + Controls ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by reference, order ID, or method..."
          className="max-w-md flex-1"
        />
        <div className="flex items-center gap-2">
          {reconcileMode ? (
            <>
              <span className="text-xs font-semibold text-brand-600">{reconcileSelected.size} selected</span>
              <button
                onClick={handleBulkConfirm}
                disabled={reconcileSelected.size === 0}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                <Check className="h-3 w-3" />
                Confirm Selected
              </button>
              <button
                onClick={() => { setReconcileMode(false); setReconcileSelected(new Set()); }}
                className="admin-btn-ghost"
              >
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setReconcileMode(true)} className="admin-btn-outline">
              <RefreshCw className="h-3 w-3" />
              Reconcile
            </button>
          )}
        </div>
      </div>

      {/* ── Status chips ── */}
      <FilterChips<string>
        options={statusTabs.map((tab) => ({ value: tab, label: tab, count: tabCounts[tab] }))}
        value={activeTab}
        onChange={setActiveTab}
      />

      {/* ── Payments table ── */}
      <TableShell
        isLoading={isLoading}
        error={fetchError}
        errorRetry={fetchPayments}
        hasData={filteredPayments.length > 0}
        filtered={!!search || activeTab !== "All"}
        emptyImage={EMPTY_IMAGES.payments}
        emptyTitle="No payments recorded"
        emptySubtitle="Payments appear here as customers pay for their orders."
      >
      <div className="rounded-2xl bg-white border border-dark-900/[0.06] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="admin-table w-full">
            <thead>
              <tr>
                {reconcileMode && <th className="w-10" />}
                <th>Reference</th>
                <th>Order</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
                <th className="hidden lg:table-cell">Verified</th>
                <th>Date</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-900/[0.04]">
              {filteredPayments.map((payment) => (
                  <tr
                    key={payment.id}
                    className={cn(
                      "hover:bg-dark-50/50 transition-colors",
                      reconcileSelected.has(payment.id) && "bg-brand-50/50"
                    )}
                  >
                    {reconcileMode && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            setReconcileSelected((prev) => {
                              const n = new Set(prev);
                              if (n.has(payment.id)) n.delete(payment.id); else n.add(payment.id);
                              return n;
                            });
                          }}
                        >
                          {reconcileSelected.has(payment.id) ? (
                            <CheckCircle2 className="h-4 w-4 text-brand-500" />
                          ) : (
                            <div className="h-4 w-4 rounded border border-dark-300" />
                          )}
                        </button>
                      </td>
                    )}
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
                      <span className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                        methodColors[payment.method] || "bg-dark-50 text-dark-500 border-dark-200"
                      )}>
                        {methodLabels[payment.method] || payment.method}
                      </span>
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
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-3.5 hidden lg:table-cell">
                      {payment.verified_at ? (
                        <span className="text-xs text-emerald-600">{formatDate(payment.verified_at)}</span>
                      ) : (
                        <span className="text-xs text-dark-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm text-dark-400">
                        {formatDate(payment.created_at ?? new Date().toISOString())}
                      </span>
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
                ))}
            </tbody>
          </table>
        </div>
        {filteredPayments.length > 0 && (
          <div className="border-t border-dark-900/[0.04] px-4 py-2.5 flex items-center justify-between text-xs text-dark-400">
            <span>Showing {filteredPayments.length} of {payments.length} payments</span>
            <span className="font-semibold text-emerald-600">
              Total: {formatUSD(filteredPayments.reduce((s, p) => s + (p.status === "confirmed" ? p.amount : 0), 0))}
            </span>
          </div>
        )}
      </div>
      </TableShell>

      {/* ── Create / Edit Panel ── */}
      <SidePanel
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalMode === "create" ? "Record Payment" : "Edit Payment"}
        subtitle="Amount, method and verification details"
        width="max-w-xl"
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className="admin-btn-ghost">Cancel</button>
            <button onClick={handleFormSubmit} disabled={formLoading} className="admin-btn-primary">
              {formLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {modalMode === "create" ? "Record Payment" : "Save Changes"}
            </button>
          </>
        }
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
            <label className="block text-sm font-medium text-dark-700">Method <span className="text-red-500">*</span></label>
            <select
              value={form.method}
              onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
              className="w-full rounded-xl border border-dark-200 bg-white px-3.5 py-2.5 text-sm text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>{methodLabels[m]}</option>
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
            <label className="block text-sm font-medium text-dark-700">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className="w-full rounded-xl border border-dark-200 bg-white px-3.5 py-2.5 text-sm text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
      </SidePanel>

      {/* ── Delete Confirm Dialog ── */}
      <ConfirmDialog
        open={deleteOpen}
        title="Delete Payment"
        message={
          deleteTarget
            ? `Are you sure you want to delete payment ${deleteTarget.reference} for ${formatUSD(deleteTarget.amount)}? This action cannot be undone.`
            : ""
        }
        onCancel={() => { setDeleteOpen(false); setDeleteTarget(null); }}
        onConfirm={handleDelete}
        confirmText="Delete"
        loading={deleteLoading}
        danger
      />
    </div>
  );
}
