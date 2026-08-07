// Self-contained types for the mobile app
// (inlined from @chinasuuq/shared/types for monorepo independence)

export type Marketplace = "1688" | "taobao" | "yiwugo" | "chinasuuq";
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
  attributes: Record<string, string>;
  variants: ProductVariant[];
  moq: number;
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
