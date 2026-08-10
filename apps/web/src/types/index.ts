export interface Product {
  id: string;
  marketplace: "1688" | "taobao" | "yiwugo" | "alibaba" | "chinagoods" | "jd" | "chinasuuq";
  source_product_id: string;
  source_url: string;
  title_original: string;
  title_english: string;
  title_somali: string;
  images: string[];
  category: string;
  price_cny_min: number;
  price_cny_max: number;
  price_usd_estimated: number;
  moq: number;
  stock_status: "in_stock" | "low_stock" | "out_of_stock";
  supplier_rating: number;
  sales_count: number;
  domestic_shipping_cny: number;
}

export interface ProductVariant {
  id: string;
  name: string;
  options: { label: string; value: string; image?: string }[];
  price_cny?: number;
  stock: number;
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
  added_at: string;
}

export interface Order {
  id: string;
  reference: string;
  status: OrderStatus;
  items: OrderItem[];
  total_usd: number;
  currency: string;
  payment_status: "pending" | "confirmed" | "failed" | "refunded";
  shipping_method: "air" | "sea" | "land";
  tracking_events: TrackingEvent[];
  created_at: string;
  updated_at: string;
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

export interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  price_usd: number;
}

export interface TrackingEvent {
  id: string;
  status: string;
  location: string;
  message: string;
  timestamp: string;
  evidence_url?: string;
}

export interface Customer {
  id: string;
  full_name: string;
  phone: string;
  email?: string;
  city: string;
  language: "en" | "so";
  customer_type: "individual" | "business";
  business_name?: string;
  created_at: string;
}

export interface Category {
  id: string;
  name_en: string;
  name_so: string;
  slug: string;
  icon: string;
  image_url?: string;
  product_count: number;
  subcategories: { name_en: string; name_so: string; slug: string }[];
}

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

export interface SourcingRequest {
  id: string;
  user_id: string;
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

export interface QuoteItem {
  product_name: string;
  variant?: string;
  quantity: number;
  unit_price_cny: number;
  subtotal_cny: number;
}

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

export interface Shipment {
  id: string;
  reference: string;
  method: "air" | "sea" | "land";
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

export interface Payment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  method: "zaad" | "edahab" | "premier" | "evc_plus" | "sahal" | "bank_transfer" | "manual";
  status: "pending" | "confirmed" | "failed" | "refunded";
  reference: string;
  verified_by?: string;
  verified_at?: string;
  created_at: string;
}
