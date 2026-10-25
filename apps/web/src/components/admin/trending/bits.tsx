"use client";

/**
 * Small presentational atoms shared by every Trending panel so the shelf, the
 * picker, the leaderboard and the publish preview all speak with one voice.
 * No fetch logic lives here — these are pure.
 */

import { PackageOpen, Info } from "lucide-react";
import type { CatalogProduct, TrendingSource } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { SOURCE_META, bestImage } from "./helpers";

/** Product photo with an honest no-image placeholder (14/15 rows ship `images: []`). */
export function TrendingThumb({
  product,
  className,
  rounded = "rounded-xl",
  alt,
}: {
  product: CatalogProduct;
  className?: string;
  rounded?: string;
  alt?: string;
}) {
  const src = bestImage(product);
  const label = alt || product.title || "Product";
  if (!src) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center bg-warm-100 ring-1 ring-dark-900/[0.06] dark:bg-dark-800",
          rounded,
          className
        )}
        aria-label={`${label} — no image stored`}
      >
        <PackageOpen className="h-5 w-5 text-dark-900/25 dark:text-neutral-600" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={label}
      loading="lazy"
      decoding="async"
      className={cn("shrink-0 object-cover ring-1 ring-dark-900/[0.06]", rounded, className)}
    />
  );
}

/** Why a card is on the shelf. Copy is deliberately different per source. */
export function SourceBadge({ source, className }: { source: TrendingSource; className?: string }) {
  const meta = SOURCE_META[source];
  return (
    <span
      title={meta.title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        meta.badge,
        className
      )}
    >
      {meta.label}
    </span>
  );
}

/** One-line reminder of the real scoring formula, from the migration. */
export function ScoreLegend({ text, className }: { text: string; className?: string }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-xl border border-dark-900/[0.06] bg-warm-50 px-3 py-2 text-[11px] leading-relaxed text-dark-900/55 dark:border-white/[0.06] dark:bg-dark-800/60 dark:text-neutral-400",
        className
      )}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" />
      <span>{text}</span>
    </p>
  );
}
