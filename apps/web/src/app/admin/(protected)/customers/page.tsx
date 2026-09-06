"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { cn, formatDate, formatUSD, formatDateTime } from "@/lib/utils";
import {
  Search, Users, Loader2, AlertCircle, Mail, Phone, MapPin,
  X, Edit3, Save, MessageSquare, Package, DollarSign, CalendarDays,
  Download, Filter, ChevronDown, ShoppingCart, User as UserIcon
} from "lucide-react";
import { listCustomers, listOrders } from "@/lib/admin/supabase-data";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/components/admin/Toast";
import { StatusBadge } from "@/components/admin/StatusBadge";

const typeFilters = ["All", "Individual", "Business"] as const;

interface CustomerNote {
  text: string;
  author: string;
  timestamp: string;
}

/* ── Component ────────────────────────────────────────────────── */

export default function CustomersPage() {
  const { success, error: toastError } = useToast();

  const [customers, setCustomers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Selection
  const [selected, setSelected] = useState<any | null>(null);
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Notes
  const [notes, setNotes] = useState<Record<string, CustomerNote[]>>({});
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Unique cities for filter
  const uniqueCities = useMemo(() => {
    const cities = new Set<string>();
    customers.forEach((c) => { if (c.city) cities.add(c.city); });
    return Array.from(cities).sort();
  }, [customers]);

  /* ── Load data ─────────────────────────────────────────────── */

  const load = useCallback(async (s?: string) => {
    setIsLoading(true);
    setError(null);
    const res = await listCustomers({ search: s });
    if (res.ok) setCustomers(res.customers);
    else setError(res.error || "Failed to load customers");
    setIsLoading(false);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  // Load notes from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("chinasuuq_customer_notes");
      if (stored) setNotes(JSON.parse(stored));
    } catch {}
  }, []);

  /* ── Filtered ──────────────────────────────────────────────── */

  const filtered = useMemo(() => {
    let result = customers;

    if (typeFilter !== "All") {
      result = result.filter((c) =>
        typeFilter === "Business"
          ? c.customer_type === "business"
          : c.customer_type !== "business"
      );
    }

    if (cityFilter) {
      result = result.filter((c) => c.city === cityFilter);
    }

    if (dateFrom) {
      result = result.filter((c) => c.created_at && c.created_at.slice(0, 10) >= dateFrom);
    }
    if (dateTo) {
      result = result.filter((c) => c.created_at && c.created_at.slice(0, 10) <= dateTo);
    }

    return result;
  }, [customers, typeFilter, cityFilter, dateFrom, dateTo]);

  /* ── KPIs ──────────────────────────────────────────────────── */

  const kpis = useMemo(() => ({
    total: customers.length,
    business: customers.filter((c) => c.customer_type === "business").length,
    individual: customers.filter((c) => c.customer_type !== "business").length,
    totalRevenue: customers.reduce((s, c) => s + (c.total_spent || 0), 0),
    avgOrderValue: customers.length
      ? customers.reduce((s, c) => s + (c.total_spent || 0), 0) / Math.max(customers.reduce((s, c) => s + (c.total_orders || 0), 0), 1)
      : 0,
    topCities: (() => {
      const map: Record<string, number> = {};
      customers.forEach((c) => { if (c.city) map[c.city] = (map[c.city] || 0) + 1; });
      return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
    })(),
  }), [customers]);

  /* ── Load customer orders when selected ────────────────────── */

  useEffect(() => {
    if (!selected) {
      setCustomerOrders([]);
      return;
    }
    setLoadingOrders(true);
    listOrders({ search: selected.phone || selected.email || selected.full_name }).then((res) => {
      if (res.ok) {
        setCustomerOrders(res.orders.filter((o) =>
          o.customer_name === selected.full_name ||
          o.phone === selected.phone ||
          o.recipient_name === selected.full_name
        ));
      }
      setLoadingOrders(false);
    });
  }, [selected]);

  /* ── Notes ─────────────────────────────────────────────────── */

  const saveNotes = useCallback((customerId: string, updated: CustomerNote[]) => {
    const newNotes = { ...notes, [customerId]: updated };
    setNotes(newNotes);
    localStorage.setItem("chinasuuq_customer_notes", JSON.stringify(newNotes));
  }, [notes]);

  const handleAddNote = () => {
    if (!selected || !newNote.trim()) return;
    setSavingNote(true);
    const note: CustomerNote = {
      text: newNote.trim(),
      author: "Admin",
      timestamp: new Date().toISOString(),
    };
    const existing = notes[selected.id] || [];
    saveNotes(selected.id, [note, ...existing]);
    setNewNote("");
    setSavingNote(false);
    success("Note added");
  };

  const handleDeleteNote = (customerId: string, idx: number) => {
    const existing = notes[customerId] || [];
    saveNotes(customerId, existing.filter((_, i) => i !== idx));
  };

  /* ── Export CSV ────────────────────────────────────────────── */

  const handleExportCSV = () => {
    const headers = ["Name", "Email", "Phone", "City", "Type", "Tier", "Orders", "Total Spent", "Joined"];
    const rows = filtered.map((c) => [
      c.full_name || "",
      c.email || "",
      c.phone || "",
      c.city || "",
      c.customer_type || "",
      c.tier || "",
      String(c.total_orders || 0),
      String(c.total_spent || 0),
      c.created_at ? formatDate(c.created_at) : "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    success(`Exported ${filtered.length} customers`);
  };

  /* ── Render ────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-dark-900">Customers</h1>
          <p className="text-sm text-dark-900/50">Manage and view all ChinaSuuq buyers</p>
        </div>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 rounded-xl border border-dark-100 bg-white px-4 py-2 text-sm font-medium text-dark-600 hover:bg-dark-50 transition-colors"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Customers", value: kpis.total, icon: Users, color: "text-dark-900" },
          { label: "Business", value: kpis.business, icon: Package, color: "text-violet-600" },
          { label: "Individual", value: kpis.individual, icon: UserIcon, color: "text-sky-600" },
          { label: "Total Revenue", value: formatUSD(kpis.totalRevenue), icon: DollarSign, color: "text-emerald-600" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-dark-100/50 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2">
              <kpi.icon className="h-4 w-4 text-dark-300" />
              <p className="text-xs font-medium text-dark-400">{kpi.label}</p>
            </div>
            <p className={cn("mt-1 text-xl font-bold", kpi.color)}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* ── Top Cities ── */}
      {kpis.topCities.length > 0 && (
        <div className="rounded-xl border border-dark-100/50 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2">Top Cities</p>
          <div className="flex flex-wrap gap-2">
            {kpis.topCities.map(([city, count]) => (
              <button
                key={city}
                onClick={() => setCityFilter(cityFilter === city ? "" : city)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all",
                  cityFilter === city
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-dark-100 bg-dark-50 text-dark-600 hover:border-brand-300"
                )}
              >
                <MapPin className="h-3 w-3" />
                {city}
                <span className="text-dark-400">({count})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Search + Filters ── */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-900/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, phone, city…"
              className="w-full rounded-xl border border-dark-900/10 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
              showFilters || cityFilter || dateFrom || dateTo
                ? "border-brand-500 bg-brand-50 text-brand-600"
                : "border-dark-100 bg-white text-dark-500 hover:bg-dark-50"
            )}
          >
            <Filter className="h-4 w-4" />
            Filters
          </button>
          <span className="text-xs text-dark-900/40">
            {filtered.length} {filtered.length === 1 ? "customer" : "customers"}
          </span>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap items-end gap-4 rounded-xl border border-dark-100 bg-white p-4 shadow-sm">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-dark-400">City</label>
                  <select
                    value={cityFilter}
                    onChange={(e) => setCityFilter(e.target.value)}
                    className="h-9 rounded-lg border border-dark-100 px-3 text-sm bg-white focus:border-brand-500 focus:outline-none"
                  >
                    <option value="">All cities</option>
                    {uniqueCities.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-dark-400">Registered After</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-9 rounded-lg border border-dark-100 px-3 text-sm focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-dark-400">Registered Before</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-9 rounded-lg border border-dark-100 px-3 text-sm focus:border-brand-500 focus:outline-none"
                  />
                </div>
                {(cityFilter || dateFrom || dateTo) && (
                  <button
                    onClick={() => { setCityFilter(""); setDateFrom(""); setDateTo(""); }}
                    className="rounded-lg bg-dark-50 px-3 py-1.5 text-xs font-medium text-dark-500 hover:bg-dark-100"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Type filter chips */}
        <div className="flex flex-wrap gap-2">
          {typeFilters.map((s) => (
            <button
              key={s}
              onClick={() => setTypeFilter(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition",
                typeFilter === s
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-dark-900/10 bg-white text-dark-900/60 hover:border-brand-500/30"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* ── Customer Table ── */}
      {isLoading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-dark-900/50">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading customers…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-dark-900/10 bg-white p-12 text-center text-sm text-dark-900/40">
          <Users className="mx-auto mb-3 h-10 w-10 text-dark-900/20" />
          <p>No customers found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-dark-900/5 bg-white">
          <table className="min-w-full divide-y divide-dark-900/5 text-sm">
            <thead className="bg-dark-50/50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-dark-900/50">
                <th className="px-4 py-3">Customer</th>
                <th className="hidden px-4 py-3 sm:table-cell">Contact</th>
                <th className="hidden px-4 py-3 md:table-cell">City</th>
                <th className="px-4 py-3">Tier</th>
                <th className="hidden px-4 py-3 md:table-cell">Orders</th>
                <th className="hidden px-4 py-3 md:table-cell">Spent</th>
                <th className="hidden px-4 py-3 lg:table-cell">Joined</th>
                <th className="hidden px-4 py-3 lg:table-cell">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-900/5">
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className="cursor-pointer transition hover:bg-dark-50/30"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500/10 text-sm font-semibold text-brand-600 shrink-0">
                        {(c.full_name || c.email || "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-dark-900 truncate">
                          {c.full_name || c.email || "—"}
                        </p>
                        {c.business_name ? (
                          <p className="text-xs text-dark-900/45 truncate">{c.business_name}</p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <p className="text-dark-900/70 truncate max-w-[180px]">{c.email || "—"}</p>
                    <p className="text-xs text-dark-900/45">{c.phone || "—"}</p>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <span className="text-dark-600 text-xs">{c.city || "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    {c.tier ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase text-amber-800">
                        {c.tier}
                      </span>
                    ) : (
                      <span className="text-xs text-dark-900/40">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <span className="font-semibold text-dark-900">{c.total_orders || 0}</span>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <span className="font-semibold text-emerald-600">
                      ${(c.total_spent || 0).toLocaleString()}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-dark-900/50 lg:table-cell">
                    {c.created_at ? formatDate(c.created_at) : "—"}
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    {notes[c.id] && notes[c.id].length > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        <MessageSquare className="h-3 w-3" />
                        {notes[c.id].length}
                      </span>
                    ) : (
                      <span className="text-xs text-dark-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Customer Detail Drawer ── */}
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
              {/* Header */}
              <div className="flex items-center justify-between border-b border-dark-900/5 px-6 py-4">
                <h2 className="text-lg font-bold text-dark-900">
                  {selected.full_name || selected.email}
                </h2>
                <button
                  onClick={() => setSelected(null)}
                  className="rounded-lg p-1.5 text-dark-900/50 hover:bg-dark-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-5 p-6">
                {/* Profile card */}
                <div className="flex items-center gap-4 rounded-2xl bg-dark-50 p-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-lg font-bold text-white shrink-0">
                    {(selected.full_name || selected.email || "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-bold text-dark-900 truncate">
                      {selected.full_name || "—"}
                    </p>
                    {selected.business_name && (
                      <p className="text-xs text-dark-900/60">{selected.business_name}</p>
                    )}
                    {selected.tier && (
                      <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                        {selected.tier}
                      </span>
                    )}
                  </div>
                </div>

                {/* Contact info */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-dark-900/40 uppercase tracking-wider">Contact</p>
                  {[
                    { icon: Mail, value: selected.email || "—" },
                    { icon: Phone, value: selected.phone || "—" },
                    { icon: MapPin, value: selected.city || "—" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <item.icon className="h-4 w-4 text-dark-900/40 shrink-0" />
                      <span className="text-dark-900/70 truncate">{item.value}</span>
                    </div>
                  ))}
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-dark-50 p-3 text-center">
                    <p className="text-2xl font-bold text-dark-900">{selected.total_orders || 0}</p>
                    <p className="text-xs text-dark-900/50">Total orders</p>
                  </div>
                  <div className="rounded-xl bg-dark-50 p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-600">
                      ${(selected.total_spent || 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-dark-900/50">Total spent</p>
                  </div>
                </div>

                {/* Order history */}
                <div>
                  <p className="text-xs font-semibold text-dark-900/40 uppercase tracking-wider mb-3">Order History</p>
                  {loadingOrders ? (
                    <div className="flex items-center gap-2 text-xs text-dark-400">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading orders…
                    </div>
                  ) : customerOrders.length === 0 ? (
                    <p className="text-xs text-dark-900/30">No orders found</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {customerOrders.map((order) => (
                        <div
                          key={order.id}
                          className="flex items-center justify-between rounded-lg border border-dark-100 px-3 py-2 hover:bg-dark-50 transition-colors"
                        >
                          <div>
                            <p className="text-xs font-semibold text-dark-900">
                              {order.order_number || order.reference || order.id.slice(0, 8)}
                            </p>
                            <p className="text-[10px] text-dark-400">
                              {order.created_at ? formatDate(order.created_at) : "—"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-dark-900">{formatUSD(order.total || 0)}</p>
                            <StatusBadge status={order.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Notes section */}
                <div>
                  <p className="text-xs font-semibold text-dark-900/40 uppercase tracking-wider mb-3">Notes</p>

                  {/* Add note */}
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddNote(); }}
                      placeholder="Add a note..."
                      className="flex-1 rounded-lg border border-dark-100 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                    />
                    <button
                      onClick={handleAddNote}
                      disabled={!newNote.trim() || savingNote}
                      className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
                    >
                      <Save className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Notes list */}
                  {(notes[selected.id] || []).length === 0 ? (
                    <p className="text-xs text-dark-900/30 italic">No notes yet</p>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {(notes[selected.id] || []).map((note, idx) => (
                        <div key={idx} className="group rounded-lg bg-dark-50 px-3 py-2 relative">
                          <p className="text-xs text-dark-700">{note.text}</p>
                          <p className="text-[10px] text-dark-400 mt-1">
                            {note.author} · {formatDateTime(note.timestamp)}
                          </p>
                          <button
                            onClick={() => handleDeleteNote(selected.id, idx)}
                            className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 rounded p-0.5 text-dark-400 hover:text-red-500 hover:bg-red-50 transition-all"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <p className="text-xs text-dark-900/40 border-t border-dark-100 pt-4">
                  <CalendarDays className="h-3 w-3 inline mr-1" />
                  Joined {selected.created_at ? formatDate(selected.created_at) : "—"}
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
