// ============================================================
// @chinasuuq/shared/types
// Canonical type definitions shared across web & mobile apps.
// Source of truth — app-level types should re-export from here.
// ============================================================

// ── Enums & Literals ────────────────────────────────────────

/** Supported marketplace platforms. */
export type Marketplace = "1688" | "taobao" | "yiwugo" | "chinasuuq";

/** Two supported display languages. */
export type Locale = "en" | "so";

/** Shipping methods available to customers. */
export type ShippingMethod = "air" | "sea" | "land";

/** Payment status lifecycle. */
export type PaymentStatus = "pending" | "confirmed" | "failed" | "refunded";

/** Customer account types. */
export type CustomerType = "individual" | "business";

/** Stock availability status. */
export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

// ── Product ─────────────────────────────────────────────────

/** A product sourced from a Chinese marketplace. */
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

/** A variant (size / colour / style) of a product. */
export interface ProductVariant {
  id: string;
  name: string;
  options: { label: string; value: string; image?: string }[];
  price_cny?: number;
  stock: number;
}

// ── Cart ────────────────────────────────────────────────────

/** An item in the user's shopping cart. */
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
  added_at: string;
}

// ── Orders ──────────────────────────────────────────────────

/** Full order lifecycle status (superset for DB & display). */
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

/** A placed order with tracking information. */
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

/** Individual line-item within an order. */
export interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  price_usd: number;
}

/** A single tracking event in an order's journey. */
export interface TrackingEvent {
  id?: string;
  status: string;
  location: string;
  message: string;
  timestamp: string;
  evidence_url?: string;
  done?: boolean;
}

// ── Customer ────────────────────────────────────────────────

/** Customer profile information. */
export interface Customer {
  id: string;
  full_name: string;
  phone: string;
  email?: string;
  city: string;
  language: Locale;
  customer_type: CustomerType;
  business_name?: string;
  created_at?: string;
}

// ── Category ────────────────────────────────────────────────

/** Product category with translations. */
export interface Category {
  id: string;
  name_en: string;
  name_so: string;
  slug: string;
  icon: string;
  image?: string;
  product_count: number;
  subcategories?: { name_en: string; name_so: string; slug: string }[];
}

// ── Staff ───────────────────────────────────────────────────

/** Staff member role in the system. */
export type StaffRole =
  | "super_admin"
  | "operations_director"
  | "finance_manager"
  | "sourcing_manager"
  | "sourcing_agent"
  | "purchasing_officer"
  | "warehouse_manager"
  | "warehouse_operator"
  | "quality_inspector"
  | "logistics_manager"
  | "support_manager"
  | "support_agent"
  | "content_manager";

/** Granular permission granted to a staff member. */
export type Permission =
  | "view"
  | "create"
  | "edit"
  | "approve"
  | "verify_payment"
  | "refund"
  | "pay_supplier"
  | "manage_exchange_rate"
  | "export"
  | "manage_roles"
  | "view_finance"
  | "view_sensitive_customer_data"
  | "archive";

/** Staff member profile. */
export interface StaffMember {
  id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  permissions: Permission[];
  is_active: boolean;
  last_login?: string;
  created_at: string;
}

// ── Sourcing ────────────────────────────────────────────────

/** A customer's product sourcing request. */
export interface SourcingRequest {
  id: string;
  customer_id: string;
  marketplace: string;
  product_url?: string;
  product_image?: string;
  product_description: string;
  quantity: number;
  destination_city: string;
  status: "pending" | "assigned" | "quoted" | "approved" | "purchased";
  agent_id?: string;
  quote?: Quote;
  created_at: string;
}

/** A price quote for a sourcing request. */
export interface Quote {
  id: string;
  request_id: string;
  items: QuoteItem[];
  total_cny: number;
  total_usd: number;
  exchange_rate: number;
  fees: number;
  freight_estimate: number;
  valid_until: string;
  status: "draft" | "sent" | "approved" | "rejected" | "expired";
}

/** Line-item within a quote. */
export interface QuoteItem {
  product_name: string;
  variant?: string;
  quantity: number;
  unit_price_cny: number;
  subtotal_cny: number;
}

// ── Payment ─────────────────────────────────────────────────

/** Supported payment methods. */
export type PaymentMethod =
  | "zaad"
  | "edahab"
  | "premier"
  | "evc_plus"
  | "sahal"
  | "bank_transfer"
  | "manual";

/** A payment record. */
export interface Payment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string;
  verified_by?: string;
  verified_at?: string;
  created_at: string;
}

// ── Warehouse & Shipping ────────────────────────────────────

/** Package received at the warehouse. */
export interface WarehousePackage {
  id: string;
  barcode: string;
  order_id?: string;
  weight_kg: number;
  dimensions: { length: number; width: number; height: number };
  status: "received" | "inspected" | "consolidated" | "shipped";
  photos: string[];
  inspection_notes?: string;
  received_at: string;
}

/** Shipment being transported to Somalia. */
export interface Shipment {
  id: string;
  reference: string;
  method: ShippingMethod;
  status: "preparing" | "loaded" | "in_transit" | "arrived" | "customs" | "delivered";
  packages: string[];
  origin: string;
  destination: string;
  departure_date: string;
  estimated_arrival: string;
  actual_arrival?: string;
  tracking_number?: string;
  documents: string[];
  created_at: string;
}

// ── Support ─────────────────────────────────────────────────

/** Support ticket status. */
export type TicketStatus =
  | "open"
  | "in_progress"
  | "waiting_customer"
  | "waiting_internal"
  | "resolved"
  | "closed";

/** A support ticket. */
export interface SupportTicket {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  category: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: TicketStatus;
  created_at: string;
}

// ── API / Supabase Helpers ──────────────────────────────────

/** Standard API response envelope. */
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  status: number;
}

/** Paginated response wrapper. */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

/** Supabase query filter operators. */
export type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "ilike"
  | "in"
  | "is"
  | "contains"
  | "contained_by"
  | "overlaps";

/** Supabase query filter definition. */
export interface QueryFilter {
  column: string;
  operator: FilterOperator;
  value: unknown;
}

/** Supabase query options for the shared client. */
export interface QueryOptions {
  filters?: QueryFilter[];
  order?: { column: string; ascending?: boolean }[];
  limit?: number;
  offset?: number;
  select?: string;
}

// ── Mobile Theme Constants ──────────────────────────────────

/** Spacing tokens for React Native. */
export interface SpacingTokens {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
  xxxl: number;
}

/** Border radius tokens for React Native. */
export interface RadiusTokens {
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
  pill: number;
}

/** Font family tokens for React Native. */
export interface FontTokens {
  regular: string;
  medium: string;
  semibold: string;
  bold: string;
}
