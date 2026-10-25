"use client";

/**
 * Pin picker — search the LIVE catalogue and drop products onto the shelf.
 *
 * The search filters run in Postgres through `fetchCatalogProducts` (status is
 * pinned to `active` so you can never feature something the customer home would
 * hide), not by slicing a big loaded page. Already-pinned products show their rank
 * and cannot be silently re-added — re-pinning a card that is already on the shelf
 * would just reshuffle it behind your back.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pin, Search, X, CheckCircle2 } from "lucide-react";
import {
  fetchCatalogProducts,
  fetchCategories,
  type CatalogProduct,
  type CategoryRow,
} from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, SearchInput, SkeletonBlock } from "@/components/admin/ui";
import { TrendingThumb } from "./bits";
import { MARKETPLACE_OPTIONS, pickDisplayTitle, priceLabel } from "./helpers";

const PAGE_SIZE = 24;

interface PinPickerProps {
  open: boolean;
  onClose: () => void;
  /** id -> rank for every product already on the shelf. */
  pinnedRank: Map<string, number>;
  /** Pin one product. Resolves true on a clean write. */
  onPin: (product: CatalogProduct) => Promise<boolean>;
}

export default function PinPicker({ open, onClose, pinnedRank, onPin }: PinPickerProps) {
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [marketplace, setMarketplace] = useState<string>("");
  const [categories, setCategories] = useState<CategoryRow[]>([]);

  const [results, setResults] = useState<CatalogProduct[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [capped, setCapped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Debounce the search box so typing does not fire a Postgres query per keypress.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(draft.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [draft]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetchCategories({ includeInactive: false }).then((res) => {
      if (alive && res.ok) setCategories(res.data);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  const run = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError(null);
    const res = await fetchCatalogProducts({
      search: search || null,
      categoryId: categoryId || null,
      marketplace: marketplace || null,
      page,
      pageSize: PAGE_SIZE,
      sort: "newest",
    });
    if (!res.ok) {
      setError(res.reason);
      setResults([]);
      setLoading(false);
      return;
    }
    // Accumulate pages so "Load more" grows the grid without dropping what you scrolled past.
    setResults((prev) => (page === 1 ? res.data.products : [...prev, ...res.data.products]));
    setTotal(res.data.total);
    setCapped(res.data.capped);
    setLoading(false);
  }, [open, search, categoryId, marketplace, page]);

  useEffect(() => {
    void run();
  }, [run]);

  const handlePin = async (product: CatalogProduct) => {
    setPendingId(product.id);
    await onPin(product);
    setPendingId(null);
  };

  if (!open) return null;

  const shown = results.length;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-dark-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-warm-50 shadow-2xl dark:bg-dark-950"
        role="dialog"
        aria-modal="true"
        aria-label="Add products to trending"
      >
        <div className="flex items-start justify-between border-b border-dark-900/[0.06] bg-white px-6 py-4 dark:border-white/[0.08] dark:bg-dark-900">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-dark-900 dark:text-neutral-100">Add to trending</h2>
            <p className="mt-0.5 text-xs text-dark-900/45 dark:text-neutral-400">
              Search the live, active catalogue. New pins join the bottom of the shelf until you reorder.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-dark-900/40 transition-colors hover:bg-dark-900/5 hover:text-dark-900 dark:text-neutral-500 dark:hover:bg-white/5"
            aria-label="Close pin picker"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 border-b border-dark-900/[0.06] bg-white px-6 py-3 dark:border-white/[0.08] dark:bg-dark-900">
          <SearchInput value={draft} onChange={setDraft} placeholder="Search products by name or category…" />
          <div className="flex flex-wrap gap-2">
            <select
              value={marketplace}
              onChange={(e) => {
                setMarketplace(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-xl border border-dark-900/10 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none dark:border-white/10 dark:bg-dark-800 dark:text-neutral-200"
            >
              <option value="">All marketplaces</option>
              {MARKETPLACE_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setPage(1);
              }}
              className="h-9 max-w-[220px] rounded-xl border border-dark-900/10 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none dark:border-white/10 dark:bg-dark-800 dark:text-neutral-200"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name_en || c.name_so || c.slug || c.id.slice(0, 8)}
                </option>
              ))}
            </select>
            <span className="ml-auto self-center text-xs text-dark-900/45 dark:text-neutral-500">
              {total > 0 ? `${total} match${total === 1 ? "" : "es"}` : ""}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && shown === 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonBlock key={i} className="h-44" />
              ))}
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={() => void run()} />
          ) : shown === 0 ? (
            <EmptyState
              image="/admin/empty_products.webp"
              compact
              title="No active products match"
              subtitle="Try a different search, marketplace or category. Draft and archived listings are never shown here because customers could not buy them."
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {results.map((product) => {
                const rank = pinnedRank.get(product.id);
                const already = rank !== undefined;
                const { text: price } = priceLabel(product);
                const title = pickDisplayTitle(product, "en");
                return (
                  <div
                    key={product.id}
                    className="flex flex-col overflow-hidden rounded-2xl border border-dark-900/[0.06] bg-white shadow-sm transition-shadow hover:shadow-md dark:border-white/[0.08] dark:bg-dark-900"
                  >
                    <TrendingThumb product={product} className="h-28 w-full" rounded="rounded-none" alt={title} />
                    <div className="flex flex-1 flex-col gap-2 p-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-xs font-semibold text-dark-900 dark:text-neutral-100" title={title}>
                          {title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-dark-900/45 dark:text-neutral-500">
                          {product.marketplace || "unknown"} · {price}
                        </p>
                      </div>
                      <div className="mt-auto">
                        {already ? (
                          <span className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-success/10 px-2 py-1.5 text-[11px] font-semibold text-success">
                            <CheckCircle2 className="h-3.5 w-3.5" /> On shelf · #{rank}
                          </span>
                        ) : (
                          <button
                            onClick={() => handlePin(product)}
                            disabled={pendingId === product.id}
                            className="admin-btn-primary h-8 w-full text-[11px]"
                            title="Pin to trending"
                          >
                            {pendingId === product.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Pin className="h-3.5 w-3.5" />
                            )}
                            Pin to trending
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && !error && shown < total && (
            <button
              onClick={() => setPage((p) => p + 1)}
              className="admin-btn-outline mx-auto mt-4 flex"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Load more
            </button>
          )}

          {capped && (
            <p className={cn("mt-4 text-center text-[11px] text-dark-900/45 dark:text-neutral-500")}>
              More products exist than this page shows — refine the search to narrow the list.
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
