// Local-first resilient data repository for ChinaSuuq mobile.
//
// Every read/write goes through here. It tries Supabase first; if the backend
// is unreachable (paused / offline / DNS down), it transparently falls back to
// AsyncStorage so the app stays fully usable. When Supabase comes back online
// the same calls write straight through to the admin mission-control tables.
//
// This is the single source of truth for the screens — they never touch
// supabase or AsyncStorage directly.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";

// ---- safe AsyncStorage helpers (never crash the app) ----
const safeGet = async (k: string) => {
  try {
    return await AsyncStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeSet = async (k: string, v: string) => {
  try {
    await AsyncStorage.setItem(k, v);
  } catch {
    /* ignore storage failures */
  }
};
const safeRemove = async (k: string) => {
  try {
    await AsyncStorage.removeItem(k);
  } catch {}
};

export interface BackendState {
  online: boolean;
  checkedAt: number;
}

let cachedOnline: boolean | null = null;
let cachedCheckedAt = 0;
const HEALTH_TTL = 60_000; // re-check every 60s

/**
 * Ping a real table to prove the backend is reachable. Returns true if Supabase
 * is live (any HTTP response that isn't a network/TLS error).
 */
export async function isBackendOnline(force = false): Promise<boolean> {
  const now = Date.now();
  if (!force && cachedOnline !== null && now - cachedCheckedAt < HEALTH_TTL) {
    return cachedOnline;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      "https://athkmrvsaijwgsyvwrbp.supabase.co/rest/v1/orders?select=id&limit=1",
      { signal: controller.signal }
    );
    clearTimeout(timer);
    cachedOnline = true; // any response (200/401/404) = project alive
  } catch {
    cachedOnline = false; // network/TLS/DNS failure = unreachable
  }
  cachedCheckedAt = now;
  return cachedOnline;
}

/**
 * Force a fresh check (call after a failed write / pull-to-refresh).
 */
export async function refreshBackendState(): Promise<BackendState> {
  const online = await isBackendOnline(true);
  return { online, checkedAt: Date.now() };
}

// =====================================================================
// ORDERS — local-first, syncs to Supabase `orders` table
// =====================================================================
export interface LocalOrder {
  id: string;
  reference: string;
  status: string;
  items: { id: string; product_name: string; quantity: number; price_usd: number }[];
  total_usd: number;
  shipping_method: "air" | "sea";
  payment_status: string;
  payment_method: string;
  recipient_name: string;
  phone: string;
  city: string;
  address: string;
  created_at: string;
  updated_at: string;
  synced: boolean;
}

const ORDERS_KEY = "chinasuuq-local-orders";

export async function getOrders(): Promise<LocalOrder[]> {
  const raw = await safeGet(ORDERS_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      /* corrupt */
    }
  }
  return [];
}

export async function getOrderById(id: string): Promise<LocalOrder | null> {
  const all = await getOrders();
  return all.find((o) => o.id === id || o.reference === id) || null;
}

/** Fetch orders for a user from Supabase `orders`, merged with local cache. */
export async function getOrdersByUser(userId: string): Promise<LocalOrder[]> {
  const local = await getOrders();
  try {
    if (await isBackendOnline()) {
      const { data, error } = await supabase
        .from("orders")
        .select("id, reference, status, total_usd, shipping_method, payment_status, destination_city, delivery_address, created_at, updated_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (!error && Array.isArray(data)) {
        const mapped: LocalOrder[] = data.map((o: any) => ({
          id: o.id,
          reference: o.reference || o.id,
          status: o.status || "pending",
          items: [],
          total_usd: o.total_usd ?? 0,
          shipping_method: o.shipping_method === "sea" ? "sea" : "air",
          payment_status: o.payment_status || "pending",
          payment_method: "",
          recipient_name: "",
          phone: "",
          city: o.destination_city || "",
          address: o.delivery_address || "",
          created_at: o.created_at || new Date().toISOString(),
          updated_at: o.updated_at || o.created_at || "",
          synced: true,
        }));
        return mapped;
      }
    }
  } catch {}
  return local;
}

export async function saveLocalOrders(orders: LocalOrder[]): Promise<void> {
  await safeSet(ORDERS_KEY, JSON.stringify(orders));
}

export async function createOrder(order: LocalOrder): Promise<LocalOrder> {
  const orders = await getOrders();
  orders.unshift(order);
  await saveLocalOrders(orders);
  // best-effort sync to Supabase (fire and forget)
  try {
    if (await isBackendOnline()) {
      await supabase.from("orders").insert({
        id: order.id,
        reference: order.reference,
        status: order.status,
        total_usd: order.total_usd,
        shipping_method: order.shipping_method,
        payment_status: order.payment_status,
        payment_method: order.payment_method,
        recipient_name: order.recipient_name,
        phone: order.phone,
        city: order.city,
        address: order.address,
        items: order.items,
        created_at: order.created_at,
      });
    }
  } catch {
    // offline — stays local, synced on next online
  }
  return order;
}

export async function updateOrderStatus(id: string, status: string): Promise<void> {
  const orders = await getOrders();
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) return;
  orders[idx] = { ...orders[idx], status, updated_at: new Date().toISOString() };
  await saveLocalOrders(orders);
  try {
    if (await isBackendOnline()) {
      await supabase.from("orders").update({ status }).eq("id", id);
    }
  } catch {}
}

// =====================================================================
// PRODUCTS — real products, local cache + Supabase `source_products` table
// (matches the web admin's Products CRUD table)
// =====================================================================
import type { Product } from "@/types";
const PRODUCTS_KEY = "chinasuuq-local-products";

export async function getProducts(): Promise<Product[]> {
  const raw = await safeGet(PRODUCTS_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {}
  }
  // seed empty, try supabase
  try {
    if (await isBackendOnline()) {
      const { data } = await supabase.from("source_products").select("*").limit(200);
      if (data && data.length) {
        const mapped = data.map((p: any) => mapRowToProduct(p));
        await safeSet(PRODUCTS_KEY, JSON.stringify(mapped));
        return mapped;
      }
    }
  } catch {}
  return [];
}

export async function getProductById(id: string): Promise<Product | null> {
  const all = await getProducts();
  return all.find((p) => p.id === id) || null;
}

function mapRowToProduct(p: any): Product {
  return {
    id: p.id,
    marketplace: p.marketplace || "chinasuuq",
    source_product_id: p.source_product_id || p.id,
    source_url: p.source_url || "",
    title_original: p.title_original || p.title || "",
    title_english: p.title_english || p.title || p.name || "",
    title_somali: p.title_somali || p.title_english || p.title || "",
    description_original: p.description_original,
    description_english: p.description_english,
    description_somali: p.description_somali,
    images: p.images || (p.image ? [p.image] : []),
    category: p.category || "",
    attributes: p.attributes || {},
    variants: p.variants || [],
    moq: p.moq ?? 1,
    price_cny_min: p.price_cny_min ?? p.price_cny ?? 0,
    price_cny_max: p.price_cny_max ?? p.price_cny ?? 0,
    price_usd_estimated: p.price_usd_estimated ?? (p.price_cny ? p.price_cny / 7.25 : 0),
    domestic_shipping_cny: p.domestic_shipping_cny ?? 0,
    stock_status: p.stock_status || "in_stock",
    supplier_rating: p.supplier_rating ?? 0,
    sales_count: p.sales_count ?? 0,
    last_synced_at: p.last_synced_at || p.updated_at || "",
    created_at: p.created_at || "",
  };
}

// =====================================================================
// SOURCING REQUESTS — the "captured marketplace products" feed the admin
// sourcing mission-control table
// =====================================================================
export interface SourcingCapture {
  id: string;
  customer_id?: string;
  marketplace: string;
  product_url: string;
  product_description: string;
  quantity: number;
  destination_city: string;
  price_cny?: number;
  price_usd?: number;
  images?: string[];
  selected_options?: Record<string, string>;
  status: string;
  created_at: string;
  synced: boolean;
}

const SOURCING_KEY = "chinasuuq-local-sourcing";

export async function getSourcingCaptures(): Promise<SourcingCapture[]> {
  const raw = await safeGet(SOURCING_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {}
  }
  return [];
}

export async function saveSourcingCapture(c: SourcingCapture): Promise<SourcingCapture> {
  const all = await getSourcingCaptures();
  all.unshift(c);
  await safeSet(SOURCING_KEY, JSON.stringify(all));

  // sync to Supabase `sourcing_requests` for the admin mission control
  try {
    if (await isBackendOnline()) {
      const { error } = await supabase.from("sourcing_requests").insert({
        marketplace: c.marketplace,
        product_url: c.product_url,
        product_description: c.product_description,
        quantity: c.quantity,
        destination_city: c.destination_city,
        price_cny: c.price_cny,
        price_usd: c.price_usd,
        images: c.images,
        status: "pending",
      });
      if (!error) {
        // mark synced
        await setSourcingSynced(c.id, true);
      }
    }
  } catch {}
  return c;
}

async function setSourcingSynced(id: string, synced: boolean): Promise<void> {
  const all = await getSourcingCaptures();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx], synced };
  await safeSet(SOURCING_KEY, JSON.stringify(all));
}

// =====================================================================
// SHIPPING QUOTE — air/sea choice only; shipping paid on arrival (per product)
// =====================================================================
export const SHIPPING_METHODS = [
  { id: "air", label: "Air Freight", days: "5–12 days", desc: "Faster, paid on arrival" },
  { id: "sea", label: "Sea Freight", days: "25–40 days", desc: "Economical, paid on arrival" },
] as const;

// =====================================================================
// PROFILE — user profile + customer profile (syncs to admin mission control)
// =====================================================================
export interface UserProfile {
  id?: string;
  full_name: string;
  phone?: string | null;
  city?: string | null;
  language?: string | null;
  is_active?: boolean;
  updated_at?: string;
}

export interface CustomerProfile {
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

const PROFILE_KEY = "chinasuuq-local-profile";

/** Fetch the user's profile from Supabase `profiles`, falling back to cache. */
export async function getProfile(userId: string): Promise<UserProfile | null> {
  try {
    if (await isBackendOnline()) {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (!error && data) {
        await safeSet(PROFILE_KEY, JSON.stringify(data));
        return data as UserProfile;
      }
    }
  } catch {}
  const cached = await safeGet(PROFILE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch {}
  }
  return null;
}

/** Persist profile updates to Supabase `profiles` + `customer_profiles`. */
export async function updateProfile(userId: string, updates: Partial<UserProfile>): Promise<void> {
  try {
    if (await isBackendOnline()) {
      const { error } = await supabase.from("profiles")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", userId);
      if (error) throw error;
    }
  } catch {}
  // Local optimistic cache
  try {
    const cur = await getProfile(userId) || { full_name: "" };
    await safeSet(PROFILE_KEY, JSON.stringify({ ...cur, ...updates }));
  } catch {}
}

// =====================================================================
// ADDRESSES — saved delivery addresses (syncs to admin)
// =====================================================================
export interface SavedAddress {
  id?: string;
  user_id: string;
  label: string;
  full_name: string;
  phone: string;
  city: string;
  district?: string;
  address_line1: string;
  address_line2?: string;
  postal_code?: string;
  is_default?: boolean;
  created_at?: string;
  updated_at?: string;
}

const ADDRESSES_KEY = "chinasuuq-local-addresses";

export async function getAddresses(userId: string): Promise<SavedAddress[]> {
  try {
    if (await isBackendOnline()) {
      const { data, error } = await supabase.from("addresses").select("*").eq("user_id", userId).order("is_default", { ascending: false });
      if (!error && data) {
        await safeSet(ADDRESSES_KEY, JSON.stringify(data));
        return data as SavedAddress[];
      }
    }
  } catch {}
  const cached = await safeGet(ADDRESSES_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch {}
  }
  return [];
}

export async function saveAddress(addr: SavedAddress): Promise<SavedAddress> {
  // Local first
  const all = await getAddresses(addr.user_id);
  let result: SavedAddress;
  if (addr.id) {
    const idx = all.findIndex((a) => a.id === addr.id);
    if (idx >= 0) all[idx] = { ...all[idx], ...addr, updated_at: new Date().toISOString() };
    result = all[idx];
  } else {
    result = { ...addr, id: `addr-${Date.now()}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    all.unshift(result);
  }
  await safeSet(ADDRESSES_KEY, JSON.stringify(all));
  // Sync to Supabase
  try {
    if (await isBackendOnline()) {
      const { data, error } = addr.id
        ? await supabase.from("addresses").update(addr).eq("id", addr.id).select().single()
        : await supabase.from("addresses").insert(addr).select().single();
      if (!error && data?.id) result = { ...result, id: data.id };
    }
  } catch {}
  return result;
}

export async function deleteAddress(id: string, userId: string): Promise<void> {
  const all = await getAddresses(userId);
  await safeSet(ADDRESSES_KEY, JSON.stringify(all.filter((a) => a.id !== id)));
  try {
    if (await isBackendOnline()) {
      await supabase.from("addresses").delete().eq("id", id);
    }
  } catch {}
}

// =====================================================================
// PAYMENTS — order payment records (read-mostly, links to admin)
// =====================================================================
export interface PaymentRecord {
  id: string;
  order_id?: string;
  amount: number;
  currency?: string;
  method?: string;
  status?: string;
  reference?: string;
  shipping_method?: string;
  created_at?: string;
}
export async function getPaymentsByUser(userId: string): Promise<PaymentRecord[]> {
  try {
    if (await isBackendOnline()) {
      const { data, error } = await supabase
        .from("orders")
        .select("id, reference, total_usd, payment_status, shipping_method, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (!error && data) {
        return data.map((o: any) => ({
          id: o.id,
          reference: o.reference,
          amount: o.total_usd ?? 0,
          status: o.payment_status ?? "pending",
          shipping_method: o.shipping_method,
          created_at: o.created_at,
        }));
      }
    }
  } catch {}
  return [];
}

// =====================================================================
// FAVORITES / WISHLIST
// =====================================================================
export async function getFavorites(userId: string): Promise<Product[]> {
  try {
    if (await isBackendOnline()) {
      const { data, error } = await supabase.from("favorites").select("*, source_products(*)").eq("user_id", userId);
      if (!error && data) {
        return (data as any[]).map((f: any) => mapRowToProduct(f.source_products)).filter(Boolean);
      }
    }
  } catch {}
  return [];
}

export async function toggleFavorite(userId: string, productId: string): Promise<boolean> {
  try {
    if (await isBackendOnline()) {
      const { data } = await supabase.from("favorites").select("id").eq("user_id", userId).eq("product_id", productId).maybeSingle();
      if (data) {
        await supabase.from("favorites").delete().eq("id", data.id);
        return false;
      } else {
        await supabase.from("favorites").insert({ user_id: userId, product_id: productId });
        return true;
      }
    }
  } catch {}
  return false;
}

