import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ProductVariant } from "@/types";
import type { VariantGroup, VariantOption } from "./VariantSelector";

/**
 * A row of `source_product_variants`, straight from PostgREST. The catalog read
 * (`db/index.ts`) maps only `source_products`, so `product.variants` is empty for
 * every live row — this hook fills the gap on the product screen without
 * touching the shared data layer.
 *
 * Column names follow the LIVE table (verified against project
 * athkmrvsaijwgsyvwrbp): the dimension split is `options` ({"color":"red"}),
 * the foreign key is `product_id`, and price/stock are `price_cny`/`stock`.
 * The previous select named `source_price`, `attributes`, `is_default`,
 * `in_stock` and filtered on `source_product_id` — none of those exist, so
 * PostgREST answered 42703 and this hook silently fell back to the inline
 * catalog variants for every product. The read below is the one the DB accepts.
 */
interface VariantRow {
  id: string;
  variant_name: string | null;
  sku: string | null;
  price_cny: number | string | null;
  image_url: string | null;
  options: Record<string, unknown> | null;
  stock: number | null;
}

/**
 * Turn a flat list of variant combinations into per-dimension groups, preserving
 * first-seen order of dimensions and options. Options that share a value across
 * rows collapse into one swatch; the row that carries an `image_url` supplies it.
 *
 * Rows with no usable `attributes` fall back to a single group keyed off the
 * listing's own `variant_name`, so a "Red / XL" combo column still renders.
 */
function groupRows(rows: VariantRow[]): VariantGroup[] {
  // Dimension name -> (option label -> option)
  const groups = new Map<string, Map<string, VariantOption>>();

  const addOption = (dim: string, label: string, image?: string | null) => {
    if (!label) return;
    let byLabel = groups.get(dim);
    if (!byLabel) {
      byLabel = new Map<string, VariantOption>();
      groups.set(dim, byLabel);
    }
    const existing = byLabel.get(label);
    if (existing) {
      if (!existing.image && image) existing.image = image;
    } else {
      byLabel.set(label, { label, value: label, image: image ?? undefined });
    }
  };

  let anyAttributed = false;
  for (const row of rows) {
    const attrs = row.options;
    const entries =
      attrs && typeof attrs === "object" && !Array.isArray(attrs)
        ? Object.entries(attrs).filter(
            ([k, v]) => typeof k === "string" && typeof v === "string" && (v as string).trim()
          )
        : [];

    if (entries.length > 0) {
      anyAttributed = true;
      for (const [key, val] of entries) {
        // One photo per combination cannot be split across every dimension, so
        // attach it to the first dimension (colour) and leave the rest as text.
        const isFirst = key === entries[0][0];
        addOption(titleDim(key), String(val).trim(), isFirst ? row.image_url : null);
      }
    } else if (row.variant_name) {
      addOption("Option", row.variant_name.trim(), row.image_url);
    }
  }

  if (!anyAttributed && groups.size === 0) return [];
  return [...groups.entries()].map(([name, byLabel]) => ({
    name,
    options: [...byLabel.values()],
  }));
}

/** "color" -> "Colour", "size" -> "Size": a customer-facing dimension label. */
function titleDim(raw: string): string {
  const clean = raw.replace(/[_-]+/g, " ").trim();
  const lower = clean.toLowerCase();
  if (lower === "color" || lower === "colour") return "Colour";
  if (lower === "size") return "Size";
  if (!clean) return "Option";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** Map the (rare) inline `product.variants` model into the same group shape. */
function fromInlineVariants(variants: ProductVariant[]): VariantGroup[] {
  return variants
    .filter((v) => Array.isArray(v.options) && v.options.length > 0)
    .map((v) => ({
      name: v.name,
      options: v.options.map((o) => ({ label: o.label, value: o.value ?? o.label, image: o.image })),
    }));
}

/**
 * Load variant dimensions for one product id.
 *
 * Returns the inline catalog variants immediately (never worse than before),
 * then replaces them with the richer DB dimensions once the targeted read
 * settles. The read only runs for a UUID (a cart/web capture id has no DB row),
 * and any failure — offline, RLS, missing table — leaves the inline groups in
 * place, so the screen can't be emptied by an optional enrichment.
 */
export function useProductVariants(
  productId: string | undefined,
  inline: ProductVariant[] | undefined
): VariantGroup[] {
  const [dbGroups, setDbGroups] = useState<VariantGroup[] | null>(null);

  const inlineGroups = useMemo(
    () => (inline && inline.length > 0 ? fromInlineVariants(inline) : []),
    [inline]
  );

  useEffect(() => {
    let active = true;
    setDbGroups(null);
    if (!productId || !/^[0-9a-f-]{36}$/i.test(productId)) return;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("source_product_variants")
          .select("id, variant_name, sku, price_cny, image_url, options, stock")
          .eq("product_id", productId)
          .order("variant_name", { ascending: true })
          .limit(200);
        if (!active || error || !Array.isArray(data)) return;
        const groups = groupRows(data as VariantRow[]);
        if (groups.length > 0) setDbGroups(groups);
      } catch {
        /* optional enrichment — silently keep inline groups. A rejected select
         * would land here too, which is why the column list is pinned to the
         * live schema above. */
      }
    })();

    return () => {
      active = false;
    };
  }, [productId]);

  return dbGroups && dbGroups.length > 0 ? dbGroups : inlineGroups;
}
