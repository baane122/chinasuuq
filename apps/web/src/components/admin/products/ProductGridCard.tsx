"use client";

/**
 * Mission Control grid card for one catalog product.
 *
 * WHY A COMPONENT: the grid view rendered its card inline in a 90-line block of
 * the products page, so every visual change meant editing the page that also
 * owns fetching, filtering and writes. This card is presentational only — it
 * receives a product and callbacks, and decides nothing about data.
 *
 * WHAT A STAFF MEMBER NEEDS FROM A CARD (and what was missing before):
 *   · a big enough photo to judge the product (was 64px, now a 4:3 cover);
 *   · the price they will actually charge, with the USD labelled for what it is
 *     (stored estimate vs converted at today's rate — never a silent derivation);
 *   · stock and lifecycle at a glance, plus the MOQ when the row states one;
 *   · which marketplace it came from and when it was last touched;
 *   · honest missing-data states: no photo is an icon, not a grey box pretending
 *     to be loading.
 */

import { memo } from "react";
import {
  AlertTriangle,
  CheckSquare,
  ExternalLink,
  ImageOff,
  Package,
  Pin,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CatalogProduct } from "@/lib/catalog";
import { formatNumber, timeAgo } from "@/components/admin/trending/helpers";

export interface ProductGridCardProps {
  product: CatalogProduct;
  selected: boolean;
  canEdit: boolean;
  /** "12.40 CNY · $1.86 converted" — built by the page so both cards agree. */
  priceCny: string;
  priceUsd: string | null;
  usdKind: "stored" | "converted" | null;
  marketplaceTint: string;
  marketplaceLabel: string;
  onToggleSelect: () => void;
  onOpen: () => void;
  /** Row actions, rendered by the page (edit / duplicate / status / delete). */
  actions: React.ReactNode;
}

const STOCK_TONE: Record<string, string> = {
  in_stock: "bg-success/10 text-success border-success/25",
  low_stock: "bg-warning/10 text-warning border-warning/30",
  out_of_stock: "bg-error/10 text-error border-error/25",
};

const STATUS_TONE: Record<string, string> = {
  active: "bg-success/10 text-success border-success/25",
  draft: "bg-info/10 text-info border-info/25",
  archived: "bg-dark-900/5 text-dark-900/50 border-dark-900/15 dark:bg-white/10 dark:text-neutral-500 dark:border-white/10",
};

export const ProductGridCard = memo(function ProductGridCard({
  product: p,
  selected,
  canEdit,
  priceCny,
  priceUsd,
  usdKind,
  marketplaceTint,
  marketplaceLabel,
  onToggleSelect,
  onOpen,
  actions,
}: ProductGridCardProps) {
  const cover = p.primaryImage;
  const missingPhoto = !cover;
  const missingPrice = p.priceCnyMin === null || p.priceCnyMin <= 0;
  const moq = typeof p.moq === "number" && p.moq > 0 ? p.moq : null;

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:bg-dark-900",
        selected
          ? "border-brand-500/60 ring-2 ring-brand-500/20"
          : "border-dark-900/[0.07] shadow-sm dark:border-white/[0.08]"
      )}
    >
      {/* Photo — 4:3 cover, with the overlays a buyer decision needs. */}
      <button
        type="button"
        onClick={onOpen}
        className="relative block aspect-[4/3] w-full overflow-hidden bg-warm-100 text-left dark:bg-dark-800"
        aria-label={`Open ${p.title}`}
      >
        {missingPhoto ? (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-dark-900/25 dark:text-neutral-600">
            <ImageOff className="h-7 w-7" />
            <span className="text-[10px] font-medium">No photo</span>
          </span>
        ) : (

          <img
            src={cover}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        )}

        {/* Top-left: marketplace */}
        <span
          className={cn(
            "absolute left-2 top-2 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide backdrop-blur-sm",
            marketplaceTint
          )}
        >
          {marketplaceLabel}
        </span>

        {/* Top-right: staff pick */}
        {p.curation.featured && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
            <Pin className="h-2.5 w-2.5" /> Pick
          </span>
        )}

        {/* Bottom row: warnings that stop a listing from selling. */}
        {(missingPrice || p.images.length === 0) && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            <AlertTriangle className="h-2.5 w-2.5 text-amber-300" />
            {missingPrice ? "No price" : "No photos"}
          </span>
        )}

        {p.images.length > 1 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            {p.images.length}
          </span>
        )}
      </button>

      {/* Selection checkbox — only when the caller may write. */}
      {canEdit && (
        <button
          type="button"
          onClick={onToggleSelect}
          className="absolute left-2 top-11 rounded-lg bg-white/85 p-1 text-dark-900/50 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 focus:opacity-100 dark:bg-dark-900/80 dark:text-neutral-300"
          aria-label={selected ? `Deselect ${p.title}` : `Select ${p.title}`}
          aria-pressed={selected}
        >
          {selected ? <CheckSquare className="h-4 w-4 text-brand-500" /> : <Square className="h-4 w-4" />}
        </button>
      )}

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <button type="button" onClick={onOpen} className="text-left">
          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-dark-900 dark:text-neutral-100">
            {p.title || p.title_english || "Untitled"}
          </p>
        </button>

        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold text-dark-900 dark:text-neutral-100">{priceCny}</p>
            {priceUsd && (
              <p className="truncate text-[10px] text-dark-900/45 dark:text-neutral-500">
                {priceUsd}{" "}
                <span className="font-medium">{usdKind === "stored" ? "est." : "converted"}</span>
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span
              className={cn(
                "rounded-full border px-1.5 py-px text-[10px] font-semibold capitalize",
                STOCK_TONE[p.stock_status ?? ""] ?? "border-dark-900/10 bg-dark-50 text-dark-900/55 dark:bg-white/5 dark:text-neutral-400"
              )}
            >
              {(p.stock_status ?? "unknown").replace(/_/g, " ")}
            </span>
            <span
              className={cn(
                "rounded-full border px-1.5 py-px text-[10px] font-semibold capitalize",
                STATUS_TONE[p.status ?? ""] ?? "border-dark-900/10 bg-dark-50 text-dark-900/55 dark:bg-white/5 dark:text-neutral-400"
              )}
            >
              {p.status ?? "unknown"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-dark-900/45 dark:text-neutral-500">
          <span className="inline-flex items-center gap-1 rounded-full bg-dark-50 px-1.5 py-0.5 dark:bg-white/5">
            <Package className="h-2.5 w-2.5" />
            {p.categoryName ?? "uncategorised"}
          </span>
          {moq !== null && <span className="rounded-full bg-dark-50 px-1.5 py-0.5 dark:bg-white/5">MOQ {formatNumber(moq)}</span>}
          {(p.sales_count ?? 0) > 0 && (
            <span className="rounded-full bg-dark-50 px-1.5 py-0.5 dark:bg-white/5">
              {formatNumber(p.sales_count ?? 0)} sold
            </span>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between gap-1 border-t border-dark-900/[0.05] pt-2 dark:border-white/[0.06]">
          <span className="truncate text-[10px] text-dark-900/40 dark:text-neutral-500">
            {p.updated_at ? `Updated ${timeAgo(p.updated_at)}` : "Never updated"}
          </span>
          <div className="flex shrink-0 items-center gap-0.5">
            {p.source_url && (
              <a
                href={p.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-dark-900/40 transition-colors hover:bg-dark-900/5 hover:text-dark-900 dark:text-neutral-500 dark:hover:bg-white/10"
                title="Open the source listing"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
});
