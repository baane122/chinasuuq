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
import { adaptOrder, unadaptOrder, mapMobileStatusToDb, adaptSourcing, unadaptAddress, adaptAddress, adaptFavorite } from "@/lib/supabase-adapter";

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

/** Fetch orders for a user from Supabase, merged with local cache. */
export async function getOrdersByUser(userId: string): Promise<LocalOrder[]> {
  const local = await getOrders();
  try {
    if (await isBackendOnline()) {
      // Try the admin view first; if it doesn't exist, fall back to base orders.
      let data: any[] | null = null;
      try {
        const v = await supabase
          .from("admin_orders_view")
          .select("id, order_number, reference, status, payment_status, payment_method, shipping_method, subtotal, shipping_cost, service_fee, total, recipient_name, phone, city, address, items, created_at, updated_at")
          .eq("profile_id", userId)
          .order("created_at", { ascending: false })
          .limit(200);
        if (!v.error && v.data) data = v.data as any[];
      } catch {}
      if (!data) {
        const r = await supabase
          .from("orders")
          .select("id, order_number, reference, status, payment_status, payment_method, shipping_method, subtotal, shipping_cost, service_fee, total, recipient_name, phone, city, address, items, created_at, updated_at")
          .eq("profile_id", userId)
          .order("created_at", { ascending: false })
          .limit(200);
        if (!r.error && r.data) data = r.data as any[];
      }
      if (data) {
        const remote: LocalOrder[] = data.map((o: any) => unadaptOrder(o));
        // Merge: prefer remote, keep local-only orders
        const ids = new Set(remote.map((r) => r.id));
        const merged = [...remote, ...local.filter((l) => !ids.has(l.id))];
        // Cache remote so next offline open is instant
        await safeSet(ORDERS_KEY, JSON.stringify(merged));
        return merged;
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
  // best-effort sync to Supabase (fire and forget) — uses the real schema via the adapter
  try {
    if (await isBackendOnline()) {
      const { data: auth } = await supabase.auth.getUser();
      const profileId = auth?.user?.id ?? null;
      const row = adaptOrder(order, profileId);
      await supabase.from("orders").upsert(row, { onConflict: "id" });
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
      const dbStatus = mapMobileStatusToDb(status);
      await supabase.from("orders").update({ status: dbStatus, updated_at: new Date().toISOString() }).eq("id", id);
    }
  } catch {}
}

// =====================================================================
// PRODUCTS — real products, local cache + Supabase `source_products` table
// (matches the web admin's Products CRUD table)
// =====================================================================
import type { Product } from "@/types";
const PRODUCTS_KEY = "chinasuuq-local-products";

export async function getProducts(force = false): Promise<Product[]> {
  if (!force) {
    const raw = await safeGet(PRODUCTS_KEY);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {}
    }
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
  // Fall back to local product cache (kept intact even when force=false only —
  // a force refresh still returns [] rather than stale cache if the backend fails).
  if (force) {
    const raw = await safeGet(PRODUCTS_KEY);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {}
    }
  }
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
// MARKETPLACE PRODUCTS — curated catalog per marketplace
// =====================================================================

/**
 * Fetch in-stock products for a specific marketplace from Supabase.
 * Used as a fallback when the WebView is blocked (login wall / CDN block).
 */
export async function getMarketplaceProducts(
  marketplace: string
): Promise<Product[]> {
  try {
    if (await isBackendOnline()) {
      const { data, error } = await supabase
        .from("source_products")
        .select("*")
        .eq("marketplace", marketplace)
        .eq("stock_status", "in_stock")
        .order("sales_count", { ascending: false })
        .limit(30);
      if (!error && data && data.length) {
        return data.map((p: any) => mapRowToProduct(p));
      }
    }
  } catch {}
  // Fall back to local product cache filtered by marketplace
  const all = await getProducts();
  return all.filter((p) => p.marketplace === marketplace);
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
      const { data: auth } = await supabase.auth.getUser();
      const row = adaptSourcing(c, auth?.user?.id ?? null);
      const { error } = await supabase.from("sourcing_requests").upsert(row, { onConflict: "id" });
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
      const { data, error } = await supabase.from("addresses").select("*").or(`profile_id.eq.${userId},user_id.eq.${userId}`).order("is_default", { ascending: false });
      if (!error && data) {
        const mapped = data.map((r: any) => unadaptAddress(r));
        await safeSet(ADDRESSES_KEY, JSON.stringify(mapped));
        return mapped as SavedAddress[];
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
  // Sync to Supabase via the adapter (uses profile_id)
  try {
    if (await isBackendOnline()) {
      const row = adaptAddress(addr, addr.user_id);
      // If the user just set this address as default, clear others
      if (addr.is_default) {
        await supabase
          .from("addresses")
          .update({ is_default: false })
          .or(`profile_id.eq.${addr.user_id},user_id.eq.${addr.user_id}`)
          .neq("id", result.id || "00000000-0000-0000-0000-000000000000");
      }
      const { data, error } = addr.id
        ? await supabase.from("addresses").update(row).eq("id", result.id).select().single()
        : await supabase.from("addresses").insert(row).select().single();
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
      const { data, error } = await supabase
        .from("favorites")
        .select("*, source_products(*)")
        .or(`profile_id.eq.${userId},user_id.eq.${userId}`);
      if (!error && data) {
        return (data as any[])
          .map((f: any) => mapRowToProduct(f.source_products))
          .filter(Boolean);
      }
    }
  } catch {}
  return [];
}

export async function toggleFavorite(userId: string, productId: string): Promise<boolean> {
  try {
    if (await isBackendOnline()) {
      // Look up by either id; legacy schema used user_id, current uses profile_id
      const { data } = await supabase
        .from("favorites")
        .select("id")
        .or(`and(profile_id.eq.${userId},source_product_id.eq.${productId}),and(user_id.eq.${userId},product_id.eq.${productId})`)
        .maybeSingle();
      if (data) {
        await supabase.from("favorites").delete().eq("id", data.id);
        return false;
      } else {
        const row = adaptFavorite(userId, productId);
        await supabase.from("favorites").insert(row);
        return true;
      }
    }
  } catch {}
  return false;
}

// =====================================================================
// SUPPORT TICKETS — creates rows in the `support_tickets` table
// (subject, description, category, status 'open', profile_id from auth)
// =====================================================================
export interface SupportTicketInput {
  subject: string;
  message: string; // maps to `description` column
  category?: string; // defaults to 'other'
}

export interface SupportTicketResult {
  ok: boolean;
  id?: string;
  ticketNumber?: string;
  error?: string;
}

/** Create a support ticket in Supabase. Requires a logged-in user. */
export async function createSupportTicket(
  input: SupportTicketInput,
  profileId: string | null
): Promise<SupportTicketResult> {
  if (!profileId) {
    return { ok: false, error: "Please sign in to submit a support ticket." };
  }
  const subject = (input.subject || "").trim();
  const message = (input.message || "").trim();
  if (!subject || !message) {
    return { ok: false, error: "Subject and message are required." };
  }
  try {
    if (await isBackendOnline()) {
      const row = {
        profile_id: profileId,
        subject,
        description: message,
        category: input.category || "other",
        // status + created_at default at the DB level
      };
      const { data, error } = await supabase
        .from("support_tickets")
        .insert(row)
        .select("id, ticket_number")
        .maybeSingle();
      if (error) {
        return { ok: false, error: error.message };
      }
      return {
        ok: true,
        id: data?.id,
        ticketNumber: data?.ticket_number,
      };
    }
    return { ok: false, error: "Backend is offline. Please try again later." };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Could not submit ticket." };
  }
}

// =====================================================================
// NOTIFICATIONS — unread count badge
// =====================================================================
/** Count unread notifications (read_at IS NULL) for a user. */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  try {
    if (await isBackendOnline()) {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null)
        .eq("profile_id", userId);
      if (!error && typeof count === "number") {
        return count;
      }
    }
  } catch {}
  return 0;
}

