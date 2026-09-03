// Supabase schema adapter for the mobile app.
//
// Centralizes the mapping from local shapes (LocalOrder, SourcingCapture, SavedAddress)
// to the real Supabase column names defined in `apps/web/supabase/migrations/`. Every
// write from the mobile data layer (`src/db/index.ts`) routes through this module so
// admin mission control and the customer's own data stay in sync.
//
// This file does NOT query Supabase itself — it just produces the row payloads
// and a few mapping helpers.

import type { LocalOrder } from "../db";
import type { SourcingCapture, SavedAddress } from "../db";
import type { UserProfile, CustomerProfile } from "../db";

export interface OrderRow {
  id: string;
  profile_id: string | null;
  order_number: string;
  status: string;
  subtotal: number;
  shipping_cost: number;
  service_fee: number;
  tax_amount: number;
  insurance_amount: number;
  discount_amount: number;
  total: number;
  amount_paid: number;
  amount_refunded: number;
  balance_due: number;
  shipping_method: "air" | "sea" | "land";
  payment_method: string | null;
  payment_status: string;
  payment_reference: string | null;
  currency: string;
  recipient_name: string;
  phone: string;
  city: string;
  address: string;
  notes: string | null;
  items: any[];
  target_marketplace: string | null;
  source_url: string | null;
  reference: string; // legacy mobile reference (CS-2026-XXXXX)
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  processing_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
}

/** Build a real `orders` row from a local order. */
export function adaptOrder(
  order: LocalOrder,
  profileId: string | null
): OrderRow {
  const subtotal = order.total_usd ?? 0;
  const serviceFee = Math.round(subtotal * 0.05 * 100) / 100;
  const shippingCost = 0; // paid on arrival per product
  const tax = 0;
  const insurance = 0;
  const discount = 0;
  const total = subtotal + serviceFee + shippingCost;
  return {
    id: order.id,
    profile_id: profileId,
    order_number: order.reference,
    status: order.status,
    subtotal,
    shipping_cost: shippingCost,
    service_fee: serviceFee,
    tax_amount: tax,
    insurance_amount: insurance,
    discount_amount: discount,
    total,
    amount_paid: 0,
    amount_refunded: 0,
    balance_due: total,
    shipping_method: order.shipping_method === "sea" ? "sea" : "air",
    payment_method: order.payment_method || null,
    payment_status: order.payment_status || "pending",
    payment_reference: null,
    currency: "USD",
    recipient_name: order.recipient_name || "",
    phone: order.phone || "",
    city: order.city || "",
    address: order.address || "",
    notes: null,
    items: order.items || [],
    target_marketplace: null,
    source_url: null,
    reference: order.reference,
    created_at: order.created_at,
    updated_at: order.updated_at || order.created_at,
    confirmed_at: null,
    processing_at: null,
    shipped_at: null,
    delivered_at: order.status === "delivered" ? order.updated_at || order.created_at : null,
    completed_at: null,
    cancelled_at: order.status === "cancelled" ? order.updated_at || order.created_at : null,
    cancellation_reason: null,
  };
}

/** Adapt a Supabase `orders` row back to the mobile LocalOrder shape. */
export function unadaptOrder(row: any): LocalOrder {
  return {
    id: row.id,
    reference: row.order_number || row.reference || row.id,
    status: row.status || "pending",
    items: Array.isArray(row.items) ? row.items : [],
    total_usd:
      typeof row.total === "number"
        ? row.total
        : typeof row.subtotal === "number"
        ? row.subtotal
        : 0,
    shipping_method: row.shipping_method === "sea" ? "sea" : "air",
    payment_status: row.payment_status || "pending",
    payment_method: row.payment_method || "",
    recipient_name: row.recipient_name || "",
    phone: row.phone || "",
    city: row.city || row.destination_city || "",
    address: row.address || row.delivery_address || "",
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || row.created_at || "",
    synced: true,
  };
}

export interface SourcingRow {
  id: string;
  profile_id: string | null;
  title: string;
  description: string | null;
  reference_urls: string[] | null;
  target_marketplace: string;
  marketplace: string;
  product_url: string;
  product_description: string;
  quantity_needed: number;
  destination_city: string;
  price_cny: number | null;
  price_usd: number | null;
  images: string[] | null;
  status: string;
  customer_id: string | null;
  created_at: string;
}

export function adaptSourcing(
  c: SourcingCapture,
  profileId: string | null
): SourcingRow {
  return {
    id: c.id,
    profile_id: profileId,
    title: c.product_description?.slice(0, 80) || "Sourcing request",
    description: c.product_description || null,
    reference_urls: c.product_url ? [c.product_url] : null,
    target_marketplace: c.marketplace || "1688",
    marketplace: c.marketplace || "1688",
    product_url: c.product_url || "",
    product_description: c.product_description || "",
    quantity_needed: c.quantity || 1,
    destination_city: c.destination_city || "",
    price_cny: c.price_cny ?? null,
    price_usd: c.price_usd ?? null,
    images: c.images || null,
    status: c.status || "pending",
    customer_id: profileId,
    created_at: c.created_at,
  };
}

export interface AddressRow {
  id: string;
  profile_id: string;
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
  profileId: string
): AddressRow {
  return {
    id: addr.id || "",
    profile_id: profileId,
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
    user_id: row.profile_id,
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
  profile_id: string;
  source_product_id: string;
  created_at?: string;
}

export function adaptFavorite(
  userId: string,
  productId: string
): FavoriteRow {
  return {
    profile_id: userId,
    source_product_id: productId,
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

// Map our mobile statuses to the canonical DB enum.
export const DB_ORDER_STATUSES = new Set([
  "pending",
  "confirmed",
  "processing",
  "sourcing",
  "sourced",
  "quoted",
  "quote_approved",
  "paid",
  "purchasing",
  "purchased",
  "in_warehouse",
  "inspection_passed",
  "inspection_failed",
  "consolidated",
  "shipped",
  "in_transit",
  "customs_hold",
  "delivered",
  "completed",
  "cancelled",
  "refunded",
  "disputed",
  "awaiting_payment",
  "in_warehouse", // duplicate intentionally
  "in_transit",
  "out_for_delivery",
  "customs",
]);

/** Map mobile status to DB status. Falls back to "pending". */
export function mapMobileStatusToDb(status: string): string {
  const map: Record<string, string> = {
    pending: "pending",
    confirmed: "confirmed",
    purchasing: "purchasing",
    purchased: "purchased",
    in_transit_china: "in_warehouse",
    warehouse: "in_warehouse",
    inspection: "inspection_passed",
    consolidated: "consolidated",
    shipped: "shipped",
    in_transit: "in_transit",
    arrived_somalia: "in_transit",
    customs: "customs_hold",
    ready_for_pickup: "out_for_delivery",
    out_for_delivery: "out_for_delivery",
    delivered: "delivered",
    cancelled: "cancelled",
  };
  return map[status] || status || "pending";
}

export function mapDbStatusToMobile(status: string): string {
  const map: Record<string, string> = {
    pending: "pending",
    confirmed: "confirmed",
    processing: "confirmed",
    sourcing: "purchasing",
    sourced: "purchased",
    quoted: "purchased",
    quote_approved: "purchased",
    paid: "confirmed",
    purchasing: "purchasing",
    purchased: "purchased",
    in_warehouse: "warehouse",
    inspection_passed: "inspection",
    inspection_failed: "cancelled",
    consolidated: "consolidated",
    shipped: "shipped",
    in_transit: "in_transit",
    customs_hold: "customs",
    delivered: "delivered",
    completed: "delivered",
    cancelled: "cancelled",
    awaiting_payment: "pending",
    out_for_delivery: "out_for_delivery",
  };
  return map[status] || status || "pending";
}
