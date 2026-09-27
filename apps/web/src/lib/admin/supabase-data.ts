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

// ─── Dashboard metrics (computed in Postgres) ───────────────────
// These five functions used to pull every row of four tables into the browser
// and reduce them here, which meant the numbers could only be as honest as a
// client-side filter. The math now lives in admin_kpis() et al
// (migration 202609240003_admin_rollups.sql), which also return the real
// previous-period value so deltas are measured rather than typed in.
export interface Metric {
  value: number;
  /** Null when the server has no prior period to compare against. */
  prevValue: number | null;
  deltaPct: number | null;
}

/** Keyed by the metric names emitted by admin_kpis(). */
export type KpiMap = Record<string, Metric>;

export async function getAdminKpis(): Promise<{
  ok: boolean;
  metrics: KpiMap;
  error?: string;
}> {
  const { data, error } = await supabase.rpc("admin_kpis");
  if (error) return { ok: false, metrics: {}, error: error.message };
  const metrics: KpiMap = {};
  for (const row of (data as any[]) || []) {
    metrics[row.metric] = {
      value: Number(row.value ?? 0),
      prevValue: row.prev_value === null ? null : Number(row.prev_value),
      deltaPct: row.delta_pct === null ? null : Number(row.delta_pct),
    };
  }
  return { ok: true, metrics };
}

/** Convenience accessor: the scalar for a metric, or 0 before it has loaded. */
export function kpiValue(metrics: KpiMap, metric: string): number {
  return metrics[metric]?.value ?? 0;
}

export async function getAdminRevenueDaily(days = 7) {
  const { data, error } = await supabase.rpc("admin_revenue_daily", {
    p_days: days,
  });
  return {
    ok: !error,
    error: error?.message,
    series: ((data as any[]) || []).map((r) => ({
      date: String(r.day),
      revenue: Number(r.revenue ?? 0),
      orders: Number(r.orders ?? 0),
    })),
  };
}

/** Status distribution over the whole window, not the last N rows. */
export async function getAdminOrderStatusCounts(days = 90) {
  const { data, error } = await supabase.rpc("admin_order_status_counts", {
    p_days: days,
  });
  return {
    ok: !error,
    error: error?.message,
    counts: ((data as any[]) || []).map((r) => ({
      status: String(r.status),
      count: Number(r.orders ?? 0),
    })),
  };
}

/**
 * Per-marketplace revenue from real order provenance (line items, falling back
 * to orders.target_marketplace). Anything with neither is 'Unattributed' —
 * legacy orders genuinely have no recorded source, and guessing one from the
 * customer's city was the bug this replaces.
 */
export async function getAdminRevenueByMarketplace(days = 90) {
  const { data, error } = await supabase.rpc("admin_revenue_by_marketplace", {
    p_days: days,
  });
  return {
    ok: !error,
    error: error?.message,
    rows: ((data as any[]) || []).map((r) => ({
      marketplace: String(r.marketplace),
      revenue: Number(r.revenue ?? 0),
      orders: Number(r.orders ?? 0),
    })),
  };
}

/**
 * Line-level provenance for one order: what was bought, in which app, at what
 * MOQ and cost. Legacy orders come back with marketplace_key 'unknown', which
 * is the honest answer — the app was never recorded for them.
 */
export async function getOrderItems(orderId: string) {
  try {
    const { data, error } = await supabase
      .from("admin_order_items_view")
      .select(
        "id, order_id, order_ref, product_name, image_url, quantity, unit_price, cost_price, currency, total_price, unit_price_cny, exchange_rate, moq_at_purchase, variant_name, source_url, origin, marketplace_key, marketplace_name, marketplace_logo, is_sourced, is_purchased, is_received, is_inspected, customer_name, created_at"
      )
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    return { ok: !error, items: (data as any[]) || [], error: error?.message };
  } catch (e) {
    return { ok: false, items: [], error: String(e) };
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
    const orders = (data as any[]) || [];
    if (error) return { ok: false, error: error.message, orders: [] };

    // One merge query for the whole page rather than a join the JS client cannot
    // express: `apps` is what the orders list shows so staff can see, per row,
    // which marketplace each order was actually bought in.
    const ids = orders.map((o) => o.id).filter(Boolean);
    if (ids.length) {
      const { data: lines } = await supabase
        .from("admin_order_items_view")
        .select("order_id, marketplace_key")
        .in("order_id", ids);
      const byOrder = new Map<string, Set<string>>();
      for (const line of (lines as any[]) || []) {
        if (!line?.order_id) continue;
        const set = byOrder.get(line.order_id) || new Set<string>();
        set.add(line.marketplace_key);
        byOrder.set(line.order_id, set);
      }
      for (const order of orders) {
        const set = byOrder.get(order.id);
        order.apps = set ? [...set].sort() : [];
      }
    }
    return { ok: true, orders };
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
    // A verified subset of admin_customers_view's fixed column list
    // (20260813_admin_view_layer_corrected.sql:98-115): every field the
    // customers list, its filters/KPIs, CSV export and row-click actually read.
    // A view's output columns are atomic — if the view exists these all exist —
    // so this is drift-safe, unlike a base-table projection.
    let q = supabase
      .from("admin_customers_view")
      .select(
        "id, full_name, email, phone, city, customer_type, business_name, tier, total_orders, total_spent, created_at"
      )
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
/**
 * Did this request fail because it named a column the live schema does not
 * have? PostgREST answers 400/PGRST204 and Postgres itself 42703; both mean
 * "narrow the query", not "the admin is out of order", so callers retry.
 */
export function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return /does not exist|could not find the/i.test(error.message ?? "");
}

/**
 * The catalog list, with an optional substring search.
 *
 * The search predicate is tried in two shapes because the table has two
 * vocabularies: `source_title` exists since 202408010004, while the curated
 * `title_english`/`title_original`/`title_somali`/`category` only arrive with
 * 202609250004. One unknown column makes PostgREST reject the WHOLE statement,
 * so the wider predicate is attempted first and narrowed on a schema error
 * rather than guessing which deploy this project is on.
 */
export async function listProducts({ search, marketplace }: { search?: string; marketplace?: string } = {}) {
  try {
    const build = (predicate: string | null) => {
      let q = supabase
        .from("source_products")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (predicate) q = q.or(predicate);
      if (marketplace) q = q.eq("marketplace", marketplace);
      return q;
    };

    let { data, error } = search
      ? await build(`${curatedTitlePredicate(search)},${baseTitlePredicate(search)}`)
      : await build(null);

    if (error && isMissingColumnError(error)) {
      const retry = search ? await build(baseTitlePredicate(search)) : await build(null);
      data = retry.data;
      error = retry.error;
    }
    return { ok: !error, products: data || [], error: error?.message };
  } catch (e) {
    return { ok: false, error: String(e), products: [] };
  }
}

/**
 * PostgREST reads `,` and `.` inside or=() as structure, so one search box could
 * otherwise smuggle extra predicates into the query (`shoes%,moq.eq.1`). All
 * three characters are escaped with the backslash PostgREST documents.
 */
function escapeFilter(term: string): string {
  return term.replace(/[\\,.]/g, (c) => `\\${c}`);
}

function baseTitlePredicate(search: string): string {
  return `source_title.ilike.%${escapeFilter(search)}%`;
}

function curatedTitlePredicate(search: string): string {
  const like = `%${escapeFilter(search)}%`;
  return (
    `title_english.ilike.${like},title_original.ilike.${like},` +
    `title_somali.ilike.${like},category.ilike.${like}`
  );
}

// ─── Marketplaces (shared accounts) ─────────────────────────────
/**
 * The live table has no `marketplace`, `password`, `cookies` or
 * `last_refreshed_at`: the real columns are marketplace_type, username,
 * phone, email, notes, is_shared and updated_at. `password_encrypted` is
 * deliberately absent from the select — an admin list query must not pull a
 * credential blob into the browser cache, masked or not.
 */
export async function listMarketplaceAccounts() {
  try {
    const { data, error } = await supabase
      .from("marketplace_accounts")
      .select(
        "id, marketplace_type, account_label, username, phone, email, notes, is_shared, is_active, updated_at, created_at"
      )
      .order("marketplace_type");
    return { ok: !error, accounts: data || [], error: error?.message };
  } catch (e) {
    return { ok: false, error: String(e), accounts: [] };
  }
}

export async function saveMarketplaceAccount(a: any) {
  try {
    const row: any = {
      marketplace_type: a.marketplace_type,
      account_label: a.account_label || "",
      username: a.username || "",
      phone: a.phone || "",
      email: a.email || "",
      notes: a.notes || "",
      is_shared: !!a.is_shared,
      is_active: !!a.is_active,
      updated_at: new Date().toISOString(),
    };
    // No client-side write touches password_encrypted: the credential is stored
    // encrypted and is only ever managed through the secure edge path.
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
      .order("effective_from", { ascending: false })
      .limit(200);
    return { ok: !error, rates: data || [], error: error?.message };
  } catch (e) {
    return { ok: false, error: String(e), rates: [] };
  }
}

export async function saveExchangeRate(r: any) {
  try {
    // Production's vocabulary is from_currency / to_currency / effective_from /
    // effective_until, and it has no `source` column — the free-text note goes
    // in `reason`. The old names made every FX save fail on an unknown column.
    const row: any = {
      from_currency: r.from_currency || "CNY",
      to_currency: r.to_currency || "USD",
      rate: Number(r.rate) || 0,
      reason: r.reason || null,
      is_active: r.is_active !== false,
      effective_from: r.effective_from || new Date().toISOString(),
      effective_until: r.effective_until || null,
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
    // Exactly the live `shipments` columns — no order_id/origin_country/
    // weight_grams; freight quantity lives in total_packages.
    const row: any = {
      reference: s.reference,
      method: s.method || "sea",
      status: s.status || "pending",
      origin: s.origin || "",
      destination: s.destination || "",
      total_packages: Number(s.total_packages) || 0,
      tracking_number: s.tracking_number || null,
      carrier: s.carrier || null,
      departure_date: s.departure_date || null,
      estimated_arrival: s.estimated_arrival || null,
      notes: s.notes || null,
    };
    const res = await supabase.from("shipments").insert(row).select().single();
    return { ok: !res.error, shipment: res.data, error: res.error?.message };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function updateShipmentStatus(id: string, status: string) {
  try {
    // shipments has no shipped_at/delivered_at stamps; only updated_at moves.
    const { error } = await supabase
      .from("shipments")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
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
