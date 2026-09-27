// Trending products for the home screen — offline-first read of the
// fn_trending_products RPC.
//
// WHY THIS FILE EXISTS: `getTrendingProducts()` in ./productEvents.ts is the
// typed transport, but it swallows errors by returning `[]`. This screen has to
// tell three different facts apart — "the customer has looked at nothing this
// week", "the backend could not be reached", "here is yesterday's list from the
// cache" — and a collapsed empty array cannot say which one it is. So the RPC is
// called here once, with a short timeout, a cache, and an honest status, while
// the write-side client (recordProductEvent) stays reused, not duplicated.
//
// RPC CONTRACT (apps/web/supabase/migrations/202609250002_trending_products.sql,
// verified before writing this call):
//   public.fn_trending_products(p_days integer DEFAULT 7, p_limit integer DEFAULT 20)
//   RETURNS TABLE(product_id uuid, name text, marketplace text, image_url text,
//                 price_usd numeric, price_cny numeric, score numeric,
//                 event_count bigint)
// `image_url` is NULL for a product with no scraped image, so callers must render
// a placeholder — see TrendingRow.tsx. The two prices are never interchangeable:
// price_usd is NULL unless a real USD figure was curated, and price_cny is the
// wholesale listing price, so a card may only print "$" next to the first.
//
// Local-first rules, mirroring src/db/index.ts: cache the last successful list,
// never let the network block or throw into a render, and never invent a product
// to fill a quiet week.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { getProducts, isBackendOnline } from "@/db";
import { resolveMoq, type ResolvedMoq } from "@/lib/moqIngest";
import type { TrendingProduct } from "@/api/productEvents";
import type { Product } from "@/types";

const TRENDING_KEY = "chinasuuq-trending-products";
/** Trending decays with a 3-day half-life, so ten minutes is well inside stale. */
const CACHE_TTL_MS = 10 * 60_000;
/** Home must paint immediately; a slow backend loses to the cache. */
const RPC_TIMEOUT_MS = 3500;
const DEFAULT_DAYS = 7;
const DEFAULT_LIMIT = 20;

/**
 * live       — ranked rows came from Postgres this call
 * cache      — rows came from the local cache (offline, timeout, or errored RPC)
 * empty      — the backend answered and nothing has engagement in the window
 * unavailable— could not ask and nothing cached: render no section at all
 */
export type TrendingStatus = "live" | "cache" | "empty" | "unavailable";

export interface TrendingItem {
  productId: string;
  name: string;
  marketplace: string;
  imageUrl: string | null;
  /** USD, or null when only a CNY wholesale price is known. */
  priceUsd: number | null;
  /** The listing's own currency (¥). Renders when priceUsd is null. */
  priceCny: number | null;
  score: number;
  eventCount: number;
  /**
   * The catalog row when the local cache holds this product id, else null.
   * A cart line needs the real product (source url, cny price, variants), so
   * an unresolved row is view-only — see canAddDirectly.
   */
  product: Product | null;
  /** MOQ verdict from moqIngest — the ONLY authority on the minimum quantity. */
  moq: ResolvedMoq;
  /** Minimum quantity that may actually be ordered (>= 1). */
  quantity: number;
  /** False when we have no catalog row: one-tap add would fabricate a line. */
  canAddDirectly: boolean;
}

export interface TrendingFeed {
  items: TrendingItem[];
  status: TrendingStatus;
  fetchedAt: number;
}

export interface TrendingFeedOptions {
  /** Ignore the cache TTL and ask the backend (pull to refresh). */
  force?: boolean;
  days?: number;
  limit?: number;
}

interface CachedTrending {
  rows: TrendingProduct[];
  fetchedAt: number;
}

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

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  // PostgREST can serialise numerics as strings, so coerce rather than cast.
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** One RPC row -> the typed shape, tolerant of absent columns. */
function normalizeRow(row: any): TrendingProduct {
  return {
    product_id: String(row?.product_id ?? ""),
    name: row?.name ?? "Untitled product",
    marketplace: row?.marketplace ?? "unknown",
    image_url: row?.image_url ?? null,
    price_usd: numeric(row?.price_usd),
    price_cny: numeric(row?.price_cny),
    score: numeric(row?.score) ?? 0,
    event_count: numeric(row?.event_count) ?? 0,
  };
}

/**
 * Ranked rows straight from Postgres. `null` means "we did not get an answer"
 * (offline, timeout, error, migration not applied) and is what separates an
 * honest empty feed from an unreachable one. Never throws.
 */
async function fetchTrendingRows(
  days: number,
  limit: number
): Promise<TrendingProduct[] | null> {
  try {
    const call = Promise.resolve(
      supabase.rpc("fn_trending_products", { p_days: days, p_limit: limit })
    );
    const winner = await Promise.race([
      call,
      new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), RPC_TIMEOUT_MS)
      ),
    ]);
    if (winner === "timeout") return null;
    const { data, error } = (winner ?? {}) as { data?: unknown; error?: unknown };
    if (error || !Array.isArray(data)) return null;
    // A row without an id cannot be opened or counted, so it is dropped.
    return data.map(normalizeRow).filter((r) => Boolean(r.product_id));
  } catch {
    return null;
  }
}

/**
 * Join the ranking against the local catalog so each card carries a real
 * product (image set, cny price, source url) and a minimum order quantity that
 * can actually be bought. resolveMoq is the single source of truth for the
 * floor: a row stating moq 20 yields 20, a row stating nothing yields 1 and the
 * card says so rather than pretending the minimum is known.
 */
async function hydrate(rows: TrendingProduct[]): Promise<TrendingItem[]> {
  let catalog: Product[] = [];
  try {
    catalog = await getProducts();
  } catch {
    catalog = [];
  }
  const byId = new Map<string, Product>();
  for (const p of catalog) byId.set(p.id, p);

  return rows.map((row) => {
    const product = byId.get(row.product_id) ?? null;
    const moq = resolveMoq(product);
    const quantity = Math.max(1, Math.floor(moq.displayMoq) || 1);
    const catalogUsd = product && product.price_usd_estimated > 0
      ? product.price_usd_estimated
      : null;
    const catalogCny = product && product.price_cny_min > 0
      ? product.price_cny_min
      : null;
    return {
      productId: row.product_id,
      name: row.name,
      marketplace: row.marketplace,
      imageUrl: product?.images?.[0] || row.image_url || null,
      priceUsd: catalogUsd ?? row.price_usd,
      priceCny: catalogCny ?? row.price_cny ?? null,
      score: row.score,
      eventCount: row.event_count,
      product,
      moq,
      quantity,
      canAddDirectly: product !== null,
    };
  });
}

async function readCache(): Promise<CachedTrending | null> {
  const raw = await safeGet(TRENDING_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    return {
      rows: parsed.rows.map(normalizeRow),
      fetchedAt: Number(parsed.fetchedAt) || 0,
    };
  } catch {
    return null;
  }
}

/** Cached rows are the offline answer; an empty cache is not a statement. */
async function fromCache(cached: CachedTrending | null): Promise<TrendingFeed> {
  if (cached && cached.rows.length > 0) {
    return { items: await hydrate(cached.rows), status: "cache", fetchedAt: cached.fetchedAt };
  }
  return { items: [], status: "unavailable", fetchedAt: 0 };
}

/**
 * The home screen's trending read. Resolves in every case — worst case with an
 * empty list and a status the caller renders as "nothing to show".
 */
export async function getTrendingFeed(
  options: TrendingFeedOptions = {}
): Promise<TrendingFeed> {
  const days = options.days ?? DEFAULT_DAYS;
  const limit = options.limit ?? DEFAULT_LIMIT;
  try {
    const cached = await readCache();

    // Fresh cache first so the section never waits on the network.
    if (!options.force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { items: await hydrate(cached.rows), status: "cache", fetchedAt: cached.fetchedAt };
    }

    if (!(await isBackendOnline())) return fromCache(cached);

    const rows = await fetchTrendingRows(days, limit);
    if (rows === null) return fromCache(cached);

    const fetchedAt = Date.now();
    await safeSet(TRENDING_KEY, JSON.stringify({ rows, fetchedAt }));

    if (rows.length === 0) {
      // The backend answered and the ledger is quiet: say so, invent nothing.
      return { items: [], status: "empty", fetchedAt };
    }
    return { items: await hydrate(rows), status: "live", fetchedAt };
  } catch {
    // Analytics must never be why a screen broke.
    return { items: [], status: "unavailable", fetchedAt: 0 };
  }
}
