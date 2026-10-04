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
  if (error) return { ok: false, metrics: {}, error: adminErrorMessage(error, error.message) };
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
/**
 * listOrders reads the admin view first (rich customer fields), and falls back
 * to the verified `orders` base-table contract when the view denies or drifted
 * (the live view is security_invoker and its alias set can't be probed with the
 * anon key, so every column read below is guarded on the page too).
 * Base-table columns verified live: reference, user_id, status, payment_status,
 * shipping_method, subtotal_usd, service_fee_usd, total_usd, balance_due_usd,
 * currency, delivery_address, destination_city, notes, created_at, updated_at.
 *
 * WINDOWING: this used to pull a single 50-row page and report the whole table
 * as those 50. It now loads a wide `pageSize` window (default 250) and returns
 * the true `total` matching row count (PostgREST head count) alongside the rows,
 * so the Orders screen can paginate client-side AND honestly say when more rows
 * exist beyond the loaded window.
 */
export async function listOrders({
  status,
  payment_status,
  search,
  page = 0,
  pageSize = 250,
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
        "id, order_number, reference, profile_id, customer_name, customer_email, customer_phone, status, payment_status, payment_method, shipping_method, subtotal, shipping_cost, service_fee, total, currency, recipient_name, phone, city, address, target_marketplace, created_at, confirmed_at, shipped_at, delivered_at, cancelled_at",
        { count: "exact" }
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
    let { data, error, count } = await q;
    let orders = (data as any[]) || [];
    let total = count ?? orders.length;

    // An empty result from the view is a legitimate empty page — only a real
    // error (denied view / drifted alias set) triggers the base-table fallback.
    if (error) {
      // Base-table fallback: same filters against verified columns only.
      let fb = supabase
        .from("orders")
        .select(
          "id, reference, user_id, status, payment_status, shipping_method, subtotal_usd, service_fee_usd, total_usd, balance_due_usd, currency, delivery_address, destination_city, notes, created_at, updated_at",
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (status) fb = fb.eq("status", status);
      if (payment_status) fb = fb.eq("payment_status", payment_status);
      if (search) {
        fb = fb.or(
          `reference.ilike.%${search}%,destination_city.ilike.%${search}%,delivery_address.ilike.%${search}%`
        );
      }
      const res = await fb;
      if (res.error) {
        return {
          ok: false,
          error: adminErrorMessage(error, res.error.message),
          orders: [],
          total: 0,
        };
      }
      total = res.count ?? (res.data as any[] | undefined)?.length ?? 0;
      // Map base rows into the shape the view promised so page code that reads
      // either shape keeps working (pages also guard per-field).
      orders = ((res.data as any[]) || []).map((o) => ({
        ...o,
        order_number: o.reference,
        profile_id: o.user_id,
        total: o.total_usd,
        subtotal: o.subtotal_usd,
        shipping_cost: o.balance_due_usd,
        service_fee: o.service_fee_usd,
        city: o.destination_city,
        address: o.delivery_address,
      }));
      // Fill customer contact for the page's user_ids (profiles.id = auth uid).
      const uids = [...new Set(orders.map((o) => o.user_id).filter(Boolean))];
      if (uids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, phone")
          .in("id", uids);
        const byId = new Map(((profs as any[]) || []).map((p) => [p.id, p]));
        for (const o of orders) {
          const p = byId.get(o.user_id);
          o.customer_name = p?.full_name ?? null;
          o.customer_phone = p?.phone ?? null;
          o.recipient_name = p?.full_name ?? null;
          o.phone = p?.phone ?? null;
        }
      }
    }

    // One merge query for the whole page rather than a join the JS client cannot
    // express: `apps` is what the orders list shows so staff can see, per row,
    // which marketplace each order was actually bought in. Non-fatal: an
    // unavailable items view just leaves apps empty.
    const ids = orders.map((o) => o.id).filter(Boolean);
    if (ids.length) {
      const { data: lines, error: linesError } = await supabase
        .from("admin_order_items_view")
        .select("order_id, marketplace_key")
        .in("order_id", ids);
      if (!linesError) {
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
    }
    return { ok: true, orders, total };
  } catch (e) {
    return { ok: false, error: String(e), orders: [], total: 0 };
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
    return {
      ok: !error,
      customers: data || [],
      error: error ? adminErrorMessage(error, "Failed to load customers") : undefined,
    };
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

/** What the operator should DO about a dead admin session. */
export const SESSION_DEAD_MESSAGE =
  "Your admin session has expired. Sign out, sign in again, then reopen this page.";

/**
 * Did this request fail because the browser's JWT is gone or stale?
 *
 * The admin views (admin_customers_view, admin_staff_view, admin_orders_view)
 * are `security_invoker` views granted to `authenticated` only, so an expired
 * session reaches PostgREST as `anon` and answers 401/42501
 * "permission denied for view …". That wording reads like a broken database and
 * sends staff hunting for an RLS bug; the real fix is one click. Same for the
 * "JWSError"/"invalid JWT" variants of a token the gateway rejected.
 */
export function isSessionDeadError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  if (error.code === "42501" || error.code === "401" || error.code === "PGRST301") return true;
  return /permission denied for (view|table)|JWSError|invalid JWT|JWT expired|token has already been used|no api key/i.test(
    error.message ?? ""
  );
}

/** Map a PostgREST error to something an operator can act on. */
export function adminErrorMessage(
  error: { code?: string; message?: string } | null | undefined,
  fallback: string
): string {
  if (isSessionDeadError(error)) return SESSION_DEAD_MESSAGE;
  return error?.message || fallback;
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
    return { ok: !error, products: data || [], error: error ? adminErrorMessage(error, "Request failed") : undefined };
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
 * Delete is schema-agnostic (only the id is touched), so it lives here while
 * the list/save helpers with the column-drift probing are grouped under
 * "Marketplace accounts" near the bottom of this file.
 */
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
    return { ok: !error, requests: data || [], error: error ? adminErrorMessage(error, "Request failed") : undefined };
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
    return { ok: !error, payments: data || [], error: error ? adminErrorMessage(error, "Request failed") : undefined };
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
      provider_ref: p.provider_ref || null,
      evidence_url: p.evidence_url || null,
    };
    const res = await supabase.from("payments").insert(row).select().single();
    return { ok: !res.error, payment: res.data, error: res.error?.message };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ─── Exchange rates ─────────────────────────────────────────────
// One write path for the admin (Settings → Currency). Reading is not here: the
// live row per pair is resolved, flipped and bounded in src/lib/fx.ts, and
// /admin/rates lists the history straight from the table. A second reader used
// to live in this file with no callers, which is how two screens could disagree
// about what `rate` means.
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
    return { ok: !error, quotes: data || [], error: error ? adminErrorMessage(error, "Request failed") : undefined };
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
    return { ok: !error, shipments: data || [], error: error ? adminErrorMessage(error, "Request failed") : undefined };
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
    return { ok: !error, packages: data || [], error: error ? adminErrorMessage(error, "Request failed") : undefined };
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
    return {
      ok: !error,
      staff: data || [],
      error: error ? adminErrorMessage(error, "Failed to load staff") : undefined,
    };
  } catch (e) {
    return { ok: false, error: String(e), staff: [] };
  }
}

// ─── Marketplace accounts ────────────────────────────────────────
/** Columns every deployment of marketplace_accounts is known to have. */
const MARKETPLACE_BASE_COLS =
  "id, marketplace_type, account_label, username, password_encrypted, phone, email, notes, is_shared, is_active, created_at";

/**
 * Wider projection adding the session/health columns used by the WebView
 * auto-login feature. Those are assumptions about the LIVE schema; if this
 * project predates them the query retries on the base set above.
 */
const MARKETPLACE_SESSION_COLS =
  MARKETPLACE_BASE_COLS + ", cookies, cookies_updated_at, last_verified_at, health";

/**
 * Session set plus cookies_updated_by (which staff member last synced the
 * cookies). That column is arriving via a migration in flight: we prefer it,
 * but a missing-column error falls through to the tier below so the list
 * keeps working until the live schema catches up.
 */
const MARKETPLACE_SESSION_PLUS_COLS = MARKETPLACE_SESSION_COLS + ", cookies_updated_by";

/**
 * Decorative join: resolve cookies_updated_by (an auth uid) to a display name
 * via profiles. Non-fatal by design — RLS or a deleted staff profile just
 * leaves the name null and the UI falls back to showing the raw id.
 */
async function attachCookieUpdaterNames(accounts: any[]): Promise<void> {
  const uids = [...new Set(accounts.map((a) => a?.cookies_updated_by).filter(Boolean))];
  if (!uids.length) return;
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", uids);
  const byId = new Map(((profs as any[]) || []).map((p) => [p.id, p?.full_name]));
  for (const a of accounts) {
    if (a?.cookies_updated_by) {
      a.cookies_updated_by_name = byId.get(a.cookies_updated_by) ?? null;
    }
  }
}

/**
 * List marketplace accounts, preferring the widest session-aware column set
 * and stepping down one tier at a time on a missing-column error (the
 * cookies_* columns arrive progressively; cookies_updated_by may not exist
 * on every deployment yet). `hasSessionColumns` tells the caller whether
 * cookies/health are live, so the UI can hide cookie/health affordances
 * instead of showing blank ones.
 */
export async function listMarketplaceAccounts() {
  try {
    // The projections name columns the generated DB types predate (cookies,
    // health, cookies_updated_by) and the drift probe deliberately tolerates
    // that, so the client result is widened here; the page guards each field
    // at read time.
    const tiers = [MARKETPLACE_SESSION_PLUS_COLS, MARKETPLACE_SESSION_COLS, MARKETPLACE_BASE_COLS];
    let data: any[] | null = null;
    let lastError: { code?: string; message?: string } | null = null;
    let hasSessionColumns = false;
    for (const cols of tiers) {
      const res = (await supabase
        .from("marketplace_accounts")
        .select(cols)
        .order("created_at", { ascending: false })) as {
        data: any[] | null;
        error: { code?: string; message?: string } | null;
      };
      if (!res.error) {
        data = res.data;
        lastError = null;
        hasSessionColumns = cols !== MARKETPLACE_BASE_COLS;
        break;
      }
      // Only a schema-drift error justifies narrowing the projection; anything
      // else (network, RLS) will fail identically on every tier.
      if (!isMissingColumnError(res.error)) {
        lastError = res.error;
        break;
      }
      lastError = res.error;
    }
    if (lastError) throw lastError;
    const accounts = data || [];
    await attachCookieUpdaterNames(accounts);
    return {
      ok: true,
      accounts,
      hasSessionColumns,
      error: undefined as string | undefined,
    };
  } catch (e) {
    return { ok: false, accounts: [], hasSessionColumns: false, error: String(e) };
  }
}

/**
 * Insert or update a marketplace account. The session fields (cookies,
 * cookies_updated_at, cookies_updated_by, last_verified_at, health) are
 * written only when the live schema has them: on a missing-column error they
 * are dropped and the write retried so the account still saves on older
 * schemas.
 */
export async function saveMarketplaceAccount(
  payload: Record<string, any>,
  id?: string
) {
  const optionalCols = [
    "cookies",
    "cookies_updated_at",
    "cookies_updated_by",
    "last_verified_at",
    "health",
  ];
  const write = (body: Record<string, any>) =>
    id
      ? supabase.from("marketplace_accounts").update(body).eq("id", id)
      : supabase.from("marketplace_accounts").insert(body);
  try {
    let { error } = await write(payload);
    if (error && isMissingColumnError(error)) {
      const narrowed = { ...payload };
      for (const c of optionalCols) delete narrowed[c];
      ({ error } = await write(narrowed));
    }
    return { ok: !error, error: error?.message };
  } catch (e) {
    return { ok: false, error: String(e) };
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
    if (error) {
      // A failed read is NOT the same as an unset key. Without this the caller
      // silently gets `fallback` and cannot tell "no value stored" from "read
      // denied/errored", so log the real failure.
      console.warn("[data]", key, error.message);
      return fallback;
    }
    if (!data) return fallback; // genuinely unset — not an error
    return data.value;
  } catch (e) {
    console.warn("[data]", key, e instanceof Error ? e.message : String(e));
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
