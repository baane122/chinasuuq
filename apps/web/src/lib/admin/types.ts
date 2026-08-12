// Admin domain types — single source of truth for the Mission Control dashboard.
// All CRUD pages import from here so the data shape stays consistent.

export type OrderStatus =
  | "draft"
  | "awaiting_payment"
  | "paid"
  | "purchasing"
  | "in_warehouse"
  | "in_transit"
  | "customs"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "refunded";

export type PaymentMethod = "zaad" | "edahab" | "premier_wallet" | "bank_transfer" | "usdt" | "cash";
export type PaymentStatus = "pending" | "confirmed" | "failed" | "refunded";
export type ShippingMethod = "air" | "sea" | "land";
export type WarehouseStatus = "expected" | "received" | "inspecting" | "consolidated" | "ready" | "shipped";

export interface AdminCustomer {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  city: string;
  type: "individual" | "business";
  total_orders: number;
  total_spent_usd: number;
  created_at: string;
  notes?: string;
}

export interface AdminOrderItem {
  id: string;
  product_id: string;
  product_title: string;
  variant?: string;
  quantity: number;
  unit_price_usd: number;
  total_usd: number;
  image?: string;
}

export interface AdminOrder {
  id: string;
  reference: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  city: string;
  status: OrderStatus;
  shipping_method: ShippingMethod;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  items: AdminOrderItem[];
  total_usd: number;
  shipping_usd: number;
  weight_kg: number;
  tracking?: { location: string; time: string; status: string }[];
  notes?: string;
  created_at: string;
  updated_at: string;
  eta?: string;
}

export interface AdminProduct {
  id: string;
  sku: string;
  title: string;
  title_somali?: string;
  category: string;
  marketplace: string;
  price_cny: number;
  price_usd: number;
  stock_status: "in_stock" | "low_stock" | "out_of_stock";
  stock_count: number;
  image?: string;
  moq: number;
  supplier: string;
  status: "active" | "draft" | "archived";
  updated_at: string;
}

export interface AdminShipment {
  id: string;
  reference: string;
  order_id: string;
  customer_name: string;
  mode: ShippingMethod;
  origin: string;
  destination: string;
  weight_kg: number;
  cbm?: number;
  status: WarehouseStatus;
  carrier: string;
  tracking_no?: string;
  departed_at?: string;
  eta: string;
  created_at: string;
}

export interface AdminQuote {
  id: string;
  reference: string;
  customer_id: string;
  customer_name: string;
  item_summary: string;
  quantity: number;
  unit_price_cny: number;
  total_usd: number;
  shipping_method: ShippingMethod;
  status: "draft" | "sent" | "accepted" | "declined" | "expired";
  valid_until: string;
  created_at: string;
}

export interface AdminPayment {
  id: string;
  reference: string;
  order_id: string;
  customer_name: string;
  method: PaymentMethod;
  amount_usd: number;
  status: PaymentStatus;
  reference_code?: string;
  received_at: string;
  confirmed_by?: string;
}

export interface AdminSupplier {
  id: string;
  name: string;
  marketplace: string;
  contact: string;
  rating: number;
  categories: string[];
  orders_count: number;
  on_time_pct: number;
  status: "active" | "paused" | "blocked";
}

export interface AdminRate {
  id: string;
  pair: string;
  buy: number;
  sell: number;
  source: string;
  updated_at: string;
}

export interface AdminSourcingRequest {
  id: string;
  reference: string;
  customer_name: string;
  source_url?: string;
  notes: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: "open" | "quoted" | "approved" | "rejected" | "fulfilled";
  assigned_to?: string;
  created_at: string;
}

export interface AdminStaffMember {
  id: string;
  full_name: string;
  email: string;
  role: "super_admin" | "admin" | "ops" | "finance" | "support" | "warehouse";
  branch: string;
  active: boolean;
  last_active: string;
}

export interface AdminMarketplaceAccount {
  id: string;
  marketplace: string;
  label: string;
  username: string;
  email?: string;
  phone?: string;
  notes?: string;
  shared: boolean;
  active: boolean;
  last_used?: string;
}

export interface AdminNotification {
  id: string;
  title: string;
  body: string;
  kind: "order" | "payment" | "system" | "support" | "warehouse";
  read: boolean;
  href?: string;
  created_at: string;
}

export interface AdminActivityEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  kind: "order" | "payment" | "product" | "customer" | "system" | "warehouse";
  created_at: string;
}

// Aggregated shape used by the dashboard
export interface AdminDashboardSummary {
  revenue_usd_today: number;
  revenue_usd_month: number;
  orders_today: number;
  orders_open: number;
  orders_in_transit: number;
  customers_total: number;
  products_active: number;
  shipments_in_transit: number;
  payments_pending: number;
  quotes_open: number;
  sourcing_open: number;
  alerts: { id: string; kind: "warning" | "danger" | "info"; title: string; body: string; created_at: string }[];
  trend: { date: string; revenue_usd: number; orders: number }[];
}
