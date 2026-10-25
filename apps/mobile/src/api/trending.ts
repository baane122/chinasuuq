// Trending products for the home screen — staff shelf first, then the real
// event ranking, then marketplace sales as a fallback.
//
// WHY THIS FILE EXISTS: `getTrendingProducts()` in ./productEvents.ts is the
// typed transport, but it swallows errors by returning `[]`. This screen has to
// tell three different facts apart — "the customer has looked at nothing this
// week", "the backend could not be reached", "here is yesterday's list from the
// cache" — and a collapsed empty array cannot say which one it is. So the RPC is
// called here once, with a short timeout, a cache, and an honest status, while
// the write-side client (recordProductEvent) stays reused, not duplicated.
//
// WHY IT ALSO READS THE ADMIN SHELF: Mission Control → Trending stores a staff
// pick inside `source_products.attributes._curation` = {featured, rank}, and the
// product ledger is empty in production today, so an RPC-only feed would render
// "Nothing is trending yet" on a screen the owner has already curated. The fill
// order is therefore pinned → behaviour → marketplace best sellers, exactly what
// apps/web/src/lib/catalog.ts `fetchTrendingFeed()` does, and each card carries
// its own `source` so a human pick is never displayed as organic demand.
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
// to fill a quiet week. Pins and best sellers come from the catalog itself, so
// they survive offline — only the behaviour ranking needs the backend.

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

/**
 * Where a card came from. Rendered as a badge, because "#3" on a staff pick
 * would claim a popularity ranking that never happened.
 */
export type TrendingSource = "pinned" | "behaviour" | "bestseller";

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
  /** Which fill stage produced this card — drives the badge wording. */
  source: TrendingSource;
  /** Units sold on the Chinese marketplace, when the catalog row states one.
   *  Never ChinaSuuq sales, so a best-seller card must say where the number is from. */
  salesCount: number | null;
}

export interface TrendingFeed {
  items: TrendingItem[];
  /** Status of the BEHAVIOUR read only. Pins and best sellers come from the local
   *  catalog and are available even when this is "unavailable" — hence the counts. */
  status: TrendingStatus;
  fetchedAt: number;
  pinnedCount: number;
  behaviourCount: number;
  bestsellerCount: number;
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
  const catalog = await loadCatalog();
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
      source: "behaviour",
      salesCount: product && product.sales_count > 0 ? product.sales_count : null,
    };
  });
}

/** Catalog read that cannot throw: an empty list is a real state, a crash is not. */
async function loadCatalog(): Promise<Product[]> {
  try {
    return await getProducts();
  } catch {
    return [];
  }
}

function titleOf(p: Product): string {
  const t = (p.title_english || p.title_somali || p.title_original || "").trim();
  return t || "Untitled product";
}

/** The catalog row's own clock, whichever column is populated. */
function stampOf(p: Product): number {
  return (
    Date.parse((p as { updated_at?: string }).updated_at || "") ||
    Date.parse(p.last_synced_at || "") ||
    Date.parse(p.created_at || "") ||
    0
  );
}

/** A catalog row turned into a shelf card (used for pins and best sellers). */
function itemFromProduct(p: Product, source: TrendingSource): TrendingItem {
  const moq = resolveMoq(p);
  const quantity = Math.max(1, Math.floor(moq.displayMoq) || 1);
  return {
    productId: p.id,
    name: titleOf(p),
    marketplace: p.marketplace || "unknown",
    imageUrl: p.images?.[0] ?? null,
    priceUsd: p.price_usd_estimated > 0 ? p.price_usd_estimated : null,
    priceCny: p.price_cny_min > 0 ? p.price_cny_min : null,
    score: 0,
    eventCount: 0,
    product: p,
    moq,
    quantity,
    canAddDirectly: true,
    source,
    salesCount: p.sales_count > 0 ? p.sales_count : null,
  };
}

/**
 * The staff shelf: Mission Control writes `{featured, rank}` into
 * `attributes._curation`, which src/db/index.ts strips out of the customer-facing
 * `attributes` and re-exposes as the typed `curation` field. Ranked first, then
 * unranked picks newest-first so two unpinned ranks cannot shuffle between loads.
 */
function pickPins(catalog: Product[], limit: number): TrendingItem[] {
  return catalog
    .filter((p) => p.curation?.featured === true)
    .sort((a, b) => {
      const ra = a.curation?.rank ?? Number.MAX_SAFE_INTEGER;
      const rb = b.curation?.rank ?? Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      const ua = stampOf(a);
      const ub = stampOf(b);
      if (ua !== ub) return ub - ua;
      return titleOf(a).localeCompare(titleOf(b));
    })
    .slice(0, limit)
    .map((p) => itemFromProduct(p, "pinned"));
}

/**
 * Last resort when nobody has looked at anything yet: the marketplace's own sold
 * counts. Honest because the card labels the number as the Chinese marketplace's,
 * and it never fires a view claim about demand we did not measure.
 */
function pickBestsellers(catalog: Product[], exclude: Set<string>, needed: number): TrendingItem[] {
  if (needed <= 0) return [];
  return catalog
    .filter((p) => !exclude.has(p.id) && typeof p.sales_count === "number" && p.sales_count > 0)
    .sort((a, b) => (b.sales_count ?? 0) - (a.sales_count ?? 0))
    .slice(0, needed)
    .map((p) => itemFromProduct(p, "bestseller"));
}

/**
 * pinned → behaviour → best seller, capped at `limit`, with a product that
 * appears in two stages counted once (the staff pick wins its slot, because the
 * owner's placement is the more specific claim).
 */
function assemble(
  behaviour: TrendingItem[],
  catalog: Product[],
  limit: number
): { items: TrendingItem[]; pinnedCount: number; behaviourCount: number; bestsellerCount: number } {
  const pins = pickPins(catalog, limit);
  const taken = new Set(pins.map((i) => i.productId));
  const rest = behaviour.filter((i) => !taken.has(i.productId)).slice(0, Math.max(0, limit - pins.length));
  for (const i of rest) taken.add(i.productId);

  const ordered = [...pins, ...rest];
  const filled = pickBestsellers(catalog, taken, Math.max(0, limit - ordered.length));

  return {
    items: [...ordered, ...filled],
    pinnedCount: pins.length,
    behaviourCount: rest.length,
    bestsellerCount: filled.length,
  };
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
  const catalog = await loadCatalog();
  if (cached && cached.rows.length > 0) {
    const merged = assemble(await hydrate(cached.rows), catalog, DEFAULT_LIMIT);
    return { ...meta(merged, cached.fetchedAt), status: "cache" };
  }
  // Nothing cached and no answer from the backend — but the staff shelf and the
  // marketplace sales figures are local, so the shelf still has content.
  const merged = assemble([], catalog, DEFAULT_LIMIT);
  return { ...meta(merged, 0), status: "unavailable" };
}

function meta(
  merged: { items: TrendingItem[]; pinnedCount: number; behaviourCount: number; bestsellerCount: number },
  fetchedAt: number
) {
  return {
    items: merged.items,
    fetchedAt,
    pinnedCount: merged.pinnedCount,
    behaviourCount: merged.behaviourCount,
    bestsellerCount: merged.bestsellerCount,
  };
}

/**
 * The home screen's trending read. Resolves in every case. The behaviour ranking
 * is the only part that needs the backend — the staff shelf and the marketplace
 * sales figures come from the catalog, so a quiet ledger or an offline phone
 * still shows the curated picks instead of an empty section.
 */
export async function getTrendingFeed(
  options: TrendingFeedOptions = {}
): Promise<TrendingFeed> {
  const days = options.days ?? DEFAULT_DAYS;
  const limit = options.limit ?? DEFAULT_LIMIT;
  try {
    const cached = await readCache();
    const catalog = await loadCatalog();

    // Fresh cache first so the section never waits on the network.
    if (!options.force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      const merged = assemble(await hydrate(cached.rows), catalog, limit);
      return { ...meta(merged, cached.fetchedAt), status: "cache" };
    }

    if (!(await isBackendOnline())) return fromCache(cached);

    const rows = await fetchTrendingRows(days, limit);
    if (rows === null) return fromCache(cached);

    const fetchedAt = Date.now();
    await safeSet(TRENDING_KEY, JSON.stringify({ rows, fetchedAt }));
    const merged = assemble(await hydrate(rows), catalog, limit);

    if (rows.length === 0) {
      // The backend answered and the ledger is quiet: say so, invent nothing.
      return { ...meta(merged, fetchedAt), status: "empty" };
    }
    return { ...meta(merged, fetchedAt), status: "live" };
  } catch {
    // Analytics must never be why a screen broke.
    return {
      items: [],
      status: "unavailable",
      fetchedAt: 0,
      pinnedCount: 0,
      behaviourCount: 0,
      bestsellerCount: 0,
    };
  }
}
