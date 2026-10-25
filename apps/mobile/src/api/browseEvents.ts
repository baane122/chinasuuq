// The ONE place browse surfaces report engagement, so "log a view" is not
// copy-pasted per screen (it used to live only inside TrendingRow — grid cards
// and search results logged nothing, so native browsing barely fed trending).
//
// Contract inherited from productEvents.ts / record_product_event:
//  * fire-and-forget — nothing here is ever awaited by a caller, nothing throws;
//  * the SERVER throttles same-product+same-event by caller for 60 s, so a
//    double-count (card open then detail open) collapses to one row;
//  * only catalog uuids are reportable: `cart-…` / `web-…` capture ids have no
//    product_events FK and sending them is pure noise, so they are skipped here.

import { recordProductEvent, type ProductEventType } from "@/api/productEvents";
import type { Product } from "@/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for real `source_products` rows only (not cart/web capture ids). */
export function isReportableProductId(id: string | null | undefined): boolean {
  return typeof id === "string" && UUID_RE.test(id);
}

/**
 * The single funnel. Every browse surface calls one of the named helpers
 * below; each of them calls this and never awaits it.
 */
function track(product: Product | null | undefined, type: ProductEventType): void {
  if (!product) return;
  if (!isReportableProductId(product.id)) return;
  // recordProductEvent catches its own failures and resolves boolean; void
  // keeps the caller's render path free of any promise handling.
  void recordProductEvent({
    productId: product.id,
    eventType: type,
    marketplaceKey: product.marketplace || null,
  });
}

/**
 * The same funnel for callers that hold only an id + marketplace (the trending
 * feed's hydrated rows), so TrendingRow routes through here too instead of
 * keeping its own copy of the guard.
 */
export function trackById(
  productId: string,
  type: ProductEventType,
  marketplaceKey?: string | null
): void {
  if (!isReportableProductId(productId)) return;
  void recordProductEvent({ productId, eventType: type, marketplaceKey: marketplaceKey ?? null });
}

/** A card the customer actually opened (home grid / trending / wishlist). */
export function trackProductView(product: Product): void {
  track(product, "view");
}

/** A search result the customer opened — the ranking weights it differently. */
export function trackSearchClick(product: Product): void {
  track(product, "search_click");
}

/** One-tap add on a browse card. */
export function trackAddToCart(product: Product): void {
  track(product, "add_to_cart");
}

/** An order line placed from a browse surface. */
export function trackOrder(product: Product): void {
  track(product, "order");
}
