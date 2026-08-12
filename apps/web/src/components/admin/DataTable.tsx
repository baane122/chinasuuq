"use client";
import { useState, useMemo, useCallback, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Download, ChevronDown, ChevronUp, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T, index: number) => ReactNode;
  className?: string;
  sortable?: boolean;
  hideOnMobile?: boolean;
}

export function DataTable<T extends { id: string }>({
  columns, data, searchKeys, onRowClick, actions, emptyMessage = "No data found",
}: {
  columns: Column<T>[];
  data: T[];
  searchKeys?: string[];
  onRowClick?: (row: T) => void;
  actions?: ReactNode;
  emptyMessage?: string;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  const filtered = useMemo(() => {
    let rows = data;
    if (search && searchKeys?.length) {
      const q = search.toLowerCase();
      rows = rows.filter((row) =>
        searchKeys.some((k) => {
          const val = (row as Record<string, unknown>)[k];
          return typeof val === "string" && val.toLowerCase().includes(q);
        })
      );
    }
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const av = (a as Record<string, unknown>)[sortKey];
        const bv = (b as Record<string, unknown>)[sortKey];
        const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [data, search, searchKeys, sortKey, sortDir]);

  const handleExport = useCallback(() => {
    const header = columns.filter((c) => c.sortable !== false).map((c) => c.label).join(",");
    const rows = filtered.map((row) =>
      columns.filter((c) => c.sortable !== false).map((c) => {
        const val = (row as Record<string, unknown>)[c.key];
        return typeof val === "string" ? `"${val.replace(/"/g, '""')}"` : String(val ?? "");
      }).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, columns]);

  return (
    <div className="rounded-2xl border border-dark-900/5 bg-white shadow-sm">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b border-dark-900/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-900/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="h-10 w-full rounded-xl border border-dark-900/10 bg-dark-50 pl-9 pr-3 text-sm placeholder:text-dark-900/30 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <button onClick={handleExport} className="inline-flex h-10 items-center gap-2 rounded-xl border border-dark-900/10 bg-white px-3 text-sm font-medium text-dark-900/70 transition hover:bg-dark-50 hover:text-dark-900">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-dark-900/5 bg-dark-50/50 text-xs font-semibold uppercase tracking-wider text-dark-900/40">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                  className={cn(
                    "px-4 py-3",
                    col.sortable !== false && "cursor-pointer select-none hover:text-dark-900/60",
                    col.className,
                    col.hideOnMobile && "hidden lg:table-cell"
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key && (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-900/5">
            <AnimatePresence>
              {filtered.map((row, i) => (
                <motion.tr
                  key={row.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.015, 0.3) }}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    "transition hover:bg-dark-50/50",
                    onRowClick && "cursor-pointer"
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={cn("px-4 py-3 text-dark-900", col.className, col.hideOnMobile && "hidden lg:table-cell")}>
                      {col.render ? col.render(row, i) : String((row as Record<string, unknown>)[col.key] ?? "")}
                    </td>
                  ))}
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* Footer */}
      {filtered.length === 0 && (
        <div className="py-12 text-center text-sm text-dark-900/40">{emptyMessage}</div>
      )}
      {filtered.length > 0 && (
        <div className="border-t border-dark-900/5 px-4 py-2 text-xs text-dark-900/40">
          Showing {filtered.length} of {data.length} records
        </div>
      )}
    </div>
  );
}
