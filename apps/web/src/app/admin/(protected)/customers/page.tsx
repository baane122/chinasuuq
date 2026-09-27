"use client";

/**
 * Customers list.
 *
 * Two things changed here, both for the operator's core ask ("show me exactly
 * what each customer bought, from which app"):
 *
 *  1. Filters live in the query string (`?q=&type=&city=&from=&to=`) and the
 *     table remembers density + hidden columns per browser. Both are client
 *     side only — apps/web is a static export, so there is no server read of
 *     searchParams. The page therefore renders inside <Suspense>.
 *  2. The row click now opens the shared Customer 360 drawer, which is built
 *     from admin_customers_view / admin_orders_view / admin_order_items_view.
 *     The old panel matched orders to customers by name/phone string, which
 *     silently mixed up everyone who shares a name; the drawer joins on the
 *     real `orders.profile_id`. Staff notes are kept — they live in this
 *     browser (localStorage) and are passed to the drawer as its footer.
 *
 * Colours: only the tokens in globals.css (brand/dark/warm scales + the flat
 * success, warning, error, info tokens used as `bg-warning/10`, never
 * `bg-warning-500`).
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Users, X, MapPin, Save, MessageSquare, Package, DollarSign,
  CalendarDays, Download, Filter, User as UserIcon, RotateCcw,
} from "lucide-react";
import { listCustomers } from "@/lib/admin/supabase-data";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/components/admin/Toast";
import {
  PageHeader, StatCard, PageGrid, SectionCard, SearchInput, FilterChips,
  TableShell, SkeletonTable, EMPTY_IMAGES,
} from "@/components/admin/ui";
import { TableControls } from "@/components/admin/TableControls";
import { useUrlFilters, useDebouncedFilterValue } from "@/components/admin/useUrlFilters";
import { useTablePrefs } from "@/components/admin/useTablePrefs";
import Customer360Drawer from "@/components/admin/Customer360Drawer";
import { useLiveVersion } from "@/lib/admin/live-store";
import { cn, formatDate, formatDateTime, formatUSD } from "@/lib/utils";

/** Module scope: a stable object identity keeps the hook from re-running effects. */
const FILTER_DEFAULTS = { q: "", type: "All", city: "", from: "", to: "" };

const TYPE_OPTIONS = [
  { value: "All", label: "All" },
  { value: "Business", label: "Business" },
  { value: "Individual", label: "Individual" },
];

const CUSTOMER_COLUMNS: { key: string; label: string }[] = [
  { key: "customer", label: "Customer" },
  { key: "contact", label: "Contact" },
  { key: "city", label: "City" },
  { key: "tier", label: "Tier" },
  { key: "orders", label: "Orders" },
  { key: "spent", label: "Spent" },
  { key: "joined", label: "Joined" },
  { key: "notes", label: "Notes" },
];

/** listCustomers reads the newest 500 profiles — never claim more than that. */
const LOAD_CAP = 500;

interface CustomerNote {
  text: string;
  author: string;
  timestamp: string;
}

const NOTES_KEY = "chinasuuq_customer_notes";

export default function CustomersPage() {
  // useSearchParams() in a statically prerendered page must be inside a
  // Suspense boundary or the prerenderer bails this route to full CSR.
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-dark-900/[0.06] bg-white shadow-sm">
          <SkeletonTable />
        </div>
      }
    >
      <CustomersPageContent />
    </Suspense>
  );
}

function CustomersPageContent() {
  const { success, error: toastError } = useToast();

  const { values, set, reset, isFiltered } = useUrlFilters(FILTER_DEFAULTS);
  const tablePrefs = useTablePrefs("customers");
  // Only order writes change this roster (customer rows aggregate orders).
  const liveVersion = useLiveVersion(["orders"]);

  const [customers, setCustomers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters, all read from the URL
  const typeFilter = values.type;
  const cityFilter = values.city;
  const dateFrom = values.from;
  const dateTo = values.to;
  const [showFilters, setShowFilters] = useState(false);

  // The search box is drafted locally; the URL is written once typing stops.
  const commitSearch = useCallback((v: string) => set("q", v), [set]);
  const [search, setSearch] = useDebouncedFilterValue(values.q, commitSearch);
  const committedSearch = values.q;

  // Selection → Customer 360
  const [selected, setSelected] = useState<{
    id: string;
    name?: string;
    joinedAt?: string | null;
  } | null>(null);

  // Staff notes (this browser only — there is no notes table behind them)
  const [notes, setNotes] = useState<Record<string, CustomerNote[]>>({});
  const [newNote, setNewNote] = useState("");

  const uniqueCities = useMemo(() => {
    const cities = new Set<string>();
    customers.forEach((c) => {
      if (c.city) cities.add(c.city);
    });
    return Array.from(cities).sort();
  }, [customers]);

  /* ── Load ────────────────────────────────────────────────────── */

  const load = useCallback(async (s?: string) => {
    setIsLoading(true);
    setError(null);
    const res = await listCustomers({ search: s });
    if (res.ok) setCustomers(res.customers);
    else setError(res.error || "Failed to load customers");
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load(committedSearch);
  }, [committedSearch, load, liveVersion]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(NOTES_KEY);
      if (stored) setNotes(JSON.parse(stored));
    } catch {
      // Corrupt notes must not break the list.
    }
  }, []);

  /* ── Filtered (client-side refinements over the loaded page) ──── */

  const filtered = useMemo(() => {
    let result = customers;

    if (typeFilter !== "All") {
      result = result.filter((c) =>
        typeFilter === "Business"
          ? c.customer_type === "business"
          : c.customer_type !== "business"
      );
    }
    if (cityFilter) result = result.filter((c) => c.city === cityFilter);
    if (dateFrom) result = result.filter((c) => c.created_at && c.created_at.slice(0, 10) >= dateFrom);
    if (dateTo) result = result.filter((c) => c.created_at && c.created_at.slice(0, 10) <= dateTo);

    return result;
  }, [customers, typeFilter, cityFilter, dateFrom, dateTo]);

  /* ── Headline figures ────────────────────────────────────────── */

  const kpis = useMemo(
    () => ({
      loaded: customers.length,
      capped: customers.length >= LOAD_CAP,
      business: customers.filter((c) => c.customer_type === "business").length,
      individual: customers.filter((c) => c.customer_type !== "business").length,
      totalSpent: customers.reduce((s, c) => s + (Number(c.total_spent) || 0), 0),
      withOrders: customers.filter((c) => (Number(c.total_orders) || 0) > 0).length,
      topCities: (() => {
        const map: Record<string, number> = {};
        customers.forEach((c) => {
          if (c.city) map[c.city] = (map[c.city] || 0) + 1;
        });
        return Object.entries(map)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);
      })(),
    }),
    [customers]
  );

  /* ── Notes ───────────────────────────────────────────────────── */

  const saveNotes = useCallback(
    (customerId: string, updated: CustomerNote[]) => {
      const next = { ...notes, [customerId]: updated };
      setNotes(next);
      try {
        localStorage.setItem(NOTES_KEY, JSON.stringify(next));
      } catch {
        toastError("Could not save the note in this browser");
      }
    },
    [notes, toastError]
  );

  const handleAddNote = () => {
    if (!selected || !newNote.trim()) return;
    const note: CustomerNote = {
      text: newNote.trim(),
      author: "Admin",
      timestamp: new Date().toISOString(),
    };
    saveNotes(selected.id, [note, ...(notes[selected.id] || [])]);
    setNewNote("");
    success("Note added");
  };

  const handleDeleteNote = (customerId: string, idx: number) => {
    saveNotes(customerId, (notes[customerId] || []).filter((_, i) => i !== idx));
  };

  const selectedNotes = selected ? notes[selected.id] || [] : [];

  /* ── Export ──────────────────────────────────────────────────── */

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
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    success(`Exported ${filtered.length} customers`);
  };

  const anyFilter = !!committedSearch || typeFilter !== "All" || !!cityFilter || !!dateFrom || !!dateTo;

  /* ── Render ──────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        subtitle="Everyone who buys through ChinaSuuq"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TableControls columns={CUSTOMER_COLUMNS} prefs={tablePrefs} />
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
            <button onClick={handleExportCSV} className="admin-btn-outline">
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        }
      />

      {/* ── Headline figures ──
          These describe the profiles THIS page loaded (the newest 500 of them),
          and the labels say so. The lifetime customer count is admin_kpis()
          → customers_total on the dashboard; repeating it here over a capped,
          filterable list would put two different "total customers" numbers in
          front of the operator. */}
      <PageGrid className="grid-cols-2 sm:grid-cols-4">
        <StatCard
          label={kpis.capped ? "Loaded (newest 500)" : "Loaded"}
          value={kpis.loaded}
          icon={Users}
          tone="brand"
          delay={0}
        />
        <StatCard label="Business" value={kpis.business} icon={Package} tone="violet" delay={1} />
        <StatCard label="Individual" value={kpis.individual} icon={UserIcon} tone="info" delay={2} />
        <StatCard
          label="Spent (loaded)"
          value={formatUSD(kpis.totalSpent)}
          icon={DollarSign}
          tone="success"
          delay={3}
        />
      </PageGrid>
      <p className="-mt-3 text-[11px] text-dark-900/40">
        {kpis.withOrders} of these {kpis.loaded} profiles have at least one recorded order.{" "}
        {kpis.capped
          ? "The list is capped at the newest 500 profiles, so counts and totals below cover those rows only."
          : "Counts and totals cover every loaded profile."}
      </p>

      {/* ── Top Cities ── */}
      {kpis.topCities.length > 0 && (
        <SectionCard title="Top Cities" subtitle="Where your customers are — tap to filter">
          <div className="flex flex-wrap gap-2">
            {kpis.topCities.map(([city, count]) => (
              <button
                key={city}
                onClick={() => set("city", cityFilter === city ? "" : city)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all",
                  cityFilter === city
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-dark-900/[0.06] bg-warm-100 text-dark-600 hover:border-brand-300"
                )}
              >
                <MapPin className="h-3 w-3" />
                {city}
                <span className="text-dark-900/40">({count})</span>
              </button>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ── Search + Filters ── */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name, email, phone, city…"
            className="flex-1 max-w-md"
          />
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
              showFilters || cityFilter || dateFrom || dateTo
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-dark-900/[0.06] bg-white text-dark-500 hover:bg-warm-100"
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
              <div className="flex flex-wrap items-end gap-4 rounded-xl border border-dark-900/[0.06] bg-white p-4 shadow-sm">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-dark-400">City</label>
                  <select
                    value={cityFilter}
                    onChange={(e) => set("city", e.target.value)}
                    className="h-9 rounded-lg border border-dark-900/10 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none"
                  >
                    <option value="">All cities</option>
                    {uniqueCities.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-dark-400">Registered After</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => set("from", e.target.value)}
                    className="h-9 rounded-lg border border-dark-900/10 px-3 text-sm focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-dark-400">Registered Before</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => set("to", e.target.value)}
                    className="h-9 rounded-lg border border-dark-900/10 px-3 text-sm focus:border-brand-500 focus:outline-none"
                  />
                </div>
                {(cityFilter || dateFrom || dateTo) && (
                  <button
                    onClick={() => {
                      set("city", "");
                      set("from", "");
                      set("to", "");
                    }}
                    className="rounded-lg bg-dark-50 px-3 py-1.5 text-xs font-medium text-dark-500 hover:bg-dark-100"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <FilterChips<string>
          options={TYPE_OPTIONS}
          value={typeFilter}
          onChange={(v) => set("type", v)}
        />
      </div>

      {/* ── Table ── */}
      <TableShell
        isLoading={isLoading}
        error={error}
        errorRetry={() => load(committedSearch)}
        hasData={filtered.length > 0}
        filtered={anyFilter}
        emptyImage={EMPTY_IMAGES.customers}
        emptyTitle="No customers yet"
        emptySubtitle="Customer profiles appear here after the first order."
      >
        <div className="overflow-hidden rounded-2xl border border-dark-900/[0.06] bg-white">
          <table
            className={cn(
              "admin-table min-w-full w-full",
              tablePrefs.className,
              tablePrefs.tableClassName
            )}
          >
            <thead>
              <tr>
                <th>Customer</th>
                {!tablePrefs.isHidden("contact") && <th>Contact</th>}
                {!tablePrefs.isHidden("city") && <th className="hidden md:table-cell">City</th>}
                {!tablePrefs.isHidden("tier") && <th>Tier</th>}
                {!tablePrefs.isHidden("orders") && <th className="hidden md:table-cell">Orders</th>}
                {!tablePrefs.isHidden("spent") && <th className="hidden md:table-cell">Spent</th>}
                {!tablePrefs.isHidden("joined") && <th className="hidden lg:table-cell">Joined</th>}
                {!tablePrefs.isHidden("notes") && (
                  <th className="hidden lg:table-cell">Notes</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-900/[0.04]">
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() =>
                    setSelected({
                      id: c.id,
                      name: c.full_name || c.email || undefined,
                      joinedAt: c.created_at || null,
                    })
                  }
                  className="cursor-pointer transition hover:bg-dark-50/30"
                >
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-sm font-semibold text-brand-600">
                        {(c.full_name || c.email || "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-dark-900">
                          {c.full_name || c.email || "—"}
                        </p>
                        {c.business_name ? (
                          <p className="truncate text-xs text-dark-900/45">{c.business_name}</p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  {!tablePrefs.isHidden("contact") && (
                    <td>
                      <p className="max-w-[180px] truncate text-dark-900/70">{c.email || "—"}</p>
                      <p className="text-xs text-dark-900/45">{c.phone || "—"}</p>
                    </td>
                  )}
                  {!tablePrefs.isHidden("city") && (
                    <td className="hidden text-xs text-dark-600 md:table-cell">
                      {c.city || "—"}
                    </td>
                  )}
                  {!tablePrefs.isHidden("tier") && (
                    <td>
                      {c.tier ? (
                        <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-bold uppercase text-warning">
                          {c.tier}
                        </span>
                      ) : (
                        <span className="text-xs text-dark-900/40">—</span>
                      )}
                    </td>
                  )}
                  {!tablePrefs.isHidden("orders") && (
                    <td className="hidden font-semibold md:table-cell">
                      {c.total_orders || 0}
                    </td>
                  )}
                  {!tablePrefs.isHidden("spent") && (
                    <td className="hidden font-semibold text-success md:table-cell">
                      {formatUSD(Number(c.total_spent) || 0)}
                    </td>
                  )}
                  {!tablePrefs.isHidden("joined") && (
                    <td className="hidden text-xs text-dark-900/50 lg:table-cell">
                      {c.created_at ? formatDate(c.created_at) : "—"}
                    </td>
                  )}
                  {!tablePrefs.isHidden("notes") && (
                    <td className="hidden lg:table-cell">
                      {(notes[c.id]?.length ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                          <MessageSquare className="h-3 w-3" />
                          {notes[c.id].length}
                        </span>
                      ) : (
                        <span className="text-xs text-dark-300">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableShell>

      {/* ── Customer 360 ── */}
      <AnimatePresence>
        {selected && (
          <Customer360Drawer
            customerId={selected.id}
            fallbackName={selected.name}
            onClose={() => setSelected(null)}
            footer={
              <div className="space-y-3 border-t border-dark-900/[0.06] pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-dark-900/40">
                  Staff notes
                </p>
                <p className="text-[11px] text-dark-900/40">
                  Saved in this browser only — there is no notes table in the database yet, so
                  these do not sync between devices or staff accounts.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddNote();
                    }}
                    placeholder="Add a note…"
                    className="admin-input flex-1 text-xs"
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={!newNote.trim()}
                    className="admin-btn-primary h-10 px-3"
                    aria-label="Save note"
                  >
                    <Save className="h-4 w-4" />
                  </button>
                </div>
                {selectedNotes.length === 0 ? (
                  <p className="text-xs italic text-dark-900/30">No notes yet</p>
                ) : (
                  <div className="max-h-40 space-y-2 overflow-y-auto">
                    {selectedNotes.map((note, idx) => (
                      <div key={idx} className="group relative rounded-lg bg-white px-3 py-2">
                        <p className="text-xs text-dark-700">{note.text}</p>
                        <p className="mt-1 text-[10px] text-dark-900/40">
                          {note.author} · {formatDateTime(note.timestamp)}
                        </p>
                        <button
                          onClick={() => handleDeleteNote(selected.id, idx)}
                          className="absolute right-2 top-2 rounded p-0.5 text-dark-300 opacity-0 transition-all hover:text-error group-hover:opacity-100"
                          aria-label="Delete note"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-dark-900/40">
                  <CalendarDays className="mr-1 inline h-3 w-3" />
                  Joined {selected.joinedAt ? formatDate(selected.joinedAt) : "—"}
                </p>
              </div>
            }
          />
        )}
      </AnimatePresence>
    </div>
  );
}
