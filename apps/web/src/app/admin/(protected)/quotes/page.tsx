"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { cn, formatCNY, formatUSD, formatDate } from "@/lib/utils";
import { BadgeDollarSign, Loader2, Plus, Pencil, Trash2, Send } from "lucide-react";
import {
  PageHeader,
  PageGrid,
  StatCard,
  SearchInput,
  TableShell,
  SidePanel,
  EMPTY_IMAGES,
} from "@/components/admin/ui";
import { useToast } from "@/components/admin/Toast";
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

/* Aligned with the shared StatusBadge palette */
const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-50 text-blue-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-rose-50 text-rose-700",
  expired: "bg-gray-100 text-gray-500",
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

  // Create panel
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [creating, setCreating] = useState(false);

  // Edit panel
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

  const totalQuotes = quotes.length;
  const sentCount = quotes.filter((q) => q.status === "sent").length;

  return (
    <div>
      <PageHeader
        title="Quotes"
        subtitle="Price quotes issued to customers"
        actions={
          <button onClick={() => setCreateOpen(true)} className="admin-btn-primary">
            <Plus className="h-4 w-4" />
            New Quote
          </button>
        }
      />

      {!isLoading && !error && (
        <PageGrid>
          <StatCard
            label="Total Quotes"
            value={totalQuotes}
            icon={BadgeDollarSign}
            tone="brand"
            delay={0}
          />
          <StatCard label="Sent" value={sentCount} icon={Send} tone="info" delay={1} />
        </PageGrid>
      )}

      <div className="space-y-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by request ID…"
          className="w-full sm:max-w-sm"
        />

        <TableShell
          isLoading={isLoading}
          error={error}
          hasData={filteredQuotes.length > 0}
          filtered={search !== ""}
          emptyImage={EMPTY_IMAGES.generic}
          emptyTitle="No quotes yet"
          emptySubtitle="Create a quote from a sourcing request to get started."
          emptyAction={
            <button onClick={() => setCreateOpen(true)} className="admin-btn-primary">
              <Plus className="h-4 w-4" />
              New Quote
            </button>
          }
          errorRetry={fetchQuotes}
        >
          <div className="overflow-hidden rounded-2xl border border-dark-900/[0.06] bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="admin-table w-full">
                <thead>
                  <tr>
                    <th>Request ID</th>
                    <th>Total CNY</th>
                    <th>Total USD</th>
                    <th>Rate</th>
                    <th>Fees</th>
                    <th>Freight</th>
                    <th>Valid Until</th>
                    <th>Status</th>
                    <th className="text-right!">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQuotes.map((quote) => (
                    <tr key={quote.id}>
                      <td>
                        <span className="font-mono text-[13px] font-semibold text-brand-600">
                          {quote.request_id}
                        </span>
                      </td>
                      <td>
                        <span className="text-dark-600">{formatCNY(Number(quote.total_cny) || 0)}</span>
                      </td>
                      <td>
                        <span className="font-semibold text-dark-900">
                          {formatUSD(Number(quote.total_usd) || 0)}
                        </span>
                      </td>
                      <td>
                        <span className="text-dark-500">{Number(quote.exchange_rate) || "—"}</span>
                      </td>
                      <td>
                        <span className="text-dark-600">{formatUSD(Number(quote.fees) || 0)}</span>
                      </td>
                      <td>
                        <span className="text-dark-600">
                          {formatUSD(Number(quote.freight_estimate) || 0)}
                        </span>
                      </td>
                      <td>
                        <span className="text-dark-900/45">
                          {quote.valid_until ? formatDate(quote.valid_until) : "—"}
                        </span>
                      </td>
                      <td>
                        <select
                          value={quote.status}
                          disabled={updatingStatus === quote.id}
                          onChange={(e) =>
                            handleStatusChange(quote, e.target.value as QuoteRow["status"])
                          }
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
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(quote)}
                            className="rounded-lg p-1.5 text-dark-900/40 transition-all hover:bg-dark-900/5 hover:text-brand-600"
                            aria-label="Edit quote"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteQuote(quote)}
                            className="rounded-lg p-1.5 text-dark-900/40 transition-all hover:bg-error/10 hover:text-error"
                            aria-label="Delete quote"
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
            {filteredQuotes.length > 0 && (
              <div className="border-t border-dark-900/[0.06] px-4 py-2.5 text-xs text-dark-900/40">
                Showing {filteredQuotes.length} of {quotes.length} quotes
              </div>
            )}
          </div>
        </TableShell>
      </div>

      {/* Create panel */}
      <SidePanel
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Quote"
        subtitle="Create a draft quote for a sourcing request"
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setCreateOpen(false)} className="admin-btn-ghost">
              Cancel
            </button>
            <button type="button" onClick={handleCreate} disabled={creating} className="admin-btn-primary">
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Quote
            </button>
          </div>
        }
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
      </SidePanel>

      {/* Edit panel */}
      <SidePanel
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Quote"
        subtitle={editQuote ? `Request ${editQuote.request_id}` : undefined}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setEditOpen(false)} className="admin-btn-ghost">
              Cancel
            </button>
            <button type="button" onClick={handleEdit} disabled={savingEdit} className="admin-btn-primary">
              {savingEdit && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        }
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
      </SidePanel>

      {/* Delete dialog */}
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
