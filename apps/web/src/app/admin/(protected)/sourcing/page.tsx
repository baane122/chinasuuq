"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { cn, formatDate, formatUSD, formatCNY } from "@/lib/utils";
import {
  ClipboardList, Loader2, Plus, Edit3, Trash2, ExternalLink,
  Download, BarChart3, ArrowUpRight, Clock, CheckCircle2,
  Smartphone, ShoppingCart, MapPin, Check, X
} from "lucide-react";
import { useToast } from "@/components/admin/Toast";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import FormInput from "@/components/admin/FormInput";
import { PageHeader, StatCard, PageGrid, SearchInput, FilterChips, TableShell, EMPTY_IMAGES, SidePanel } from "@/components/admin/ui";
import { motion, AnimatePresence } from "framer-motion";

/* ── Types ─────────────────────────────────────────────────────── */

interface SourcingRequest {
  id: string;
  customer_id: string;
  marketplace: string;
  product_url?: string;
  product_description: string;
  quantity: number;
  destination_city: string;
  status: "pending" | "assigned" | "quoted" | "approved" | "purchased";
  agent_id?: string;
  created_at: string;
}

interface QuoteItem {
  id: string;
  sourcing_request_id: string;
  product_name: string;
  supplier: string;
  price_cny: number;
  price_usd: number;
  moq: number;
  source_url?: string;
  selected: boolean;
}

/* ── Constants ─────────────────────────────────────────────────── */

const statusColors: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  assigned: "bg-blue-50 text-blue-700 border-blue-200",
  quoted: "bg-purple-50 text-purple-700 border-purple-200",
  approved: "bg-green-50 text-green-700 border-green-200",
  purchased: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

const statusLabels: Record<string, string> = {
  pending: "Pending",
  assigned: "Assigned",
  quoted: "Quoted",
  approved: "Approved",
  purchased: "Purchased",
};

const statusWorkflow = ["pending", "assigned", "quoted", "approved", "purchased"];

const defaultForm = {
  customer_id: "",
  marketplace: "",
  product_description: "",
  product_url: "",
  quantity: 1,
  destination_city: "",
};

const defaultQuote: QuoteItem = {
  id: "",
  sourcing_request_id: "",
  product_name: "",
  supplier: "",
  price_cny: 0,
  price_usd: 0,
  moq: 1,
  source_url: "",
  selected: false,
};

/* ── Component ─────────────────────────────────────────────────── */

export default function SourcingPage() {
  const toast = useToast();
  const [requests, setRequests] = useState<SourcingRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Status update loading
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  // Detail / price comparison
  const [selected, setSelected] = useState<SourcingRequest | null>(null);
  const [quotes, setQuotes] = useState<Record<string, QuoteItem[]>>({});
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [quoteForm, setQuoteForm] = useState(defaultQuote);

  /* ── Fetch ──────────────────────────────────────────────────── */

  useEffect(() => { fetchRequests(); }, []);

  const fetchRequests = async () => {
    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from("sourcing_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (fetchError) throw fetchError;
      setRequests((data as SourcingRequest[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sourcing requests");
    } finally {
      setIsLoading(false);
    }
  };

  /* ── Filter ─────────────────────────────────────────────────── */

  const filteredRequests = useMemo(() => {
    let result = requests;

    if (statusFilter !== "All") {
      result = result.filter((r) => r.status === statusFilter.toLowerCase());
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.customer_id.toLowerCase().includes(q) ||
          r.marketplace.toLowerCase().includes(q) ||
          r.destination_city.toLowerCase().includes(q) ||
          r.product_description?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [requests, search, statusFilter]);

  /* ── KPIs ──────────────────────────────────────────────────── */

  const kpis = useMemo(() => {
    const total = requests.length;
    const pending = requests.filter((r) => r.status === "pending").length;
    const quoted = requests.filter((r) => r.status === "quoted").length;
    const approved = requests.filter((r) => r.status === "approved").length;
    const purchased = requests.filter((r) => r.status === "purchased").length;
    const uniqueMarketplaces = new Set(requests.map((r) => r.marketplace)).size;
    const uniqueCities = new Set(requests.map((r) => r.destination_city)).size;

    return { total, pending, quoted, approved, purchased, uniqueMarketplaces, uniqueCities };
  }, [requests]);

  /* ── Status counts for tabs ────────────────────────────────── */

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { All: requests.length };
    requests.forEach((r) => {
      const key = statusLabels[r.status] || r.status;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [requests]);

  /* ── Form handlers ──────────────────────────────────────────── */

  const openCreate = () => {
    setEditId(null);
    setForm(defaultForm);
    setModalOpen(true);
  };

  const openEdit = (req: SourcingRequest) => {
    setEditId(req.id);
    setForm({
      customer_id: req.customer_id,
      marketplace: req.marketplace,
      product_description: req.product_description,
      product_url: req.product_url || "",
      quantity: req.quantity,
      destination_city: req.destination_city,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.customer_id || !form.marketplace || !form.product_description || !form.destination_city) {
      toast.error("Please fill in all required fields");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        customer_id: form.customer_id,
        marketplace: form.marketplace,
        product_description: form.product_description,
        product_url: form.product_url || null,
        quantity: form.quantity,
        destination_city: form.destination_city,
        status: "pending" as const,
      };

      if (editId) {
        const { error: updateError } = await supabase
          .from("sourcing_requests").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editId);
        if (updateError) throw updateError;
        toast.success("Sourcing request updated");
      } else {
        const { error: insertError } = await supabase
          .from("sourcing_requests").insert({ ...payload, created_at: new Date().toISOString() });
        if (insertError) throw insertError;
        toast.success("Sourcing request created");
      }
      setModalOpen(false);
      fetchRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save sourcing request");
    } finally {
      setSaving(false);
    }
  };

  /* ── Delete ─────────────────────────────────────────────────── */

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const { error: deleteError } = await supabase
        .from("sourcing_requests").delete().eq("id", deleteId);
      if (deleteError) throw deleteError;
      toast.success("Sourcing request deleted");
      setDeleteId(null);
      setSelected(null);
      fetchRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete sourcing request");
    } finally {
      setDeleting(false);
    }
  };

  /* ── Status change ─────────────────────────────────────────── */

  const handleStatusChange = async (id: string, newStatus: string) => {
    setUpdatingStatus(id);
    try {
      const { error: updateError } = await supabase
        .from("sourcing_requests")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (updateError) throw updateError;
      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: newStatus as SourcingRequest["status"] } : r))
      );
      if (selected?.id === id) setSelected({ ...selected, status: newStatus as SourcingRequest["status"] });
      toast.success(`Status updated to ${statusLabels[newStatus] || newStatus}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setUpdatingStatus(null);
    }
  };

  /* ── Price comparison helpers ───────────────────────────────── */

  const getQuotesForRequest = (requestId: string): QuoteItem[] => {
    return quotes[requestId] || [];
  };

  const addQuote = () => {
    if (!selected) return;
    const newQuote: QuoteItem = {
      ...defaultQuote,
      id: `q_${Date.now()}`,
      sourcing_request_id: selected.id,
      selected: false,
    };
    setQuoteForm(newQuote);
    setShowQuoteModal(true);
  };

  const saveQuote = () => {
    if (!selected) return;
    const existing = quotes[selected.id] || [];
    const newQuotes = [...existing, { ...quoteForm, id: `q_${Date.now()}` }];
    setQuotes((prev) => ({ ...prev, [selected.id]: newQuotes }));
    setShowQuoteModal(false);
    toast.success("Quote added for comparison");
  };

  const toggleQuoteSelect = (requestId: string, quoteId: string) => {
    setQuotes((prev) => ({
      ...prev,
      [requestId]: (prev[requestId] || []).map((q) =>
        q.id === quoteId ? { ...q, selected: !q.selected } : q
      ),
    }));
  };

  const truncate = (text: string, max: number) => {
    if (!text) return "-";
    return text.length > max ? text.slice(0, max) + "..." : text;
  };

  /* ── Export ─────────────────────────────────────────────────── */

  const handleExport = () => {
    const headers = ["Customer", "Marketplace", "Product", "Qty", "Destination", "Status", "Date"];
    const rows = filteredRequests.map((r) => [
      r.customer_id, r.marketplace, r.product_description,
      String(r.quantity), r.destination_city, r.status,
      r.created_at ? formatDate(r.created_at) : "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sourcing-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredRequests.length} requests`);
  };

  /* ── Render ─────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <PageHeader
        title="Sourcing"
        subtitle="Customer requests — quote, approve and purchase from suppliers"
        actions={
          <div className="flex items-center gap-2">
            <a
              href="https://wa.me/8615277074143?text=Hello%20ChinaSuuq%2C%20I%20have%20a%20sourcing%20request"
              target="_blank"
              rel="noopener noreferrer"
              className="admin-btn-outline"
            >
              <Smartphone className="h-4 w-4" />
              Mobile Capture
            </a>
            <button onClick={openCreate} className="admin-btn-primary">
              <Plus className="h-4 w-4" />
              New Request
            </button>
          </div>
        }
      />

      {/* ── KPIs ── */}
      <PageGrid className="grid-cols-2 sm:grid-cols-4">
        <StatCard label="Total Requests" value={kpis.total} icon={ClipboardList} tone="brand" delay={0} />
        <StatCard label="Pending" value={kpis.pending} icon={Clock} tone="warning" delay={1} />
        <StatCard label="Quoted" value={kpis.quoted} icon={BarChart3} tone="violet" delay={2} />
        <StatCard label="Purchased" value={kpis.purchased} icon={CheckCircle2} tone="success" delay={3} />
      </PageGrid>

      {/* ── Search + Controls ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by customer, marketplace, or city..."
          className="max-w-md flex-1"
        />
        <div className="flex items-center gap-3">
          <button onClick={handleExport} className="admin-btn-outline">
            <Download className="h-3 w-3" /> Export
          </button>
          <span className="text-xs text-dark-400">
            {filteredRequests.length} request{filteredRequests.length !== 1 ? "s" : ""}
          </span>
          {search && (
            <button onClick={() => setSearch("")} className="text-xs text-brand-500 hover:underline">Clear</button>
          )}
        </div>
      </div>

      {/* ── Status chips ── */}
      <FilterChips<string>
        options={["All", ...Object.values(statusLabels)].map((tab) => ({
          value: tab,
          label: tab,
          count: statusCounts[tab],
        }))}
        value={statusFilter}
        onChange={setStatusFilter}
      />

      {/* ── Table ── */}
      <TableShell
        isLoading={isLoading}
        error={error}
        errorRetry={fetchRequests}
        hasData={filteredRequests.length > 0}
        filtered={!!search || statusFilter !== "All"}
        emptyImage={EMPTY_IMAGES.sourcing}
        emptyTitle="No sourcing requests"
        emptySubtitle="New customer sourcing requests will land here."
        emptyAction={
          <button onClick={openCreate} className="admin-btn-primary">Create your first request</button>
        }
      >
      <div className="rounded-2xl bg-white border border-dark-900/[0.06] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="admin-table w-full">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Marketplace</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Destination</th>
                <th>Status</th>
                <th className="hidden lg:table-cell">Date</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-900/[0.04]">
              {filteredRequests.map((req) => (
                  <tr
                    key={req.id}
                    onClick={() => setSelected(req)}
                    className="hover:bg-dark-50/50 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-3.5">
                      <span className="text-sm font-medium text-dark-900">{req.customer_id}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 text-orange-700 px-2.5 py-0.5 text-xs font-medium">
                        {req.marketplace}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <div>
                        <span className="text-sm text-dark-600 max-w-[250px] truncate inline-block" title={req.product_description}>
                          {truncate(req.product_description, 60)}
                        </span>
                        {req.product_url && (
                          <a
                            href={req.product_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="ml-1 inline-flex items-center text-dark-300 hover:text-brand-500"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm font-medium text-dark-900">{req.quantity}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-1 text-sm text-dark-600">
                        <MapPin className="h-3 w-3 text-dark-400" />
                        {req.destination_city}
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <select
                        value={req.status}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleStatusChange(req.id, e.target.value);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        disabled={updatingStatus === req.id}
                        className={cn(
                          "inline-flex items-center rounded-full border-0 px-2.5 py-0.5 text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500/30",
                          statusColors[req.status] || "bg-dark-50 text-dark-500"
                        )}
                      >
                        {Object.entries(statusLabels).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-3.5 hidden lg:table-cell">
                      <span className="text-xs text-dark-400">
                        {req.created_at ? formatDate(req.created_at) : "—"}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => openEdit(req)}
                          className="rounded-lg p-1.5 text-dark-400 hover:bg-dark-50 hover:text-brand-500 transition-all"
                          title="Edit"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteId(req.id)}
                          className="rounded-lg p-1.5 text-dark-400 hover:bg-red-50 hover:text-red-500 transition-all"
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
        {filteredRequests.length > 0 && (
          <div className="border-t border-dark-900/[0.04] px-4 py-2.5 text-xs text-dark-400">
            Showing {filteredRequests.length} of {requests.length} requests
          </div>
        )}
      </div>
      </TableShell>

      {/* ── Detail Drawer with Price Comparison ── */}
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
                <div>
                  <h2 className="text-lg font-bold text-dark-900">Sourcing Request</h2>
                  <p className="text-xs text-dark-900/40">{selected.created_at ? formatDate(selected.created_at) : ""}</p>
                </div>
                <button onClick={() => setSelected(null)} className="rounded-lg p-1.5 text-dark-900/50 hover:bg-dark-50">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 space-y-5 p-6">
                {/* Status + workflow */}
                <div>
                  <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize", statusColors[selected.status])}>
                    {statusLabels[selected.status]}
                  </span>
                </div>

                {/* Progress */}
                <div className="rounded-xl bg-dark-50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-dark-500">Request Progress</span>
                    <span className="text-xs font-bold text-brand-600">
                      {Math.round((statusWorkflow.indexOf(selected.status) / (statusWorkflow.length - 1)) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-dark-100 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600"
                      initial={{ width: 0 }}
                      animate={{ width: `${(statusWorkflow.indexOf(selected.status) / (statusWorkflow.length - 1)) * 100}%` }}
                      transition={{ duration: 0.6 }}
                    />
                  </div>
                </div>

                {/* Quick advance */}
                {selected.status !== "purchased" && (
                  <button
                    onClick={() => {
                      const idx = statusWorkflow.indexOf(selected.status);
                      if (idx < statusWorkflow.length - 1) {
                        handleStatusChange(selected.id, statusWorkflow[idx + 1]);
                      }
                    }}
                    disabled={updatingStatus === selected.id}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/50 px-4 py-3 text-sm font-semibold text-brand-600 hover:bg-brand-50 transition-colors"
                  >
                    {updatingStatus === selected.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Advance to {statusLabels[statusWorkflow[Math.min(statusWorkflow.indexOf(selected.status) + 1, statusWorkflow.length - 1)]]}
                        <ArrowUpRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                )}

                {/* Details */}
                <div className="space-y-3 rounded-2xl bg-dark-50 p-4">
                  <p className="text-xs font-semibold text-dark-900/50 uppercase tracking-wider">Details</p>
                  {[
                    { label: "Customer", value: selected.customer_id },
                    { label: "Marketplace", value: selected.marketplace },
                    { label: "Quantity", value: String(selected.quantity) },
                    { label: "Destination", value: selected.destination_city },
                  ].map((item) => (
                    <div key={item.label} className="flex justify-between text-sm">
                      <span className="text-dark-500">{item.label}</span>
                      <span className="font-medium text-dark-900">{item.value}</span>
                    </div>
                  ))}
                </div>

                {/* Product description */}
                <div className="rounded-2xl bg-white border border-dark-100/50 p-4">
                  <p className="text-xs font-semibold text-dark-900/50 uppercase tracking-wider mb-2">Product Description</p>
                  <p className="text-sm text-dark-700 whitespace-pre-wrap">{selected.product_description}</p>
                  {selected.product_url && (
                    <a
                      href={selected.product_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand-500 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View Product Link
                    </a>
                  )}
                </div>

                {/* Price comparison */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-dark-900/50 uppercase tracking-wider">Price Comparison</p>
                    <button
                      onClick={addQuote}
                      className="flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-[10px] font-semibold text-brand-600 hover:bg-brand-100"
                    >
                      <Plus className="h-3 w-3" />
                      Add Quote
                    </button>
                  </div>
                  {getQuotesForRequest(selected.id).length === 0 ? (
                    <div className="rounded-xl border border-dashed border-dark-200 p-6 text-center">
                      <ShoppingCart className="mx-auto h-6 w-6 text-dark-300" />
                      <p className="mt-2 text-xs text-dark-400">No quotes yet. Add supplier quotes to compare prices.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {getQuotesForRequest(selected.id).map((q) => (
                        <div
                          key={q.id}
                          className={cn(
                            "rounded-xl border p-3 transition-all cursor-pointer",
                            q.selected ? "border-brand-500 bg-brand-50/50" : "border-dark-100 hover:border-brand-300"
                          )}
                          onClick={() => toggleQuoteSelect(selected.id, q.id)}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-semibold text-dark-900">{q.product_name}</p>
                              <p className="text-xs text-dark-400">{q.supplier}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-brand-600">{formatCNY(q.price_cny)}</p>
                              <p className="text-[10px] text-dark-400">~{formatUSD(q.price_usd)}</p>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center gap-3 text-[10px] text-dark-400">
                            <span>MOQ: {q.moq}</span>
                            {q.source_url && (
                              <a href={q.source_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-brand-500 hover:underline">
                                View Source
                              </a>
                            )}
                          </div>
                          {q.selected && (
                            <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-brand-600">
                              <Check className="h-3 w-3" /> Selected
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Add/Edit Panel ── */}
      <SidePanel
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? "Edit Sourcing Request" : "New Sourcing Request"}
        subtitle="Request details, quantity and destination"
        width="max-w-xl"
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className="admin-btn-ghost">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="admin-btn-primary">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editId ? "Update" : "Create Request"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <FormInput
            label="Customer ID"
            name="customer_id"
            value={form.customer_id}
            onChange={(v) => setForm((f) => ({ ...f, customer_id: v }))}
            placeholder="e.g. uuid or reference"
            required
          />
          <FormInput
            label="Marketplace"
            name="marketplace"
            value={form.marketplace}
            onChange={(v) => setForm((f) => ({ ...f, marketplace: v }))}
            placeholder="e.g. 1688, Taobao, Yiwugo"
            required
          />
          <FormInput
            label="Product Description"
            name="product_description"
            value={form.product_description}
            onChange={(v) => setForm((f) => ({ ...f, product_description: v }))}
            placeholder="Describe the product to source..."
            textarea
            rows={3}
            required
          />
          <FormInput
            label="Product URL"
            name="product_url"
            type="url"
            value={form.product_url}
            onChange={(v) => setForm((f) => ({ ...f, product_url: v }))}
            placeholder="https://... (optional)"
          />
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Quantity"
              name="quantity"
              type="number"
              value={form.quantity}
              onChange={(v) => setForm((f) => ({ ...f, quantity: Number(v) || 1 }))}
              min={1}
              required
            />
            <FormInput
              label="Destination City"
              name="destination_city"
              value={form.destination_city}
              onChange={(v) => setForm((f) => ({ ...f, destination_city: v }))}
              placeholder="e.g. Hargeisa, Mogadishu"
              required
            />
          </div>
        </div>
      </SidePanel>

      {/* ── Add Quote Panel ── */}
      <SidePanel
        open={showQuoteModal}
        onClose={() => setShowQuoteModal(false)}
        title="Add Supplier Quote"
        subtitle="Compare supplier prices for this request"
        width="max-w-xl"
        footer={
          <>
            <button onClick={() => setShowQuoteModal(false)} className="admin-btn-ghost">Cancel</button>
            <button onClick={saveQuote} className="admin-btn-primary">Add Quote</button>
          </>
        }
      >
        <div className="space-y-4">
          <FormInput
            label="Product Name"
            name="product_name"
            value={quoteForm.product_name}
            onChange={(v) => setQuoteForm((q) => ({ ...q, product_name: v }))}
            placeholder="Product name from supplier"
            required
          />
          <FormInput
            label="Supplier"
            name="supplier"
            value={quoteForm.supplier}
            onChange={(v) => setQuoteForm((q) => ({ ...q, supplier: v }))}
            placeholder="Supplier name or ID"
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Price (CNY)"
              name="price_cny"
              type="number"
              value={quoteForm.price_cny}
              onChange={(v) => {
                const cny = Number(v);
                setQuoteForm((q) => ({ ...q, price_cny: cny, price_usd: Math.round(cny * 0.14 * 100) / 100 }));
              }}
              min={0}
              step={0.01}
              required
            />
            <FormInput
              label="Price (USD)"
              name="price_usd"
              type="number"
              value={quoteForm.price_usd}
              onChange={(v) => setQuoteForm((q) => ({ ...q, price_usd: Number(v) }))}
              min={0}
              step={0.01}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="MOQ"
              name="moq"
              type="number"
              value={quoteForm.moq}
              onChange={(v) => setQuoteForm((q) => ({ ...q, moq: Number(v) || 1 }))}
              min={1}
            />
            <FormInput
              label="Source URL"
              name="source_url"
              type="url"
              value={quoteForm.source_url || ""}
              onChange={(v) => setQuoteForm((q) => ({ ...q, source_url: v }))}
              placeholder="https://..."
            />
          </div>
        </div>
      </SidePanel>

      {/* ── Delete Confirm ── */}
      <ConfirmDialog
        open={deleteId !== null}
        title="Delete Sourcing Request"
        message="Are you sure you want to delete this sourcing request? This action cannot be undone."
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDelete}
        loading={deleting}
        confirmText="Delete"
        danger
      />
    </div>
  );
}
