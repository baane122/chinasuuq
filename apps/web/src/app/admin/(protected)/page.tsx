"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  DollarSign,
  Download,
  Globe2,
  Layers,
  Package,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShoppingCart,
  Ship,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { PageHeader, StatCard, PageGrid, SectionCard, FilterChips } from "@/components/admin/ui";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { useToast } from "@/components/admin/Toast";
import { supabase } from "@/lib/supabase";
import { formatUSD } from "@/lib/utils";
import { ORDERS_CSV_COLUMNS, downloadCsv, stamp, toCsv } from "@/lib/admin/csv";
import { useLiveConnected, useLiveVersion } from "@/lib/admin/live-store";
import {
  getAdminKpis,
  getAdminOrderStatusCounts,
  getAdminRevenueByMarketplace,
  getAdminRevenueDaily,
  kpiValue,
  listOrders,
  listProducts,
  mapDbStatusToMobile,
  type KpiMap,
} from "@/lib/admin/supabase-data";

/* ─── Types ──────────────────────────────────────────────────────── */
interface RecentOrder {
  id: string;
  order_number: string;
  customer_name: string;
  city: string;
  total: number;
  status: string;
  payment_status: string;
  created_at: string;
}

interface ActivityEvent {
  id: string;
  title: string;
  type: string;
  created_at: string;
}

interface DailyRevenue {
  date: string;
  label: string;
  amount: number;
  /** Order count behind that day's revenue — exported with the CSV. */
  orders: number;
}

interface OrderStatusCount {
  status: string;
  count: number;
  color: string;
}

interface TopProduct {
  id: string;
  title: string;
  title_english: string;
  marketplace: string;
  sales_count: number;
  price_usd_estimated: number;
  source_images?: string[] | null;
}

interface TopCategory {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  /** Counted live from source_products.category_id — the categories table has
   *  no stored product_count. Null means the count query failed, i.e. unknown. */
  product_count: number | null;
}

/**
 * Each counter is a head-count query, and a head-count that fails returns
 * `count: null` rather than throwing. Reporting that as 0 told staff there were
 * no low-stock items when the real answer was "the query broke", which is the
 * fabricated-metric failure this dashboard was rebuilt to remove. null means
 * unknown and renders as an em dash.
 */
interface LiveOps {
  inTransit: number | null;
  lowStock: number | null;
  pendingSourcing: number | null;
  unreadNotifications: number | null;
}

interface MarketplaceRevenue {
  marketplace: string;
  revenue: number;
  orders: number;
  color: string;
  icon: string;
}

/* ─── Date range ────────────────────────────────────────────────── */
type RangeKey = "24h" | "7d" | "30d" | "90d" | "all";

/**
 * One window drives every range-filtered chart on the page (revenue daily,
 * status donut, marketplace breakdown). `days: null` is "All".
 *
 * There is no unfiltered server mode: the admin_* rollup RPCs clamp their
 * window with least(coalesce(p_days, …), 365) and read NULL as their default,
 * so "All" is served as the RPC's full 365-day window (see rpcDays below).
 * A truly unbounded query would need a migration, which this page cannot ship.
 */
const DATE_RANGES: {
  key: RangeKey;
  label: string;
  days: number | null;
  heading: string;
  caption: string;
}[] = [
  { key: "24h", label: "24h", days: 1, heading: "Last 24 Hours", caption: "the last 24 hours" },
  { key: "7d", label: "7d", days: 7, heading: "Last 7 Days", caption: "the last 7 days" },
  { key: "30d", label: "30d", days: 30, heading: "Last 30 Days", caption: "the last 30 days" },
  { key: "90d", label: "90d", days: 90, heading: "Last 90 Days", caption: "the last 90 days" },
  {
    key: "all",
    label: "All",
    days: null,
    heading: "All Time",
    // Honest: the server caps the rollup window at 365 days.
    caption: "all time (rollup window caps at 365 days)",
  },
];

function rangeOf(key: RangeKey) {
  return DATE_RANGES.find((r) => r.key === key) ?? DATE_RANGES[1];
}

/** Wire value for the rollup RPCs — see the DATE_RANGES comment for "All". */
const rpcDays = (days: number | null) => days ?? 365;

/* ─── Per-widget CSV columns ────────────────────────────────────── */
/** Daily revenue chart rows, as fetched from admin_revenue_daily. */
const REVENUE_CSV_COLUMNS: { header: string; value: (row: DailyRevenue) => unknown }[] = [
  { header: "Date", value: (r) => r.date },
  { header: "Day", value: (r) => r.label },
  { header: "Orders", value: (r) => r.orders },
  { header: "Revenue USD", value: (r) => r.amount },
];

const STATUS_CSV_COLUMNS: { header: string; value: (row: OrderStatusCount & { share: number }) => unknown }[] = [
  { header: "Status", value: (r) => r.status },
  { header: "Orders", value: (r) => r.count },
  { header: "Share %", value: (r) => r.share },
];

/* ─── Presentation maps for server-side buckets ─────────────────── */
/**
 * Keyed by the normalised (mobile) status, because every DB status spelling is
 * funnelled through mapDbStatusToMobile() before it reaches the donut. Anything
 * unmapped renders grey, so an unrecognised status is visible rather than
 * silently coloured like something it is not.
 */
const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B",
  confirmed: "#3B82F6",
  purchasing: "#3B82F6",
  purchased: "#10B981",
  warehouse: "#8B5CF6",
  inspection: "#8B5CF6",
  consolidated: "#8B5CF6",
  shipped: "#0EA5E9",
  in_transit: "#0EA5E9",
  customs: "#F97316",
  out_for_delivery: "#FF5A0A",
  delivered: "#10B981",
  cancelled: "#9CA3AF",
};

/** Keys are matched after normalising, because the RPC returns whatever the
 *  app recorded. The registered names in the marketplaces table are lowercase
 *  slugs (1688, taobao, yiwugo, jd, alibaba, chinagoods, dollarstore). */
const MARKETPLACE_STYLE: Record<string, { color: string; icon: string }> = {
  "1688": { color: "#FF5A0A", icon: "🏪" },
  taobao: { color: "#FF6A00", icon: "🛒" },
  yiwugo: { color: "#F97316", icon: "📦" },
  jd: { color: "#FF6A00", icon: "📦" },
  alibaba: { color: "#F97316", icon: "🏪" },
  chinagoods: { color: "#FF5A0A", icon: "🏪" },
  dollarstore: { color: "#F97316", icon: "🛒" },
  unattributed: { color: "#9CA3AF", icon: "📊" },
};

function marketplaceStyle(name: string) {
  return (
    MARKETPLACE_STYLE[name.trim().toLowerCase().replace(/\s+/g, "")] || {
      color: "#9CA3AF",
      icon: "📊",
    }
  );
}

/**
 * Which failures are worth re-attempting without asking the operator.
 *
 * A stale PostgREST schema cache surfaces as "Could not find the function
 * public.admin_kpis() in the schema cache" (PGRST202) right after a migration is
 * applied, and a cold connection or a flaky edge shows up as a fetch/network
 * error or a 5xx. Both clear themselves seconds later. Anything else — a missing
 * grant, a broken signature — will not, so it must not retry.
 */
const TRANSIENT_ERROR =
  /schema cache|PGRST202|PGRST106|failed to fetch|fetch failed|networkerror|network request failed|load failed|service unavailable|bad gateway|gateway time-?out|too many requests|\b50[0234]\b|timed out|timeout/i;

/** How long to wait before the single automatic re-attempt. */
const AUTO_RETRY_DELAY_MS = 4000;

function weekdayLabel(day: string) {
  const d = new Date(`${day}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? day.slice(5)
    : d.toLocaleDateString("en-US", { weekday: "short" });
}

/**
 * Several stored statuses normalise to the same label (both in_warehouse and
 * in_transit_china history land on 'warehouse'), so counts must be summed after
 * mapping or the same bucket appears twice with different sizes.
 */
function mergeStatusCounts(
  rows: { status: string; count: number }[]
): { status: string; count: number }[] {
  const merged = new Map<string, number>();
  for (const row of rows) {
    const key = mapDbStatusToMobile(row.status);
    merged.set(key, (merged.get(key) || 0) + row.count);
  }
  return [...merged.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);
}

/* ─── Animated counter hook ─────────────────────────────────────── */
function useAnimatedCounter(end: number, duration = 1200, decimals = 0) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    fromRef.current = value;
    startRef.current = null;
    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = fromRef.current + (end - fromRef.current) * eased;
      setValue(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [end, duration]);

  return decimals > 0 ? value.toFixed(decimals) : Math.round(value);
}

/* ─── Mini sparkline (SVG) ──────────────────────────────────────── */
function MiniSparkline({
  data,
  color = "#FF5A0A",
}: {
  data: number[];
  color?: string;
}) {
  const max = Math.max(...data, 1);
  const points = data
    .map(
      (v, i) =>
        `${(i / (data.length - 1)) * 100},${100 - (v / max) * 80}`
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-8"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        points={points}
      />
      <polygon
        fill={`url(#spark-${color.replace("#", "")})`}
        points={`0,100 ${points} 100,100`}
      />
    </svg>
  );
}

/* ─── Revenue bar chart (pure CSS/SVG) ──────────────────────────── */
function RevenueBarChart({ data }: { data: DailyRevenue[] }) {
  const max = Math.max(...data.map((d) => d.amount), 1);
  // Past ~2 weeks a 10px label per day stops fitting, so only every nth day
  // keeps its label. Spans longer than the card scroll horizontally instead of
  // squeezing 365 bars into 700px.
  const labelEvery = data.length > 14 ? Math.ceil(data.length / 14) : 1;
  return (
    <div className="w-full">
      <div className="scrollbar-slim w-full overflow-x-auto">
        <div
          className="flex items-end gap-1.5 h-40 px-1"
          style={data.length > 45 ? { minWidth: data.length * 16 } : undefined}
        >
          {data.map((d, i) => {
            const pct = (d.amount / max) * 100;
            return (
              <Link
                key={d.date}
                href="/admin/orders"
                title={`${d.date} — ${formatUSD(d.amount)} · open in Orders`}
                aria-label={`Orders for ${d.date}: ${formatUSD(d.amount)}`}
                className="flex-1 flex flex-col items-center gap-1 group"
              >
                <div className="relative w-full flex justify-center">
                  <span className="absolute -top-6 text-[10px] font-semibold text-dark-900/70 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {formatUSD(d.amount)}
                  </span>
                </div>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(pct, 4)}%` }}
                  transition={{ delay: 0.1 + i * 0.05, duration: 0.5, ease: "easeOut" }}
                  className="w-full rounded-t-lg bg-gradient-to-t from-brand-600 to-brand-400 hover:from-brand-500 hover:to-brand-300 transition-colors cursor-pointer relative"
                />
                <span
                  className="text-[10px] font-medium text-dark-900/50 mt-1 whitespace-nowrap"
                  style={{ visibility: i % labelEvery === 0 ? "visible" : "hidden" }}
                >
                  {d.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Order status donut (pure SVG) ─────────────────────────────── */
function OrderStatusDonut({ data }: { data: OrderStatusCount[] }) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 58;
  const stroke = 22;
  const circumference = 2 * Math.PI * radius;
  let accumulated = 0;

  return (
    <div className="flex items-center gap-6">
      {/* The whole donut is one jump: every slice is an order, so any slice
          leads to the same place — the Orders queue. */}
      <Link
        href="/admin/orders"
        aria-label="View all orders"
        title="View all orders"
        className="relative block shrink-0 cursor-pointer transition-opacity hover:opacity-85"
      >
        <svg width={size} height={size} className="transform -rotate-90">
          {data.map((d) => {
            const pct = d.count / total;
            const dashLen = circumference * pct;
            const dashOff = circumference * accumulated;
            accumulated += pct;
            return (
              <circle
                key={d.status}
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth={stroke}
                strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                strokeDashoffset={-dashOff}
                strokeLinecap="butt"
                className="transition-all duration-700 ease-out"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-dark-900">{total}</span>
          <span className="text-[10px] text-dark-900/40 font-medium">TOTAL</span>
        </div>
      </Link>
      <div className="flex flex-col gap-2 min-w-0">
        {data.map((d) => (
          <Link
            key={d.status}
            href="/admin/orders"
            title={`View ${d.status.replace(/_/g, " ")} orders`}
            className="group flex items-center gap-2 min-w-0 rounded-lg px-1 -mx-1 py-0.5 hover:bg-dark-50 transition-colors"
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: d.color }}
            />
            <span className="text-xs text-dark-900/60 truncate capitalize">
              {d.status.replace(/_/g, " ")}
            </span>
            <span className="text-xs font-bold text-dark-900 ml-auto shrink-0">
              {d.count}
            </span>
            <ChevronRight className="h-3 w-3 shrink-0 text-dark-900/20 transition-colors group-hover:text-brand-500" />
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ─── Marketplace revenue breakdown ─────────────────────────────── */
function MarketplaceBreakdown({ data }: { data: MarketplaceRevenue[] }) {
  const max = Math.max(...data.map((d) => d.revenue), 1);
  return (
    <div className="space-y-3">
      {data.map((d) => {
        const pct = (d.revenue / max) * 100;
        return (
          <Link
            key={d.marketplace}
            href="/admin/orders"
            title={`View ${d.marketplace} orders`}
            className="block space-y-1.5 rounded-xl -mx-1.5 px-1.5 py-1 transition-colors hover:bg-dark-50/60"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">{d.icon}</span>
                <span className="text-sm font-medium text-dark-900">
                  {d.marketplace}
                </span>
                <span className="text-xs text-dark-900/40">
                  {d.orders} orders
                </span>
              </div>
              <span className="text-sm font-bold text-dark-900">
                {formatUSD(d.revenue)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-dark-100 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(pct, 2)}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full"
                // @ts-expect-error framer-motion style typing
                style={{ backgroundColor: d.color }}
              />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/* ─── Live activity feed ────────────────────────────────────────── */
function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  const typeIcons: Record<string, { icon: any; color: string }> = {
    order: { icon: ShoppingCart, color: "bg-brand-50 text-brand-600" },
    payment: { icon: CreditCard, color: "bg-emerald-50 text-emerald-600" },
    shipment: { icon: Ship, color: "bg-sky-50 text-sky-600" },
    customer: { icon: Users, color: "bg-violet-50 text-violet-600" },
    product: { icon: Package, color: "bg-amber-50 text-amber-600" },
    system: { icon: Zap, color: "bg-gray-100 text-gray-600" },
  };

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <div className="space-y-1 max-h-[380px] overflow-y-auto pr-1">
      {events.length === 0 && (
        <p className="text-center text-sm text-dark-900/40 py-8">
          No recent activity
        </p>
      )}
      {events.map((e, i) => {
        const cfg = typeIcons[e.type] || typeIcons.system;
        const Icon = cfg.icon;
        return (
          <motion.div
            key={e.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className="flex items-start gap-3 rounded-xl p-2.5 hover:bg-dark-50/50 transition-colors"
          >
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${cfg.color}`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-dark-900 leading-tight">{e.title}</p>
              <p className="text-[11px] text-dark-900/40 mt-0.5">
                {timeAgo(e.created_at)}
              </p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ─── Main Dashboard ────────────────────────────────────────────── */
export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<KpiMap>({});
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenue[]>([]);
  const [orderStatusCounts, setOrderStatusCounts] = useState<OrderStatusCount[]>([]);
  const [marketplaceRevenue, setMarketplaceRevenue] = useState<MarketplaceRevenue[]>([]);
  const [topCategories, setTopCategories] = useState<TopCategory[]>([]);
  const [ops, setOps] = useState<LiveOps>({
    inTransit: null,
    lowStock: null,
    pendingSourcing: null,
    unreadNotifications: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /* The shell owns the single realtime channel; this page only refetches when a
   * debounced burst lands, so a five-row order write causes one reload. */
  const liveVersion = useLiveVersion();
  const liveConnected = useLiveConnected();
  /* Auto-retries spent on the current failure. A ref, not state: nothing about
   * it needs a render, and the effect below must see the count it just wrote.
   * Reset only by a load that reports no error, so one failure can never buy
   * more than one silent re-attempt. */
  const autoRetriesRef = useRef(0);

  /* ─── Date range (drives every range-filtered chart) ─────────── */
  const [rangeKey, setRangeKey] = useState<RangeKey>("7d");
  const activeRange = rangeOf(rangeKey);
  const rangeDays = activeRange.days;

  const toast = useToast();

  /* Per-widget CSV exports — client-side, the rows are already in state. */
  const exportRevenueCsv = () => {
    if (dailyRevenue.length === 0) return;
    downloadCsv(
      `chinasuuq-revenue-daily-${rangeKey}-${stamp()}`,
      toCsv(REVENUE_CSV_COLUMNS, dailyRevenue)
    );
    toast.success(`Exported ${dailyRevenue.length} days of revenue`);
  };

  const exportStatusCsv = () => {
    if (orderStatusCounts.length === 0) return;
    const total = orderStatusCounts.reduce((s, d) => s + d.count, 0);
    const rows = orderStatusCounts.map((d) => ({
      ...d,
      share: total > 0 ? Math.round((d.count / total) * 100) : 0,
    }));
    downloadCsv(
      `chinasuuq-orders-by-status-${rangeKey}-${stamp()}`,
      toCsv(STATUS_CSV_COLUMNS, rows)
    );
    toast.success(`Exported ${rows.length} status buckets`);
  };

  const exportRecentOrdersCsv = () => {
    if (recentOrders.length === 0) return;
    downloadCsv(
      `chinasuuq-recent-orders-${stamp()}`,
      toCsv(ORDERS_CSV_COLUMNS, recentOrders)
    );
    toast.success(`Exported ${recentOrders.length} recent orders`);
  };

  /* Animated counters */
  const animRevenue = useAnimatedCounter(kpiValue(metrics, "revenue_all_time"), 1400, 0);
  const animOrders = useAnimatedCounter(kpiValue(metrics, "orders_total"), 1200, 0);
  const animCustomers = useAnimatedCounter(kpiValue(metrics, "customers_total"), 1200, 0);
  const animShipments = useAnimatedCounter(kpiValue(metrics, "shipments_active"), 1200, 0);

  /**
   * undefined = the metric has not loaded yet, so StatCard hides the row.
   * null      = loaded, but there is no previous period to compare against.
   */
  const deltaOf = (metric: string) =>
    metrics[metric] ? metrics[metric].deltaPct : undefined;

  /* Fetch all dashboard data */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      /* The shell will not render this page until its own auth check has
       * resolved, but getSession() is the same await edgeFetch uses: doing it
       * here turns "the RPCs raced the session restore" from an assumption into
       * a guarantee, at the cost of one already-cached promise. */
      await supabase.auth.getSession();
      /* One window for every rollup: the segmented control's `days` (null =
       * All) flows into all three RPCs through rpcDays — see DATE_RANGES for
       * why All maps to the RPCs' 365-day maximum. */
      const span = rpcDays(rangeDays);
      const [kpiRes, dailyRes, statusRes, mpRes, ordersRes, productsRes, notifRes] =
        await Promise.all([
          getAdminKpis(),
          getAdminRevenueDaily(span),
          getAdminOrderStatusCounts(span),
          getAdminRevenueByMarketplace(span),
          listOrders({ pageSize: 8 }),
          // The six best sellers, ordered and limited in Postgres. listProducts
          // pulls the whole catalog page to slice six here, which costs every
          // row's bytes on every dashboard refresh for six cards' worth of data.
          supabase
            .from("source_products")
            .select(
              "id, title_english, marketplace, sales_count, price_usd_estimated, images"
            )
            .order("sales_count", { ascending: false })
            .limit(6),
          supabase
            .from("notifications")
            .select("id, title, body, type, created_at")
            .order("created_at", { ascending: false })
            .limit(20),
        ]);

      setMetrics(kpiRes.metrics);
      const failed = [
        kpiRes.ok ? null : `admin_kpis: ${kpiRes.error}`,
        dailyRes.ok ? null : `admin_revenue_daily: ${dailyRes.error}`,
        statusRes.ok ? null : `admin_order_status_counts: ${statusRes.error}`,
        mpRes.ok ? null : `admin_revenue_by_marketplace: ${mpRes.error}`,
      ].filter(Boolean);

      setDailyRevenue(
        dailyRes.series.map((d) => ({
          date: d.date,
          label: weekdayLabel(d.date),
          amount: d.revenue,
          orders: d.orders,
        }))
      );
      setOrderStatusCounts(
        mergeStatusCounts(statusRes.counts).map((s) => ({
          ...s,
          color: STATUS_COLORS[s.status] || "#9CA3AF",
        }))
      );
      setMarketplaceRevenue(
        mpRes.rows.map((r) => ({ ...r, ...marketplaceStyle(r.marketplace) }))
      );
      setRecentOrders((ordersRes.orders as RecentOrder[]) || []);

      /* Top products — the query already orders by sales_count and stops at
       * six, so nothing is sliced or re-sorted here. */
      if (!productsRes.error && productsRes.data) {
        setTopProducts(
          (
            productsRes.data as {
              id: string;
              title_english: string | null;
              marketplace: string | null;
              sales_count: number | null;
              price_usd_estimated: number | null;
              images: string[] | null;
            }[]
          ).map((p) => ({
            id: p.id,
            title: p.title_english ?? "",
            title_english: p.title_english ?? "",
            marketplace: p.marketplace ?? "",
            sales_count: p.sales_count ?? 0,
            price_usd_estimated: p.price_usd_estimated ?? 0,
            source_images: p.images,
          }))
        );
      } else if (productsRes.error) {
        failed.push(`source_products (top sellers): ${productsRes.error.message}`);
      }

      /* Activity feed from notifications */
      if (!notifRes.error && notifRes.data) {
        setActivities(
          (notifRes.data as any[]).map((n) => ({
            id: n.id,
            title: n.title || n.body || "System event",
            type: n.type || "system",
            created_at: n.created_at,
          }))
        );
      } else if (notifRes.error) {
        failed.push(`notifications: ${notifRes.error.message}`);
      }

      /* One banner for the whole load, after every part has reported. */
      if (failed.length) setError(failed.join(" | "));
      else autoRetriesRef.current = 0;
    } catch (e: any) {
      setError(e?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
    /* rangeDays (not the object) is the dependency: DATE_RANGES is a module
     * constant, so switching the segmented control re-runs the whole load. */
  }, [rangeDays]);

  useEffect(() => {
    void load();
  }, [load, liveVersion]);

  /* load() used to run only on mount and on a realtime bump, so one 502 or a
   * schema cache that had not caught up with the migration pinned the banner
   * over the dashboard until someone reloaded the tab. Re-run once by itself
   * when the error reads as transient; the Retry button covers everything else.
   * Unmounting (or a manual retry, which nulls the error) clears the timer. */
  useEffect(() => {
    if (!error) return;
    if (autoRetriesRef.current >= 1 || !TRANSIENT_ERROR.test(error)) return;
    autoRetriesRef.current += 1;
    const timer = setTimeout(() => void load(), AUTO_RETRY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [error, load]);

  /* Live ops counters + popular categories (cheap parallel head-counts) */
  useEffect(() => {
    (async () => {
      const [ship, stock, src, notif, cats] = await Promise.all([
        supabase.from("shipments").select("id", { count: "exact", head: true }).eq("status", "in_transit"),
        supabase
          .from("source_products")
          .select("id", { count: "exact", head: true })
          .eq("status", "active")
          .eq("stock_status", "low_stock"),
        supabase.from("sourcing_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        // Read state is the `read` boolean on the live table; there is no read_at.
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("read", false),
        // One grouped RPC: the categories table stores no product_count, so this
        // used to be one head-count per category — twelve requests on every
        // debounced realtime burst, which showed as a stall on any write.
        supabase.rpc("admin_category_product_counts"),
      ]);
      setOps({
        inTransit: ship.error ? null : (ship.count ?? 0),
        lowStock: stock.error ? null : (stock.count ?? 0),
        pendingSourcing: src.error ? null : (src.count ?? 0),
        unreadNotifications: notif.error ? null : (notif.count ?? 0),
      });
      /* A failed count stays null ("—"), never 0: the dashboard was rebuilt to
       * stop reporting a broken query as an empty metric. */
      if (!cats.error && cats.data) {
        setTopCategories(
          ((cats.data as { id: string; name_en: string; slug: string; image_url: string | null; product_count: number }[]) ?? [])
            .map((c) => ({
              id: c.id,
              name: c.name_en,
              slug: c.slug,
              image_url: c.image_url,
              product_count: c.product_count,
            }))
            .sort((a, b) => (b.product_count ?? -1) - (a.product_count ?? -1))
            .slice(0, 8)
        );
      }
    })();
  }, [liveVersion]);

  return (
    <div className="space-y-6">
      {/* ─── Header ─────────────────────────────────────────── */}
      <PageHeader
        title="Dashboard"
        subtitle="Mission Control — live overview of ChinaSuuq operations"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {/* The window every range-filtered chart below obeys. "All" is the
                rollup RPCs' full 365-day window — see DATE_RANGES. */}
            <div role="group" aria-label="Date range" className="mr-1">
              <FilterChips
                options={DATE_RANGES.map((r) => ({ value: r.key, label: r.label }))}
                value={rangeKey}
                onChange={(key) => setRangeKey(key)}
              />
            </div>
            {/* Honest connection state: the pill used to claim Live whether or
                not Realtime had a socket, which hid every silent stall. */}
            <span
              title={
                liveConnected
                  ? "Updates stream as staff and customers write."
                  : "No Realtime socket — showing data from the last refresh."
              }
              className={
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase " +
                (liveConnected
                  ? "bg-success/10 border-success/30 text-success"
                  : "bg-dark-50 border-dark-200 text-dark-400")
              }
            >
              <span
                className={
                  "w-1.5 h-1.5 rounded-full " +
                  (liveConnected ? "bg-success animate-pulse" : "bg-dark-300")
                }
              />
              {liveConnected ? "Live" : "Offline"}
            </span>
            {/* Quick actions */}
            <a
              href="/admin/orders"
              className="admin-btn-primary h-9 px-3.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              New Order
            </a>
            <button
              onClick={exportRecentOrdersCsv}
              disabled={recentOrders.length === 0}
              className="admin-btn-outline h-9 px-3 text-xs disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
            <button
              className="admin-btn-ghost h-9 w-9 px-0"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Refresh dashboard"
              title="Refresh"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
            </button>
            <a
              href="/admin/settings"
              className="admin-btn-ghost h-9 w-9 px-0"
              aria-label="Settings"
            >
              <Settings className="h-3.5 w-3.5" />
            </a>
            <a
              href="/marketplaces"
              target="_blank"
              rel="noopener noreferrer"
              className="admin-btn-outline h-9 px-3 text-xs"
            >
              <Globe2 className="h-3.5 w-3.5" />
              Public site
            </a>
          </div>
        }
      />

      {/* ─── Error banner ───────────────────────────────────── */}
      <AnimatePresence>
        {error ? (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">
              Could not load live data: {error}. Check that migration
              202609240003_admin_rollups.sql has been applied to this project.
            </span>
            {/* The banner has to be actionable from where it sits. It used to be
                a dead end: staff could read the failure but nothing on the page
                re-ran those queries short of reloading the tab. */}
            <button
              onClick={() => void load()}
              disabled={loading}
              className="admin-btn-outline ml-auto h-8 shrink-0 px-2.5 text-xs disabled:opacity-50"
              title="Re-run the failed queries"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Retry
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ─── KPI Cards ──────────────────────────────────────── */}
      <PageGrid className="grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Revenue"
          value={`$${animRevenue.toLocaleString()}`}
          icon={DollarSign}
          tone="brand"
          delta={deltaOf("revenue_30d")}
          deltaLabel="last 30d vs prior 30d"
          delay={0}
        />
        <StatCard
          label="Total Orders"
          value={animOrders}
          icon={ShoppingCart}
          tone="info"
          delta={deltaOf("orders_30d")}
          deltaLabel="last 30d vs prior 30d"
          delay={1}
        />
        <StatCard
          label="Customers"
          value={animCustomers}
          icon={Users}
          tone="violet"
          delta={deltaOf("customers_total")}
          deltaLabel="added in last 30d vs the base before"
          delay={2}
        />
        <StatCard
          label="Active Shipments"
          value={animShipments}
          icon={Ship}
          tone="success"
          delay={3}
        />
      </PageGrid>

      {/* ─── Secondary KPI row ──────────────────────────────── */}
      <PageGrid className="grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Today's Orders"
          value={kpiValue(metrics, "orders_today")}
          icon={Clock3}
          tone="warning"
          delta={deltaOf("orders_today")}
          deltaLabel="vs yesterday"
          delay={4}
        />
        <StatCard
          label="Today's Revenue"
          value={`$${kpiValue(metrics, "revenue_today").toLocaleString()}`}
          icon={TrendingUp}
          tone="success"
          delta={deltaOf("revenue_today")}
          deltaLabel="vs yesterday"
          delay={5}
        />
        <StatCard
          label="Pending Sourcing"
          value={kpiValue(metrics, "sourcing_pending")}
          icon={Package}
          tone="error"
          delay={6}
        />
        <StatCard
          label="Avg Order Value"
          value={`$${kpiValue(metrics, "aov_30d").toFixed(0)}`}
          icon={DollarSign}
          tone="violet"
          delta={deltaOf("aov_30d")}
          deltaLabel="last 30d"
          delay={7}
        />
      </PageGrid>

      {/* ─── Live Ops pulse strip ───────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "In transit", value: ops.inTransit, href: "/admin/shipments", dot: "bg-info", icon: Ship, hint: "Open shipments" },
          { label: "Low stock items", value: ops.lowStock, href: "/admin/products", dot: "bg-warning", icon: Package, hint: "Open products" },
          { label: "Pending sourcing", value: ops.pendingSourcing, href: "/admin/sourcing", dot: "bg-error", icon: Clock3, hint: "Open sourcing requests" },
          /* Alerts are the unread notifications — ops events (orders, payments,
           * shipments), not settings. There is no notifications page, and the
           * shell's own bell routes to /admin/orders, so this chip does too. */
          { label: "Unread alerts", value: ops.unreadNotifications, href: "/admin/orders", dot: "bg-success", icon: Activity, hint: "Unread notifications are ops events — open Orders" },
        ].map((chip, i) => (
          <motion.div
            key={chip.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
          >
            <Link
              href={chip.href}
              title={chip.hint}
              className="group flex items-center gap-3 rounded-2xl border border-dark-900/[0.06] bg-white px-4 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className={`h-2 w-2 shrink-0 animate-pulse rounded-full ${chip.dot}`} />
              <div className="min-w-0">
                <p className="text-lg font-bold leading-none text-dark-900">{chip.value}</p>
                <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-wide text-dark-900/40">
                  {chip.label}
                </p>
              </div>
              <chip.icon className="ml-auto h-4 w-4 shrink-0 text-dark-900/25 transition-colors group-hover:text-brand-500" />
            </Link>
          </motion.div>
        ))}
      </div>

      {/* ─── Revenue Chart + Order Status Donut ─────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Revenue chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="lg:col-span-2"
        >
        <SectionCard
          title={`Revenue — ${activeRange.heading}`}
          subtitle={`Daily revenue trend · ${activeRange.caption}`}
          actions={
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1.5 text-xs text-dark-900/50">
                <Calendar className="h-3.5 w-3.5" />
                {dailyRevenue.length > 0 &&
                  `${dailyRevenue[0].label} — ${dailyRevenue[dailyRevenue.length - 1].label}`}
              </span>
              <button
                onClick={exportRevenueCsv}
                disabled={loading || dailyRevenue.length === 0}
                className="admin-btn-outline h-7 px-2 text-xs disabled:opacity-50"
                title="Download this chart as CSV"
              >
                <Download className="h-3 w-3" />
                CSV
              </button>
              <Link
                href="/admin/orders"
                className="admin-btn-ghost h-7 px-2 text-xs"
                title="Open the orders these bars come from"
              >
                View
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          }
        >
          {loading ? (
            <div className="h-40 animate-pulse rounded-xl bg-dark-50" />
          ) : (
            <RevenueBarChart data={dailyRevenue} />
          )}
        </SectionCard>
        </motion.div>

        {/* Order status donut */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
        <SectionCard
          title="Order Status"
          subtitle={`Every order placed in ${activeRange.caption}`}
          actions={
            <div className="flex items-center gap-1.5">
              <button
                onClick={exportStatusCsv}
                disabled={loading || orderStatusCounts.length === 0}
                className="admin-btn-outline h-7 px-2 text-xs disabled:opacity-50"
                title="Download these counts as CSV"
              >
                <Download className="h-3 w-3" />
                CSV
              </button>
            </div>
          }
        >
          {loading ? (
            <div className="h-40 animate-pulse rounded-xl bg-dark-50" />
          ) : orderStatusCounts.length > 0 ? (
            <OrderStatusDonut data={orderStatusCounts} />
          ) : (
            <p className="text-center text-sm text-dark-900/40 py-8">
              No order data
            </p>
          )}
        </SectionCard>
        </motion.div>
      </div>

      {/* ─── Recent Orders Table ────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
      <SectionCard
        title="Recent Orders"
        actions={
          <div className="flex items-center gap-1.5">
            <button
              onClick={exportRecentOrdersCsv}
              disabled={loading || recentOrders.length === 0}
              className="admin-btn-outline h-7 px-2 text-xs disabled:opacity-50"
              title="Download these orders as CSV"
            >
              <Download className="h-3 w-3" />
              CSV
            </button>
            <Link
              href="/admin/orders"
              className="admin-btn-ghost h-7 px-2 text-xs"
            >
              View all
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        }
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="admin-table w-full">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th className="hidden md:table-cell">City</th>
                <th>Total</th>
                <th>Status</th>
                <th className="hidden lg:table-cell">Payment</th>
                <th className="hidden lg:table-cell">Date</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-900/[0.04]">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-5 py-3">
                          <div className="h-4 animate-pulse rounded bg-dark-50" />
                        </td>
                      ))}
                    </tr>
                  ))
                : recentOrders.map((o, idx) => (
                    <motion.tr
                      key={o.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.03 }}
                      className="hover:bg-dark-50/50 transition-colors"
                    >
                      <td className="px-5 py-3 font-medium text-dark-900">
                        {o.order_number || o.id.slice(0, 8)}
                      </td>
                      <td className="px-5 py-3 text-dark-900/70">
                        {o.customer_name || "Guest"}
                      </td>
                      <td className="px-5 py-3 text-dark-900/50 hidden md:table-cell">
                        {o.city || "—"}
                      </td>
                      <td className="px-5 py-3 font-semibold text-dark-900">
                        ${(o.total || 0).toLocaleString()}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={o.status} />
                      </td>
                      <td className="px-5 py-3 hidden lg:table-cell">
                        <StatusBadge status={o.payment_status || "pending"} />
                      </td>
                      <td className="px-5 py-3 text-xs text-dark-900/40 hidden lg:table-cell">
                        {o.created_at
                          ? new Date(o.created_at).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                            })
                          : "—"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href="/admin/orders"
                          className="admin-btn-ghost h-7 px-2 text-xs"
                          title={`Open order ${o.order_number || o.id} in Orders`}
                        >
                          View
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </motion.tr>
                  ))}
            </tbody>
          </table>
        </div>
        {!loading && recentOrders.length === 0 && (
          <p className="text-center text-sm text-dark-900/40 py-8">
            No orders yet
          </p>
        )}
      </SectionCard>
      </motion.div>

      {/* ─── Popular Categories ─────────────────────────────── */}
      {topCategories.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
        >
          <SectionCard
            title="Popular Categories"
            subtitle="Live catalog breadth — each badge counts this category's products in the catalog right now (— when the count could not be read)"
            actions={
              <a href="/admin/products" className="admin-btn-ghost h-7 px-2 text-xs">
                All products
                <ChevronRight className="h-3.5 w-3.5" />
              </a>
            }
          >
            <div className="scrollbar-slim -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
              {topCategories.map((c, i) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.04 }}
                  className="group w-36 shrink-0"
                >
                  <div className="relative h-24 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-50 to-warm-100 ring-1 ring-dark-900/[0.04]">
                    {c.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.image_url}
                        alt={c.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Layers className="h-7 w-7 text-brand-500/40" />
                      </div>
                    )}
                    <span
                      className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-dark-900 shadow-sm"
                      title={
                        c.product_count === null
                          ? "Product count not readable — the counting query failed"
                          : "Products linked to this category via source_products.category_id"
                      }
                    >
                      {c.product_count ?? "—"}
                    </span>
                  </div>
                  <p className="mt-2 truncate text-xs font-semibold capitalize text-dark-900">
                    {c.name}
                  </p>
                </motion.div>
              ))}
            </div>
          </SectionCard>
        </motion.div>
      )}

      {/* ─── Bottom row: Top Products + Marketplace + Activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Top Selling Products */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
        <SectionCard
          title="Top Products"
          actions={
            <a
              href="/admin/products"
              className="admin-btn-ghost h-7 px-2 text-xs"
            >
              View all →
            </a>
          }
        >
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-dark-50" />
              ))}
            </div>
          ) : topProducts.length > 0 ? (
            <div className="space-y-2">
              {topProducts.map((p, i) => {
                const img = p.source_images?.[0];
                return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.04 }}
                  className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-dark-50/50 transition-colors"
                >
                  <span className="w-4 shrink-0 text-center text-[10px] font-bold text-dark-900/35">
                    {i + 1}
                  </span>
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt={p.title_english || p.title}
                      className="h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-dark-900/[0.06]"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 ring-1 ring-dark-900/[0.06]">
                      <Boxes className="h-4 w-4 text-brand-500/60" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-dark-900 truncate">
                      {p.title_english || p.title || "Untitled"}
                    </p>
                    <p className="text-[11px] text-dark-900/40">
                      {p.marketplace} · ${(p.price_usd_estimated || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-dark-900">
                      {p.sales_count || 0}
                    </p>
                    <p className="text-[10px] text-dark-900/40">sales</p>
                  </div>
                </motion.div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-sm text-dark-900/40 py-8">
              No products yet
            </p>
          )}
        </SectionCard>
        </motion.div>

        {/* Marketplace Revenue Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
        <SectionCard
          title="Revenue by Marketplace"
          subtitle={`Actual purchase source — ${activeRange.caption}`}
          actions={
            <Link
              href="/admin/orders"
              className="admin-btn-ghost h-7 px-2 text-xs"
              title="Open the orders behind these bars"
            >
              View
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-dark-50" />
              ))}
            </div>
          ) : marketplaceRevenue.length > 0 ? (
            <>
              <MarketplaceBreakdown data={marketplaceRevenue} />
              {marketplaceRevenue.every((m) => m.marketplace === "Unattributed") && (
                <p className="mt-4 rounded-xl bg-dark-50 px-3 py-2 text-[11px] leading-relaxed text-dark-900/50">
                  These orders predate per-line provenance, so the app they were
                  bought in was never recorded. Orders placed from the updated
                  mobile app attribute each line to its marketplace.
                </p>
              )}
            </>
          ) : (
            <p className="text-center text-sm text-dark-900/40 py-8">
              No orders in {activeRange.caption}
            </p>
          )}
        </SectionCard>
        </motion.div>

        {/* Live Activity Feed */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
        <SectionCard
          title="Activity Feed"
          actions={
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE
            </span>
          }
        >
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-dark-50" />
              ))}
            </div>
          ) : (
            <ActivityFeed events={activities} />
          )}
        </SectionCard>
        </motion.div>
      </div>
    </div>
  );
}
