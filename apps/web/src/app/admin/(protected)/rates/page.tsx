"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { cn, formatDateTime } from "@/lib/utils";
import { Search, Globe, Loader2, Plus, Edit3, Trash2 } from "lucide-react";
import { useToast } from "@/components/admin/Toast";
import Modal from "@/components/admin/Modal";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import FormInput from "@/components/admin/FormInput";

interface ExchangeRate {
  id: string;
  currency_from: string;
  currency_to: string;
  rate: number;
  effective_at: string;
  approved_by: string;
  reason: string;
  created_at: string;
}

const defaultForm = {
  currency_from: "CNY",
  currency_to: "USD",
  rate: 7.0,
  reason: "",
};

export default function RatesPage() {
  const toast = useToast();
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  // Confirm dialog state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchRates();
  }, []);

  const fetchRates = async () => {
    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from("exchange_rates")
        .select("*")
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setRates((data as ExchangeRate[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load exchange rates");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredRates = useMemo(() => {
    if (!search) return rates;
    const q = search.toLowerCase();
    return rates.filter(
      (r) =>
        r.currency_from.toLowerCase().includes(q) ||
        r.currency_to.toLowerCase().includes(q) ||
        (r.approved_by && r.approved_by.toLowerCase().includes(q)) ||
        (r.reason && r.reason.toLowerCase().includes(q))
    );
  }, [rates, search]);

  const openCreate = () => {
    setEditId(null);
    setForm(defaultForm);
    setModalOpen(true);
  };

  const openEdit = (rate: ExchangeRate) => {
    setEditId(rate.id);
    setForm({
      currency_from: rate.currency_from,
      currency_to: rate.currency_to,
      rate: rate.rate,
      reason: rate.reason || "",
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.currency_from || !form.currency_to || !form.rate) {
      toast.error("Please fill in all required fields");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        currency_from: form.currency_from.toUpperCase(),
        currency_to: form.currency_to.toUpperCase(),
        rate: form.rate,
        effective_at: new Date().toISOString(),
        approved_by: "admin",
        reason: form.reason,
      };

      if (editId) {
        const { error: updateError } = await supabase
          .from("exchange_rates")
          .update(payload)
          .eq("id", editId);

        if (updateError) throw updateError;
        toast.success("Exchange rate updated");
      } else {
        const { error: insertError } = await supabase
          .from("exchange_rates")
          .insert(payload);

        if (insertError) throw insertError;
        toast.success("Exchange rate added");
      }

      setModalOpen(false);
      fetchRates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save exchange rate");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const { error: deleteError } = await supabase
        .from("exchange_rates")
        .delete()
        .eq("id", deleteId);

      if (deleteError) throw deleteError;
      toast.success("Exchange rate deleted");
      setDeleteId(null);
      fetchRates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete exchange rate");
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-sm text-dark-400">Loading exchange rates...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-sm text-red-600">{error}</p>
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
          <h1 className="text-2xl font-bold text-dark-900">Exchange Rates</h1>
          <p className="text-sm text-dark-400">Manage currency conversion rates</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-brand-600 transition-all"
        >
          <Plus className="h-4 w-4" />
          Add Rate
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-400" />
        <input
          type="text"
          placeholder="Search by currency or approver..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-full rounded-xl border border-dark-100 bg-white pl-10 pr-4 text-sm text-dark-900 placeholder:text-dark-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
        />
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-sm text-dark-400">
        <div className="flex items-center gap-1.5">
          <Globe className="h-4 w-4" />
          <span>{filteredRates.length} rate{filteredRates.length !== 1 ? "s" : ""}</span>
        </div>
        {search && (
          <button onClick={() => setSearch("")} className="text-brand-500 hover:underline">
            Clear search
          </button>
        )}
      </div>

      {/* Rates table */}
      <div className="rounded-2xl bg-white border border-dark-100/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-50 bg-dark-50/50">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">From</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">To</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Rate</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Effective</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Approved By</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Reason</th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-dark-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-50">
              {filteredRates.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <Globe className="mx-auto h-10 w-10 text-dark-300" />
                    <p className="mt-2 text-sm font-medium text-dark-400">
                      {search ? "No rates match your search" : "No exchange rates yet"}
                    </p>
                    {!search && (
                      <p className="text-xs text-dark-300 mt-1">Click &quot;Add Rate&quot; to create one</p>
                    )}
                  </td>
                </tr>
              ) : (
                filteredRates.map((rate) => (
                  <tr key={rate.id} className="hover:bg-dark-50/50 transition-colors">
                    <td className="px-6 py-3.5">
                      <span className="text-sm font-medium text-dark-900">{rate.currency_from}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm font-medium text-dark-900">{rate.currency_to}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm font-semibold text-brand-500">{rate.rate}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm text-dark-400">{formatDateTime(rate.effective_at)}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm text-dark-600">{rate.approved_by || "-"}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm text-dark-500 max-w-[200px] truncate inline-block">
                        {rate.reason || "-"}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(rate)}
                          className="rounded-lg p-1.5 text-dark-400 hover:bg-dark-50 hover:text-brand-500 transition-all"
                          title="Edit"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteId(rate.id)}
                          className="rounded-lg p-1.5 text-dark-400 hover:bg-red-50 hover:text-red-500 transition-all"
                          title="Delete"
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

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? "Edit Exchange Rate" : "Add Exchange Rate"}
        onConfirm={handleSave}
        confirmText={editId ? "Update" : "Add Rate"}
        confirmLoading={saving}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Currency From"
              name="currency_from"
              value={form.currency_from}
              onChange={(v) => setForm((f) => ({ ...f, currency_from: v }))}
              placeholder="e.g. CNY"
              required
            />
            <FormInput
              label="Currency To"
              name="currency_to"
              value={form.currency_to}
              onChange={(v) => setForm((f) => ({ ...f, currency_to: v }))}
              placeholder="e.g. USD"
              required
            />
          </div>
          <FormInput
            label="Exchange Rate"
            name="rate"
            type="number"
            value={form.rate}
            onChange={(v) => setForm((f) => ({ ...f, rate: parseFloat(v) || 0 }))}
            placeholder="e.g. 7.0"
            step={0.0001}
            min={0.0001}
            required
          />
          <FormInput
            label="Reason (optional)"
            name="reason"
            value={form.reason}
            onChange={(v) => setForm((f) => ({ ...f, reason: v }))}
            placeholder="Why was this rate set?"
            textarea
            rows={2}
          />
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={deleteId !== null}
        title="Delete Exchange Rate"
        message="Are you sure you want to delete this exchange rate? This action cannot be undone."
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDelete}
        loading={deleting}
        confirmText="Delete"
        danger
      />
    </div>
  );
}