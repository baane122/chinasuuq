// Supabase-backed data layer for admin mission control.
//
// Each function reads/writes real Supabase tables (or the new admin_*_view
// projections from migration 014_admin_view_layer.sql). Pages should call
// these instead of the legacy `useAdminData` store so the admin truly mirrors
// the production database.

import { supabase } from "../supabase";

// ─── Status mappers (mirror the mobile adapter) ───────────────────
const MOBILE_TO_DB: Record<string, string> = {
  pending: "pending",
  confirmed: "confirmed",
  purchasing: "purchasing",
  purchased: "purchased",
  in_transit_china: "in_warehouse",
  warehouse: "in_warehouse",
  inspection: "inspection_passed",
  consolidated: "consolidated",
  shipped: "shipped",
  in_transit: "in_transit",
  arrived_somalia: "in_transit",
  customs: "customs_hold",
  ready_for_pickup: "out_for_delivery",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  cancelled: "cancelled",
};

const DB_TO_MOBILE: Record<string, string> = {
  pending: "pending",
  confirmed: "confirmed",
  processing: "confirmed",
  sourcing: "purchasing",
  sourced: "purchased",
  quoted: "purchased",
  quote_approved: "purchased",
  paid: "confirmed",
  purchasing: "purchasing",
  purchased: "purchased",
  in_warehouse: "warehouse",
  inspection_passed: "inspection",
  inspection_failed: "cancelled",
  consolidated: "consolidated",
  shipped: "shipped",
  in_transit: "in_transit",
  customs_hold: "customs",
  delivered: "delivered",
  completed: "delivered",
  cancelled: "cancelled",
  awaiting_payment: "pending",
  out_for_delivery: "out_for_delivery",
};

export function mapMobileStatusToDb(s: string): string {
  return MOBILE_TO_DB[s] || s || "pending";
}

export function mapDbStatusToMobile(s: string): string {
  return DB_TO_MOBILE[s] || s || "pending";
}

// ─── Dashboard KPIs ───────────────────────────────────────────────
export async function getDashboardKpis() {
  try {
    const [ordersRes, customersRes, productsRes, sourcingRes] = await Promise.all([
      supabase
        .from("admin_orders_view")
        .select("id, total, status, payment_status, created_at"),
      supabase
        .from("admin_customers_view")
        .select("id, total_orders, total_spent"),
      supabase
        .from("source_products")
        .select("id, marketplace, price_usd_estimated, stock_status, sales_count")
        .eq("stock_status", "in_stock"),
      supabase
        .from("admin_sourcing_view")
        .select("id, status, created_at"),
    ]);
    const orders = (ordersRes.data as any[]) || [];
    const customers = (customersRes.data as any[]) || [];
    const products = (productsRes.data as any[]) || [];
    const sourcing = (sourcingRes.data as any[]) || [];
    const totalRevenue = orders.reduce((s, o) => s + (o.total || 0), 0);
    const activeOrders = orders.filter(
      (o) => !["delivered", "completed", "cancelled"].includes(o.status)
    ).length;
    const deliveredOrders = orders.filter((o) =>
      ["delivered", "completed"].includes(o.status)
    ).length;
    const today = new Date().toISOString().slice(0, 10);
    const todaysOrders = orders.filter(
      (o) => (o.created_at || "").slice(0, 10) === today
    );
    const pendingSourcing = sourcing.filter((s) =>
      ["pending", "reviewing"].includes(s.status)
    ).length;
    return {
      ok: true,
      kpis: {
        totalRevenue,
        totalOrders: orders.length,
        activeOrders,
        deliveredOrders,
        totalCustomers: customers.length,
        totalProducts: products.length,
        todaysOrders: todaysOrders.length,
        todaysRevenue: todaysOrders.reduce((s, o) => s + (o.total || 0), 0),
        pendingSourcing,
        avgOrderValue: orders.length ? totalRevenue / orders.length : 0,
        deliveryRate: orders.length ? (deliveredOrders / orders.length) * 100 : 0,
      },
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ─── Orders CRUD ──────────────────────────────────────────────────
export async function listOrders({
  status,
  payment_status,
  search,
  page = 0,
  pageSize = 50,
}: {
  status?: string;
  payment_status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  try {
    let q = supabase
      .from("admin_orders_view")
      .select(
        "id, order_number, reference, profile_id, customer_name, customer_email, customer_phone, status, payment_status, payment_method, shipping_method, subtotal, shipping_cost, service_fee, total, currency, recipient_name, phone, city, address, target_marketplace, created_at, confirmed_at, shipped_at, delivered_at, cancelled_at"
      )
      .order("created_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (status) q = q.eq("status", status);
    if (payment_status) q = q.eq("payment_status", payment_status);
    if (search) {
      q = q.or(
        `order_number.ilike.%${search}%,reference.ilike.%${search}%,recipient_name.ilike.%${search}%,phone.ilike.%${search}%`
      );
    }
    const { data, error } = await q;
    return { ok: !error, orders: data || [], error: error?.message };
  } catch (e) {
    return { ok: false, error: String(e), orders: [] };
  }
}

export async function updateOrder(id: string, patch: Record<string, any>) {
  try {
    const { error } = await supabase
      .from("orders")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    return { ok: !error, error: error?.message };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ─── Customers ────────────────────────────────────────────────────
export async function listCustomers({ search }: { search?: string } = {}) {
  try {
    let q = supabase
      .from("admin_customers_view")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (search) {
      q = q.or(
        `full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,city.ilike.%${search}%`
      );
    }
    const { data, error } = await q;
    return { ok: !error, customers: data || [], error: error?.message };
  } catch (e) {
    return { ok: false, error: String(e), customers: [] };
  }
}

// ─── Products ─────────────────────────────────────────────────────
export async function listProducts({ search, marketplace }: { search?: string; marketplace?: string } = {}) {
  try {
    let q = supabase
      .from("source_products")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (search) {
      q = q.or(
        `title_english.ilike.%${search}%,title_original.ilike.%${search}%,title.ilike.%${search}%,name.ilike.%${search}%`
      );
    }
    if (marketplace) q = q.eq("marketplace", marketplace);
    const { data, error } = await q;
    return { ok: !error, products: data || [], error: error?.message };
  } catch (e) {
    return { ok: false, error: String(e), products: [] };
  }
}

export async function saveProduct(p: any) {
  try {
    const row: any = {
      title_english: p.title_english || p.title || "",
      title_original: p.title_original || p.title || "",
      title_somali: p.title_somali || p.title_english || "",
      description_english: p.description_english || "",
      description_original: p.description_original || "",
      marketplace: p.marketplace || "1688",
      category: p.category || "",
      price_cny_min: Number(p.price_cny_min) || 0,
      price_cny_max: Number(p.price_cny_max) || p.price_cny_min || 0,
      price_usd_estimated: Number(p.price_usd_estimated) || 0,
      moq: Number(p.moq) || 1,
      stock_status: p.stock_status || "in_stock",
      source_url: p.source_url || "",
      sales_count: Number(p.sales_count) || 0,
      supplier_rating: Number(p.supplier_rating) || 0,
      images: p.images || [],
      updated_at: new Date().toISOString(),
    };
    let res;
    if (p.id) {
      res = await supabase.from("source_products").update(row).eq("id", p.id).select().single();
    } else {
      row.created_at = new Date().toISOString();
      res = await supabase.from("source_products").insert(row).select().single();
    }
    return { ok: !res.error, product: res.data, error: res.error?.message };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function deleteProduct(id: string) {
  try {
    const { error } = await supabase.from("source_products").delete().eq("id", id);
    return { ok: !error, error: error?.message };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ─── Marketplaces (shared accounts) ─────────────────────────────
export async function listMarketplaceAccounts() {
  try {
    const { data, error } = await supabase
      .from("marketplace_accounts")
      .select("id, marketplace, username, password, cookies, is_active, last_refreshed_at, created_at")
      .order("marketplace");
    return { ok: !error, accounts: data || [], error: error?.message };
  } catch (e) {
    return { ok: false, error: String(e), accounts: [] };
  }
}

export async function saveMarketplaceAccount(a: any) {
  try {
    const row: any = {
      marketplace: a.marketplace,
      username: a.username || "",
      password: a.password || "",
      cookies: a.cookies || "",
      is_active: !!a.is_active,
      last_refreshed_at: new Date().toISOString(),
    };
    let res;
    if (a.id) res = await supabase.from("marketplace_accounts").update(row).eq("id", a.id).select().single();
    else res = await supabase.from("marketplace_accounts").insert(row).select().single();
    return { ok: !res.error, account: res.data, error: res.error?.message };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function deleteMarketplaceAccount(id: string) {
  try {
    const { error } = await supabase.from("marketplace_accounts").delete().eq("id", id);
    return { ok: !error, error: error?.message };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ─── Sourcing ─────────────────────────────────────────────────────
export async function listSourcing({ status }: { status?: string } = {}) {
  try {
    let q = supabase
      .from("admin_sourcing_view")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    return { ok: !error, requests: data || [], error: error?.message };
  } catch (e) {
    return { ok: false, error: String(e), requests: [] };
  }
}

export async function updateSourcing(id: string, patch: Record<string, any>) {
  try {
    const { error } = await supabase
      .from("sourcing_requests")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    return { ok: !error, error: error?.message };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ─── Payments ─────────────────────────────────────────────────────
export async function listPayments({ status }: { status?: string } = {}) {
  try {
    let q = supabase
      .from("admin_payments_view")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    return { ok: !error, payments: data || [], error: error?.message };
  } catch (e) {
    return { ok: false, error: String(e), payments: [] };
  }
}

export async function recordPayment(p: any) {
  try {
    const row: any = {
      order_id: p.order_id,
      amount: Number(p.amount) || 0,
      currency: p.currency || "USD",
      method: p.method || "mobile_money",
      status: p.status || "pending",
      reference: p.reference || null,
      shipping_method: p.shipping_method || null,
    };
    const res = await supabase.from("payments").insert(row).select().single();
    return { ok: !res.error, payment: res.data, error: res.error?.message };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ─── Exchange rates ─────────────────────────────────────────────
export async function listExchangeRates() {
  try {
    const { data, error } = await supabase
      .from("exchange_rates")
      .select("*")
      .order("valid_from", { ascending: false })
      .limit(200);
    return { ok: !error, rates: data || [], error: error?.message };
  } catch (e) {
    return { ok: false, error: String(e), rates: [] };
  }
}

export async function saveExchangeRate(r: any) {
  try {
    const row: any = {
      source_currency: r.source_currency || "CNY",
      target_currency: r.target_currency || "USD",
      rate: Number(r.rate) || 0,
      source: r.source || "manual",
      is_active: r.is_active !== false,
      valid_from: r.valid_from || new Date().toISOString(),
      valid_until: r.valid_until || null,
    };
    let res;
    if (r.id) res = await supabase.from("exchange_rates").update(row).eq("id", r.id).select().single();
    else res = await supabase.from("exchange_rates").insert(row).select().single();
    return { ok: !res.error, rate: res.data, error: res.error?.message };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ─── Quotes ──────────────────────────────────────────────────────
export async function listQuotes() {
  try {
    const { data, error } = await supabase
      .from("admin_quotes_view")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    return { ok: !error, quotes: data || [], error: error?.message };
  } catch (e) {
    return { ok: false, error: String(e), quotes: [] };
  }
}

export async function createQuote(q: any) {
  try {
    const row: any = {
      sourcing_request_id: q.sourcing_request_id || null,
      profile_id: q.profile_id,
      subtotal: Number(q.subtotal) || 0,
      shipping_cost: Number(q.shipping_cost) || 0,
      service_fee: Number(q.service_fee) || 0,
      tax_amount: Number(q.tax_amount) || 0,
      discount_amount: Number(q.discount_amount) || 0,
      total: Number(q.total) || 0,
      currency: q.currency || "USD",
      valid_until: q.valid_until || null,
      notes: q.notes || null,
    };
    const res = await supabase.from("quotes").insert(row).select().single();
    return { ok: !res.error, quote: res.data, error: res.error?.message };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ─── Shipments ───────────────────────────────────────────────────
export async function listShipments() {
  try {
    const { data, error } = await supabase
      .from("admin_shipments_view")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    return { ok: !error, shipments: data || [], error: error?.message };
  } catch (e) {
    return { ok: false, error: String(e), shipments: [] };
  }
}

export async function createShipment(s: any) {
  try {
    const row: any = {
      order_id: s.order_id,
      carrier: s.carrier || "China Post",
      status: s.status || "pending",
      origin_country: s.origin_country || "CN",
      origin_warehouse: s.origin_warehouse || "Guangzhou",
      destination_country: s.destination_country || "SO",
      destination_city: s.destination_city || "",
      destination_address: s.destination_address || "",
      weight_grams: Number(s.weight_grams) || 0,
      package_count: Number(s.package_count) || 1,
      shipping_cost: Number(s.shipping_cost) || 0,
      currency: s.currency || "USD",
      estimated_delivery_date: s.estimated_delivery_date || null,
    };
    const res = await supabase.from("shipments").insert(row).select().single();
    return { ok: !res.error, shipment: res.data, error: res.error?.message };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function updateShipmentStatus(id: string, status: string) {
  try {
    const patch: any = { status, updated_at: new Date().toISOString() };
    if (status === "shipped") patch.shipped_at = new Date().toISOString();
    if (status === "delivered") patch.delivered_at = new Date().toISOString();
    const { error } = await supabase.from("shipments").update(patch).eq("id", id);
    return { ok: !error, error: error?.message };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ─── Warehouse packages ──────────────────────────────────────────
export async function listWarehousePackages() {
  try {
    const { data, error } = await supabase
      .from("admin_warehouse_view")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    return { ok: !error, packages: data || [], error: error?.message };
  } catch (e) {
    return { ok: false, error: String(e), packages: [] };
  }
}

export async function updateWarehousePackage(id: string, patch: Record<string, any>) {
  try {
    const { error } = await supabase
      .from("warehouse_packages")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    return { ok: !error, error: error?.message };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ─── Staff ────────────────────────────────────────────────────────
export async function listStaff() {
  try {
    const { data, error } = await supabase
      .from("admin_staff_view")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    return { ok: !error, staff: data || [], error: error?.message };
  } catch (e) {
    return { ok: false, error: String(e), staff: [] };
  }
}

// ─── Settings ────────────────────────────────────────────────────
export async function getSetting(key: string, fallback: any = null) {
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return fallback;
    return data.value;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: any) {
  try {
    const { error } = await supabase
      .from("settings")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    return { ok: !error, error: error?.message };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
