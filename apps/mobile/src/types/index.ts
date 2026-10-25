// Self-contained types for the mobile app
// (inlined from @chinasuuq/shared/types for monorepo independence)

export type Marketplace = "1688" | "taobao" | "yiwugo" | "chinagoods" | "chinasuuq" | "dollarstore";
export type Locale = "en" | "so";
export type ShippingMethod = "air" | "sea" | "land";
export type PaymentStatus = "pending" | "confirmed" | "failed" | "refunded";
export type CustomerType = "individual" | "business";
export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export interface ProductVariant {
  id: string;
  name: string;
  options: { label: string; value: string; image?: string }[];
  price_cny?: number;
  stock: number;
}

/**
 * Staff-chosen placement for one product, read from the RESERVED key
 * `_curation` inside `source_products.attributes` (shape: {featured, rank,
 * note, pinned_by, pinned_at}). The website's Mission Control writes it; this
 * app only reads it, and `src/db` strips every `_`-prefixed key out of
 * `attributes` so staff metadata can never render to a customer as a spec.
 * Optional because cart lines, WebView captures and cache rows written before
 * this field existed carry no curation at all.
 */
export interface ProductCuration {
  featured: boolean;
  /** 1 = first staff pick on the shelf. Lower number wins. null = not ranked. */
  rank: number | null;
}

/**
 * One row of the live `categories` table (verified columns 2026-10-16):
 * name_en/name_so bilingual labels, slug, emoji or URL icon, image_url,
 * sort_order and is_active. parent_id exists for future sub-categories but the
 * browse surfaces are flat today.
 */
export interface Category {
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

export interface Product {
  id: string;
  marketplace: Marketplace;
  source_product_id: string;
  source_url: string;
  title_original: string;
  title_english: string;
  title_somali: string;
  description_original?: string;
  description_english?: string;
  description_somali?: string;
  images: string[];
  video?: string;
  category: string;
  /** FK to `categories.id` as the database returns it. POPULATION IS ~0% in
   *  production (see 202610161301_category_wiring.sql): the real categorisation
   *  today is the text column above, which holds English NAMES. Never filter
   *  products on this alone — use src/api/categories productInCategory(). */
  category_id?: string | null;
  /** Internal keys (`_curation`, any `_`-prefixed staff metadata) are stripped
   *  from this map by mapRowToProduct() before a row is ever cached or shown. */
  attributes: Record<string, string>;
  /** Read-only placement derived from the reserved `_curation` attribute. */
  curation?: ProductCuration | null;
  variants: ProductVariant[];
  moq: number;
  /** Provenance of `moq`: manual = a human typed/confirmed it, regex = the
   *  local parser (@/lib/moqIngest), ai = the product-enrich model pass.
   *  NOTE: `source_products.moq` defaults to 1, so `moq: 1` with no source is
   *  the ABSENCE of evidence, not a real one-piece minimum. Always read MOQ
   *  through resolveMoq()/moqOrderRules() instead of using `moq` directly. */
  moq_source?: "manual" | "regex" | "ai" | null;
  /** 0..1 — how much the stored value deserves to be trusted. */
  moq_confidence?: number | null;
  /** Verbatim marketplace wording the number came from, e.g. "10件起批". */
  moq_raw_text?: string | null;
  price_cny_min: number;
  price_cny_max: number;
  price_usd_estimated: number;
  domestic_shipping_cny: number;
  stock_status: StockStatus;
  supplier_rating: number;
  sales_count: number;
  last_synced_at: string;
  created_at: string;
}

export interface CartItem {
  id: string;
  product_id: string;
  product: Product;
  variant?: ProductVariant;
  selected_options: Record<string, string>;
  quantity: number;
  price_cny_snapshot: number;
  price_usd_estimated: number;
  exchange_rate: number;
  estimated_kg?: number;
  estimated_cbm?: number;
  added_at: string;
}

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "purchasing"
  | "purchased"
  | "in_transit_china"
  | "warehouse"
  | "inspection"
  | "consolidated"
  | "shipped"
  | "in_transit"
  | "arrived_somalia"
  | "customs"
  | "ready_for_pickup"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

export interface Order {
  id: string;
  reference: string;
  status: OrderStatus;
  items: OrderItem[];
  total_usd: number;
  currency: string;
  shipping_method: ShippingMethod;
  payment_status: PaymentStatus;
  tracking_events: TrackingEvent[];
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  price_usd: number;
}

export interface TrackingEvent {
  id?: string;
  status: string;
  location: string;
  message: string;
  timestamp: string;
  evidence_url?: string;
  done?: boolean;
}
