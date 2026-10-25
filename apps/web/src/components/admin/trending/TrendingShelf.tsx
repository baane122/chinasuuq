"use client";

/**
 * The staff-picked shelf — the exact ordered list the customer home shows first.
 *
 * Reorder happens locally (arrows + native drag) so a staff member can arrange
 * the whole shelf before one write. "Save order" then persists every rank through
 * `reorderPinnedProducts`, which writes 1..n. If any single write fails the panel
 * lists the failed products instead of reporting a clean save — a partial save is
 * exactly the kind of silent lie this console was rebuilt to stop.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, Loader2, Plus, RotateCcw, Save, AlertTriangle, X } from "lucide-react";
import type { CatalogProduct } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/admin/ui";
import ShelfCard from "./ShelfCard";

interface TrendingShelfProps {
  items: CatalogProduct[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** Persists the new order. Resolves to the product ids whose write FAILED. */
  onPersist: (orderedIds: string[]) => Promise<string[]>;
  onUnpin: (id: string) => Promise<boolean>;
  onSaveNote: (id: string, note: string) => Promise<boolean>;
  onPreview: (product: CatalogProduct) => void;
  onAddPicks: () => void;
}

function sameOrder(a: CatalogProduct[], b: CatalogProduct[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i].id !== b[i].id) return false;
  return true;
}

export default function TrendingShelf({
  items,
  loading,
  error,
  onRetry,
  onPersist,
  onUnpin,
  onSaveNote,
  onPreview,
  onAddPicks,
}: TrendingShelfProps) {
  const [order, setOrder] = useState<CatalogProduct[]>(items);
  const [savedSnapshot, setSavedSnapshot] = useState<CatalogProduct[]>(items);
  const [saving, setSaving] = useState(false);
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const dragIndex = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  // When the persisted truth changes (after a save or an external pin/unpin),
  // re-sync the working copy — unless there are unsaved local moves to protect.
  useEffect(() => {
    if (sameOrder(savedSnapshot, items)) return; // external change only
    if (sameOrder(order, items)) return; // we already match
    setOrder(items);
    setSavedSnapshot(items);
    // Intentionally not resetting failedIds here — the operator dismisses those.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const dirty = !sameOrder(order, savedSnapshot);

  const failedProducts = useMemo(
    () => order.filter((p) => failedIds.includes(p.id)),
    [order, failedIds]
  );

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    setOrder((prev) => {
      const next = prev.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const handleDragStart = (index: number) => {
    dragIndex.current = index;
  };
  const handleDragEnter = (index: number) => {
    if (dragIndex.current === null || dragIndex.current === index) return;
    setDragOver(index);
    move(dragIndex.current, index);
    dragIndex.current = index;
  };
  const handleDragEnd = () => {
    dragIndex.current = null;
    setDragOver(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setFailedIds([]);
    try {
      const failed = await onPersist(order.map((p) => p.id));
      if (failed.length === 0) {
        setSavedSnapshot(order); // now the truth
      } else {
        setFailedIds(failed);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading && items.length === 0) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-32" />
        ))}
      </div>
    );
  }

  if (error && items.length === 0) {
    return <ErrorState message={error} onRetry={onRetry} />;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dark-900/[0.06] bg-white dark:border-white/[0.08] dark:bg-dark-900">
        <EmptyState
          image="/admin/empty_products.webp"
          title="No staff picks on the shelf yet"
          subtitle="The customer home will fall back to marketplace best sellers (1688/Taobao sales counts) — your own engagement data and human picks do not appear until a pin exists here."
          action={
            <button onClick={onAddPicks} className="admin-btn-primary">
              <Plus className="h-4 w-4" /> Pick products to feature
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      {/* Save bar — sticky so ordering stays reachable on a long shelf */}
      <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dark-900/[0.06] bg-warm-50/90 px-4 py-2.5 backdrop-blur dark:border-white/[0.08] dark:bg-dark-800/80">
        <p className="flex items-center gap-2 text-xs text-dark-900/55 dark:text-neutral-400">
          <ArrowUpDown className="h-3.5 w-3.5" />
          {order.length} pin{order.length === 1 ? "" : "s"} in this exact order · drag a card or use the
          arrows
          {dirty && <span className="font-semibold text-brand-600 dark:text-brand-400">· unsaved changes</span>}
        </p>
        <div className="flex items-center gap-2">
          {dirty && (
            <button onClick={() => { setOrder(savedSnapshot); setDragOver(null); }} className="admin-btn-ghost h-8 px-2.5 text-xs">
              <RotateCcw className="h-3.5 w-3.5" /> Discard
            </button>
          )}
          <button onClick={handleSave} disabled={!dirty || saving} className="admin-btn-primary h-8 px-3 text-xs">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? "Saving…" : "Save order"}
          </button>
        </div>
      </div>

      {failedProducts.length > 0 && (
        <div className="mb-4 rounded-xl border border-error/30 bg-error/5 p-4 text-sm text-error">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">
                {failedProducts.length} of {order.length} positions could not be saved. The shelf was only
                partially updated — the products below kept their old rank:
              </p>
              <ul className="mt-1.5 space-y-0.5 text-[13px]">
                {failedProducts.map((p) => (
                  <li key={p.id} className="truncate">
                    • {p.title_english || p.title_somali || p.id.slice(0, 8)}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-dark-900/50 dark:text-neutral-400">
                Retry “Save order”, or check your connection. Until it succeeds, the customer shelf does not
                match what you arranged here.
              </p>
            </div>
            <button onClick={() => setFailedIds([])} className="rounded p-1 hover:bg-error/10" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className={cn("grid gap-3", dirty && "ring-1 ring-brand-500/20 rounded-2xl p-0.5")}>
        <div className="grid gap-3 sm:grid-cols-2">
          {order.map((product, i) => (
            <ShelfCard
              key={product.id}
              product={product}
              index={i}
              count={order.length}
              disabled={saving}
              dragging={dragIndex.current === i}
              dragOver={dragOver === i}
              onMoveUp={(idx) => move(idx, idx - 1)}
              onMoveDown={(idx) => move(idx, idx + 1)}
              onUnpin={onUnpin}
              onSaveNote={onSaveNote}
              onPreview={onPreview}
              onDragStart={handleDragStart}
              onDragEnter={handleDragEnter}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
