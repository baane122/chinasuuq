"use client";

/**
 * The one product card every customer surface renders.
 *
 * Before this file existed, `TrendingProducts.tsx` hand-rolled its own card: it
 * printed `price_usd.toFixed(2)` straight from the row (ignoring `lib/fx.ts`, the
 * project's single source of exchange-rate truth), showed a single hotlink with no
 * load/error handling (broken-image icons on every expired 1688 URL), never said
 * which language its title was in, and claimed a flame count for products a staff
 * member had pinned. Everything the shop shows — home browse, the trending shelf,
 * `/catalog`, `/product` related items — goes through this component now, so those
 * mistakes cannot be re-introduced one surface at a time.
 */

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { Layers, PackageOpen, Flame, Star, Ban, BadgeCheck, MessageCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { pickTitle, recordProductEvent, type CatalogProduct } from "@/lib/catalog";
import { formatUsd, usdFromCny, useFx, type FxRates } from "@/lib/fx";
import { getMarketplace } from "@/lib/marketplaces";
import { waLink } from "@/lib/whatsapp";

/**
 * THE WEBSITE IS NOT THE SHOP (decided 2026-10-16). Browsing, carts and product
 * pages live in the mobile app; this site introduces the goods and hands the
 * customer to a human or the app. A card therefore has no `/product` route to
 * point at, and must not pretend it does — the whole card opens a WhatsApp
 * enquiry that already names the product.
 */
export function enquiryLink(product: CatalogProduct, title: string): string {
  const lines = [
    `Hello ChinaSuuq, I am interested in: ${title}`,
    product.priceCnyMin !== null ? `Listing price: ¥${product.priceCnyMin}${product.priceCnyMax && product.priceCnyMax !== product.priceCnyMin ? `–${product.priceCnyMax}` : ""} CNY` : null,
    product.marketplace ? `Source: ${product.marketplace}` : null,
    product.source_url ? product.source_url : null,
  ].filter(Boolean);
  return waLink(lines.join("\n"));
}

/**
 * The price a customer sees, always stated as what it is.
 *
 * `price_usd_estimated` is a stored guess (the column says "estimated"), and a
 * CNY-only row has no USD at all until we convert it with the live rate. Those
 * two cases get different qualifiers; a rate we could not read from a live row
 * gets a third, because `fx.ts` is explicit that a default rate is display-only
 * and must never be presented as a billable number.
 */
export interface PriceDisplay {
  /** USD to show, or null when the row carries no number at all. */
  usd: number | null;
  /** How the USD was obtained: stored estimate, converted from CNY, or neither. */
  basis: "stored_estimate" | "converted_from_cny" | "none";
  /** False when `basis` is a conversion but fx fell back to the offline default. */
  rateIsLive: boolean;
  cnyMin: number | null;
  cnyMax: number | null;
  /** A CNY range is a real marketplace fact; the USD of it is a single number. */
  hasCnyRange: boolean;
}

export function productPrice(product: CatalogProduct, fx: FxRates): PriceDisplay {
  const cnyMin = product.priceCnyMin;
  const cnyMax = product.priceCnyMax;
  const hasCnyRange =
    cnyMin !== null && cnyMax !== null && Number(cnyMax.toFixed(2)) !== Number(cnyMin.toFixed(2));

  if (product.priceUsd !== null) {
    return {
      usd: product.priceUsd,
      basis: "stored_estimate",
      rateIsLive: fx.fromLiveRow,
      cnyMin,
      cnyMax,
      hasCnyRange,
    };
  }
  if (cnyMin !== null) {
    return {
      usd: usdFromCny(cnyMin, fx.cnyPerUsd),
      basis: "converted_from_cny",
      rateIsLive: fx.fromLiveRow,
      cnyMin,
      cnyMax,
      hasCnyRange,
    };
  }
  return {
    usd: null,
    basis: "none",
    rateIsLive: fx.fromLiveRow,
    cnyMin: null,
    cnyMax: null,
    hasCnyRange: false,
  };
}

/** ¥ as typed by the marketplace — never rounded into a fake whole number. */
export function formatCny(amount: number): string {
  return `¥${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

/** The warm placeholder the whole shop falls back to — never a broken-image icon. */
export function ProductImagePlaceholder({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex h-full w-full items-center justify-center bg-warm-200 ${className}`}
      aria-hidden="true"
    >
      <PackageOpen className="h-6 w-6 text-dark-900/20" />
    </div>
  );
}

interface ProductCardProps {
  product: CatalogProduct;
  /** "Selected for you" / "Trending by views" / "Best seller on 1688" — passed in
   *  already translated by the surface that knows why this item is on the shelf. */
  sourceLabel?: string | null;
  /** Non-empty when the card is a search result: opening it records a
   *  `search_click` (a view alone would hide which words sold the click). */
  searchQuery?: string | null;
  /** Entrance stagger index for grids; 0 keeps the card animation-free in rails. */
  index?: number;
  compact?: boolean;
}

export default function ProductCard({
  product,
  sourceLabel = null,
  searchQuery = null,
  index = 0,
  compact = false,
}: ProductCardProps) {
  const { t, locale } = useI18n();
  // Cards mount 12–24 at a time, so fx must stay the single cached read
  // `fx.ts` already dedupes rather than become a per-card query.
  const fx = useFx();
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "80px" });

  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const images = product.images;
  const hero = images[0] ?? null;
  const hoverImage = images.length > 1 ? images[1] : null;
  const extraCount = Math.max(0, images.length - 1);

  // A card that never enters the viewport must not claim a view. The foundation
  // throttles repeats locally (50 s) and server-side (60 s), so a grid of 24
  // scrolling past is one batch of writes, not a flood.
  useEffect(() => {
    if (!inView) return;
    recordProductEvent(product.id, "view", product.marketplace);
  }, [inView, product.id, product.marketplace]);

  const title = pickTitle(product, locale);
  const displayTitle = title || t("card.unnamedProduct");
  const price = productPrice(product, fx);
  const market = product.marketplace ? getMarketplace(product.marketplace) : undefined;
  const marketLabel = market?.displayName ?? product.marketplace;

  const stock = (product.stock_status ?? "").trim().toLowerCase();
  const isOut = stock === "out_of_stock" || stock === "sold_out";
  const isLow = stock === "low_stock";

  const handleClick = () => {
    if ((searchQuery ?? "").trim()) {
      recordProductEvent(product.id, "search_click", product.marketplace);
    }
  };

  return (
    <motion.article
      ref={ref}
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.35, delay: Math.min(index, 11) * 0.03 }}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-dark-900/7 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-brand-500/25 hover:shadow-lg hover:shadow-brand-500/10 active:translate-y-0 active:scale-[0.99] dark:border-white/10 dark:bg-dark-900"
    >
      {/* ── Image ── */}
      <div className="relative aspect-[4/5] overflow-hidden bg-warm-50 dark:bg-dark-800">
        {!loaded && !failed && <div className="skeleton absolute inset-0 rounded-none" />}

        {hero && !failed ? (
          <>
            <img
              src={hero}
              alt={displayTitle}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
              className={`h-full w-full object-cover transition-opacity duration-300 group-hover:opacity-0 ${
                loaded ? "opacity-100" : "opacity-0"
              } ${isOut ? "grayscale-[0.7] opacity-60" : ""}`}
            />
            {hoverImage && (
              <img
                src={hoverImage}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
                className={`absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${
                  isOut ? "grayscale-[0.7] opacity-0 group-hover:opacity-60" : ""
                }`}
              />
            )}
          </>
        ) : (
          <ProductImagePlaceholder />
        )}

        {/* Marketplace provenance */}
        {marketLabel && marketLabel !== "unknown" && (
          <span className="absolute left-2 top-2 rounded-full border border-dark-900/10 bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-dark-900/70 backdrop-blur-sm">
            {marketLabel}
          </span>
        )}

        {/* Photo count — the row's real images array length, nothing invented */}
        {extraCount > 0 && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-dark-900/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            <Layers className="h-2.5 w-2.5" />
            {images.length}
          </span>
        )}

        {sourceLabel && (
          <span className="absolute bottom-2 right-2 inline-flex max-w-[70%] items-center gap-1 truncate rounded-full bg-brand-500/90 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            {sourceLabel}
          </span>
        )}

        {isOut && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-dark-900/80 px-2 py-0.5 text-[10px] font-semibold text-white">
            <Ban className="h-2.5 w-2.5" />
            {t("card.outOfStock")}
          </span>
        )}
      </div>

      {/* ── Body ── */}
      <div className={`flex flex-1 flex-col ${compact ? "p-2.5" : "p-3"}`}>
        <h3 className="line-clamp-2 min-h-[2.5em] text-xs font-medium leading-snug text-dark-900 sm:text-sm dark:text-dark-50">
          {/* The whole card is the tap target (`after:absolute after:inset-0`), and
              it opens a WhatsApp enquiry that already names the product — the
              website has no product page, the app does. */}
          <a
            href={enquiryLink(product, displayTitle)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleClick}
            title={displayTitle}
            className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2"
          >
            {displayTitle}
          </a>
        </h3>

        {/* Price. The qualifier word is the point: a converted number is an
            estimate, and an estimate read from the offline default rate says so. */}
        <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          {price.usd !== null ? (
            <span className="text-sm font-bold text-dark-900 sm:text-base dark:text-dark-50">
              {formatUsd(price.usd)}
            </span>
          ) : (
            <span className="text-sm font-medium text-dark-900/45 dark:text-dark-300">
              {t("card.priceOnRequest")}
            </span>
          )}

          {price.cnyMin !== null && (
            <span className="text-[11px] text-dark-900/45 dark:text-dark-300">
              {price.hasCnyRange
                ? `${formatCny(price.cnyMin)}–${formatCny(price.cnyMax as number)}`
                : formatCny(price.cnyMin)}
            </span>
          )}

          {price.basis !== "none" && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                price.basis === "converted_from_cny" && !price.rateIsLive
                  ? "bg-warning/10 text-warning"
                  : "bg-warm-200 text-dark-900/45 dark:bg-white/10 dark:text-dark-300"
              }`}
              title={
                price.basis === "converted_from_cny"
                  ? price.rateIsLive
                    ? t("card.estimateTipLive")
                    : t("card.estimateTipFallback")
                  : t("card.storedEstimateTip")
              }
            >
              {t("card.estimate")}
            </span>
          )}
        </div>

        {!compact && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-dark-900/45 dark:text-dark-300">
            {typeof product.moq === "number" && product.moq > 1 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-dark-900/8 bg-warm-100 px-2 py-0.5 font-medium text-dark-900/60 dark:border-white/10 dark:bg-dark-800 dark:text-dark-200">
                {t("card.moqPrefix")} {product.moq}
              </span>
            )}
            {product.categoryName && (
              <span className="inline-flex max-w-[10rem] items-center gap-1 truncate rounded-full border border-dark-900/8 bg-white px-2 py-0.5 text-dark-900/50 dark:border-white/10 dark:bg-dark-900 dark:text-dark-300">
                {product.categoryName}
              </span>
            )}
            {isLow && (
              <span className="inline-flex items-center gap-1 rounded-full border border-warning/25 bg-warning/10 px-2 py-0.5 font-medium text-warning">
                {t("card.lowStock")}
              </span>
            )}
            {typeof product.sales_count === "number" && product.sales_count > 0 && (
              <span className="inline-flex items-center gap-1" title={t("card.marketplaceSalesTip")}>
                <Star className="h-2.5 w-2.5 text-brand-500/60" />
                {product.sales_count}
              </span>
            )}
            {typeof product.supplier_rating === "number" && product.supplier_rating > 0 && (
              <span className="inline-flex items-center gap-1">
                <BadgeCheck className="h-2.5 w-2.5 text-success/70" />
                {product.supplier_rating.toFixed(1)}
              </span>
            )}
            {product.curation.featured && (
              <span className="inline-flex items-center gap-1 text-brand-600" title={t("card.curatedTip")}>
                <Flame className="h-2.5 w-2.5" />
                {t("card.curated")}
              </span>
            )}
          </div>
        )}
      </div>
    </motion.article>
  );
}
