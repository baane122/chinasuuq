// Supabase schema adapter for the mobile app.
//
// Centralizes the mapping from local shapes (LocalOrder, SourcingCapture, SavedAddress)
// to the real Supabase column names verified against the production project. Every
// write from the mobile data layer (`src/db/index.ts`) routes through this module so
// admin mission control and the customer's own data stay in sync.
//
// This file does NOT query Supabase itself — it just produces the row payloads
// and a few mapping helpers. Customer orders are the exception: they are written
// by the submit_mobile_order RPC, whose payload is built in src/db/index.ts.

import type { LocalOrder, LocalOrderItem } from "../db";
import type { SourcingCapture, SavedAddress } from "../db";
import type { UserProfile, CustomerProfile } from "../db";

// Row shape of production's `public.orders`, verified against the live schema.
// `id` is omitted: it is a server-generated uuid and any client id is rejected.
// Line items live in `order_items`, never as a JSON blob on the order.
export interface OrderRow {
  reference: string;
  user_id: string;
  status: string;
  payment_status: string;
  shipping_method: "air" | "sea" | "land";
  currency: string;
  subtotal_usd: number;
  service_fee_usd: number;
  shipping_estimate_usd: number;
  customs_estimate_usd: number;
  amount_paid_usd: number;
  balance_due_usd: number;
  total_usd: number;
  delivery_address: string | null;
  destination_city: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Legacy/staff-facing `orders` row shape. Customer order creation goes through
 *  the submit_mobile_order RPC (order_items has no customer INSERT policy), so
 *  this is kept only as the canonical row description. */
export function adaptOrder(order: LocalOrder, userId: string): OrderRow {
  const subtotal = order.total_usd ?? 0;
  const serviceFee = Math.round(subtotal * 0.05 * 100) / 100;
  const total = subtotal + serviceFee;
  return {
    reference: order.reference,
    user_id: userId,
    status: mapMobileStatusToDb(order.status),
    payment_status: order.payment_status || "pending",
    shipping_method: order.shipping_method === "sea" ? "sea" : "air",
    currency: "USD",
    subtotal_usd: subtotal,
    service_fee_usd: serviceFee,
    shipping_estimate_usd: 0, // shipping is quoted on arrival, per product
    customs_estimate_usd: 0,
    amount_paid_usd: 0,
    balance_due_usd: total,
    total_usd: total,
    delivery_address: order.address || null,
    destination_city: order.city || null,
    notes: order.notes || null,
    created_at: order.created_at,
    updated_at: order.updated_at || order.created_at,
  };
}

/** NUMERIC columns arrive as strings; a non-finite or non-positive value is
 *  absence of data, not a billable zero. */
function positiveNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Adapt an `orders` row (+ its order_items rows) back to the mobile LocalOrder shape. */
export function unadaptOrder(row: any, items?: any[]): LocalOrder {
  return {
    id: row.id,
    reference: row.reference || row.id,
    status: mapDbStatusToMobile(row.status),
    items: Array.isArray(items) ? items.map(unadaptOrderItem) : [],
    total_usd: Number(row.total_usd) || 0,
    // Server-decided money. PostgREST numerics arrive as strings; NaN or ≤0
    // is missing, not zero — the screens then fall back to the total alone.
    subtotal_usd: positiveNumber(row.subtotal_usd),
    service_fee_usd: positiveNumber(row.service_fee_usd),
    shipping_method: row.shipping_method === "sea" ? "sea" : "air",
    payment_status: row.payment_status || "pending",
    // Production stores no payment method / recipient name / phone on the order;
    // the checkout contact block travels in `notes` instead.
    payment_method: "",
    recipient_name: "",
    phone: "",
    city: row.destination_city || "",
    address: row.delivery_address || "",
    notes: row.notes || "",
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || row.created_at || "",
    synced: true,
  };
}

/** `order_items` row → LocalOrderItem, keeping the provenance the admin mission is about. */
export function unadaptOrderItem(it: any): LocalOrderItem {
  return {
    id: it.id,
    product_id: it.product_id || undefined,
    product_name: it.product_name || "",
    quantity: it.quantity ?? 1,
    price_usd: Number(it.unit_price) || 0,
    marketplace: it.marketplace_key || undefined,
    source_url: it.source_url || undefined,
    image_url: it.image_url || undefined,
    price_cny: it.unit_price_cny == null ? undefined : Number(it.unit_price_cny),
    exchange_rate: it.exchange_rate == null ? undefined : Number(it.exchange_rate),
    moq: it.moq_at_purchase ?? undefined,
    variant: it.variant_name || it.variant || undefined,
  };
}

// Row shape of production's `sourcing_requests`, verified against the live
// schema: id, user_id, marketplace (nullable enum: 1688 | taobao | yiwugo |
// chinagoods), product_url, product_description, quantity,
// destination_city, status, created_at, updated_at. `id`, `created_at` and
// `updated_at` are server-generated and must never be sent from the client —
// the earlier adapter wrote nine columns that do not exist, so every mobile
// sourcing sync was rejected by PostgREST.
export interface SourcingRow {
  user_id: string | null;
  marketplace: "1688" | "taobao" | "yiwugo" | "chinagoods" | null;
  product_url: string | null;
  product_description: string;
  quantity: number;
  destination_city: string | null;
  status: "pending" | "assigned" | "quoted" | "approved" | "purchased" | "cancelled";
}

/** The marketplace labels the live `sourcing_requests.marketplace` enum accepts. */
const LIVE_SOURCING_MARKETPLACES = new Set([
  "1688",
  "taobao",
  "yiwugo",
  "chinagoods",
]);

export function adaptSourcing(
  c: SourcingCapture,
  profileId: string | null
): SourcingRow {
  // The Dollar Store is an in-app storefront with no enum label in the live
  // schema: `marketplace` stays NULL and the provenance travels in the
  // description, which is what sourcing staff actually read. Any other value
  // outside the enum is likewise dropped rather than risking a 22P02 reject.
  const isDollarStore = c.marketplace === "dollarstore";
  const marketplace = !isDollarStore && LIVE_SOURCING_MARKETPLACES.has(c.marketplace)
    ? (c.marketplace as SourcingRow["marketplace"])
    : null;
  const description = isDollarStore
    ? `[Dollar Store] ${c.product_description || ""}`.trim()
    : c.product_description || "";

  return {
    user_id: profileId,
    marketplace,
    product_url: c.product_url || null,
    product_description: description,
    quantity: c.quantity || 1,
    destination_city: c.destination_city || null,
    status: "pending",
  };
}

export interface AddressRow {
  /** Postgres generates it; sending a device id (`addr-…`) is an invalid uuid
   *  and would fail the whole INSERT. */
  id?: string;
  user_id: string;
  label: string;
  full_name: string;
  phone: string;
  city: string;
  district: string | null;
  address_line1: string;
  address_line2: string | null;
  postal_code: string | null;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

export function adaptAddress(
  addr: SavedAddress,
  userId: string
): AddressRow {
  // A device-side id like `addr-1712345678` is not a uuid; sending it makes
  // Postgres reject the row, so only a real uuid is carried over.
  const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return {
    ...(addr.id && UUID_LIKE.test(addr.id) ? { id: addr.id } : {}),
    user_id: userId,
    label: addr.label,
    full_name: addr.full_name,
    phone: addr.phone,
    city: addr.city,
    district: addr.district || null,
    address_line1: addr.address_line1,
    address_line2: addr.address_line2 || null,
    postal_code: addr.postal_code || null,
    is_default: !!addr.is_default,
    created_at: addr.created_at,
    updated_at: addr.updated_at,
  };
}

export function unadaptAddress(row: any): SavedAddress {
  return {
    id: row.id,
    user_id: row.user_id,
    label: row.label || "Home",
    full_name: row.full_name || "",
    phone: row.phone || "",
    city: row.city || "",
    district: row.district || undefined,
    address_line1: row.address_line1 || "",
    address_line2: row.address_line2 || undefined,
    postal_code: row.postal_code || undefined,
    is_default: !!row.is_default,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface FavoriteRow {
  id?: string;
  user_id: string;
  product_id: string;
  created_at?: string;
}

export function adaptFavorite(
  userId: string,
  productId: string
): FavoriteRow {
  return {
    user_id: userId,
    product_id: productId,
  };
}

export interface ProfileRow {
  id: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  language?: string | null;
  updated_at?: string;
}

export function adaptProfile(
  userId: string,
  profile: Partial<UserProfile>
): ProfileRow {
  return {
    id: userId,
    full_name: profile.full_name || "",
    phone: profile.phone || null,
    city: profile.city || null,
    language: profile.language || null,
    updated_at: new Date().toISOString(),
  };
}

export interface CustomerProfileRow {
  user_id: string;
  customer_type?: string | null;
  business_name?: string | null;
  city?: string | null;
  address_line1?: string | null;
  delivery_notes?: string | null;
  total_orders?: number;
  total_spent_usd?: number;
  tier?: string | null;
}

export function adaptCustomerProfile(
  userId: string,
  profile: Partial<CustomerProfile>
): CustomerProfileRow {
  return {
    user_id: userId,
    customer_type: profile.customer_type || null,
    business_name: profile.business_name || null,
    city: profile.city || null,
    address_line1: profile.address_line1 || null,
    delivery_notes: profile.delivery_notes || null,
    tier: profile.tier || null,
  };
}

// The exact 16 labels of production's `order_status` enum, verified against the
// live schema. Postgres rejects any other label with 22P02, so anything unknown
// falls back to "pending" — the enum and the mobile OrderStatus union in
// src/types are the same 16 values, so the mapping is the identity.
export const DB_ORDER_STATUSES = new Set([
  "pending",
  "confirmed",
  "purchasing",
  "purchased",
  "in_transit_china",
  "warehouse",
  "inspection",
  "consolidated",
  "shipped",
  "in_transit",
  "arrived_somalia",
  "customs",
  "ready_for_pickup",
  "out_for_delivery",
  "delivered",
  "cancelled",
]);

/** Map mobile status to the DB enum. Anything not in the enum → "pending". */
export function mapMobileStatusToDb(status: string): string {
  return DB_ORDER_STATUSES.has(status) ? status : "pending";
}

export function mapDbStatusToMobile(status: string): string {
  return DB_ORDER_STATUSES.has(status) ? status : "pending";
}
