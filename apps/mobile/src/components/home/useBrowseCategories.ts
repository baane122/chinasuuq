// One hook feeding both browse surfaces (home grid + search) the REAL category
// vocabulary, so the two screens cannot drift back into separate lists.
//
// Loading model, honest by construction:
//  * `loading` is the categories read only; it resolves in a few hundred ms at
//    worst (the db layer never throws and never spins forever).
//  * While it is pending the caller gets `categories: []` — the chips render
//    just "All", which is true, instead of a skeleton that lies about work
//    that may never need the network at all (fresh local cache answers
//    instantly).
//  * If the table returns nothing usable, the chips become the distinct
//    category texts the cached products ACTUALLY carry. Never the old
//    hardcoded list.

import { useEffect, useMemo, useState } from "react";
import { getCategories } from "@/db";
import {
  buildBrowseCategories,
  deriveCategoriesFromProducts,
  type BrowseCategory,
} from "@/api/categories";
import type { Category, Product } from "@/types";

export interface BrowseCategoriesState {
  categories: BrowseCategory[];
  /** "table" = real rows, "catalog-text" = fallback vocabulary, "loading". */
  source: "table" | "catalog-text" | "loading";
  /** A categories read that could not be completed (offline fresh device). Never blocks the UI. */
  failed: boolean;
}

export function useBrowseCategories(products: Product[]): BrowseCategoriesState {
  // null = the read is still in flight; [] = it answered with nothing.
  const [rows, setRows] = useState<Category[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    getCategories()
      .then((cats) => {
        if (!active) return;
        setRows(cats);
        // getCategories swallows its own errors and returns the stale cache or
        // []; "failed" only means the UI should not pretend the table is the
        // source of truth when it silently is not.
        setFailed(cats.length === 0);
      })
      .catch(() => {
        if (!active) return;
        setRows([]);
        setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return useMemo<BrowseCategoriesState>(() => {
    if (rows === null) return { categories: [], source: "loading", failed: false };
    if (rows.length > 0) {
      return { categories: buildBrowseCategories(rows, products), source: "table", failed: false };
    }
    return { categories: deriveCategoriesFromProducts(products), source: "catalog-text", failed };
  }, [rows, products, failed]);
}
