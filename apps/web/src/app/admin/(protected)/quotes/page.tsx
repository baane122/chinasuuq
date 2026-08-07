"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { cn, formatCNY, formatUSD, formatDate } from "@/lib/utils";
import { BadgeDollarSign, Search, Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/components/admin/Toast";
import Modal from "@/components/admin/Modal";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import FormInput from "@/components/admin/FormInput";

interface QuoteRow {
  id: string;
  request_id: string;
  total_cny: number;
  total_usd: number;
  exchange_rate: number;
  fees: number;
  freight_estimate: number;
  valid_until: string;
  status: "draft" | "sent" | "approved" | "rejected" | "expired";
  created_at?: string;
}

const QUOTE_STATUSES = ["draft", "sent", "approved", "rejected", "expired"] as const;

const statusColors: Record<string, string> = {
  draft: "bg-dark-100 text-dark-600",
  sent: "bg-blue-50 text-blue-600",
  approved: "bg-green-50 text-green-600",
  rejected: "bg-red-50 text-red-600",
  expired: "bg-amber-50 text-amber-600",
};

const EMPTY_FORM = {
  request_id: "",
  total_cny: "",
  total_usd: "",
  fees: "",
  freight_estimate: "",
  valid_until: "",
};

export default function QuotesPage() {
  const { toast } = useToast();
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [creating, setCreating] = useState(false);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editQuote, setEditQuote] = useState<QuoteRow | null>(null);
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM });
  const [savingEdit, setSavingEdit] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  // Delete
  const [deleteQuote, setDeleteQuote] = useState<QuoteRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchQuotes = async () => {
    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from("quotes")
        .select("*")
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setQuotes((data as QuoteRow[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quotes");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotes();
  }, []);

  const filteredQuotes = quotes.filter((q) => {
    if (search === "") return true;
    return q.request_id.toLowerCase().includes(search.toLowerCase());
  });

  const handleCreate = async () => {
    if (!form.request_id) {
      toast("error", "Request ID is required");
      return;
    }
    try {
      setCreating(true);
      const payload = {
        request_id: form.request_id,
        total_cny: Number(form.total_cny) || 0,
        total_usd: Number(form.total_usd) || 0,
        fees: Number(form.fees) || 0,
        freight_estimate: Number(form.freight_estimate) || 0,
        valid_until: form.valid_until || null,
        exchange_rate: 0,
        status: "draft",
      };
      const { error: insertError } = await supabase.from("quotes").insert(payload);
      if (insertError) throw insertError;
      toast("success", "Quote created successfully");
      setCreateOpen(false);
      setForm({ ...EMPTY_FORM });
      fetchQuotes();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to create quote");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (q: QuoteRow) => {
    setEditQuote(q);
    setEditForm({
      request_id: q.request_id,
      total_cny: String(q.total_cny ?? ""),
      total_usd: String(q.total_usd ?? ""),
      fees: String(q.fees ?? ""),
      freight_estimate: String(q.freight_estimate ?? ""),
      valid_until: q.valid_until ? q.valid_until.slice(0, 10) : "",
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editQuote) return;
    try {
      setSavingEdit(true);
      const payload = {
        request_id: editForm.request_id,
        total_cny: Number(editForm.total_cny) || 0,
        total_usd: Number(editForm.total_usd) || 0,
        fees: Number(editForm.fees) || 0,
        freight_estimate: Number(editForm.freight_estimate) || 0,
        valid_until: editForm.valid_until || null,
      };
      const { error: updateError } = await supabase
        .from("quotes")
        .update(payload)
        .eq("id", editQuote.id);
      if (updateError) throw updateError;
      toast("success", "Quote updated successfully");
      setEditOpen(false);
      fetchQuotes();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to update quote");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleStatusChange = async (quote: QuoteRow, status: QuoteRow["status"]) => {
    if (quote.status === status) return;
    try {
      setUpdatingStatus(quote.id);
      const { error: updateError } = await supabase
        .from("quotes")
        .update({ status })
        .eq("id", quote.id);
      if (updateError) throw updateError;
      toast("success", `Status updated to ${status}`);
      setQuotes((prev) =>
        prev.map((q) => (q.id === quote.id ? { ...q, status } : q))
      );
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteQuote) return;
    try {
      setDeleting(true);
      const { error: deleteError } = await supabase
        .from("quotes")
        .delete()
        .eq("id", deleteQuote.id);
      if (deleteError) throw deleteError;
      toast("success", "Quote deleted");
      setDeleteQuote(null);
      setQuotes((prev) => prev.filter((q) => q.id !== deleteQuote.id));
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to delete quote");
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-sm text-dark-400">Loading quotes...</p>
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
          <h1 className="text-2xl font-bold text-dark-900">Quotes</h1>
          <p className="text-sm text-dark-400">Build and manage customer quotes</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Quote
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-400" />
        <input
          type="text"
          placeholder="Search by request ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-full rounded-xl border border-dark-100 bg-white pl-10 pr-4 text-sm text-dark-900 placeholder:text-dark-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
        />
      </div>

      {/* Quotes table */}
      <div className="rounded-2xl bg-white border border-dark-100/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-50 bg-dark-50/50">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Request ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Total CNY</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Total USD</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Rate</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Fees</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Freight</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Valid Until</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-dark-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-50">
              {filteredQuotes.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
                    <BadgeDollarSign className="mx-auto h-10 w-10 text-dark-300" />
                    <p className="mt-2 text-sm font-medium text-dark-400">
                      {search ? "No quotes match your search" : "No quotes yet"}
                    </p>
                    {!search && (
                      <p className="text-xs text-dark-300 mt-1">Create your first quote to get started</p>
                    )}
                  </td>
                </tr>
              ) : (
                filteredQuotes.map((quote) => (
                  <tr key={quote.id} className="hover:bg-dark-50/50 transition-colors">
                    <td className="px-6 py-3.5">
                      <span className="text-sm font-medium text-brand-500">{quote.request_id}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm text-dark-700">{formatCNY(Number(quote.total_cny) || 0)}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm font-medium text-dark-900">{formatUSD(Number(quote.total_usd) || 0)}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm text-dark-600">{Number(quote.exchange_rate) || "—"}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm text-dark-600">{formatUSD(Number(quote.fees) || 0)}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm text-dark-600">{formatUSD(Number(quote.freight_estimate) || 0)}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm text-dark-400">
                        {quote.valid_until ? formatDate(quote.valid_until) : "—"}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <select
                        value={quote.status}
                        disabled={updatingStatus === quote.id}
                        onChange={(e) => handleStatusChange(quote, e.target.value as QuoteRow["status"])}
                        className={cn(
                          "cursor-pointer rounded-full border-0 px-2.5 py-1 text-xs font-medium capitalize focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50",
                          statusColors[quote.status] || "bg-dark-50 text-dark-500"
                        )}
                      >
                        {QUOTE_STATUSES.map((s) => (
                          <option key={s} value={s} className="bg-white text-dark-900">
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(quote)}
                          className="rounded-lg p-1.5 text-dark-400 hover:bg-dark-50 hover:text-brand-500 transition-all"
                          aria-label="Edit quote"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteQuote(quote)}
                          className="rounded-lg p-1.5 text-dark-400 hover:bg-red-50 hover:text-red-500 transition-all"
                          aria-label="Delete quote"
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

      {/* Create Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Quote"
        onConfirm={handleCreate}
        confirmText="Create Quote"
        confirmLoading={creating}
      >
        <div className="space-y-4">
          <FormInput
            label="Request ID"
            name="request_id"
            value={form.request_id}
            onChange={(v) => setForm((f) => ({ ...f, request_id: v }))}
            placeholder="e.g. RQ-00014"
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Total CNY"
              name="total_cny"
              type="number"
              value={form.total_cny}
              onChange={(v) => setForm((f) => ({ ...f, total_cny: v }))}
              placeholder="0.00"
            />
            <FormInput
              label="Total USD"
              name="total_usd"
              type="number"
              value={form.total_usd}
              onChange={(v) => setForm((f) => ({ ...f, total_usd: v }))}
              placeholder="0.00"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Fees"
              name="fees"
              type="number"
              value={form.fees}
              onChange={(v) => setForm((f) => ({ ...f, fees: v }))}
              placeholder="0.00"
            />
            <FormInput
              label="Freight Estimate"
              name="freight_estimate"
              type="number"
              value={form.freight_estimate}
              onChange={(v) => setForm((f) => ({ ...f, freight_estimate: v }))}
              placeholder="0.00"
            />
          </div>
          <FormInput
            label="Valid Until"
            name="valid_until"
            type="text"
            value={form.valid_until}
            onChange={(v) => setForm((f) => ({ ...f, valid_until: v }))}
            placeholder="YYYY-MM-DD"
          />
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Quote"
        onConfirm={handleEdit}
        confirmText="Save Changes"
        confirmLoading={savingEdit}
      >
        <div className="space-y-4">
          <FormInput
            label="Request ID"
            name="request_id"
            value={editForm.request_id}
            onChange={(v) => setEditForm((f) => ({ ...f, request_id: v }))}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Total CNY"
              name="total_cny"
              type="number"
              value={editForm.total_cny}
              onChange={(v) => setEditForm((f) => ({ ...f, total_cny: v }))}
            />
            <FormInput
              label="Total USD"
              name="total_usd"
              type="number"
              value={editForm.total_usd}
              onChange={(v) => setEditForm((f) => ({ ...f, total_usd: v }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Fees"
              name="fees"
              type="number"
              value={editForm.fees}
              onChange={(v) => setEditForm((f) => ({ ...f, fees: v }))}
            />
            <FormInput
              label="Freight Estimate"
              name="freight_estimate"
              type="number"
              value={editForm.freight_estimate}
              onChange={(v) => setEditForm((f) => ({ ...f, freight_estimate: v }))}
            />
          </div>
          <FormInput
            label="Valid Until"
            name="valid_until"
            type="text"
            value={editForm.valid_until}
            onChange={(v) => setEditForm((f) => ({ ...f, valid_until: v }))}
            placeholder="YYYY-MM-DD"
          />
        </div>
      </Modal>

      {/* Delete Dialog */}
      <ConfirmDialog
        open={!!deleteQuote}
        title="Delete quote"
        message={`Are you sure you want to delete quote ${deleteQuote?.request_id || ""}? This cannot be undone.`}
        confirmText="Delete"
        onCancel={() => setDeleteQuote(null)}
        onConfirm={handleDelete}
        loading={deleting}
        danger
      />
    </div>
  );
}
