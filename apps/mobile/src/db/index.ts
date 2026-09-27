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
import { unadaptOrder, mapMobileStatusToDb, adaptSourcing, unadaptAddress, adaptAddress, adaptFavorite } from "@/lib/supabase-adapter";

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
// ORDERS — local-first; production writes go through submit_mobile_order
// =====================================================================
export interface LocalOrderItem {
  id: string;
  /** The source_products uuid when the line came from a real catalog row.
   *  Cart ids (`cart-…`) and WebView capture ids (`web-…`) are not uuids and
   *  are never sent as product_id — order_items.product_id is a uuid column. */
  product_id?: string;
  product_name: string;
  quantity: number;
  price_usd: number;
  /** Which app the customer was actually browsing. Discarding this is why
   *  Mission Control cannot say what was bought where. */
  marketplace?: string;
  source_url?: string;
  image_url?: string;
  /** Unit cost in the marketplace's own currency, at the rate used at add-time. */
  price_cny?: number;
  exchange_rate?: number;
  /** MOQ as displayed when the order was placed; the rule changes constantly. */
  moq?: number;
  variant?: string;
}

export interface LocalOrder {
  id: string;
  reference: string;
  status: string;
  items: LocalOrderItem[];
  total_usd: number;
  shipping_method: "air" | "sea";
  payment_status: string;
  payment_method: string;
  recipient_name: string;
  phone: string;
  city: string;
  address: string;
  /** Free-text carried to production's `notes`; checkout folds the recipient,
   *  phone and payment channel in here because `orders` has no columns for them. */
  notes?: string;
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
  let remote: LocalOrder[] = [];
  try {
    if (await isBackendOnline()) {
      // Real columns only: PostgREST rejects a whole SELECT for one unknown
      // name, which is why order history used to always come back empty.
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, reference, status, payment_status, shipping_method, currency, subtotal_usd, service_fee_usd, total_usd, delivery_address, destination_city, notes, created_at, updated_at"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!error && data) {
        const ids = (data as any[]).map((o) => o.id).filter(Boolean);
        // Two queries beat an orders→order_items embed: the embed only
        // resolves if PostgREST detects the FK, and a second select on the
        // real column list works whatever the relationship hint says.
        const itemsByOrder: Record<string, any[]> = {};
        if (ids.length > 0) {
          const r = await supabase
            .from("order_items")
            .select(
              "id, order_id, product_id, product_name, quantity, unit_price, unit_price_cny, exchange_rate, moq_at_purchase, variant, variant_name, marketplace_key, source_url, image_url"
            )
            .in("order_id", ids);
          if (!r.error && r.data) {
            for (const it of r.data as any[]) {
              const key = it.order_id as string;
              if (!itemsByOrder[key]) itemsByOrder[key] = [];
              itemsByOrder[key].push(it);
            }
          }
        }
        remote = (data as any[]).map((o) => unadaptOrder(o, itemsByOrder[o.id] || []));
      }
    }
  } catch {}
  // Merge: prefer remote; a queued order that has since synced shares its
  // reference with the remote row, so dedupe on id AND reference.
  const ids = new Set(remote.map((r) => r.id));
  const refs = new Set(remote.map((r) => r.reference));
  const merged = [...remote, ...local.filter((l) => !ids.has(l.id) && !refs.has(l.reference))];
  if (remote.length > 0) {
    await safeSet(ORDERS_KEY, JSON.stringify(merged));
  }
  // Opportunistically flush orders queued while offline / as a guest.
  void syncPendingOrders(userId).catch(() => {});
  return merged;
}

export async function saveLocalOrders(orders: LocalOrder[]): Promise<void> {
  await safeSet(ORDERS_KEY, JSON.stringify(orders));
}

/** Result contract shared with checkout and the offline-sync screens:
 *  - ok:false           → nothing was stored anywhere; show the error, keep the cart.
 *  - ok:true stored:    → the row is in production under this (server uuid) id.
 *  - ok:true queued:    → saved on this device with synced:false, retryable via
 *                         syncPendingOrders(); the id is a device-local id. */
export interface CreateOrderResult {
  ok: boolean;
  id?: string;
  stored?: boolean;
  error?: string;
}

/** The RPC multiplies the subtotal by this value, so it is a fraction: the same
 *  5% checkout.tsx previews as `subtotal * 0.05`. Passing 5 would bill 500%. */
const SERVICE_FEE_PCT = 0.05;

function buildRpcItems(order: LocalOrder) {
  return (order.items || []).map((it) => ({
    product_id: it.product_id && UUID_RE.test(it.product_id) ? it.product_id : null,
    product_name: it.product_name || "",
    quantity: Math.max(1, Math.floor(it.quantity) || 1),
    unit_price_usd: it.price_usd ?? 0,
    unit_price_cny: it.price_cny ?? null,
    exchange_rate: it.exchange_rate ?? null,
    marketplace_key: it.marketplace ?? null,
    source_url: it.source_url ?? null,
    image_url: it.image_url ?? null,
    moq: it.moq ?? null,
    variant: it.variant ?? null,
  }));
}

/** One submit path, used by createOrder and by the offline retry queue. */
async function submitMobileOrderRpc(order: LocalOrder): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("submit_mobile_order", {
    p_reference: order.reference,
    p_shipping_method: order.shipping_method || null,
    p_delivery_address: order.address || null,
    p_destination_city: order.city || null,
    p_notes: order.notes || null,
    p_service_fee_pct: SERVICE_FEE_PCT,
    p_items: buildRpcItems(order),
  });
  if (error) return { id: null, error: error.message || "Could not place the order." };
  // The server's uuid is the only field we trust from the echo; totals are
  // recomputed there and may legitimately differ from the preview.
  const id = (data as any)?.id;
  if (!id || typeof id !== "string") return { id: null, error: "The server did not return an order id." };
  return { id, error: null };
}

/**
 * Place an order.
 *
 * Signed in + online → stored in production through submit_mobile_order (the
 * only path that can write order_items). Anything else is queued on the device
 * with synced:false — honestly, not as a fake success — and flushed later by
 * syncPendingOrders(). A failed RPC is reported, never swallowed.
 */
export async function createOrder(
  draft: Omit<LocalOrder, "id" | "synced">
): Promise<CreateOrderResult> {
  let userId: string | null = null;
  try {
    const { data: auth } = await supabase.auth.getUser();
    userId = auth?.user?.id ?? null;
  } catch {}

  if (userId && (await isBackendOnline())) {
    const order: LocalOrder = { ...draft, id: "", synced: true };
    const { id, error } = await submitMobileOrderRpc(order);
    if (error || !id) return { ok: false, error: error || "Could not place the order." };
    order.id = id;
    const orders = await getOrders();
    orders.unshift(order);
    await saveLocalOrders(orders);
    return { ok: true, id, stored: true };
  }

  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const order: LocalOrder = { ...draft, id, synced: false };
  const orders = await getOrders();
  orders.unshift(order);
  await saveLocalOrders(orders);
  return { ok: true, id, stored: false };
}

/** Retry every queued (synced:false) order. Returns the number stored. */
export async function syncPendingOrders(userId: string): Promise<number> {
  void userId; // the RPC takes the caller from the session, not an argument
  const pending = (await getOrders()).filter((o) => !o.synced);
  if (pending.length === 0) return 0;
  let syncedCount = 0;
  for (const order of pending) {
    try {
      const { id, error } = await submitMobileOrderRpc(order);
      if (error || !id) continue;
      const cur = await getOrders();
      const idx = cur.findIndex((o) => o.id === order.id);
      if (idx >= 0) {
        cur[idx] = { ...cur[idx], synced: true };
        await saveLocalOrders(cur);
        syncedCount += 1;
      }
    } catch {}
  }
  return syncedCount;
}

export async function updateOrderStatus(
  id: string,
  status: string
): Promise<{ ok: boolean; remote: boolean; error?: string }> {
  const orders = await getOrders();
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) return { ok: false, remote: false, error: "Order not found on this device." };

  // A queued `local-…` id has no production row to move (yet). For stored
  // orders the remote update goes first: if it fails we do NOT rewrite the
  // local copy, so the list never shows a status the admin has never seen.
  let remote = false;
  if (UUID_RE.test(id)) {
    try {
      if (await isBackendOnline()) {
        const { error } = await supabase
          .from("orders")
          .update({ status: mapMobileStatusToDb(status), updated_at: new Date().toISOString() })
          .eq("id", id);
        if (error) return { ok: false, remote: false, error: error.message };
        remote = true;
      }
    } catch (e: any) {
      return { ok: false, remote: false, error: e?.message };
    }
  }

  orders[idx] = { ...orders[idx], status, updated_at: new Date().toISOString() };
  await saveLocalOrders(orders);
  return { ok: true, remote };
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

/**
 * Row → app model.
 *
 * Two vocabularies meet here. `source_products` was created (202408010004) in
 * the marketplace's own terms — source_title, source_images, source_price,
 * in_stock — and both apps have always spoken a curated one — title_english,
 * images, price_cny_min, stock_status — which no migration added until
 * 202609250004. So a row can arrive with either set, and the curated one can be
 * NULL on rows the importer filled. Read every field from both names instead of
 * betting on which deploy this project is on: a product with a blank title and
 * no image is indistinguishable from "the catalog is empty" on this screen.
 */
function mapRowToProduct(p: any): Product {
  const curatedTitle = firstText(p.title_english, p.title, p.name);
  const originalTitle = firstText(p.title_original, p.source_title);
  const title = curatedTitle || originalTitle;

  const curatedPriceCny = positiveOr(firstNumber(p.price_cny_min, p.price_cny, p.source_price));
  const images =
    Array.isArray(p.images) && p.images.length > 0
      ? p.images
      : Array.isArray(p.source_images) && p.source_images.length > 0
        ? p.source_images
        : p.image
          ? [p.image]
          : [];

  return {
    id: p.id,
    marketplace: p.marketplace || "chinasuuq",
    // The table's marketplace-side key is the text column `source_id`;
    // `source_product_id` is what every other table in this schema calls it.
    source_product_id: firstText(p.source_product_id, p.source_id) || p.id,
    source_url: p.source_url || "",
    title_original: originalTitle || title,
    title_english: title,
    title_somali: firstText(p.title_somali) || title,
    description_original: firstText(p.description_original, p.source_description) || undefined,
    description_english: firstText(p.description_english, p.source_description) || undefined,
    description_somali: firstText(p.description_somali) || undefined,
    images,
    category: firstText(p.category) || "",
    attributes:
      p.attributes && typeof p.attributes === "object" && !Array.isArray(p.attributes)
        ? p.attributes
        : {},
    variants: Array.isArray(p.variants) ? p.variants : [],
    moq: p.moq ?? 1,
    // MOQ provenance (migration 202609250003_moq_extraction). Kept as-is so
    // resolveMoq() can tell a human-confirmed minimum from a parser guess —
    // and so a bare `moq: 1` is never mistaken for "one piece is allowed".
    moq_source: normalizeMoqSource(p.moq_source),
    moq_confidence: normalizeMoqConfidence(p.moq_confidence),
    moq_raw_text: typeof p.moq_raw_text === "string" && p.moq_raw_text ? p.moq_raw_text : null,
    price_cny_min: curatedPriceCny ?? 0,
    price_cny_max: firstNumber(p.price_cny_max) ?? curatedPriceCny ?? 0,
    price_usd_estimated:
      firstNumber(p.price_usd_estimated) ?? (curatedPriceCny !== null ? curatedPriceCny / 7.25 : 0),
    domestic_shipping_cny: firstNumber(p.domestic_shipping_cny) ?? 0,
    // stock_status is the curated three-state flag; in_stock is the boolean the
    // importers write. 202609250004 keeps them in step by trigger, but a row
    // written before it can carry only one, so the boolean is the fallback
    // rather than a second opinion.
    stock_status: normalizeStockStatus(p.stock_status) ?? (p.in_stock === false ? "out_of_stock" : "in_stock"),
    supplier_rating: firstNumber(p.supplier_rating, p.seller_rating) ?? 0,
    sales_count: firstNumber(p.sales_count) ?? 0,
    last_synced_at: p.last_synced_at || p.updated_at || "",
    created_at: p.created_at || "",
  };
}

/** '' and NULL are the same absence here, and the DB allows both. */
function firstText(...values: unknown[]): string {
  for (const v of values) if (typeof v === "string" && v.trim()) return v;
  return "";
}

function firstNumber(...values: unknown[]): number | null {
  for (const v of values) {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n === "number" && Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Live declares `price_cny_min NUMERIC NOT NULL DEFAULT 0`, so 0 is the column's
 * own word for "nobody priced this" — the same absence as NULL. Carrying it
 * through renders a real product as free on every screen.
 */
function positiveOr(value: number | null): number | null {
  return value !== null && value > 0 ? value : null;
}

/** A CHECK constraint keeps new rows honest; old rows and other generations do not. */
function normalizeStockStatus(v: unknown): Product["stock_status"] | null {
  return v === "in_stock" || v === "low_stock" || v === "out_of_stock" ? v : null;
}

/** The DB has a CHECK on this column; anything else is a stale cache row. */
function normalizeMoqSource(v: unknown): Product["moq_source"] {
  return v === "manual" || v === "regex" || v === "ai" ? v : null;
}

/** NUMERIC(4,3) can arrive as a string from some drivers. */
function normalizeMoqConfidence(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// =====================================================================
// MOQ PROVENANCE — writing the minimum back, local-first
// =====================================================================
import type { MoqSource } from "@/lib/moqIngest";
import { buildMoqCapture } from "@/lib/moqIngest";

export interface MoqDecision {
  moq: number;
  source: MoqSource;
  confidence: number;
  /** The marketplace wording this reading came from ("10件起批"). */
  rawText?: string | null;
}

/** record_moq_candidate() takes a uuid; a capture's `web-<id>` row has none. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Apply a decision to every cached copy of the product, offline-inclusive. */
async function applyMoqToLocalCache(productId: string, d: MoqDecision): Promise<void> {
  try {
    const all = await getProducts();
    const idx = all.findIndex((p) => p.id === productId);
    if (idx === -1) return;
    all[idx] = {
      ...all[idx],
      moq: d.moq,
      moq_source: d.source,
      moq_confidence: d.confidence,
      moq_raw_text: d.rawText ?? null,
    };
    await safeSet(PRODUCTS_KEY, JSON.stringify(all));
  } catch {}
}

/**
 * Persist "this is the minimum" for a product.
 *
 * Same local-first shape as every other write here: the local row is updated
 * first so the cart and the detail screen agree immediately, then the server is
 * asked. Who may ask is decided by RLS, not by this function:
 * `source_products` is writable only under `source_products_manage_admin`
 * (staff/super_admin), and record_moq_candidate() — the machine gate — is
 * granted to service_role only, so calling it from any app session is a
 * guaranteed permission error. A direct UPDATE is the path that actually works:
 * a staff session moves the catalog value, a customer's UPDATE matches zero
 * rows and the decision stays local, travelling with the cart snapshot instead.
 * The provenance columns arrive with migration 202609250003; before that the
 * UPDATE fails and the decision is local-only, which is the same visible
 * outcome as a non-staff caller.
 */
export async function saveMoqDecision(
  productId: string,
  d: MoqDecision
): Promise<{ local: boolean; remote: string | null }> {
  const decision: MoqDecision = {
    moq: Math.max(1, Math.floor(d.moq) || 1),
    source: d.source,
    confidence: Math.min(1, Math.max(0, d.confidence)),
    rawText: d.rawText ?? null,
  };
  await applyMoqToLocalCache(productId, decision);
  if (!UUID_RE.test(productId)) return { local: true, remote: null };
  try {
    if (await isBackendOnline()) {
      const patch: Record<string, unknown> = {
        moq: decision.moq,
        moq_source: decision.source,
        moq_confidence: decision.confidence,
        moq_raw_text: decision.rawText ? decision.rawText.slice(0, 500) : null,
      };
      if (decision.source === "manual") patch.moq_reviewed_at = new Date().toISOString();
      const { error, count } = await supabase
        .from("source_products")
        .update(patch, { count: "exact" })
        .eq("id", productId);
      if (error) return { local: true, remote: "error" };
      // Zero rows is RLS saying the caller is not staff, not a broken write.
      return { local: true, remote: (count ?? 0) > 0 ? "written" : null };
    }
  } catch {}
  return { local: true, remote: null };
}

export interface AiMoqAnswer {
  moq: number;
  confidence: number;
  rawText: string | null;
}

/**
 * The paid fallback: when the offline parser cannot read the listing, ask the
 * product-enrich edge function (it authenticates the caller, quotes the page
 * text to the model, re-validates the answer, and persists it through
 * record_moq_candidate with source 'ai'). Best-effort: null on any failure —
 * the caller keeps showing the honest "unconfirmed" state.
 */
export async function enrichMoqWithAi(args: {
  productId?: string | null;
  title: string;
  marketplace?: string | null;
  capturedText: string | null | undefined;
}): Promise<AiMoqAnswer | null> {
  const productId = args.productId && UUID_RE.test(args.productId) ? args.productId : "";
  const body = {
    ...buildMoqCapture(productId, args.capturedText),
    title: args.title,
    marketplace: args.marketplace || "",
  };
  try {
    if (!(await isBackendOnline())) return null;
    const { data, error } = await supabase.functions.invoke("product-enrich", { body });
    if (error || !data || typeof data !== "object") return null;
    const res = data as { error?: string; moq?: unknown; moq_confidence?: unknown; moq_raw_text?: unknown; recorded?: unknown };
    if (res.error) return null;
    const moq = Number(res.moq);
    if (!Number.isInteger(moq) || moq < 1) return null;
    const answer: AiMoqAnswer = {
      moq,
      confidence: Number.isFinite(Number(res.moq_confidence)) ? Number(res.moq_confidence) : 0,
      rawText: typeof res.moq_raw_text === "string" ? res.moq_raw_text : null,
    };
    // The function already wrote it when it had a real row: mirror that truth.
    if (productId && res.recorded === "written") {
      await applyMoqToLocalCache(productId, {
        moq: answer.moq,
        source: "ai",
        confidence: answer.confidence,
        rawText: answer.rawText,
      });
    }
    return answer;
  } catch {
    return null;
  }
}


// =====================================================================
// MARKETPLACE PRODUCTS — curated catalog per marketplace
// =====================================================================

/**
 * Fetch in-stock products for a specific marketplace from Supabase.
 * Used as a fallback when the WebView is blocked (login wall / CDN block).
 *
 * The query filters ONLY on `marketplace`: it is the one column this screen
 * needs that every generation has (202408010014), and PostgREST fails a whole
 * statement over a single unknown column, so an earlier version that added
 * `.eq("stock_status")` and `.order("sales_count")` — columns no migration
 * created until 202609250004 — errored every time and this list silently
 * degenerated to whatever happened to be cached on the device. Stock and
 * popularity are applied below, where an absent column is just a default.
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
        .limit(60);
      if (!error && data && data.length) {
        return data
          .map((p: any) => mapRowToProduct(p))
          .filter((p) => p.stock_status !== "out_of_stock")
          .sort((a, b) => b.sales_count - a.sales_count || a.title_english.localeCompare(b.title_english))
          .slice(0, 30);
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
        // city is not a profiles column — it lives on customer_profiles.
        let city: string | null = null;
        const c = await supabase
          .from("customer_profiles")
          .select("city")
          .eq("user_id", userId)
          .maybeSingle();
        if (!c.error) city = (c.data as any)?.city ?? null;
        const merged = { ...data, city } as UserProfile;
        await safeSet(PROFILE_KEY, JSON.stringify(merged));
        return merged;
      }
    }
  } catch {}
  const cached = await safeGet(PROFILE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch {}
  }
  return null;
}

/** Persist profile updates to Supabase `profiles` + `customer_profiles`.
 *
 *  `profiles` has no city column; the customer's city belongs to
 *  `customer_profiles`. Sending city to `profiles` would make Postgres reject
 *  the whole UPDATE (one unknown name fails the statement), so the payload is
 *  split across the two tables it actually belongs to.
 */
export async function updateProfile(userId: string, updates: Partial<UserProfile>): Promise<void> {
  const { city, ...profileFields } = updates;
  try {
    if (await isBackendOnline()) {
      if (Object.keys(profileFields).length > 0) {
        const { error } = await supabase
          .from("profiles")
          .update({ ...profileFields, updated_at: new Date().toISOString() })
          .eq("id", userId);
        if (error) throw error;
      }
      if (city !== undefined) {
        const { error } = await supabase
          .from("customer_profiles")
          .upsert({ user_id: userId, city, updated_at: new Date().toISOString() });
        if (error) throw error;
      }
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
  // Sync to Supabase (the row is `addresses`, owned by user_id)
  try {
    if (await isBackendOnline()) {
      const row = adaptAddress(addr, addr.user_id);
      // If the user just set this address as default, clear others
      if (addr.is_default) {
        await supabase
          .from("addresses")
          .update({ is_default: false })
          .eq("user_id", addr.user_id)
          .neq("id", result.id || "00000000-0000-0000-0000-000000000000");
      }
      // A device-generated id (`addr-…`) is not a uuid: it can only be an
      // insert, and the server's uuid is then adopted back.
      const isUuid = UUID_RE.test(result.id || "");
      const { data, error } = isUuid
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
        .eq("user_id", userId);
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
      const { data } = await supabase
        .from("favorites")
        .select("id")
        .eq("user_id", userId)
        .eq("product_id", productId)
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
// SUPPORT TICKETS — `support_tickets` (user_id, subject, category) plus one
// `support_messages` row carrying the body. There is no description column.
// =====================================================================
export interface SupportTicketInput {
  subject: string;
  message: string; // stored as a support_messages row
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
      // Production's vocabulary: `user_id` (not profile_id), no `description`
      // and no `ticket_number` on support_tickets — the body is a row in
      // support_messages and the display reference comes from the id.
      const { data, error } = await supabase
        .from("support_tickets")
        .insert({
          user_id: profileId,
          subject,
          category: input.category || "other",
        })
        .select("id, created_at")
        .maybeSingle();
      if (error) {
        return { ok: false, error: error.message };
      }
      if (!data?.id) {
        return { ok: false, error: "The ticket was not stored." };
      }
      const messageError = await supabase
        .from("support_messages")
        .insert({ ticket_id: data.id, sender_id: profileId, message });
      if (messageError.error) {
        // The ticket exists but the customer's words did not land; say so
        // rather than reporting a ticket nobody can read.
        return { ok: false, error: messageError.error.message };
      }
      return {
        ok: true,
        id: data.id,
        ticketNumber: `CS-${String(data.id).slice(0, 8).toUpperCase()}`,
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
/** Count unread notifications (`read = false`) for a user. */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  try {
    if (await isBackendOnline()) {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("read", false)
        .eq("user_id", userId);
      if (!error && typeof count === "number") {
        return count;
      }
    }
  } catch {}
  return 0;
}

