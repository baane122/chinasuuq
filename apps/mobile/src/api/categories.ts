// The ONE category vocabulary for the browse surfaces (home chips, search
// chips, product matching) — shared so the two screens can never drift again.
//
// WHY THIS FILE EXISTS. Three vocabularies used to describe the same shelves:
//   1. `CategoryChips.tsx` hardcoded ten ids (electronics, jewelry, …) that no
//      row has ever used.
//   2. `source_products.category` is a free TEXT column holding English NAMES
//      ("Home & Kitchen", plus orphans like "Sports"), and it is the ONLY
//      categorisation populated in production.
//   3. `src/lib/constants.ts` CATEGORIES is a third, marketing-side list.
// Meanwhile the real `categories` table has 12 rows (name_en/name_so/slug) and
// its FK `category_id` is 0% populated (verified in migration
// 202610161301_category_wiring.sql). So filtering `p.category === "electronics"`
// matched almost nothing, and the chips that "worked" did so by accident.
//
// THE RULE, copied from the SQL repair so client and server agree: a product
// belongs to a category when its `category_id` equals the category OR its text
// `category` matches name_en / name_so / slug case-insensitively with every run
// of punctuation collapsed to a single space — "Home & Kitchen", "home-kitchen"
// and "Home  Kitchen" all land on the same row.

import type { Category, Product } from "@/types";

/** A category as the browse UI consumes it: one label per language + a count. */
export interface BrowseCategory {
  /** Stable selection key: the uuid for table rows, `text:<key>` for derived ones. */
  id: string;
  nameEn: string;
  nameSo: string | null;
  /** Emoji (or any short glyph) when the table stores one; URL when it stores an image. */
  icon: string | null;
  imageUrl: string | null;
  /** Normalized aliases this category answers to (name_en/name_so/slug keys). */
  keys: string[];
  /** How many cached products match — 0 means the chip must read as empty, honestly. */
  count: number;
  source: "table" | "catalog-text";
}

/**
 * The ONE normalizer. Lowercase, every run of non-alphanumerics collapses to a
 * single trimmed space — same expression as the SQL helper and the web
 * catalog.ts `keyOf`, so the three surfaces cannot disagree about "Electronics"
 * vs "electronics!!" ever again.
 */
export function categoryKey(text: string | null | undefined): string {
  return (text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** The aliases a real `categories` row answers to. */
function keysOfCategory(c: Category): string[] {
  const out = new Set<string>();
  for (const raw of [c.name_en, c.name_so, c.slug]) {
    const k = categoryKey(raw);
    if (k) out.add(k);
  }
  // "home-kitchen" as a slug must also answer to the text "home kitchen".
  if (c.slug) {
    const spaced = categoryKey(c.slug.replace(/-/g, " "));
    if (spaced) out.add(spaced);
  }
  return Array.from(out);
}

/**
 * The membership test — the fix for the whole category bug. A product is IN a
 * category if the FK matches (for the day the wiring migration is run) or its
 * text category equals one of the category's normalized names/slug.
 */
export function productInCategory(p: Product, c: BrowseCategory): boolean {
  if (p.category_id && p.category_id === c.id) return true;
  const key = categoryKey(p.category);
  return key !== "" && c.keys.includes(key);
}

/** Bilingual display order per app locale; never an empty label. */
export function categoryLabel(c: BrowseCategory, locale: "en" | "so"): string {
  if (locale === "so") return c.nameSo || c.nameEn || c.id;
  return c.nameEn || c.nameSo || c.id;
}

function withCounts(c: BrowseCategory, products: Product[]): BrowseCategory {
  let count = 0;
  for (const p of products) if (productInCategory(p, c)) count++;
  return { ...c, count };
}

/**
 * Turn the live `categories` rows into browse chips, ordered by sort_order
 * exactly like the table, and counted against the products actually cached.
 * Rows missing every name are dropped — a chip nobody can label is a bug, not
 * a category.
 */
export function buildBrowseCategories(
  rows: Category[],
  products: Product[]
): BrowseCategory[] {
  const sorted = rows.slice().sort((a, b) => {
    const sa = a.sort_order ?? Number.MAX_SAFE_INTEGER;
    const sb = b.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return (a.name_en || a.name_so || "").localeCompare(b.name_en || b.name_so || "");
  });
  return sorted
    .filter((r) => r.name_en || r.name_so || r.slug)
    .map((r) =>
      withCounts(
        {
          id: r.id,
          nameEn: r.name_en || r.name_so || r.slug || r.id,
          nameSo: r.name_so,
          icon: r.icon,
          imageUrl: r.image_url,
          keys: keysOfCategory(r),
          count: 0,
          source: "table",
        },
        products
      )
    );
}

/**
 * The FALLBACK vocabulary: categories that the cached products ACTUALLY carry,
 * grouped by the same normalized key so "Home & Kitchen" typed two ways shows
 * one chip. Used when the table read failed or answered with nothing — NEVER
 * the old hardcoded list. Displayed by count, biggest shelf first.
 */
export function deriveCategoriesFromProducts(products: Product[]): BrowseCategory[] {
  const groups = new Map<string, { display: string; count: number }>();
  for (const p of products) {
    const raw = (p.category || "").trim();
    const key = categoryKey(raw);
    if (!key) continue;
    const g = groups.get(key);
    if (g) g.count += 1;
    else groups.set(key, { display: raw, count: 1 });
  }
  return Array.from(groups.entries())
    .map(([key, g]) => ({
      id: `text:${key}`,
      nameEn: g.display,
      nameSo: null,
      icon: null,
      imageUrl: null,
      // The FK can still resolve a derived chip: its id is the text key, so
      // only the text alias matters.
      keys: [key],
      count: g.count,
      source: "catalog-text" as const,
    }))
    .sort((a, b) => b.count - a.count || a.nameEn.localeCompare(b.nameEn));
}

/**
 * Filter a catalog by a selected chip id ("all", a uuid, or `text:<key>`),
 * given the chip list the screen is showing. Returns the products, sales-
 * ordered the way the home grid has always been.
 */
export function filterProductsByCategory(
  products: Product[],
  categories: BrowseCategory[],
  selectedId: string
): Product[] {
  if (!selectedId || selectedId === "all") return products;
  const cat = categories.find((c) => c.id === selectedId);
  if (!cat) return products;
  return products
    .filter((p) => productInCategory(p, cat))
    .slice()
    .sort((a, b) => b.sales_count - a.sales_count);
}
