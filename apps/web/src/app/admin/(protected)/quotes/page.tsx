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
import { RowCapNotice } from "@/components/admin/RowCapNotice";
import FormInput from "@/components/admin/FormInput";
import { fxRatesUnavailableMessage, normalizeCnyPerUsd, roundCents, usdFromCny, useFx } from "@/lib/fx";

interface QuoteRow {
  id: string;
  /** Nullable: a quote raised from the Sourcing page can carry no request row. */
  request_id: string | null;
  total_cny: number;
  total_usd: number;
  /** CNY per 1 USD that priced this quote: USD = total_cny ÷ exchange_rate. */
  exchange_rate: number;
  fees: number;
  freight_estimate: number;
  valid_until: string | null;
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
  fees: "",
  freight_estimate: "",
  valid_until: "",
};

/** Rounded to 4 places so a stored rate is readable and still exact enough. */
const roundRate = (n: number) => Math.round(n * 10000) / 10000;

/* Legacy rows were inserted with exchange_rate 0, which prices nothing; they
 * render as "—" rather than as a rate of zero. */
const storedRate = (raw: number | string | null | undefined): number | null => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export default function QuotesPage() {
  const { toast } = useToast();
  const fx = useFx();
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

  // Set when a fetch returned a full 1000-row page — the read cap hides older rows.
  const [rowCapHit, setRowCapHit] = useState(false);

  const fetchQuotes = async () => {
    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from("quotes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (fetchError) throw fetchError;
      const rows = (data as QuoteRow[]) || [];
      setQuotes(rows);
      setRowCapHit(rows.length >= 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quotes");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotes();
  }, []);

  /* request_id is nullable — a quote raised from the Sourcing page has none — so
   * every string in this filter is read through text(), never .toLowerCase(). */
  const filteredQuotes = quotes.filter((q) => {
    if (search === "") return true;
    return (q.request_id ?? "").toLowerCase().includes(search.toLowerCase());
  });

  /* The quote screen READS the rate — it does not choose one. Settings →
   * Currency owns the single live CNY→USD pair, so the USD total is always
   * total_cny ÷ that rate and the stored exchange_rate is that same number.
   * The old manual-USD box reverse-engineered a rate from typed totals, which
   * made this page a second rate editor; it also used to re-save the rate on
   * every quote save, which could overwrite the owner's number with a cached
   * default if the table was momentarily unreadable. Both are gone: a rate that
   * did not come from an active DB row (or that fails the plausibility band)
   * blocks the save — nothing is ever priced at a number nobody saw. */
  const liveRate = fx.fromLiveRow ? normalizeCnyPerUsd(fx.cnyPerUsd) : null;
  const saveRate = liveRate === null ? null : roundRate(liveRate);

  const priceFromForm = (cnyText: string) => {
    const totalCny = Number(cnyText) || 0;
    const totalUsd = saveRate === null ? 0 : roundCents(usdFromCny(totalCny, saveRate));
    return { totalCny, totalUsd };
  };

  const blockedByRate = () => {
    toast("error", fxRatesUnavailableMessage);
  };

  const handleCreate = async () => {
    if (!form.request_id) {
      toast("error", "Request ID is required");
      return;
    }
    if (saveRate === null) {
      blockedByRate();
      return;
    }
    try {
      setCreating(true);
      const { totalCny, totalUsd } = priceFromForm(form.total_cny);
      const payload = {
        request_id: form.request_id,
        total_cny: totalCny,
        total_usd: totalUsd,
        fees: Number(form.fees) || 0,
        freight_estimate: Number(form.freight_estimate) || 0,
        valid_until: form.valid_until || null,
        exchange_rate: saveRate,
        status: "draft" as const,
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

  /* Only a draft can be re-priced. Once a quote has been sent or approved, its
   * total is what the customer saw and agreed to, so editing the CNY amount at
   * today's rate would silently change a number somebody already accepted. */
  const openEdit = (q: QuoteRow) => {
    if (q.status !== "draft") {
      toast(
        "error",
        `This quote is ${q.status}, so its total is locked. Duplicate it as a new draft to re-price at today's rate.`
      );
      return;
    }
    setEditQuote(q);
    setEditForm({
      request_id: q.request_id ?? "",
      total_cny: String(q.total_cny ?? ""),
      fees: String(q.fees ?? ""),
      freight_estimate: String(q.freight_estimate ?? ""),
      valid_until: q.valid_until ? q.valid_until.slice(0, 10) : "",
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editQuote) return;
    if (editQuote.status !== "draft") {
      toast("error", "This quote is no longer a draft — its total was already sent to the customer, so it can't be re-priced here.");
      return;
    }
    if (saveRate === null) {
      blockedByRate();
      return;
    }
    try {
      setSavingEdit(true);
      const { totalCny, totalUsd } = priceFromForm(editForm.total_cny);
      const payload = {
        request_id: editForm.request_id,
        total_cny: totalCny,
        total_usd: totalUsd,
        exchange_rate: saveRate,
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
      const { data, error: deleteError } = await supabase
        .from("quotes")
        .delete()
        .eq("id", deleteQuote.id)
        .select("id");
      if (deleteError) throw deleteError;
      // RLS denial returns 204 / 0 rows with NO error.
      if (!data || data.length === 0) {
        toast("error", "Blocked by permissions — nothing was deleted");
        return;
      }
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

  /* Live previews for the two panels: the same priceFromForm the save uses, so
   * what is displayed is exactly what is stored. */
  const createPreview = priceFromForm(form.total_cny);
  const editPreview = priceFromForm(editForm.total_cny);

  const usdBox = (label: string, amount: number) => (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-dark-700">{label}</span>
      <p className="w-full rounded-xl border border-dark-200 bg-dark-50 px-3.5 py-2.5 text-sm text-dark-900 tabular-nums">
        {saveRate === null ? "—" : formatUSD(amount)}
      </p>
    </div>
  );

  const rateHint = (
    <>
      {saveRate === null ? (
        <span className="text-warning">
          No live CNY→USD rate could be read. Open Settings → Currency and confirm the rate before saving —
          an unpriced quote is never written.
        </span>
      ) : (
        <>
          USD = CNY ÷ {saveRate} (1 CNY = ${(1 / saveRate).toFixed(4)}), the live rate from Settings →
          Currency. The quote only reads it, never edits it, and it is saved on the row as{" "}
          <span className="font-mono">exchange_rate</span>, so a later rate change cannot rewrite what the
          customer was quoted.
        </>
      )}
    </>
  );

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

      {rowCapHit && <RowCapNotice noun="quotes" />}

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
                          {quote.request_id ?? "—"}
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
                        {(() => {
                          const rate = storedRate(quote.exchange_rate);
                          return rate === null ? (
                            <span
                              className="inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning"
                              title="This quote was saved before the rate was recorded, so its USD total cannot be re-derived. Re-save it from the edit panel to pin today's rate."
                            >
                              rate not recorded
                            </span>
                          ) : (
                            <span
                              className="text-dark-500 tabular-nums"
                              title={`${rate} CNY per 1 USD — USD = CNY ÷ ${rate}`}
                            >
                              {rate} · 1 CNY = ${(1 / rate).toFixed(4)}
                            </span>
                          );
                        })()}
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
            {usdBox("Total USD", createPreview.totalUsd)}
          </div>
          <p className="-mt-2 text-[11px] text-dark-900/45 tabular-nums">{rateHint}</p>
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
            {usdBox("Total USD", editPreview.totalUsd)}
          </div>
          <p className="-mt-2 text-[11px] text-dark-900/45 tabular-nums">{rateHint}</p>
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
