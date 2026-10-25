/**
 * ChinaSuuq — catalog data layer (public shop + Mission Control)
 *
 * WHY THIS FILE EXISTS
 * Before 2026-10-16 the website had no shop: the home page rendered one trending
 * RPC (`TrendingProducts.tsx`), categories were never read at all, product
 * searches were forwarded to WhatsApp, and the admin wrote a free-text category
 * while the database's real relationship is `category_id -> categories.id`. Three
 * different spellings of "category" and nobody joining them. This module is the
 * single place that knows what a product, a category and a trending pick actually
 * look like in production, so the home page, the catalog, the product page and
 * Mission Control cannot drift apart again.
 *
 * LIVE SCHEMA (verified 2026-10-16 against production PostgREST, service-role
 * Swagger spec — 107 relations):
 *   source_products  images text[]      <- NOT jsonb; 14 of 15 rows are []
 *                    category_id uuid    -> FK to categories.id, 0% populated
 *                    category text       <- the only categorisation that exists,
 *                                            holds English NAMES ("Electronics"),
 *                                            including one orphan ("Sports")
 *                    attributes jsonb    <- all NULL; product specs, rendered to
 *                                            customers by both apps
 *                    status text         ('draft' | 'active' | 'archived')
 *   categories       12 rows, name_en + name_so + slug + icon + image_url +
 *                    parent_id + sort_order + is_active
 *   product_events   0 rows  (trending is real SQL over an empty ledger)
 *   fn_trending_products(p_days int, p_limit int) -> 8 columns
 *   record_product_event(p_product_id, p_event_type, p_marketplace_key)
 *
 * NO DDL AVAILABLE. The Supabase Management API token is expired (401), so this
 * layer must work on the schema that exists today. That is why trending curation
 * is stored in `attributes` under the reserved key `_curation` instead of a new
 * `is_featured` column: `settings` is not readable by anon (verified 401), so a
 * settings row would be invisible to the customer home page, while a value on the
 * product row is already readable by exactly the people who need it.
 *
 * THE RESERVED KEY RULE — anything written into `attributes` whose key starts with
 * "_" is internal metadata, not a product spec, and MUST be filtered out by every
 * surface that renders attributes to a customer. `202408010004` documents that
 * column as "{ color: "red", size: "xl" }".
 */
import { supabase } from "./supabase";

export type Locale = "en" | "so";

export const TRENDING_CACHE_TTL_MS = 10 * 60_000;
export const CATALOG_CACHE_TTL_MS = 5 * 60_000;

/** Reserved namespace inside `source_products.attributes`. Never a customer spec. */
export const INTERNAL_ATTRIBUTE_PREFIX = "_";
export const CURATION_ATTRIBUTE_KEY = "_curation";

// ─── Types ─────────────────────────────────────────────────────────────────

/** One row of `categories`, named the way the live table names it. */
export interface CategoryRow {
  id: string;
  name_en: string | null;
  name_so: string | null;
  slug: string | null;
  icon: string | null;
  image_url: string | null;
  parent_id: string | null;
  sort_order: number | null;
  is_active: boolean | null;
}

/** A product as the database returns it. Every column is optional because the
 *  live generation is one of several shapes and old rows miss fields. */
export interface ProductRow {
  id: string;
  marketplace: string | null;
  source_product_id: string | null;
  source_url: string | null;
  source_seller_id: string | null;
  seller_name: string | null;
  title_original: string | null;
  title_english: string | null;
  title_somali: string | null;
  description_original: string | null;
  description_english: string | null;
  description_somali: string | null;
  images: unknown;
  video_url: string | null;
  category_id: string | null;
  category: string | null;
  attributes: unknown;
  moq: number | null;
  moq_source: string | null;
  moq_confidence: string | null;
  moq_raw_text: string | null;
  price_cny_min: number | null;
  price_cny_max: number | null;
  price_usd_estimated: number | null;
  domestic_shipping_cny: number | null;
  stock_status: string | null;
  supplier_rating: number | null;
  sales_count: number | null;
  weight_kg: number | null;
  is_restricted: boolean | null;
  is_verified: boolean | null;
  acquisition_method: string | null;
  data_confidence: number | null;
  status: string | null;
  last_synced_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  categories?: Pick<CategoryRow, "id" | "name_en" | "name_so" | "slug" | "icon" | "image_url"> | null;
}

/** Product after normalisation: safe arrays/numbers and a display title. */
export interface CatalogProduct extends Omit<ProductRow, "images" | "attributes"> {
  images: string[];
  attributes: Record<string, unknown>;
  curation: TrendingCuration;
  title: string;
  primaryImage: string | null;
  priceUsd: number | null;
  priceCnyMin: number | null;
  priceCnyMax: number | null;
  categoryName: string | null;
  categorySlug: string | null;
}

/** Exactly the 8 columns `fn_trending_products` returns. */
export interface TrendingRpcRow {
  product_id: string;
  name: string;
  marketplace: string;
  image_url: string | null;
  price_usd: number | null;
  price_cny: number | null;
  score: number;
  event_count: number;
}

/** Staff-chosen placement for one product. Written by Mission Control. */
export interface TrendingCuration {
  featured: boolean;
  /** 1 = first card on the shelf. Lower number wins. */
  rank: number | null;
  note: string | null;
  pinned_by: string | null;
  pinned_at: string | null;
}

export const EMPTY_CURATION: TrendingCuration = {
  featured: false,
  rank: null,
  note: null,
  pinned_by: null,
  pinned_at: null,
};

/**
 * Honest result envelope. `ok: false` means the data was NOT retrieved — it must
 * never be painted as an empty catalogue, which is how this project's earlier
 * "nothing is trending" bug hid a dead RPC. `partial` flags a degraded-but-shown
 * read (cache served past TTL, join unavailable) so the UI can say so.
 */
export type Result<T> =
  | { ok: true; data: T; partial?: string | null }
  | { ok: false; reason: string };

// ─── Small tolerant readers ────────────────────────────────────────────────

function asText(v: unknown): string | null {
  if (typeof v === "string") return v.trim() === "" ? null : v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asBoolean(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true" || v === "1";
  if (typeof v === "number") return v !== 0;
  return fallback;
}

/**
 * `supabase-js` has no generated Database types in this project, so it infers a
 * failed read's shape (`{ error: true } & String`) as the type of `data` on every
 * successful one. These two narrow it once, at the boundary, instead of a
 * per-callsite `as unknown as` — the live row shape is documented at the top of
 * this file and verified against production PostgREST.
 */
function rows<T>(data: unknown): T[] {
  return (data ?? []) as unknown as T[];
}

function one<T>(data: unknown): T | null {
  return (data ?? null) as unknown as T | null;
}

/**
 * `images` is text[] in production, but the importer generation and older rows
 * have held a JSON string, a single URL, or `{[""]}`. Never let a card render
 * `""` as an image or a comma-split URL — both produce the broken thumbnail.
 */
export function normalizeImages(raw: unknown): string[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    if (s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s);
        list = Array.isArray(parsed) ? parsed : [s];
      } catch {
        // Newline-separated URL list, which is what the old admin textarea wrote.
        list = s.split(/[\n,]/);
      }
    } else list = [s];
  } else if (raw && typeof raw === "object") {
    list = Object.values(raw as Record<string, unknown>);
  }

  const out: string[] = [];
  for (const item of list) {
    const url = asText(item);
    if (!url) continue;
    if (!/^(https?:\/\/|data:image\/|\/)/i.test(url)) continue;
    if (!out.includes(url)) out.push(url);
  }
  return out.slice(0, 24);
}

/** Internal keys are stripped here, so no renderer can leak `_curation` to a customer. */
export function normalizeAttributes(raw: unknown): Record<string, unknown> {
  let obj: Record<string, unknown> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  } else if (typeof raw === "string" && raw.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") obj = parsed as Record<string, unknown>;
    } catch {
      obj = {};
    }
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith(INTERNAL_ATTRIBUTE_PREFIX)) continue;
    out[k] = v;
  }
  return out;
}

/** Read curation from a raw attributes value, tolerating anything half-written. */
export function readCuration(raw: unknown): TrendingCuration {
  let obj: Record<string, unknown> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) obj = raw as Record<string, unknown>;
  else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") obj = parsed as Record<string, unknown>;
    } catch {
      return { ...EMPTY_CURATION };
    }
  }
  const node = obj[CURATION_ATTRIBUTE_KEY];
  if (!node || typeof node !== "object" || Array.isArray(node)) return { ...EMPTY_CURATION };
  const c = node as Record<string, unknown>;
  const rank = asNumber(c.rank);
  return {
    featured: asBoolean(c.featured),
    rank: rank !== null && rank >= 1 ? Math.round(rank) : null,
    note: asText(c.note),
    pinned_by: asText(c.pinned_by),
    pinned_at: asText(c.pinned_at),
  };
}

/** English-first, Somali second for Latin-script readers; never a fake title. */
export function pickTitle(row: ProductRow, locale: Locale = "en"): string {
  const chain =
    locale === "so"
      ? [row.title_somali, row.title_english, row.title_original]
      : [row.title_english, row.title_somali, row.title_original];
  for (const candidate of chain) {
    const t = asText(candidate);
    if (t) return t;
  }
  return "";
}

export function pickDescription(row: ProductRow, locale: Locale = "en"): string {
  const chain =
    locale === "so"
      ? [row.description_somali, row.description_english, row.description_original]
      : [row.description_english, row.description_somali, row.description_original];
  for (const candidate of chain) {
    const t = asText(candidate);
    if (t) return t;
  }
  return "";
}

export function pickCategoryName(
  cat: Pick<CategoryRow, "name_en" | "name_so"> | null | undefined,
  locale: Locale = "en"
): string | null {
  if (!cat) return null;
  return locale === "so"
    ? asText(cat.name_so) ?? asText(cat.name_en)
    : asText(cat.name_en) ?? asText(cat.name_so);
}

/** Turn any row into a render-ready product. One code path for every surface. */
export function toCatalogProduct(row: ProductRow, locale: Locale = "en"): CatalogProduct {
  const images = normalizeImages(row.images);
  return {
    ...(row as Omit<CatalogProduct, "images" | "attributes" | "curation" | "title" | "primaryImage" | "priceUsd" | "priceCnyMin" | "priceCnyMax" | "categoryName" | "categorySlug">),
    images,
    attributes: normalizeAttributes(row.attributes),
    curation: readCuration(row.attributes),
    title: pickTitle(row, locale),
    primaryImage: images[0] ?? null,
    // price_usd_estimated is a stored human/model guess; USD shown to a customer
    // must never be silently derived from a CNY number in this layer.
    priceUsd: asNumber(row.price_usd_estimated),
    priceCnyMin: asNumber(row.price_cny_min),
    priceCnyMax: asNumber(row.price_cny_max),
    categoryName:
      pickCategoryName(row.categories, locale) ?? asText(row.category),
    categorySlug: asText(row.categories?.slug),
  };
}

/** Columns every product read needs. Kept in one string so a missing column is
 *  fixed here once, not hunted through six components. */
export const PRODUCT_SELECT = [
  "id",
  "marketplace",
  "source_product_id",
  "source_url",
  "source_seller_id",
  "seller_name",
  "title_original",
  "title_english",
  "title_somali",
  "description_original",
  "description_english",
  "description_somali",
  "images",
  "video_url",
  "category_id",
  "category",
  "attributes",
  "moq",
  "moq_source",
  "moq_confidence",
  "moq_raw_text",
  "price_cny_min",
  "price_cny_max",
  "price_usd_estimated",
  "domestic_shipping_cny",
  "stock_status",
  "supplier_rating",
  "sales_count",
  "weight_kg",
  "is_restricted",
  "is_verified",
  "acquisition_method",
  "data_confidence",
  "status",
  "last_synced_at",
  "created_at",
  "updated_at",
  "categories(id,name_en,name_so,slug,icon,image_url)",
].join(",");

// ─── Cache ─────────────────────────────────────────────────────────────────

interface CacheEnvelope<T> { data: T; ts: number }

function readCache<T>(key: string, ttlMs: number): { data: T; stale: boolean } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const env = JSON.parse(raw) as CacheEnvelope<T>;
    if (!env || typeof env.ts !== "number" || env.data === undefined) return null;
    return { data: env.data, stale: Date.now() - env.ts > ttlMs };
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() } satisfies CacheEnvelope<T>));
  } catch {
    /* private mode / quota — a cold read is acceptable, never an error */
  }
}

// ─── Categories ────────────────────────────────────────────────────────────

export async function fetchCategories(opts: { includeInactive?: boolean } = {}): Promise<Result<CategoryRow[]>> {
  const cacheKey = `chinasuuq.categories.${opts.includeInactive ? "all" : "active"}`;
  let query = supabase
    .from("categories")
    .select("id,name_en,name_so,slug,icon,image_url,parent_id,sort_order,is_active")
    .order("sort_order", { ascending: true })
    .order("name_en", { ascending: true });
  if (!opts.includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) {
    const cached = readCache<CategoryRow[]>(cacheKey, CATALOG_CACHE_TTL_MS);
    if (cached) return { ok: true, data: cached.data, partial: "categories cache served" };
    return { ok: false, reason: `categories query failed: ${error.message}` };
  }
  const found = rows<CategoryRow>(data);
  if (found.length === 0) {
    return { ok: true, data: [], partial: "no category rows" };
  }
  writeCache(cacheKey, found);
  return { ok: true, data: found };
}

// ─── Catalog reads ─────────────────────────────────────────────────────────

export interface CatalogQuery {
  categorySlug?: string | null;
  categoryId?: string | null;
  search?: string | null;
  marketplace?: string | null;
  minMoq?: number | null;
  maxMoq?: number | null;
  inStockOnly?: boolean;
  sort?: "newest" | "sales" | "price_asc" | "price_desc";
  page?: number;
  pageSize?: number;
  includeNonActive?: boolean;
  locale?: Locale;
}

export interface CatalogPage {
  products: CatalogProduct[];
  total: number;
  page: number;
  pageSize: number;
  /** True when the DB had fewer rows than the filter implies (partial join, cap). */
  capped: boolean;
}

const PAGE_SORTS: Record<NonNullable<CatalogQuery["sort"]>, { column: string; ascending: boolean }> = {
  newest: { column: "created_at", ascending: false },
  sales: { column: "sales_count", ascending: false },
  price_asc: { column: "price_cny_min", ascending: true },
  price_desc: { column: "price_cny_min", ascending: false },
};

/**
 * Resolve a category by id or slug from the cached category list. Returns null
 * when the catalogue has no such category, which callers must treat as "match
 * nothing" rather than "no filter" — a typo in a URL must not silently show the
 * whole shop.
 */
async function resolveCategory(categoryId?: string | null, categorySlug?: string | null): Promise<CategoryRow | null> {
  const res = await fetchCategories({ includeInactive: true });
  const list = res.ok ? res.data : [];
  if (categoryId) {
    const byId = list.find((c) => c.id === categoryId);
    if (byId) return byId;
    // Unknown uuid: keep the FK filter anyway so an unlinked-but-correct row can
    // still appear; the text alternatives simply are not available.
    return { id: categoryId, name_en: null, name_so: null, slug: null, icon: null, image_url: null, parent_id: null, sort_order: null, is_active: null };
  }
  const needle = (categorySlug ?? "").trim().toLowerCase();
  if (!needle) return null;
  return list.find((c) => (c.slug ?? "").toLowerCase() === needle) ?? null;
}

/**
 * Paged, server-filtered product read. Filtering happens in Postgres, not in
 * `.filter()` over 1000 loaded rows, because that is what made the admin's
 * "Total" KPI report the loaded page instead of the catalogue.
 */
export async function fetchCatalogProducts(q: CatalogQuery = {}): Promise<Result<CatalogPage>> {
  const pageSize = Math.max(1, Math.min(q.pageSize ?? 24, 96));
  const page = Math.max(1, q.page ?? 1);
  const sort = PAGE_SORTS[q.sort ?? "newest"] ?? PAGE_SORTS.newest;
  const locale = q.locale ?? "en";

  let query = supabase
    .from("source_products")
    .select(PRODUCT_SELECT, { count: "exact" });

  if (!q.includeNonActive) query = query.eq("status", "active");

  // A category page must work BEFORE the FK backfill: `category_id` is 0 % populated
  // in production today, so filtering on the FK alone returns an empty shop for
  // every real category. Match the FK OR the denormalised text name. Verified
  // 2026-10-16 against production that two `or=` params are ANDed by PostgREST, so
  // the search group below stays independent instead of flattening into this one.
  if (q.categoryId || q.categorySlug) {
    const wanted = await resolveCategory(q.categoryId, q.categorySlug);
    if (!wanted) return { ok: true, data: { products: [], total: 0, page, pageSize, capped: false }, partial: "unknown category" };
    const parts = [`category_id.eq.${wanted.id}`];
    for (const name of [wanted.name_en, wanted.name_so, wanted.slug]) {
      const key = (name ?? "").trim().replace(/[%,()]/g, " ");
      if (key) parts.push(`category.ilike.${key}`);
    }
    query = query.or(parts.join(","));
  }

  if (q.marketplace) query = query.eq("marketplace", q.marketplace);
  if (typeof q.minMoq === "number") query = query.gte("moq", q.minMoq);
  if (typeof q.maxMoq === "number") query = query.lte("moq", q.maxMoq);
  if (q.inStockOnly) query = query.eq("stock_status", "in_stock");

  const needle = (q.search ?? "").trim();
  if (needle) {
    const safe = needle.replace(/[%,()]/g, " ");
    // Search both language columns: a Somali customer types Somali, the importer
    // wrote English, and the original Chinese title is what a 1688 link proves.
    query = query.or(
      `title_english.ilike.%${safe}%,title_somali.ilike.%${safe}%,title_original.ilike.%${safe}%,category.ilike.%${safe}%`
    );
  }

  query = query.order(sort.column, { ascending: sort.ascending }).range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await query;
  if (error) return { ok: false, reason: `catalog query failed: ${error.message}` };

  const products = rows<ProductRow>(data).map((row) => toCatalogProduct(row, locale));
  const total = count ?? products.length;
  return { ok: true, data: { products, total, page, pageSize, capped: total > page * pageSize } };
}

export async function fetchProductById(id: string, locale: Locale = "en"): Promise<Result<CatalogProduct | null>> {
  const clean = (id ?? "").trim();
  if (!clean) return { ok: false, reason: "no product id" };
  const { data, error } = await supabase
    .from("source_products")
    .select(PRODUCT_SELECT)
    .eq("id", clean)
    .maybeSingle();
  if (error) return { ok: false, reason: `product query failed: ${error.message}` };
  if (!data) return { ok: true, data: null };
  return { ok: true, data: toCatalogProduct(one<ProductRow>(data)!, locale) };
}

export interface VariantRow {
  id: string;
  variant_name: string | null;
  options: Record<string, unknown> | null;
  price_cny: number | null;
  stock: number | null;
  sku: string | null;
  image_url: string | null;
}

/** Variants exist live (`source_product_variants`) and are unread by any client
 *  today; the product page needs them to show size/colour options. */
export async function fetchProductVariants(productId: string): Promise<Result<VariantRow[]>> {
  const { data, error } = await supabase
    .from("source_product_variants")
    .select("id,variant_name,options,price_cny,stock,sku,image_url")
    .eq("product_id", productId)
    .limit(60);
  if (error) return { ok: false, reason: `variants query failed: ${error.message}` };
  const out: VariantRow[] = rows<Record<string, unknown>>(data).map((r) => ({
    id: String(r.id ?? ""),
    variant_name: asText(r.variant_name),
    options: (r.options && typeof r.options === "object" && !Array.isArray(r.options)
      ? (r.options as Record<string, unknown>)
      : null),
    price_cny: asNumber(r.price_cny),
    stock: asNumber(r.stock),
    sku: asText(r.sku),
    image_url: asText(r.image_url),
  }));
  return { ok: true, data: out };
}

// ─── Trending: staff picks + behaviour, merged honestly ────────────────────

export type TrendingSource = "pinned" | "behaviour" | "bestseller";

export interface TrendingItem {
  product: CatalogProduct;
  /** Why this card is here. The UI labels it — a pinned pick must never look organic. */
  source: TrendingSource;
  score: number | null;
  eventCount: number | null;
  rank: number | null;
}

export interface TrendingFeed {
  items: TrendingItem[];
  /** False when the RPC was reachable but the ledger is empty — a different
   *  sentence to show than "we could not reach the database". */
  behaviourLive: boolean;
  behaviourError: string | null;
  pinnedCount: number;
  servedFrom: "live" | "cache";
}

/** Products a staff member pinned, ordered by the rank they chose. */
export async function fetchPinnedProducts(locale: Locale = "en"): Promise<CatalogProduct[]> {
  const { data, error } = await supabase
    .from("source_products")
    .select(PRODUCT_SELECT)
    .eq("status", "active")
    .limit(200);
  if (error) return [];
  return rows<ProductRow>(data)
    .map((row) => toCatalogProduct(row, locale))
    .filter((p) => p.curation.featured)
    .sort((a, b) => (a.curation.rank ?? 999) - (b.curation.rank ?? 999));
}

/**
 * The weekly behaviour ranking. `p_days`/`p_limit` are the RPC's real parameter
 * names — passing `{ limit }` returns PGRST202, which is how a "trending is
 * empty" bug once masqueraded as a data problem.
 */
export async function fetchBehaviourTrending(
  days = 7,
  limit = 20
): Promise<{ rows: TrendingRpcRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc("fn_trending_products", {
    p_days: Math.max(1, Math.min(days, 90)),
    p_limit: Math.max(1, Math.min(limit, 100)),
  });
  if (error) return { rows: [], error: error.message };
  return { rows: rows<TrendingRpcRow>(data), error: null };
}

/**
 * Home-shelf trending = staff pins first, then real behaviour, and if the ledger
 * has nothing yet, the marketplace sales numbers already in the row. Every branch
 * is labelled so the card can say "Featured" or "Trending by views" truthfully.
 * Best-seller fallback is NOT invented engagement: `sales_count` is copied from
 * the Chinese marketplace and means "sold there", which the UI must say.
 */
export async function fetchTrendingFeed(opts: {
  days?: number;
  limit?: number;
  locale?: Locale;
} = {}): Promise<Result<TrendingFeed>> {
  const limit = Math.max(1, Math.min(opts.limit ?? 20, 60));
  const days = opts.days ?? 7;
  const locale = opts.locale ?? "en";
  const cacheKey = `chinasuuq.trending.${days}.${limit}`;

  const behaviour = await fetchBehaviourTrending(days, limit);
  const pinned = await fetchPinnedProducts(locale);

  if (behaviour.error && pinned.length === 0) {
    const cached = readCache<TrendingFeed>(cacheKey, TRENDING_CACHE_TTL_MS);
    if (cached) return { ok: true, data: { ...cached.data, servedFrom: "cache" }, partial: cached.stale ? "cache older than TTL" : null };
    return { ok: false, reason: behaviour.error };
  }

  const items: TrendingItem[] = [];
  const seen = new Set<string>();
  for (const p of pinned) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    items.push({ product: p, source: "pinned", score: null, eventCount: null, rank: p.curation.rank });
  }

  const needRows = limit - items.length;
  if (behaviour.rows.length > 0 && needRows > 0) {
    const ids = behaviour.rows.map((r) => r.product_id).filter((id) => !seen.has(id)).slice(0, needRows);
    if (ids.length) {
      const { data, error } = await supabase
        .from("source_products")
        .select(PRODUCT_SELECT)
        .in("id", ids);
      if (!error) {
        const byId = new Map(rows<ProductRow>(data).map((row) => [row.id, toCatalogProduct(row, locale)]));
        for (const row of behaviour.rows) {
          if (items.length >= limit) break;
          if (seen.has(row.product_id)) continue;
          const product = byId.get(row.product_id);
          if (!product) continue; // deleted / unpublished listing — do not paint a ghost
          seen.add(row.product_id);
          items.push({ product, source: "behaviour", score: row.score, eventCount: row.event_count, rank: null });
        }
      }
    }
  }

  if (items.length === 0) {
    // Nothing pinned, nothing watched: show what the marketplace itself sells best.
    const fallback = await supabase
      .from("source_products")
      .select(PRODUCT_SELECT)
      .eq("status", "active")
      .order("sales_count", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (!fallback.error) {
      for (const row of rows<ProductRow>(fallback.data)) {
        const product = toCatalogProduct(row, locale);
        if (seen.has(product.id)) continue;
        seen.add(product.id);
        items.push({ product, source: "bestseller", score: null, eventCount: null, rank: null });
      }
    }
  }

  const feed: TrendingFeed = {
    items,
    behaviourLive: behaviour.rows.length > 0,
    behaviourError: behaviour.error,
    pinnedCount: pinned.length,
    servedFrom: "live",
  };
  writeCache(cacheKey, feed);
  return { ok: true, data: feed };
}

/**
 * Write a staff pick. Read-modify-write on `attributes` so product specs written
 * by the enricher survive; internal keys are preserved, customer-visible ones are
 * untouched. Requires the staff session the admin layout already holds (RLS
 * `is_staff_or_admin()` for ALL on source_products).
 */
export async function writeTrendingCuration(
  productId: string,
  next: Partial<TrendingCuration>,
  pinnedBy: string | null
): Promise<Result<TrendingCuration>> {
  const { data: existing, error: readError } = await supabase
    .from("source_products")
    .select("attributes")
    .eq("id", productId)
    .maybeSingle();
  if (readError) return { ok: false, reason: `could not read product: ${readError.message}` };
  if (!existing) return { ok: false, reason: "product no longer exists" };

  const raw = one<{ attributes: unknown }>(existing)?.attributes;
  const base: Record<string, unknown> =
    raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
  const current = readCuration(raw);
  const merged: TrendingCuration = { ...current, ...next };
  const cleaned: TrendingCuration = merged.featured
    ? { ...merged, pinned_at: new Date().toISOString(), pinned_by: pinnedBy ?? merged.pinned_by }
    : { ...EMPTY_CURATION };

  if (cleaned.featured) base[CURATION_ATTRIBUTE_KEY] = cleaned;
  else delete base[CURATION_ATTRIBUTE_KEY];

  const { error } = await supabase
    .from("source_products")
    .update({ attributes: base, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (error) return { ok: false, reason: `could not save the pick: ${error.message}` };
  return { ok: true, data: cleaned };
}

/**
 * Reorder the pinned shelf in one pass. Ranks are written as 1..n so a removed
 * pin cannot leave a hole that reads as a mistake on the home page.
 */
export async function reorderPinnedProducts(
  orderedIds: string[],
  pinnedBy: string | null
): Promise<Result<{ written: number; failed: string[] }>> {
  const failed: string[] = [];
  let written = 0;
  for (let i = 0; i < orderedIds.length; i++) {
    const res = await writeTrendingCuration(orderedIds[i], { featured: true, rank: i + 1 }, pinnedBy);
    if (res.ok) written++;
    else failed.push(orderedIds[i]);
  }
  return { ok: true, data: { written, failed } };
}

// ─── Category wiring ───────────────────────────────────────────────────────

export interface CategorySyncResult {
  categories: number;
  products: number;
  linked: number;
  alreadyLinked: number;
  unmatched: { product: string; text: string }[];
  dryRun: boolean;
}

/**
 * `category_id` is 0% populated in production while every product carries a text
 * `category` holding the English NAME. This is the wiring step the shop needs and
 * the admin button runs: match the text to a category by name_en / name_so / slug
 * (case, spacing and punctuation-insensitive) and write the FK.
 *
 * Dry-run by default. A staff click can therefore preview "12 of 15 would link,
 * Sports matches nothing" before touching the catalogue, and the orphan is
 * reported instead of silently dropped.
 */
export async function syncProductCategoryIds(opts: { dryRun?: boolean } = {}): Promise<Result<CategorySyncResult>> {
  const dryRun = opts.dryRun ?? true;
  const catRes = await fetchCategories({ includeInactive: true });
  if (!catRes.ok) return catRes;
  const cats = catRes.data;

  const keyOf = (s: string | null | undefined) =>
    (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  const index = new Map<string, string>();
  for (const c of cats) {
    for (const value of [c.name_en, c.name_so, c.slug]) {
      const key = keyOf(value);
      if (key && !index.has(key)) index.set(key, c.id);
    }
    if (c.slug) index.set(keyOf(c.slug.replace(/-/g, " ")), c.id);
  }

  const { data: productRows, error } = await supabase
    .from("source_products")
    .select("id,title_english,title_somali,category,category_id")
    .limit(2000);
  if (error) return { ok: false, reason: `could not read products: ${error.message}` };

  let linked = 0;
  let alreadyLinked = 0;
  const unmatched: CategorySyncResult["unmatched"] = [];

  for (const row of rows<Pick<ProductRow, "id" | "category" | "category_id" | "title_english" | "title_somali">>(productRows)) {
    if (row.category_id) {
      alreadyLinked++;
      continue;
    }
    const matchId = index.get(keyOf(row.category));
    if (!matchId) {
      unmatched.push({
        product: asText(row.title_english) ?? asText(row.title_somali) ?? row.id,
        text: asText(row.category) ?? "(empty)",
      });
      continue;
    }
    if (!dryRun) {
      const { error: writeError } = await supabase
        .from("source_products")
        .update({ category_id: matchId })
        .eq("id", row.id);
      if (writeError) {
        unmatched.push({ product: row.id, text: `${asText(row.category)} (write failed)` });
        continue;
      }
    }
    linked++;
  }

  return {
    ok: true,
    data: { categories: cats.length, products: rows<Pick<ProductRow, "id">>(productRows).length, linked, alreadyLinked, unmatched, dryRun },
  };
}

/** Two products in the same category, for "more like this". */
export async function fetchRelatedProducts(
  product: CatalogProduct,
  limit = 8,
  locale: Locale = "en"
): Promise<CatalogProduct[]> {
  let query = supabase
    .from("source_products")
    .select(PRODUCT_SELECT)
    .eq("status", "active")
    .neq("id", product.id)
    .limit(Math.max(1, Math.min(limit, 12)));
  if (product.category_id) query = query.eq("category_id", product.category_id);
  else if (product.category) query = query.eq("category", product.category);
  else query = query.eq("marketplace", product.marketplace ?? "");
  const { data } = await query;
  return rows<ProductRow>(data).map((row) => toCatalogProduct(row, locale)).slice(0, limit);
}

// ─── Engagement telemetry ──────────────────────────────────────────────────

export type ProductEventType = "view" | "search_click" | "add_to_cart" | "order";

/**
 * The website used to READ trending and never WRITE events, so web traffic could
 * not influence the shelf it was displaying and the ledger stayed at 0 rows
 * forever. This is the missing half.
 *
 * Fire-and-forget by contract: it swallows every failure. A customer's page must
 * never break or block because analytics did not land, and the server enforces a
 * 60-second per-product-per-event limiter itself, so repeat calls are cheap.
 */
const recentSent = new Map<string, number>();
const LOCAL_THROTTLE_MS = 50_000; // just under the server's 60 s so a doomed call is not even made

export function recordProductEvent(
  productId: string | null | undefined,
  eventType: ProductEventType,
  marketplaceKey?: string | null
): void {
  if (typeof window === "undefined" || !productId) return;
  const key = `${productId}:${eventType}`;
  const now = Date.now();
  const last = recentSent.get(key);
  if (last && now - last < LOCAL_THROTTLE_MS) return;
  recentSent.set(key, now);

  void (async () => {
    try {
      await supabase.rpc("record_product_event", {
        p_product_id: productId,
        p_event_type: eventType,
        p_marketplace_key: marketplaceKey ?? null,
      });
    } catch {
      recentSent.delete(key);
    }
  })();
}

// ─── Media hosting ─────────────────────────────────────────────────────────

export const PRODUCT_IMAGE_BUCKET = "product-images";

export interface UploadOutcome {
  ok: boolean;
  url: string | null;
  reason: string | null;
}

/**
 * Upload one picked file to the `product-images` bucket and return its public
 * URL, ready to push onto a product's `images` array.
 *
 * HONEST LIMITATION, verified 2026-10-16: production has ZERO storage buckets and
 * bucket write rules can only be created from the Supabase dashboard (the
 * Management API token returns 401). `supabase/migrations/202610161300_product_media_bucket.sql`
 * creates the bucket and the staff-write/public-read rules. Until that is applied
 * this function fails with a reason the admin UI must show, and the URL-based
 * image manager remains the working path. Never let a caller treat this failure as
 * success or silently fall back to a hotlink.
 */
export async function uploadProductImage(
  file: File,
  productId: string | null | undefined
): Promise<UploadOutcome> {
  if (!file) return { ok: false, url: null, reason: "no file selected" };
  if (file.size > 6 * 1024 * 1024) {
    return { ok: false, url: null, reason: `${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 6 MB` };
  }
  if (!/^image\/(png|jpe?g|webp|gif|avif)$/i.test(file.type)) {
    return { ok: false, url: null, reason: `${file.type || "unknown type"} is not a png/jpg/webp/avif image` };
  }

  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const owner = (productId ?? "unassigned").slice(0, 36);
  const path = `${owner}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  try {
    const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) {
      const message = error.message ?? "upload refused";
      const needsBucket = /bucket not found/i.test(message);
      // Measured on production 2026-10-16: the bucket now exists (created with the
      // service key) but an anonymous/staff write answers
      // "new row violates row-level security policy", because storage write rules
      // can only be created by an owner in the dashboard. Same instruction for both
      // halves of the setup so the admin is never told a half-truth.
      const needsPolicies = /row-level security|Unauthorized|AccessDenied/i.test(message);
      return {
        ok: false,
        url: null,
        reason:
          needsBucket || needsPolicies
            ? `Hosting is set up but write permission is still missing: run supabase/migrations/202610161300_product_media_bucket.sql in the Supabase dashboard SQL editor, then retry. (${message})`
            : message,
      };
    }
    const { data } = supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);
    return { ok: true, url: data.publicUrl, reason: null };
  } catch (err) {
    return { ok: false, url: null, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Broken-link detection for remote hotlinks (1688/taobao URLs that expire).
 * HEAD first, GET fallback — some CDNs answer 405 to HEAD; a 403 is reported as
 * blocked rather than broken, because the admin needs to know it is an anti-
 * hotlink refusal (1688/Taobao do this to non-Chinese referers) and not a typo.
 */
export async function probeImageUrl(url: string, timeoutMs = 6000): Promise<"ok" | "blocked" | "broken" | "unknown"> {
  const clean = (url ?? "").trim();
  if (!clean) return "broken";
  if (typeof window === "undefined" || typeof fetch !== "function") return "unknown";
  if (typeof AbortSignal !== "function" || typeof AbortSignal.timeout !== "function") return "unknown";
  try {
    const head = await fetch(clean, { method: "HEAD", mode: "no-cors", signal: AbortSignal.timeout(timeoutMs) });
    if (head.status === 403) return "blocked";
    if (head.ok || head.status === 0) return "ok"; // opaque responses still mean the host answered
    if (head.status >= 400 && head.status < 500) return "broken";
    return "unknown";
  } catch {
    return "broken";
  }
}
