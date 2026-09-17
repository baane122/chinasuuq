"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { formatDateTime } from "@/lib/utils";
import { Globe, Loader2, Plus, Edit3, Trash2, ArrowLeftRight, Clock, Info } from "lucide-react";
import { useToast } from "@/components/admin/Toast";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import FormInput from "@/components/admin/FormInput";
import {
  PageHeader,
  PageGrid,
  StatCard,
  SectionCard,
  SearchInput,
  TableShell,
  SidePanel,
  EMPTY_IMAGES,
} from "@/components/admin/ui";

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

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
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
    setPanelOpen(true);
  };

  const openEdit = (rate: ExchangeRate) => {
    setEditId(rate.id);
    setForm({
      currency_from: rate.currency_from,
      currency_to: rate.currency_to,
      rate: rate.rate,
      reason: rate.reason || "",
    });
    setPanelOpen(true);
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

      setPanelOpen(false);
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

  // Derived stats (client-side only, from the loaded rows)
  const currentCnyUsd = useMemo(
    () => rates.find((r) => r.currency_from === "CNY" && r.currency_to === "USD")?.rate,
    [rates]
  );
  const pairCount = useMemo(
    () => new Set(rates.map((r) => `${r.currency_from}→${r.currency_to}`)).size,
    [rates]
  );
  const lastUpdated = useMemo(
    () => (rates.length > 0 ? formatDateTime(rates[0].created_at) : "—"),
    [rates]
  );

  return (
    <div>
      <PageHeader
        title="Exchange Rates"
        subtitle="CNY → USD → SOS rates used across the app"
        actions={
          <button onClick={openCreate} className="admin-btn-primary">
            <Plus className="h-4 w-4" /> Add Rate
          </button>
        }
      />

      {/* Stats */}
      <PageGrid>
        <StatCard
          label="Current CNY → USD"
          value={currentCnyUsd !== undefined ? currentCnyUsd : "—"}
          icon={ArrowLeftRight}
          tone="brand"
          delay={0}
        />
        <StatCard label="Rates Recorded" value={rates.length} icon={Globe} tone="info" delay={1} />
        <StatCard label="Currency Pairs" value={pairCount} icon={ArrowLeftRight} tone="violet" delay={2} />
        <StatCard label="Last Updated" value={lastUpdated} icon={Clock} tone="success" delay={3} />
      </PageGrid>

      {/* Search */}
      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by currency or approver…"
          className="max-w-md"
        />
      </div>

      {/* Rates table */}
      <TableShell
        isLoading={isLoading}
        error={error}
        errorRetry={fetchRates}
        hasData={filteredRates.length > 0}
        filtered={!!search}
        emptyImage={EMPTY_IMAGES.generic}
        emptyTitle="No rates recorded"
        emptySubtitle="Add a rate to start converting prices across the app."
        emptyAction={
          <button onClick={openCreate} className="admin-btn-primary">
            <Plus className="h-4 w-4" /> Add Rate
          </button>
        }
      >
        <SectionCard bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="admin-table w-full">
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Rate</th>
                  <th>Effective</th>
                  <th>Approved By</th>
                  <th>Reason</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRates.map((rate) => (
                  <tr key={rate.id}>
                    <td>
                      <span className="text-sm font-semibold text-dark-900">{rate.currency_from}</span>
                    </td>
                    <td>
                      <span className="text-sm font-semibold text-dark-900">{rate.currency_to}</span>
                    </td>
                    <td>
                      <span className="text-sm font-bold text-brand-500">{rate.rate}</span>
                    </td>
                    <td>
                      <span className="text-sm text-dark-900/50">{formatDateTime(rate.effective_at)}</span>
                    </td>
                    <td>
                      <span className="text-sm text-dark-700">{rate.approved_by || "-"}</span>
                    </td>
                    <td>
                      <span className="inline-block max-w-[200px] truncate text-sm text-dark-900/55">
                        {rate.reason || "-"}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(rate)}
                          className="rounded-lg p-1.5 text-dark-900/40 transition-colors hover:bg-dark-50 hover:text-brand-500"
                          title="Edit"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteId(rate.id)}
                          className="rounded-lg p-1.5 text-dark-900/40 transition-colors hover:bg-rose-50 hover:text-rose-500"
                          title="Delete"
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
          <div className="border-t border-dark-900/[0.06] px-5 py-2.5 text-xs text-dark-900/45">
            Showing {filteredRates.length} of {rates.length} rates
          </div>
        </SectionCard>
      </TableShell>

      {/* How rates are used */}
      <SectionCard className="mt-6" bodyClassName="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Info className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-dark-900">How rates are used</p>
            <p className="mt-0.5 text-sm text-dark-900/50">
              Purchasing costs are recorded in CNY and converted to USD with the newest effective
              CNY → USD rate. Customer checkout then shows prices in SOS using the app-wide
              CNY → USD → SOS conversion chain, so keeping these rates current keeps quotes accurate.
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Add / Edit panel */}
      <SidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={editId ? "Edit Exchange Rate" : "Add Exchange Rate"}
        subtitle="The new rate becomes effective immediately"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setPanelOpen(false)} className="admin-btn-ghost">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="admin-btn-primary">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editId ? "Update" : "Add Rate"}
            </button>
          </div>
        }
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
      </SidePanel>

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
