"use client";

/**
 * One pinned card on the shelf.
 *
 * The order arrows are the reliable reorder path; native HTML5 drag-and-drop is
 * layered on top (no library) via the `draggable` + onDrag* props the parent owns.
 * Everything a staff member needs to trust the pick — who, when, note, rank — is
 * on the card, and the "open in products" / "preview as customer" exits stay honest:
 * there is no per-product public page, so preview renders the customer card itself.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  GripVertical,
  ArrowUp,
  ArrowDown,
  Pencil,
  Save,
  X,
  PinOff,
  ExternalLink,
  Eye,
  Loader2,
  Store,
  Tag,
} from "lucide-react";
import type { CatalogProduct } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { TrendingThumb } from "./bits";
import { pickDisplayTitle, priceLabel, timeAgo, pinnerLabel } from "./helpers";

interface ShelfCardProps {
  product: CatalogProduct;
  index: number;
  count: number;
  disabled?: boolean;
  dragging?: boolean;
  dragOver?: boolean;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onUnpin: (id: string) => Promise<boolean>;
  onSaveNote: (id: string, note: string) => Promise<boolean>;
  onPreview: (product: CatalogProduct) => void;
  onDragStart: (index: number) => void;
  onDragEnter: (index: number) => void;
  onDragEnd: () => void;
}

export default function ShelfCard({
  product,
  index,
  count,
  disabled,
  dragging,
  dragOver,
  onMoveUp,
  onMoveDown,
  onUnpin,
  onSaveNote,
  onPreview,
  onDragStart,
  onDragEnter,
  onDragEnd,
}: ShelfCardProps) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(product.curation.note ?? "");
  const [busy, setBusy] = useState<null | "note" | "unpin">(null);

  // Re-sync the draft when a different product lands in this slot or after a save.
  useEffect(() => {
    setNoteDraft(product.curation.note ?? "");
  }, [product.id, product.curation.note]);

  const { text: price, approx } = priceLabel(product);
  const title = pickDisplayTitle(product, "en");
  const somali = (product.title_somali ?? "").trim();
  const rank = product.curation.rank ?? index + 1;
  const searchHref = `/admin/products?q=${encodeURIComponent(title)}`;

  const handleSaveNote = async () => {
    setBusy("note");
    const ok = await onSaveNote(product.id, noteDraft.trim());
    setBusy(null);
    if (ok) setEditingNote(false);
  };

  const handleUnpin = async () => {
    setBusy("unpin");
    await onUnpin(product.id);
    setBusy(null);
  };

  return (
    <div
      draggable={!disabled && !editingNote}
      onDragStart={() => onDragStart(index)}
      onDragEnter={() => onDragEnter(index)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDragEnd();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm transition-all",
        "border-dark-900/[0.06] dark:border-white/[0.08] dark:bg-dark-900",
        dragging && "opacity-40",
        dragOver && "border-brand-500 ring-2 ring-brand-500/30",
        !disabled && "cursor-grab active:cursor-grabbing"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Rank + grip */}
        <div className="flex shrink-0 flex-col items-center gap-1">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-xs font-bold text-white"
            title={`Position ${index + 1} on the customer shelf`}
          >
            {index + 1}
          </span>
          <GripVertical className="h-4 w-4 text-dark-900/25 dark:text-neutral-600" aria-hidden />
        </div>

        <TrendingThumb product={product} className="h-16 w-16" rounded="rounded-xl" alt={title} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-bold text-dark-900 dark:text-neutral-100" title={title}>
              {title}
            </p>
            <span className="shrink-0 text-sm font-bold tabular-nums text-dark-900 dark:text-neutral-100">
              {price}
              {approx && <span className="ml-1 align-middle text-[10px] font-medium text-dark-900/40">CNY</span>}
            </span>
          </div>

          {somali && somali !== title && (
            <p className="truncate text-xs text-dark-900/50 dark:text-neutral-400" title={somali} dir="rtl">
              {somali}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-dark-900/50 dark:text-neutral-400">
            <span className="inline-flex items-center gap-1">
              <Store className="h-3 w-3" />
              {product.marketplace || "unknown"}
            </span>
            {product.categoryName && (
              <span className="inline-flex items-center gap-1">
                <Tag className="h-3 w-3" />
                {product.categoryName}
              </span>
            )}
            <span className="text-dark-900/35 dark:text-neutral-600">Rank {rank}</span>
          </div>

          {product.curation.note && !editingNote && (
            <p className="mt-2 rounded-lg bg-warm-50 px-2.5 py-1.5 text-[11px] italic leading-relaxed text-dark-900/60 dark:bg-dark-800 dark:text-neutral-400">
              “{product.curation.note}”
            </p>
          )}

          <p className="mt-2 text-[11px] text-dark-900/45 dark:text-neutral-500">
            Pinned/updated by <span className="font-semibold text-dark-900/70 dark:text-neutral-300">{pinnerLabel(product.curation.pinned_by)}</span>
            {" · "}{timeAgo(product.curation.pinned_at)}
          </p>
        </div>
      </div>

      {editingNote ? (
        <div className="rounded-xl border border-brand-500/30 bg-brand-50/40 p-2.5 dark:bg-brand-500/5">
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={2}
            placeholder="Why is this pinned? (internal note — never shown to customers)"
            className="admin-input text-xs"
            autoFocus
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              onClick={() => {
                setEditingNote(false);
                setNoteDraft(product.curation.note ?? "");
              }}
              className="admin-btn-ghost h-8 px-2.5 text-xs"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
            <button
              onClick={handleSaveNote}
              disabled={busy === "note"}
              className="admin-btn-primary h-8 px-3 text-xs"
            >
              {busy === "note" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save note
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dark-900/[0.06] pt-3 dark:border-white/[0.06]">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onMoveUp(index)}
              disabled={disabled || index === 0}
              className="rounded-lg border border-dark-900/10 p-1.5 text-dark-900/55 transition-colors hover:border-brand-500/40 hover:text-brand-600 disabled:opacity-30 dark:border-white/10 dark:text-neutral-400"
              title="Move up (toward position 1)"
              aria-label="Move up"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onMoveDown(index)}
              disabled={disabled || index === count - 1}
              className="rounded-lg border border-dark-900/10 p-1.5 text-dark-900/55 transition-colors hover:border-brand-500/40 hover:text-brand-600 disabled:opacity-30 dark:border-white/10 dark:text-neutral-400"
              title="Move down"
              aria-label="Move down"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <Link
              href={searchHref}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-dark-900/55 transition-colors hover:bg-dark-50 hover:text-dark-900 dark:text-neutral-400 dark:hover:bg-white/5"
              title="Find this product in the Products screen"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Products
            </Link>
            <button
              onClick={() => onPreview(product)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-dark-900/55 transition-colors hover:bg-dark-50 hover:text-dark-900 dark:text-neutral-400 dark:hover:bg-white/5"
              title="Preview the customer home card for this pin"
            >
              <Eye className="h-3.5 w-3.5" /> Preview
            </button>
            <button
              onClick={() => {
                setEditingNote(true);
              }}
              disabled={disabled}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-dark-900/55 transition-colors hover:bg-dark-50 hover:text-dark-900 disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-white/5"
              title="Edit the internal note"
            >
              <Pencil className="h-3.5 w-3.5" /> Note
            </button>
            <button
              onClick={handleUnpin}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-error transition-colors hover:bg-error/10"
              title="Unpin — remove from the shelf"
            >
              {busy === "unpin" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PinOff className="h-3.5 w-3.5" />} Unpin
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
