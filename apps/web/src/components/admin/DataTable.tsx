"use client";
import { useState, useMemo, useCallback, useEffect, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Download,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Density } from "@/components/admin/useTablePrefs";

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T, index: number) => ReactNode;
  className?: string;
  sortable?: boolean;
  hideOnMobile?: boolean;
  /** true = never offered for hiding (e.g. the row's identifying column). */
  fixed?: boolean;
}

/* Client-side page sizes. 25 keeps a screenful; 100 suits bulk review/ops days. */
const PAGE_SIZES = [25, 50, 100] as const;

export function DataTable<T extends { id: string }>({
  columns, data, searchKeys, onRowClick, actions, emptyMessage = "No data found",
  search, onSearchChange, density = "comfortable", hiddenKeys, toolbar, exportRows,
}: {
  columns: Column<T>[];
  data: T[];
  searchKeys?: string[];
  onRowClick?: (row: T) => void;
  actions?: ReactNode;
  emptyMessage?: string;
  /** Controlled search: pass both to keep the query in the URL. Omit them and
   *  the table keeps its own local search exactly as it did before. */
  search?: string;
  onSearchChange?: (value: string) => void;
  density?: Density;
  hiddenKeys?: Set<string>;
  /** Rendered in the toolbar next to the search box (density/column controls). */
  toolbar?: ReactNode;
  /** Override what Export writes (e.g. the page's richer CSV shape). */
  exportRows?: () => void;
}) {
  const [internalSearch, setInternalSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);

  const controlled = onSearchChange !== undefined;
  const searchValue = controlled ? (search ?? "") : internalSearch;
  const setSearchValue = controlled ? onSearchChange! : setInternalSearch;

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

  const visibleColumns = useMemo(
    () => (hiddenKeys ? columns.filter((c) => c.fixed || !hiddenKeys.has(c.key)) : columns),
    [columns, hiddenKeys]
  );

  const filtered = useMemo(() => {
    let rows = data;
    if (searchValue && searchKeys?.length) {
      const q = searchValue.toLowerCase();
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
  }, [data, searchValue, searchKeys, sortKey, sortDir]);

  /* ─── Pagination ───────────────────────────────────────────────
   * Purely client-side: it slices `filtered` so sorting, column prefs and the
   * URL-controlled search all keep working untouched. Export below still writes
   * the FULL filtered set (not just this page). */
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Reset to the first page whenever the result set changes shape, and clamp if
  // a shrink (filter edit / page-size bump) left `page` out of range.
  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages, searchValue, sortKey, sortDir, pageSize]);

  const start = (page - 1) * pageSize;
  const paged = useMemo(
    () => filtered.slice(start, start + pageSize),
    [filtered, start, pageSize]
  );
  const rangeStart = total === 0 ? 0 : start + 1;
  const rangeEnd = Math.min(start + pageSize, total);

  const handleExport = useCallback(() => {
    if (exportRows) return exportRows();
    const header = visibleColumns.filter((c) => c.sortable !== false).map((c) => c.label).join(",");
    const rows = filtered.map((row) =>
      visibleColumns.filter((c) => c.sortable !== false).map((c) => {
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
  }, [filtered, visibleColumns, exportRows]);

  const pad = density === "compact" ? "px-3 py-1.5" : "px-4 py-3";

  return (
    <div className="rounded-2xl border border-dark-900/5 bg-white shadow-sm dark:border-white/[0.08] dark:bg-dark-900">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b border-dark-900/5 p-4 dark:border-white/[0.08] sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-900/30 dark:text-neutral-500" />
          <input
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Search..."
            className="h-10 w-full rounded-xl border border-dark-900/10 bg-dark-50 pl-9 pr-3 text-sm text-dark-900 placeholder:text-dark-900/30 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-dark-950 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {toolbar}
          {actions}
          <button onClick={handleExport} className="inline-flex h-10 items-center gap-2 rounded-xl border border-dark-900/10 bg-white px-3 text-sm font-medium text-dark-900/70 transition hover:bg-dark-50 hover:text-dark-900 dark:border-white/10 dark:bg-dark-900 dark:text-neutral-300 dark:hover:bg-white/5 dark:hover:text-neutral-100">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className={cn("w-full text-left text-sm", density === "compact" && "text-[13px]")}>
          <thead>
            <tr className="border-b border-dark-900/5 bg-dark-50/50 text-xs font-semibold uppercase tracking-wider text-dark-900/40 dark:border-white/[0.08] dark:bg-dark-950/40 dark:text-neutral-500">
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                  className={cn(
                    pad,
                    col.sortable !== false && "cursor-pointer select-none hover:text-dark-900/60 dark:hover:text-neutral-300",
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
          <tbody className="divide-y divide-dark-900/5 dark:divide-white/[0.08]">
            <AnimatePresence>
              {paged.map((row, i) => (
                <motion.tr
                  key={row.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.015, 0.3) }}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    "transition hover:bg-dark-50/50 dark:hover:bg-white/5",
                    onRowClick && "cursor-pointer"
                  )}
                >
                  {visibleColumns.map((col) => (
                    <td key={col.key} className={cn(pad, "text-dark-900 dark:text-neutral-100", col.className, col.hideOnMobile && "hidden lg:table-cell")}>
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
      {total === 0 && (
        <div className="py-12 text-center text-sm text-dark-900/40 dark:text-neutral-500">{emptyMessage}</div>
      )}
      {total > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 border-t border-dark-900/5 px-4 py-3 text-xs text-dark-900/50 dark:border-white/[0.08] dark:text-neutral-400 sm:flex-row">
          <div className="flex items-center gap-3">
            <span className="tabular-nums">
              Showing {rangeStart}–{rangeEnd} of {total}
            </span>
            <label className="flex items-center gap-1.5">
              <span className="hidden sm:inline">Rows</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="h-7 rounded-lg border border-dark-900/10 bg-white px-1.5 text-xs font-medium text-dark-900/70 focus:border-brand-500 focus:outline-none dark:border-white/10 dark:bg-dark-950 dark:text-neutral-300"
                aria-label="Rows per page"
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex h-7 items-center gap-0.5 rounded-lg border border-dark-900/10 px-2 font-medium transition hover:bg-dark-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <span className="px-2 tabular-nums">
                Page {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex h-7 items-center gap-0.5 rounded-lg border border-dark-900/10 px-2 font-medium transition hover:bg-dark-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5"
                aria-label="Next page"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
