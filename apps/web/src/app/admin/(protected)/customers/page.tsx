"use client";

import { useEffect, useState, useMemo } from "react";
import { cn, formatDate } from "@/lib/utils";
import { Search, Users, Loader2, AlertCircle, Mail, Phone, MapPin } from "lucide-react";
import { listCustomers } from "@/lib/admin/supabase-data";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

const statusFilters = ["All", "Individual", "Business"] as const;

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [selected, setSelected] = useState<any | null>(null);

  const load = async (s?: string) => {
    setIsLoading(true);
    setError(null);
    const res = await listCustomers({ search: s });
    if (res.ok) setCustomers(res.customers);
    else setError(res.error || "Failed to load customers");
    setIsLoading(false);
  };

  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filtered = useMemo(() => {
    if (statusFilter === "All") return customers;
    return customers.filter((c) =>
      statusFilter === "Business"
        ? c.customer_type === "business"
        : c.customer_type !== "business"
    );
  }, [customers, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-dark-900">Customers</h1>
          <p className="text-sm text-dark-900/50">All ChinaSuuq buyers</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-900/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, phone…"
            className="w-72 rounded-xl border border-dark-900/10 bg-white py-1.5 pl-9 pr-3 text-sm outline-none focus:border-brand-500"
          />
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {statusFilters.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition",
              statusFilter === s
                ? "border-brand-500 bg-brand-500 text-white"
                : "border-dark-900/10 bg-white text-dark-900/60 hover:border-brand-500/30"
            )}
          >
            {s}
          </button>
        ))}
        <span className="ml-auto text-xs text-dark-900/40">
          {filtered.length} {filtered.length === 1 ? "customer" : "customers"}
        </span>
      </div>

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
                <th className="px-4 py-3">Tier</th>
                <th className="hidden px-4 py-3 md:table-cell">Orders</th>
                <th className="hidden px-4 py-3 md:table-cell">Spent</th>
                <th className="hidden px-4 py-3 lg:table-cell">Joined</th>
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
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500/10 text-sm font-semibold text-brand-600">
                        {(c.full_name || c.email || "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-dark-900">
                          {c.full_name || c.email || "—"}
                        </p>
                        {c.business_name ? (
                          <p className="text-xs text-dark-900/45">{c.business_name}</p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <p className="text-dark-900/70">{c.email || "—"}</p>
                    <p className="text-xs text-dark-900/45">{c.phone || "—"}</p>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Customer detail drawer */}
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
                <div className="flex items-center gap-4 rounded-2xl bg-dark-50 p-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-lg font-bold text-white">
                    {(selected.full_name || selected.email || "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-base font-bold text-dark-900">
                      {selected.full_name || "—"}
                    </p>
                    {selected.business_name ? (
                      <p className="text-xs text-dark-900/60">{selected.business_name}</p>
                    ) : null}
                    {selected.tier ? (
                      <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                        {selected.tier}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="h-4 w-4 text-dark-900/40" />
                    <span className="text-dark-900/70">{selected.email || "—"}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 text-dark-900/40" />
                    <span className="text-dark-900/70">{selected.phone || "—"}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="h-4 w-4 text-dark-900/40" />
                    <span className="text-dark-900/70">{selected.city || "—"}</span>
                  </div>
                </div>

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

                <p className="text-xs text-dark-900/40">
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
