/**
 * ChinaSuuq — Mission Control product reads/writes.
 *
 * WHY THIS FILE EXISTS
 * The old Products screen saved by retrying THREE payload shapes (importer /
 * curated / live) until one was accepted, which could silently write the wrong
 * vocabulary. Everything here writes ONE shape: the live `source_products`
 * columns verified against production PostgREST on 2026-10-16 (see the header
 * of lib/catalog.ts). Optional scalars are omitted from an UPDATE unless the
 * operator actually changed them — a column the form never touched is never
 * sent, and a column the operator cleared is written as an honest NULL (0 for
 * the NOT NULL DEFAULT 0 price/moq/sales columns).
 *
 * The admin read differs from the public `fetchCatalogProducts` in exactly two
 * ways, both needed by this screen: it can filter by lifecycle `status`
 * (draft/archived, which the shop hides) and by `stock_status` values other
 * than in_stock. When neither of those is in play the call delegates straight
 * to `fetchCatalogProducts` — one data layer, no drift. When they are, the
 * query below mirrors catalog.ts filter-for-filter (server-side `count: exact`
 * + range paging + the FK-OR-text category match), never a client-side slice.
 *
 * RLS: every write goes through the staff JWT already held by the browser
 * client (`is_staff_or_admin()` for ALL on source_products). There is no
 * service-role key here and never will be in a client bundle.
 */
import { supabase } from "../supabase";
import { IN_CLAUSE_BATCH_SIZE, chunk, runInBatches } from "./batched-join";
import {
  fetchCatalogProducts,
  fetchCategories,
  normalizeAttributes,
  writeTrendingCuration,
  PRODUCT_SELECT,
  toCatalogProduct,
  INTERNAL_ATTRIBUTE_PREFIX,
  type CatalogPage,
  type CatalogProduct,
  type CategoryRow,
  type ProductRow,
  type Result,
} from "../catalog";

/* ── Column vocabularies (live values, 2026-10-16) ─────────────────────── */

export const MARKETPLACE_CODES = ["1688", "taobao", "yiwugo", "chinagoods", "chinasuuq"] as const;
export const PRODUCT_STATUSES = ["active", "draft", "archived"] as const;
export const STOCK_STATUSES = ["in_stock", "low_stock", "out_of_stock"] as const;

/** Live price/moq/sales columns are NOT NULL DEFAULT 0 — clearing them on the
 *  form writes 0 ("no price captured" for the mobile reader), never NULL. */
const ZERO_ON_CLEAR = new Set(["price_cny_min", "price_cny_max", "moq", "sales_count"]);

/** The supplier's own product id read out of a listing URL (1688/Taobao/JD all
 *  carry a long digit run). No run means a hand-added product. */
export function deriveSourceId(url: string | null | undefined): string | null {
  return (url ?? "").match(/\d{6,}/)?.[0] ?? null;
}

/* ── Form values ↔ payload ─────────────────────────────────────────────── */

export interface AttrRow {
  key: string;
  value: string;
}

/** Every live column the Products editor touches. Scalars stay strings — the
 *  form is text inputs; conversion + validation happen at save time. */
export interface ProductFormValues {
  marketplace: string;
  source_product_id: string;
  source_url: string;
  source_seller_id: string;
  seller_name: string;
  title_original: string;
  title_english: string;
  title_somali: string;
  description_original: string;
  description_english: string;
  description_somali: string;
  images: string[];
  video_url: string;
  categoryId: string | null;
  /** Orphan text (a `category` value matching no category row) — shown, never invented. */
  categoryText: string | null;
  attributes: AttrRow[];
  moq: string;
  moq_source: string;
  moq_confidence: string;
  moq_raw_text: string;
  price_cny_min: string;
  price_cny_max: string;
  price_usd_estimated: string;
  domestic_shipping_cny: string;
  stock_status: string;
  supplier_rating: string;
  sales_count: string;
  weight_kg: string;
  is_restricted: boolean;
  is_verified: boolean;
  acquisition_method: string;
  data_confidence: string;
  status: string;
}

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  marketplace: "1688",
  source_product_id: "",
  source_url: "",
  source_seller_id: "",
  seller_name: "",
  title_original: "",
  title_english: "",
  title_somali: "",
  description_original: "",
  description_english: "",
  description_somali: "",
  images: [],
  video_url: "",
  categoryId: null,
  categoryText: null,
  attributes: [],
  moq: "",
  moq_source: "",
  moq_confidence: "",
  moq_raw_text: "",
  price_cny_min: "",
  price_cny_max: "",
  price_usd_estimated: "",
  domestic_shipping_cny: "",
  stock_status: "in_stock",
  supplier_rating: "",
  sales_count: "",
  weight_kg: "",
  is_restricted: false,
  is_verified: false,
  acquisition_method: "",
  data_confidence: "",
  status: "active",
};

function n2s(v: number | null | undefined): string {
  return v === null || v === undefined ? "" : String(v);
}

export function productFormFromCatalog(p: CatalogProduct): ProductFormValues {
  return {
    marketplace: p.marketplace && MARKETPLACE_CODES.includes(p.marketplace as (typeof MARKETPLACE_CODES)[number])
      ? p.marketplace
      : p.marketplace || "1688",
    source_product_id: p.source_product_id ?? "",
    source_url: p.source_url ?? "",
    source_seller_id: p.source_seller_id ?? "",
    seller_name: p.seller_name ?? "",
    title_original: p.title_original ?? "",
    title_english: p.title_english ?? "",
    title_somali: p.title_somali ?? "",
    description_original: p.description_original ?? "",
    description_english: p.description_english ?? "",
    description_somali: p.description_somali ?? "",
    images: [...p.images],
    video_url: p.video_url ?? "",
    categoryId: p.category_id ?? null,
    // The FK is 0% populated in production: a row may carry only the text.
    // Show the text as an orphan when it matches none of the real categories.
    categoryText: p.category_id ? null : p.category ?? null,
    attributes: Object.entries(normalizeAttributes(p.attributes)).map(([key, value]) => ({
      key,
      value: typeof value === "string" ? value : JSON.stringify(value),
    })),
    moq: n2s(p.moq),
    moq_source: p.moq_source ?? "",
    moq_confidence: p.moq_confidence ?? "",
    moq_raw_text: p.moq_raw_text ?? "",
    price_cny_min: n2s(p.price_cny_min),
    price_cny_max: n2s(p.price_cny_max),
    price_usd_estimated: n2s(p.price_usd_estimated),
    domestic_shipping_cny: n2s(p.domestic_shipping_cny),
    stock_status: p.stock_status ?? "in_stock",
    supplier_rating: n2s(p.supplier_rating),
    sales_count: n2s(p.sales_count),
    weight_kg: n2s(p.weight_kg),
    is_restricted: p.is_restricted === true,
    is_verified: p.is_verified === true,
    acquisition_method: p.acquisition_method ?? "",
    data_confidence: n2s(p.data_confidence),
    status: p.status ?? "active",
  };
}

export function parseFormNumber(raw: string): { value: number | null; invalid: boolean } {
  const t = (raw ?? "").trim();
  if (!t) return { value: null, invalid: false };
  const n = Number(t);
  return Number.isFinite(n) ? { value: n, invalid: false } : { value: null, invalid: true };
}

function isHttpUrl(raw: string): boolean {
  return /^https?:\/\/\S+$/i.test(raw.trim());
}

/** Field-level validation. Keys map to the form's error slots; the panel
 *  renders them under the offending input, never as a generic toast. */
export function validateProductForm(v: ProductFormValues): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!v.title_english.trim() && !v.title_somali.trim() && !v.title_original.trim()) {
    errors.title_english = "A title is required in at least one language (English, Somali or original).";
  }

  const checkNum = (field: keyof ProductFormValues, label: string, opts: { min?: number; max?: number } = {}) => {
    const { value, invalid } = parseFormNumber(v[field] as string);
    if (invalid) errors[field] = `${label} must be a number.`;
    else if (value !== null && opts.min !== undefined && value < opts.min)
      errors[field] = `${label} cannot be below ${opts.min}.`;
    else if (value !== null && opts.max !== undefined && value > opts.max)
      errors[field] = `${label} cannot be above ${opts.max}.`;
  };
  checkNum("moq", "MOQ", { min: 0 });
  checkNum("price_cny_min", "Minimum price", { min: 0 });
  checkNum("price_cny_max", "Maximum price", { min: 0 });
  checkNum("price_usd_estimated", "Stored USD estimate", { min: 0 });
  checkNum("domestic_shipping_cny", "Domestic shipping", { min: 0 });
  checkNum("supplier_rating", "Supplier rating", { min: 0, max: 5 });
  checkNum("sales_count", "Sales count", { min: 0 });
  checkNum("weight_kg", "Weight", { min: 0 });
  checkNum("data_confidence", "Data confidence", { min: 0, max: 1 });

  const min = parseFormNumber(v.price_cny_min).value;
  const max = parseFormNumber(v.price_cny_max).value;
  if (min !== null && max !== null && max < min) {
    errors.price_cny_max = "Maximum price is below the minimum price.";
  }

  for (const [field, label] of [
    ["source_url", "Source URL"],
    ["video_url", "Video URL"],
  ] as const) {
    const t = v[field].trim();
    if (t && !isHttpUrl(t)) errors[field] = `${label} must start with http:// or https://.`;
  }

  const seenKeys = new Set<string>();
  v.attributes.forEach((row, i) => {
    const k = row.key.trim();
    if (!k) {
      if (row.value.trim()) errors[`attr_${i}`] = "This spec has a value but no name.";
      return;
    }
    if (k.startsWith(INTERNAL_ATTRIBUTE_PREFIX)) {
      errors[`attr_${i}`] = `Keys starting with "${INTERNAL_ATTRIBUTE_PREFIX}" are reserved for internal metadata and cannot be edited as specs.`;
      return;
    }
    if (seenKeys.has(k.toLowerCase())) errors[`attr_${i}`] = `Duplicate spec key "${k}".`;
    seenKeys.add(k.toLowerCase());
  });

  return errors;
}

/** Visible attrs as a plain object; internal `_`-keys are dropped here and
 *  re-merged from the row's CURRENT raw value at write time (mergeInternal). */
export function visibleAttributesFromForm(v: ProductFormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of v.attributes) {
    const k = row.key.trim();
    if (!k || k.startsWith(INTERNAL_ATTRIBUTE_PREFIX)) continue;
    const rawValue = row.value.trim();
    if (!rawValue) continue;
    let value: unknown = rawValue;
    // Keep numbers as numbers so the customer spec list renders them cleanly.
    const asNum = Number(rawValue);
    if (rawValue !== "" && Number.isFinite(asNum) && /^-?\d+(\.\d+)?$/.test(rawValue)) value = asNum;
    out[k] = value;
  }
  return out;
}

function rawAttributeObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string" && raw.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      /* half-written JSON — treat as no internals to preserve */
    }
  }
  return {};
}

/** Preserve every `_`-prefixed key the row currently holds; replace the rest. */
export function mergeAttributesPreservingInternal(raw: unknown, visible: Record<string, unknown>): Record<string, unknown> {
  const current = rawAttributeObject(raw);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(current)) {
    if (k.startsWith(INTERNAL_ATTRIBUTE_PREFIX)) out[k] = v;
  }
  for (const [k, v] of Object.entries(visible)) {
    if (!k.startsWith(INTERNAL_ATTRIBUTE_PREFIX)) out[k] = v;
  }
  return out;
}

/** Resolve the category pair the live row must carry: FK AND the text name in
 *  sync, so both old readers (`category` text) and new ones (`category_id`)
 *  stay correct. Unknown id → no FK write; text falls back to the orphan. */
export function categoryColumnsFor(
  v: ProductFormValues,
  categories: CategoryRow[]
): { category_id: string | null; category: string | null } {
  if (v.categoryId) {
    const cat = categories.find((c) => c.id === v.categoryId);
    return { category_id: v.categoryId, category: cat?.name_en?.trim() || v.categoryText?.trim() || null };
  }
  return { category_id: null, category: v.categoryText?.trim() || null };
}

/** The ONE write shape. Diffed against the loaded row for updates (only
 *  changed columns are sent), fully assembled for inserts. */
export function buildProductPayload(
  v: ProductFormValues,
  original: CatalogProduct | null,
  categories: CategoryRow[]
): { payload: Record<string, unknown>; attributesVisible: Record<string, unknown> | null } {
  const payload: Record<string, unknown> = {};
  const put = (key: string, next: unknown, prev: unknown) => {
    if (JSON.stringify(next) === JSON.stringify(prev)) return;
    payload[key] = next === null && ZERO_ON_CLEAR.has(key) ? 0 : next;
  };

  const text = (raw: string) => raw.trim() || null;
  const num = (raw: string): number | null => parseFormNumber(raw).value;

  const catCols = categoryColumnsFor(v, categories);

  if (!original) {
    // INSERT: every field the operator filled, plus the NOT NULLs the live
    // table declares (title_original, source_product_id) with honest fallbacks.
    payload.marketplace = v.marketplace.trim() || "1688";
    // Both of these are NOT NULL on the live table. A hand-added product has
    // neither a supplier URL nor an offer id, so each gets an explicit
    // "manual" marker instead of null — the previous null made every product
    // created without a source URL fail with 23502.
    const manualSourceId = v.source_product_id.trim() || deriveSourceId(v.source_url) || `manual-${Date.now()}`;
    payload.source_product_id = manualSourceId;
    const manualSourceUrl =
      text(v.source_url) || `https://manual.chinasuuq.com/product/${encodeURIComponent(manualSourceId)}`;
    payload.title_original =
      v.title_original.trim() || v.title_english.trim() || v.title_somali.trim() || "Untitled";
    payload.title_english = text(v.title_english);
    payload.title_somali = text(v.title_somali);
    payload.description_original = text(v.description_original);
    payload.description_english = text(v.description_english);
    payload.description_somali = text(v.description_somali);
    payload.source_url = manualSourceUrl;
    payload.source_seller_id = text(v.source_seller_id);
    payload.seller_name = text(v.seller_name);
    payload.video_url = text(v.video_url);
    payload.category_id = catCols.category_id;
    payload.category = catCols.category;
    payload.images = v.images;
    payload.moq = num(v.moq) ?? 0;
    payload.moq_source = text(v.moq_source);
    payload.moq_confidence = text(v.moq_confidence);
    payload.moq_raw_text = text(v.moq_raw_text);
    payload.price_cny_min = num(v.price_cny_min) ?? 0;
    payload.price_cny_max = num(v.price_cny_max) ?? num(v.price_cny_min) ?? 0;
    payload.price_usd_estimated = num(v.price_usd_estimated);
    payload.domestic_shipping_cny = num(v.domestic_shipping_cny);
    payload.stock_status = v.stock_status;
    payload.supplier_rating = num(v.supplier_rating);
    payload.sales_count = num(v.sales_count) ?? 0;
    payload.weight_kg = num(v.weight_kg);
    payload.is_restricted = v.is_restricted;
    payload.is_verified = v.is_verified;
    payload.acquisition_method = text(v.acquisition_method);
    payload.data_confidence = num(v.data_confidence);
    payload.status = v.status;
    const now = new Date().toISOString();
    payload.created_at = now;
    payload.updated_at = now;
    const visible = visibleAttributesFromForm(v);
    return { payload, attributesVisible: Object.keys(visible).length ? visible : {} };
  }

  // UPDATE: send only what changed. A column the form did not touch is never
  // sent, and never written as a silent null.
  put("marketplace", v.marketplace.trim() || null, original.marketplace);
  put("source_product_id", v.source_product_id.trim() || null, original.source_product_id);
  put("source_url", text(v.source_url), original.source_url);
  put("source_seller_id", text(v.source_seller_id), original.source_seller_id);
  put("seller_name", text(v.seller_name), original.seller_name);
  put("title_original", v.title_original.trim() || v.title_english.trim() || v.title_somali.trim() || null, original.title_original);
  put("title_english", text(v.title_english), original.title_english);
  put("title_somali", text(v.title_somali), original.title_somali);
  put("description_original", text(v.description_original), original.description_original);
  put("description_english", text(v.description_english), original.description_english);
  put("description_somali", text(v.description_somali), original.description_somali);
  put("video_url", text(v.video_url), original.video_url);
  put("category_id", catCols.category_id, original.category_id);
  put("category", catCols.category, original.category);
  put("images", v.images, original.images);
  put("moq", num(v.moq), original.moq);
  put("moq_source", text(v.moq_source), original.moq_source);
  put("moq_confidence", text(v.moq_confidence), original.moq_confidence);
  put("moq_raw_text", text(v.moq_raw_text), original.moq_raw_text);
  put("price_cny_min", num(v.price_cny_min), original.price_cny_min);
  put("price_cny_max", num(v.price_cny_max), original.price_cny_max);
  put("price_usd_estimated", num(v.price_usd_estimated), original.price_usd_estimated);
  put("domestic_shipping_cny", num(v.domestic_shipping_cny), original.domestic_shipping_cny);
  put("stock_status", v.stock_status || null, original.stock_status);
  put("supplier_rating", num(v.supplier_rating), original.supplier_rating);
  put("sales_count", num(v.sales_count), original.sales_count);
  put("weight_kg", num(v.weight_kg), original.weight_kg);
  put("is_restricted", v.is_restricted, original.is_restricted ?? false);
  put("is_verified", v.is_verified, original.is_verified ?? false);
  put("acquisition_method", text(v.acquisition_method), original.acquisition_method);
  put("data_confidence", num(v.data_confidence), original.data_confidence);
  put("status", v.status || null, original.status);
  payload.updated_at = new Date().toISOString();

  const visible = visibleAttributesFromForm(v);
  const same =
    JSON.stringify(visible) === JSON.stringify(original.attributes ?? {});
  return { payload, attributesVisible: same ? null : visible };
}

/* ── Single-row writes ─────────────────────────────────────────────────── */

function rowsAs<T>(data: unknown): T[] {
  return (data ?? []) as unknown as T[];
}

function productResult(row: ProductRow | null | undefined): CatalogProduct | null {
  return row ? toCatalogProduct(row) : null;
}

/**
 * UPDATE one product. Attributes, when changed, are read-modify-written: the
 * row's CURRENT raw value is fetched first so `_`-prefixed internal keys
 * (`_curation` included) survive an edit made from a stale page.
 */
export async function updateProduct(
  id: string,
  payload: Record<string, unknown>,
  attributesVisible: Record<string, unknown> | null
): Promise<Result<CatalogProduct>> {
  const finalPayload = { ...payload };
  if (attributesVisible !== null) {
    const { data: current, error: readError } = await supabase
      .from("source_products")
      .select("attributes")
      .eq("id", id)
      .maybeSingle();
    if (readError) return { ok: false, reason: `could not read the product's specs before saving: ${readError.message}` };
    if (!current) return { ok: false, reason: "the product no longer exists — it was deleted while you were editing" };
    finalPayload.attributes = mergeAttributesPreservingInternal(
      (current as { attributes: unknown }).attributes,
      attributesVisible
    );
  }

  const { data, error } = await supabase
    .from("source_products")
    .update(finalPayload)
    .eq("id", id)
    .select(PRODUCT_SELECT)
    .maybeSingle();
  if (error) return { ok: false, reason: error.message };
  const saved = productResult(rowsAs<ProductRow>(data)[0]);
  if (!saved) {
    return { ok: false, reason: "Nothing was updated — your role's row-level security refused the write, or the row was deleted." };
  }
  return { ok: true, data: saved };
}

export async function createProduct(payload: Record<string, unknown>): Promise<Result<CatalogProduct>> {
  const { data, error } = await supabase
    .from("source_products")
    .insert(payload)
    .select(PRODUCT_SELECT)
    .maybeSingle();
  if (error) return { ok: false, reason: error.message };
  const saved = productResult(rowsAs<ProductRow>(data)[0]);
  if (!saved) return { ok: false, reason: "The insert was not accepted — nothing was written." };
  return { ok: true, data: saved };
}

/** Duplicate payload: same visible specs (starts UNPINNED — `_curation` from
 *  the source row is deliberately not copied), status forced to draft, and the
 *  source_product_id suffixed so nobody mistakes the copy for the import. */
export function payloadForDuplicate(p: CatalogProduct): Record<string, unknown> {
  const now = new Date().toISOString();
  const base = p.source_product_id || deriveSourceId(p.source_url) || "manual";
  return {
    marketplace: p.marketplace ?? "1688",
    source_product_id: `${base}-copy-${Date.now()}`,
    source_url: p.source_url,
    source_seller_id: p.source_seller_id,
    seller_name: p.seller_name,
    title_original: p.title_original ?? p.title_english ?? p.title_somali ?? "Untitled copy",
    title_english: p.title_english,
    title_somali: p.title_somali,
    description_original: p.description_original,
    description_english: p.description_english,
    description_somali: p.description_somali,
    images: p.images,
    video_url: p.video_url,
    category_id: p.category_id,
    category: p.category,
    attributes: normalizeAttributes(p.attributes),
    moq: p.moq ?? 0,
    moq_source: p.moq_source,
    moq_confidence: p.moq_confidence,
    moq_raw_text: p.moq_raw_text,
    price_cny_min: p.price_cny_min ?? 0,
    price_cny_max: p.price_cny_max ?? 0,
    price_usd_estimated: p.price_usd_estimated,
    domestic_shipping_cny: p.domestic_shipping_cny,
    stock_status: p.stock_status ?? "in_stock",
    supplier_rating: p.supplier_rating,
    sales_count: p.sales_count ?? 0,
    weight_kg: p.weight_kg,
    is_restricted: p.is_restricted ?? false,
    is_verified: p.is_verified ?? false,
    acquisition_method: p.acquisition_method,
    data_confidence: p.data_confidence,
    status: "draft",
    created_at: now,
    updated_at: now,
  };
}

export async function duplicateProduct(p: CatalogProduct): Promise<Result<CatalogProduct>> {
  return createProduct(payloadForDuplicate(p));
}

export async function quickSetStatus(id: string, status: string): Promise<Result<{ id: string }>> {
  const { data, error } = await supabase
    .from("source_products")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, reason: error.message };
  if (!data) return { ok: false, reason: "Blocked by permissions — your role could not change this product." };
  return { ok: true, data: rowsAs<{ id: string }>(data)[0] };
}

/* ── Bulk writes (batched `.in()` — same URL-size budget as reads) ─────── */

/**
 * A bulk action used to hand PostgREST every selected id in ONE `.in()`; a
 * ~1000-uuid request line exceeded the gateway's URL budget and answered 400/414
 * before Postgres ran. Same budget as the read-side joins: 50 ids per request,
 * bounded concurrency, and a chunk that did not land is reported as FAILED —
 * never folded into "nothing matched". Three honest outcomes, because the
 * three causes need different follow-ups from staff:
 *   affected — the server echoed the row back; it really changed
 *   failed   — the request never completed; the rows are untouched and retryable
 *   blocked  — the request succeeded and the row was filtered out; that IS the
 *              row-level security answer, and retrying will not help
 */
export type BulkWriteResult = {
  affected: string[];
  failed: string[];
  blocked: string[];
  /** 1-based numbers of the groups whose request failed, for the notice. */
  failedGroupNumbers: number[];
  groups: number;
};

export async function bulkWrite(
  ids: string[],
  label: string,
  write: (batch: string[]) => PromiseLike<{ data: unknown; error: { message?: string } | null }>,
  onProgress?: (doneGroups: number, totalGroups: number) => void
): Promise<BulkWriteResult> {
  const groups = chunk(ids, IN_CLAUSE_BATCH_SIZE);
  const failedGroupNumbers: number[] = [];
  let done = 0;
  const { rows } = await runInBatches<string, { id: string }>({
    values: ids,
    batchSize: IN_CLAUSE_BATCH_SIZE,
    query: async (batch) => {
      const res = await write(batch);
      onProgress?.(Math.min(++done, groups.length), groups.length);
      return {
        data: (res.data as Array<{ id: string }> | null) ?? null,
        error: res.error ? { message: res.error.message || "request failed" } : null,
      };
    },
    onBatchError: (idx, total, message) => {
      console.warn(`[products] bulk ${label} group ${idx}/${total} failed:`, message);
      failedGroupNumbers.push(idx);
    },
  });

  const affected = rows.map((r) => r.id);
  const affectedSet = new Set(affected);
  const failed = failedGroupNumbers.flatMap((n) => groups[n - 1] ?? []);
  const failedSet = new Set(failed);
  const blocked = ids.filter((id) => !affectedSet.has(id) && !failedSet.has(id));
  return { affected, failed, blocked, failedGroupNumbers, groups: groups.length };
}

/** Staff-facing outcome of a bulk write: only what needs acting on. */
export function bulkWriteNotice(verb: "deleted" | "updated", res: BulkWriteResult): string[] {
  const out: string[] = [];
  if (res.failed.length) {
    const listed = res.failedGroupNumbers.slice(0, 6).join(", ");
    const more = res.failedGroupNumbers.length > 6 ? ` (+${res.failedGroupNumbers.length - 6} more)` : "";
    out.push(
      `${res.failed.length.toLocaleString()} selected product${res.failed.length === 1 ? "" : "s"} could not be ${verb}: ` +
        `group${res.failedGroupNumbers.length === 1 ? "" : "s"} ${listed}${more} of ${res.groups} never reached the database, ` +
        `so those rows are untouched — that is a failed request, not "nothing to ${verb === "deleted" ? "delete" : "update"}". ` +
        `They are still selected, so pressing the button again retries only them.`
    );
  }
  if (res.blocked.length) {
    out.push(
      `${res.blocked.length.toLocaleString()} product${res.blocked.length === 1 ? "" : "s"} were sent and refused by the database's row-level security — your signed-in role cannot ${verb === "deleted" ? "delete" : "change"} those rows. Retrying will not help.`
    );
  }
  return out;
}

/** Feature/un-feature a selection. Each product's `attributes` is a
 *  read-modify-write (via writeTrendingCuration), so this loops per id with a
 *  progress line and an honest per-item failure list. */
export async function bulkSetFeature(
  ids: string[],
  featured: boolean,
  pinnedBy: string | null,
  onProgress?: (done: number, total: number) => void
): Promise<{ changed: string[]; failures: { id: string; reason: string }[] }> {
  const changed: string[] = [];
  const failures: { id: string; reason: string }[] = [];
  for (let i = 0; i < ids.length; i++) {
    onProgress?.(i, ids.length);
    const res = await writeTrendingCuration(ids[i], { featured }, pinnedBy);
    if (res.ok) changed.push(ids[i]);
    else failures.push({ id: ids[i], reason: res.reason });
  }
  onProgress?.(ids.length, ids.length);
  return { changed, failures };
}

/* ── Admin-shaped reads ────────────────────────────────────────────────── */

export type AdminProductSort = "newest" | "sales" | "price_asc" | "price_desc";

const SORTS: Record<AdminProductSort, { column: string; ascending: boolean }> = {
  newest: { column: "created_at", ascending: false },
  sales: { column: "sales_count", ascending: false },
  price_asc: { column: "price_cny_min", ascending: true },
  price_desc: { column: "price_cny_min", ascending: false },
};

export interface AdminProductsQuery {
  /** "All" | active | draft | archived */
  status?: string;
  marketplace?: string;
  stock?: string;
  /** A real category id, or "uncategorised" (no FK AND no text). */
  category?: string;
  search?: string;
  sort?: AdminProductSort;
  page?: number;
  pageSize?: number;
}

export const UNCATEGORISED = "uncategorised";

/**
 * Paged admin read. Delegates to fetchCatalogProducts whenever its filter set
 * covers the request (status all/active, stock all/in_stock); otherwise runs
 * the identical query directly so the screen never filters a loaded page
 * client-side. `count: "exact"` on every path — the KPIs and footer can say
 * the real catalogue size.
 */
export async function fetchAdminProducts(q: AdminProductsQuery = {}): Promise<Result<CatalogPage>> {
  const pageSize = Math.max(1, Math.min(q.pageSize ?? 24, 96));
  const page = Math.max(1, q.page ?? 1);
  const sort = q.sort ?? "newest";
  const status = q.status && q.status !== "All" ? q.status : null;
  const stock = q.stock && q.stock !== "All" ? q.stock : null;
  const marketplace = q.marketplace && q.marketplace !== "All" ? q.marketplace.toLowerCase() : null;
  const category = q.category && q.category !== "All" ? q.category : null;
  const needle = (q.search ?? "").trim();

  const delegatable = (!status || status === "active") && (!stock || stock === "in_stock") && category !== UNCATEGORISED;
  if (delegatable) {
    return fetchCatalogProducts({
      includeNonActive: status === null,
      categoryId: category,
      marketplace,
      inStockOnly: stock === "in_stock",
      search: needle || null,
      sort,
      page,
      pageSize,
    });
  }

  // Direct path: mirrors catalog.ts exactly and adds what the shop-facing read
  // cannot express (draft/archived rows; low_stock/out_of_stock; uncategorised).
  let query = supabase.from("source_products").select(PRODUCT_SELECT, { count: "exact" });
  if (status) query = query.eq("status", status);

  if (category === UNCATEGORISED) {
    query = query.is("category_id", "null").or("category.is.null,category.eq.");
  } else if (category) {
    const cats = await fetchCategories({ includeInactive: true });
    const wanted = (cats.ok ? cats.data : []).find((c: CategoryRow) => c.id === category) ?? null;
    if (!wanted) {
      return {
        ok: true,
        data: { products: [], total: 0, page, pageSize, capped: false },
        partial: "unknown category",
      };
    }
    const parts = [`category_id.eq.${wanted.id}`];
    for (const name of [wanted.name_en, wanted.name_so, wanted.slug]) {
      const key = (name ?? "").trim().replace(/[%,()]/g, " ");
      if (key) parts.push(`category.ilike.${key}`);
    }
    query = query.or(parts.join(","));
  }

  if (marketplace) query = query.eq("marketplace", marketplace);
  if (stock) query = query.eq("stock_status", stock);
  if (needle) {
    const safe = needle.replace(/[%,()]/g, " ");
    query = query.or(
      `title_english.ilike.%${safe}%,title_somali.ilike.%${safe}%,title_original.ilike.%${safe}%,category.ilike.%${safe}%`
    );
  }

  const order = SORTS[sort];
  query = query.order(order.column, { ascending: order.ascending }).range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await query;
  if (error) return { ok: false, reason: `catalog query failed: ${error.message}` };
  const products = rowsAs<ProductRow>(data).map((row) => toCatalogProduct(row));
  const total = count ?? products.length;
  return { ok: true, data: { products, total, page, pageSize, capped: total > page * pageSize } };
}

export interface CatalogKpis {
  total: number | null;
  active: number | null;
  draft: number | null;
  archived: number | null;
  lowStock: number | null;
  outOfStock: number | null;
  /** Plain-language failures — a null card must never look like a real zero. */
  errors: string[];
}

/** Real head counts over the WHOLE catalogue (count:exact + head), never the
 *  loaded page. That mix-up is what made the old "Total" KPI a page size. */
export async function fetchCatalogKpis(): Promise<CatalogKpis> {
  const base = () => supabase.from("source_products").select("id", { count: "exact", head: true });
  const out: CatalogKpis = {
    total: null, active: null, draft: null, archived: null, lowStock: null, outOfStock: null, errors: [],
  };
  const apply = (res: { count: number | null; error: { message?: string } | null | undefined }, label: string, key: keyof Omit<CatalogKpis, "errors">) => {
    if (res.error) out.errors.push(`${label} count failed: ${res.error.message || "no response"}`);
    else out[key] = res.count ?? 0;
  };
  const [total, active, draft, archived, low, oos] = await Promise.all([
    base(),
    base().eq("status", "active"),
    base().eq("status", "draft"),
    base().eq("status", "archived"),
    base().eq("stock_status", "low_stock"),
    base().eq("stock_status", "out_of_stock"),
  ]);
  apply(total, "total", "total");
  apply(active, "active", "active");
  apply(draft, "draft", "draft");
  apply(archived, "archived", "archived");
  apply(low, "low-stock", "lowStock");
  apply(oos, "out-of-stock", "outOfStock");
  return out;
}

/** Live product count per category (FK OR the legacy text name — the same
 *  match the shop uses while `category_id` is still being backfilled).
 *  Head-only counts, one pass per category (12 rows live today). */
export async function fetchCategoryCounts(categories: CategoryRow[]): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  await Promise.all(
    categories.map(async (c) => {
      const parts = [`category_id.eq.${c.id}`];
      for (const name of [c.name_en, c.name_so, c.slug]) {
        const key = (name ?? "").trim().replace(/[%,()]/g, " ");
        if (key) parts.push(`category.ilike.${key}`);
      }
      const { count, error } = await supabase
        .from("source_products")
        .select("id", { count: "exact", head: true })
        .or(parts.join(","));
      out[c.id] = error ? null : count ?? 0;
    })
  );
  const { count, error } = await supabase
    .from("source_products")
    .select("id", { count: "exact", head: true })
    .is("category_id", "null")
    .or("category.is.null,category.eq.");
  out[UNCATEGORISED] = error ? null : count ?? 0;
  return out;
}
