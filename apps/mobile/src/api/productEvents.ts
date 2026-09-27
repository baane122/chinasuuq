// Product engagement events + trending reads, straight to Postgres.
//
// Deliberately thin: the ranking math lives in fn_trending_products
// (apps/web/supabase/migrations/202609250002_trending_products.sql) so every
// client agrees on what "trending" means, and this app's static web export has
// no server of its own to compute it in.
//
// Analytics must never be why a screen broke, so nothing here throws — a
// failure costs one event row and returns a falsy/empty result.

import { supabase } from "@/lib/supabase";

export type ProductEventType = "view" | "add_to_cart" | "order" | "search_click";

export interface TrendingProduct {
  product_id: string;
  name: string;
  marketplace: string;
  image_url: string | null;
  /** NULL unless the catalog row carries a real USD figure. Never a CNY number. */
  price_usd: number | null;
  /** The wholesale price in the listing's own currency. */
  price_cny: number | null;
  score: number;
  event_count: number;
}

/** PostgREST serialises numerics as strings; an absent column reads undefined. */
function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fire one engagement event. Returns false when it was throttled (same
 * product + event by this caller inside 60s) or the write failed.
 * A WebView capture that was never saved to source_products has no product id,
 * and sending an empty one would only add noise, so it is skipped here.
 */
export async function recordProductEvent(input: {
  productId: string;
  eventType: ProductEventType;
  marketplaceKey?: string | null;
}): Promise<boolean> {
  if (!input.productId) return false;
  try {
    const { data, error } = await supabase.rpc("record_product_event", {
      p_product_id: input.productId,
      p_event_type: input.eventType,
      p_marketplace_key: input.marketplaceKey ?? null,
    });
    if (error) return false;
    return Boolean(data);
  } catch {
    return false;
  }
}

/**
 * Ranked trending products. `[]` when the backend is unreachable or the
 * migration has not been applied yet, which is what callers render as "no
 * trending row today" rather than an error state.
 */
export async function getTrendingProducts(options?: {
  days?: number;
  limit?: number;
}): Promise<TrendingProduct[]> {
  try {
    const { data, error } = await supabase.rpc("fn_trending_products", {
      p_days: options?.days ?? 7,
      p_limit: options?.limit ?? 20,
    });
    if (error || !Array.isArray(data)) return [];
    return data.map((row: any) => ({
      product_id: String(row?.product_id ?? ""),
      name: row.name ?? "Untitled product",
      marketplace: row.marketplace ?? "unknown",
      image_url: row.image_url ?? null,
      price_usd: numeric(row.price_usd),
      price_cny: numeric(row.price_cny),
      score: numeric(row.score) ?? 0,
      event_count: numeric(row.event_count) ?? 0,
    }));
  } catch {
    return [];
  }
}
