"use client";

import { Suspense, useEffect, useState, useMemo, useCallback } from "react";
import { waLink } from "@/lib/whatsapp";
import { supabase } from "@/lib/supabase";
import { cn, formatDate, formatUSD, formatCNY } from "@/lib/utils";
import {
  ClipboardList, Loader2, Plus, Edit3, Trash2, ExternalLink,
  Download, BarChart3, ArrowUpRight, Clock, CheckCircle2,
  Smartphone, ShoppingCart, MapPin, X, RotateCcw
} from "lucide-react";
import { useToast } from "@/components/admin/Toast";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import FormInput from "@/components/admin/FormInput";
import {
  PageHeader, StatCard, PageGrid, SearchInput, FilterChips, TableShell,
  EMPTY_IMAGES, SidePanel, SkeletonTable,
} from "@/components/admin/ui";
import { TableControls } from "@/components/admin/TableControls";
import { useUrlFilters, useDebouncedFilterValue } from "@/components/admin/useUrlFilters";
import { useTablePrefs } from "@/components/admin/useTablePrefs";
import SourcingBoard from "@/components/admin/SourcingBoard";
import { useLiveVersion } from "@/lib/admin/live-store";
import { motion, AnimatePresence } from "framer-motion";

/* ── Types ─────────────────────────────────────────────────────── */

interface SourcingRequest {
  id: string;
  user_id: string;
  marketplace: string | null;
  product_url?: string;
  product_description: string;
  quantity: number;
  destination_city: string;
  status: "pending" | "assigned" | "quoted" | "approved" | "purchased" | "cancelled";
  created_at: string;
}

/* Session-local record of quotes created from the drawer. `quotes` rows carry
 * no request reference in the schema, so they cannot be re-fetched per
 * request — the drawer list only shows what this session created. */
interface QuoteEntry {
  id: string;
  reference: string;
  product_name: string;
  quantity: number;
  unit_price_cny: number;
  total_cny: number;
  total_usd: number;
}

/* ── Constants ─────────────────────────────────────────────────── */

const statusColors: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  assigned: "bg-blue-50 text-blue-700 border-blue-200",
  quoted: "bg-purple-50 text-purple-700 border-purple-200",
  approved: "bg-green-50 text-green-700 border-green-200",
  purchased: "bg-indigo-50 text-indigo-700 border-indigo-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

const statusLabels: Record<string, string> = {
  pending: "Pending",
  assigned: "Assigned",
  quoted: "Quoted",
  approved: "Approved",
  purchased: "Purchased",
  cancelled: "Cancelled",
};

const statusWorkflow = ["pending", "assigned", "quoted", "approved", "purchased"];

const defaultForm = {
  user_id: "",
  marketplace: "",
  product_description: "",
  product_url: "",
  quantity: 1,
  destination_city: "",
};

const defaultQuoteForm = { unit_price_cny: 0, quantity: 1 };

/* Fallback CNY→USD rate when `exchange_rates` has no active CNY→USD row. */
const FALLBACK_CNY_USD_RATE = 0.14;

/* Values allowed by the sourcing_requests.marketplace enum. */
const MARKETPLACES = [
  { value: "1688", label: "1688" },
  { value: "taobao", label: "Taobao" },
  { value: "yiwugo", label: "Yiwugo" },
  { value: "alibaba", label: "Alibaba" },
  { value: "chinagoods", label: "Chinagoods" },
  { value: "jd", label: "JD" },
];

/* QT-YYYYMMDD-XXXX — 4 random chars via crypto.getRandomValues. */
const QUOTE_REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeQuoteReference(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (b) => QUOTE_REF_CHARS[b % QUOTE_REF_CHARS.length]).join("");
  return `QT-${ymd}-${suffix}`;
}

/* ── URL-backed view state ──────────────────────────────────────
 * `view` switches between the request list and the sourcing board for the
 * order LINEs (deliverable: a click-to-advance board). Everything else is the
 * page's previous filter set, moved out of component state so a view can be
 * reloaded or shared. Client-side only: apps/web is a static export.
 */
const FILTER_DEFAULTS = {
  view: "requests", q: "", status: "All", app: "", from: "", to: "",
};

const REQUEST_COLUMNS: { key: string; label: string }[] = [
  { key: "customer", label: "Customer" },
  { key: "marketplace", label: "Marketplace" },
  { key: "product", label: "Product" },
  { key: "quantity", label: "Qty" },
  { key: "destination", label: "Destination" },
  { key: "status", label: "Status" },
  { key: "created_at", label: "Date" },
  { key: "actions", label: "Actions" },
];

/* ── Component ─────────────────────────────────────────────────── */

export default function SourcingPage() {
  // useSearchParams() must sit under <Suspense> in a statically prerendered
  // route, or the prerenderer bails this page to full client rendering.
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-dark-900/[0.06] bg-white shadow-sm">
          <SkeletonTable />
        </div>
      }
    >
      <SourcingPageContent />
    </Suspense>
  );
}

function SourcingPageContent() {
  const toast = useToast();
  const { values, set, reset, isFiltered } = useUrlFilters(FILTER_DEFAULTS);
  const tablePrefs = useTablePrefs("sourcing-requests");
  const liveVersion = useLiveVersion(["sourcing_requests", "orders", "order_items"]);

  const [requests, setRequests] = useState<SourcingRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const statusFilter = values.status;
  const appFilter = values.app;
  const dateFrom = values.from;
  const dateTo = values.to;
  const view = values.view === "board" ? "board" : "requests";

  // Drafted while typing; committed to the URL debounced.
  const commitSearch = useCallback((v: string) => set("q", v), [set]);
  const [search, setSearch] = useDebouncedFilterValue(values.q, commitSearch);

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
  const [quotes, setQuotes] = useState<Record<string, QuoteEntry[]>>({});
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [quoteForm, setQuoteForm] = useState(defaultQuoteForm);
  const [savingQuote, setSavingQuote] = useState(false);
  const [cnyRate, setCnyRate] = useState(FALLBACK_CNY_USD_RATE);

  /* ── Fetch ──────────────────────────────────────────────────── */

  const fetchRequests = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchRequests();
    // liveVersion comes from the realtime channel in the admin layout, so a
    // request captured on the phone appears without a manual reload.
  }, [fetchRequests, liveVersion]);

  // Active CNY→USD rate for quote totals (see exchange_rates contract).
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("exchange_rates")
        .select("rate")
        .eq("from_currency", "CNY")
        .eq("to_currency", "USD")
        .eq("is_active", true)
        .order("effective_from", { ascending: false })
        .limit(1);
      const rate = data?.[0]?.rate;
      if (typeof rate === "number" && rate > 0) setCnyRate(rate);
    })();
  }, []);

  /* ── Filter ─────────────────────────────────────────────────── */

  const filteredRequests = useMemo(() => {
    let result = requests;

    if (statusFilter !== "All") {
      const wanted = Object.entries(statusLabels).find(([, label]) => label === statusFilter)?.[0];
      result = result.filter((r) => r.status === (wanted ?? statusFilter.toLowerCase()));
    }

    if (appFilter) {
      result = result.filter(
        (r) => (r.marketplace || "").toLowerCase() === appFilter.toLowerCase()
      );
    }

    if (dateFrom) {
      result = result.filter((r) => r.created_at && r.created_at.slice(0, 10) >= dateFrom);
    }
    if (dateTo) {
      result = result.filter((r) => r.created_at && r.created_at.slice(0, 10) <= dateTo);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (r) =>
          (r.user_id ?? "").toLowerCase().includes(q) ||
          (r.marketplace ?? "").toLowerCase().includes(q) ||
          (r.destination_city ?? "").toLowerCase().includes(q) ||
          r.product_description?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [requests, search, statusFilter, appFilter, dateFrom, dateTo]);

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

  /* ── Which apps requests mention ───────────────────────────── */

  const appOptions = useMemo(() => {
    const counts = new Map<string, number>();
    requests.forEach((r) => {
      const key = (r.marketplace || "").trim();
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([app, count]) => ({ app, count }));
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
      user_id: req.user_id ?? "",
      marketplace: req.marketplace ?? "",
      product_description: req.product_description,
      product_url: req.product_url || "",
      quantity: req.quantity,
      destination_city: req.destination_city,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.user_id || !form.product_description || !form.destination_city) {
      toast.error("Please fill in all required fields");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        user_id: form.user_id,
        marketplace: form.marketplace || null,
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

  /* ── Quote drawer (real writes to quotes + quote_items) ─────── */

  const getQuotesForRequest = (requestId: string): QuoteEntry[] => {
    return quotes[requestId] || [];
  };

  const openQuoteDrawer = () => {
    if (!selected) return;
    setQuoteForm({
      unit_price_cny: 0,
      quantity: Math.max(1, Math.floor(Number(selected.quantity) || 1)),
    });
    setShowQuoteModal(true);
  };

  const handleAddQuote = async () => {
    if (!selected || savingQuote) return;
    const unitPrice = Number(quoteForm.unit_price_cny);
    const qty = Math.max(1, Math.floor(Number(quoteForm.quantity) || 1));
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      toast.error("Enter a valid unit price in CNY");
      return;
    }
    if (!selected.user_id) {
      toast.error("This request has no customer user attached");
      return;
    }

    setSavingQuote(true);
    try {
      const totalCny = Math.round(unitPrice * qty * 100) / 100;
      const totalUsd = Math.round(totalCny * cnyRate * 100) / 100;
      // Draft quotes are valid for 14 days.
      const validUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

      const { data: quoteRow, error: quoteError } = await supabase
        .from("quotes")
        .insert({
          reference: makeQuoteReference(),
          user_id: selected.user_id,
          status: "draft",
          total_cny: totalCny,
          total_usd: totalUsd,
          valid_until: validUntil,
        })
        .select("id, reference")
        .single();
      if (quoteError) throw quoteError;

      const { error: itemError } = await supabase.from("quote_items").insert({
        quote_id: quoteRow.id,
        product_name: (selected.product_description || "").slice(0, 200),
        quantity: qty,
        unit_price_cny: unitPrice,
      });
      if (itemError) {
        // Best-effort rollback so a failed item write leaves no orphan quote.
        await supabase.from("quotes").delete().eq("id", quoteRow.id);
        throw itemError;
      }

      setQuotes((prev) => ({
        ...prev,
        [selected.id]: [
          ...(prev[selected.id] || []),
          {
            id: quoteRow.id,
            reference: quoteRow.reference,
            product_name: (selected.product_description || "").slice(0, 200),
            quantity: qty,
            unit_price_cny: unitPrice,
            total_cny: totalCny,
            total_usd: totalUsd,
          },
        ],
      }));
      setShowQuoteModal(false);
      toast.success(`Quote ${quoteRow.reference} created`);
      fetchRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create quote");
    } finally {
      setSavingQuote(false);
    }
  };

  const truncate = (text: string, max: number) => {
    if (!text) return "-";
    return text.length > max ? text.slice(0, max) + "..." : text;
  };

  // Live totals preview for the Add Quote drawer.
  const quoteQty = Math.max(1, Math.floor(Number(quoteForm.quantity) || 1));
  const quoteUnit = Number(quoteForm.unit_price_cny) || 0;
  const quoteTotalCny = Math.round(quoteUnit * quoteQty * 100) / 100;
  const quoteTotalUsd = Math.round(quoteTotalCny * cnyRate * 100) / 100;

  /* ── Export ─────────────────────────────────────────────────── */

  const handleExport = () => {
    const headers = ["Customer", "Marketplace", "Product", "Qty", "Destination", "Status", "Date"];
    const rows = filteredRequests.map((r) => [
      r.user_id ?? "", r.marketplace ?? "", r.product_description,
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
          <div className="flex flex-wrap items-center gap-2">
            {view === "requests" && (
              <TableControls columns={REQUEST_COLUMNS} prefs={tablePrefs} />
            )}
            {isFiltered && (
              <button
                onClick={() => {
                  reset();
                  setSearch("");
                }}
                className="flex items-center gap-1.5 rounded-xl border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100"
                title="Clears every filter and the query string"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset filters
              </button>
            )}
            <a
              href={waLink("Hello ChinaSuuq, I have a sourcing request")}
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

      {/* ── Two different objects, two views ──
          Requests are what the customer asked for. The board is the order LINEs
          moving through sourcing, which is the same team's work but a different
          table. The chosen view is part of the URL (?view=board). */}
      <FilterChips<string>
        options={[
          { value: "requests", label: "Customer requests", count: requests.length },
          { value: "board", label: "Line-item sourcing board" },
        ]}
        value={view}
        onChange={(v) => set("view", v === "requests" ? "" : v)}
      />

      {view === "requests" && (
        <PageGrid className="grid-cols-2 sm:grid-cols-4">
          <StatCard label="Total Requests" value={kpis.total} icon={ClipboardList} tone="brand" delay={0} />
          <StatCard label="Pending" value={kpis.pending} icon={Clock} tone="warning" delay={1} />
          <StatCard label="Quoted" value={kpis.quoted} icon={BarChart3} tone="violet" delay={2} />
          <StatCard label="Purchased" value={kpis.purchased} icon={CheckCircle2} tone="success" delay={3} />
        </PageGrid>
      )}

      {view === "board" && (
        <p className="-mt-2 text-xs text-dark-900/45">
          This board is the <strong className="font-semibold text-dark-900/70">line items of real
          orders</strong>, staged by the four flags stored on each line. It is click-to-advance:
          there is no drag-and-drop in this build, and nothing is installed that would provide it.
        </p>
      )}

      {/* ── Search + Controls ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={
            view === "board"
              ? "Search a line by product, order reference or customer…"
              : "Search by user, marketplace, or city..."
          }
          className="max-w-md flex-1"
        />
        <div className="flex items-center gap-3">
          {view === "requests" && (
            <button onClick={handleExport} className="admin-btn-outline">
              <Download className="h-3 w-3" /> Export
            </button>
          )}
          <span className="text-xs text-dark-400">
            {view === "requests"
              ? `${filteredRequests.length} request${filteredRequests.length !== 1 ? "s" : ""}`
              : "filtered lines are counted on the board"}
          </span>
          {(search || appFilter || dateFrom || dateTo) && (
            <button
              onClick={() => {
                setSearch("");
                set("q", "");
                set("app", "");
                set("from", "");
                set("to", "");
              }}
              className="text-xs text-brand-700 hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── App + date range, shared by both views ── */}
      <div className="flex flex-wrap items-end gap-4">
        {appOptions.length > 0 && view === "requests" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-dark-900/40">
              Marketplace
            </span>
            <FilterChips<string>
              options={[
                { value: "", label: "Any", count: requests.length },
                ...appOptions.map(({ app, count }) => ({ value: app, label: app, count })),
              ]}
              value={appFilter}
              onChange={(v) => set("app", v)}
            />
          </div>
        )}
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-dark-900/40">
            Created
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => set("from", e.target.value)}
            className="rounded-xl border border-dark-900/10 bg-white px-3 py-1.5 text-xs outline-none focus:border-brand-500"
            aria-label="Created from"
          />
          <span className="text-xs text-dark-300">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => set("to", e.target.value)}
            className="rounded-xl border border-dark-900/10 bg-white px-3 py-1.5 text-xs outline-none focus:border-brand-500"
            aria-label="Created to"
          />
        </div>
      </div>

      {view === "board" ? (
        <SourcingBoard
          appFilter={appFilter}
          search={search}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      ) : (
        <>

      {/* ── Status chips ── */}
      <FilterChips<string>
        options={["All", ...Object.values(statusLabels)].map((tab) => ({
          value: tab,
          label: tab,
          count: statusCounts[tab],
        }))}
        value={statusFilter}
        onChange={(v) => set("status", v)}
      />

      {/* ── Table ── */}
      <TableShell
        isLoading={isLoading}
        error={error}
        errorRetry={fetchRequests}
        hasData={filteredRequests.length > 0}
        filtered={!!search || statusFilter !== "All" || !!appFilter || !!dateFrom || !!dateTo}
        emptyImage={EMPTY_IMAGES.sourcing}
        emptyTitle="No sourcing requests"
        emptySubtitle="New customer sourcing requests will land here."
        emptyAction={
          <button onClick={openCreate} className="admin-btn-primary">Create your first request</button>
        }
      >
      <div className="rounded-2xl bg-white border border-dark-900/[0.06] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className={cn(
              "admin-table w-full",
              tablePrefs.className,
              tablePrefs.tableClassName
            )}
          >
            <thead>
              <tr>
                {!tablePrefs.isHidden("customer") && <th>Customer</th>}
                {!tablePrefs.isHidden("marketplace") && <th>Marketplace</th>}
                {!tablePrefs.isHidden("product") && <th>Product</th>}
                {!tablePrefs.isHidden("quantity") && <th>Qty</th>}
                {!tablePrefs.isHidden("destination") && <th>Destination</th>}
                {!tablePrefs.isHidden("status") && <th>Status</th>}
                {!tablePrefs.isHidden("created_at") && (
                  <th className="hidden lg:table-cell">Date</th>
                )}
                {!tablePrefs.isHidden("actions") && <th className="text-right">Actions</th>}
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
                      <span className="text-sm font-medium text-dark-900">{req.user_id}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 text-orange-700 px-2.5 py-0.5 text-xs font-medium">
                        {req.marketplace ?? "—"}
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
        </>
      )}

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
                      {Math.round((Math.max(0, statusWorkflow.indexOf(selected.status)) / (statusWorkflow.length - 1)) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-dark-100 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600"
                      initial={{ width: 0 }}
                      animate={{ width: `${(Math.max(0, statusWorkflow.indexOf(selected.status)) / (statusWorkflow.length - 1)) * 100}%` }}
                      transition={{ duration: 0.6 }}
                    />
                  </div>
                </div>

                {/* Quick advance */}
                {selected.status !== "purchased" && selected.status !== "cancelled" && (
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
                    { label: "Customer", value: selected.user_id },
                    { label: "Marketplace", value: selected.marketplace ?? "—" },
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

                {/* Quotes created from this drawer. `quotes` rows carry no
                    request reference in the schema, so this list only shows
                    what this session created. */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-dark-900/50 uppercase tracking-wider">Quotes</p>
                    <button
                      onClick={openQuoteDrawer}
                      className="flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-[10px] font-semibold text-brand-600 hover:bg-brand-100"
                    >
                      <Plus className="h-3 w-3" />
                      Add Quote
                    </button>
                  </div>
                  {getQuotesForRequest(selected.id).length === 0 ? (
                    <div className="rounded-xl border border-dashed border-dark-200 p-6 text-center">
                      <ShoppingCart className="mx-auto h-6 w-6 text-dark-300" />
                      <p className="mt-2 text-xs text-dark-400">
                        No quotes created yet. New quotes are saved as drafts for this customer.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {getQuotesForRequest(selected.id).map((q) => (
                        <div key={q.id} className="rounded-xl border border-dark-100 p-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-semibold text-dark-900">{q.product_name}</p>
                              <p className="text-xs text-dark-400">{q.reference}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-brand-600">{formatCNY(q.total_cny)}</p>
                              <p className="text-[10px] text-dark-400">~{formatUSD(q.total_usd)}</p>
                            </div>
                          </div>
                          <div className="mt-2 text-[10px] text-dark-400">
                            {q.quantity} × {formatCNY(q.unit_price_cny)} · draft
                          </div>
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
            label="Customer User ID"
            name="user_id"
            value={form.user_id}
            onChange={(v) => setForm((f) => ({ ...f, user_id: v }))}
            placeholder="profiles.id of the customer"
            required
          />
          <div className="space-y-1.5">
            <label htmlFor="marketplace" className="block text-sm font-medium text-dark-700">
              Marketplace
            </label>
            <select
              id="marketplace"
              name="marketplace"
              value={form.marketplace}
              onChange={(e) => setForm((f) => ({ ...f, marketplace: e.target.value }))}
              className="w-full rounded-xl border border-dark-200 bg-white px-3.5 py-2.5 text-sm text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            >
              <option value="">None</option>
              {MARKETPLACES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
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

      {/* ── Add Quote Panel (writes quotes + quote_items) ── */}
      <SidePanel
        open={showQuoteModal}
        onClose={() => setShowQuoteModal(false)}
        title="Add Quote"
        subtitle="Creates a draft quote for this customer"
        width="max-w-xl"
        footer={
          <>
            <button onClick={() => setShowQuoteModal(false)} className="admin-btn-ghost">Cancel</button>
            <button onClick={handleAddQuote} disabled={savingQuote} className="admin-btn-primary">
              {savingQuote ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create Quote
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-dark-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-dark-900/40 mb-1">Product</p>
            <p className="text-sm text-dark-700 whitespace-pre-wrap">
              {(selected?.product_description || "").slice(0, 200) || "—"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Quantity"
              name="quote_quantity"
              type="number"
              value={quoteForm.quantity}
              onChange={(v) => setQuoteForm((q) => ({ ...q, quantity: Math.max(1, Math.floor(Number(v) || 1)) }))}
              min={1}
              required
            />
            <FormInput
              label="Unit Price (CNY)"
              name="unit_price_cny"
              type="number"
              value={quoteForm.unit_price_cny}
              onChange={(v) => setQuoteForm((q) => ({ ...q, unit_price_cny: Number(v) || 0 }))}
              min={0}
              step={0.01}
              required
            />
          </div>
          <div className="rounded-xl border border-dark-100 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-dark-500">Total (CNY)</span>
              <span className="font-semibold text-dark-900">{formatCNY(quoteTotalCny)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-500">Total (USD)</span>
              <span className="font-semibold text-dark-900">≈ {formatUSD(quoteTotalUsd)}</span>
            </div>
            <p className="mt-1 text-[10px] text-dark-400">
              CNY→USD rate {cnyRate} · saved as draft · valid 14 days
            </p>
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
