"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  DollarSign,
  Download,
  Globe,
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
import { KPICard } from "@/components/admin/KPICard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { supabase } from "@/lib/supabase";
import { formatUSD } from "@/lib/utils";
import {
  getDashboardKpis,
  listOrders,
  listProducts,
} from "@/lib/admin/supabase-data";

/* ─── Types ──────────────────────────────────────────────────────── */
interface Kpis {
  totalRevenue: number;
  totalOrders: number;
  activeOrders: number;
  deliveredOrders: number;
  totalCustomers: number;
  totalProducts: number;
  todaysOrders: number;
  todaysRevenue: number;
  pendingSourcing: number;
  avgOrderValue: number;
  deliveryRate: number;
}

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
}

interface MarketplaceRevenue {
  marketplace: string;
  revenue: number;
  orders: number;
  color: string;
  icon: string;
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
  return (
    <div className="w-full">
      <div className="flex items-end gap-1.5 h-40 px-1">
        {data.map((d, i) => {
          const pct = (d.amount / max) * 100;
          return (
            <div
              key={d.date}
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
              <span className="text-[10px] font-medium text-dark-900/50 mt-1">
                {d.label}
              </span>
            </div>
          );
        })}
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
      <div className="relative">
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
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        {data.map((d) => (
          <div key={d.status} className="flex items-center gap-2 min-w-0">
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
          </div>
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
          <div key={d.marketplace} className="space-y-1.5">
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
          </div>
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
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenue[]>([]);
  const [orderStatusCounts, setOrderStatusCounts] = useState<OrderStatusCount[]>([]);
  const [marketplaceRevenue, setMarketplaceRevenue] = useState<MarketplaceRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Animated counters */
  const animRevenue = useAnimatedCounter(kpis?.totalRevenue ?? 0, 1400, 0);
  const animOrders = useAnimatedCounter(kpis?.totalOrders ?? 0, 1200, 0);
  const animCustomers = useAnimatedCounter(kpis?.totalCustomers ?? 0, 1200, 0);
  const animShipments = useAnimatedCounter(kpis?.activeOrders ?? 0, 1200, 0);

  /* Fetch all dashboard data */
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [
          kpiRes,
          ordersRes,
          productsRes,
          notifRes,
        ] = await Promise.all([
          getDashboardKpis(),
          listOrders({ pageSize: 10 }),
          listProducts({}),
          supabase
            .from("notifications")
            .select("id, title, body, type, created_at")
            .order("created_at", { ascending: false })
            .limit(20),
        ]);

        if (kpiRes.ok && kpiRes.kpis) {
          setKpis(kpiRes.kpis as Kpis);
        }
        if (ordersRes.ok) {
          const orders = (ordersRes.orders as RecentOrder[]) || [];
          setRecentOrders(orders);

          /* Build order status counts */
          const statusMap: Record<string, number> = {};
          orders.forEach((o) => {
            statusMap[o.status] = (statusMap[o.status] || 0) + 1;
          });
          const statusColors: Record<string, string> = {
            pending: "#F59E0B",
            awaiting_payment: "#F59E0B",
            paid: "#10B981",
            purchasing: "#3B82F6",
            in_warehouse: "#8B5CF6",
            in_transit: "#0EA5E9",
            customs: "#F97316",
            out_for_delivery: "#FF5A0A",
            delivered: "#10B981",
            completed: "#10B981",
            cancelled: "#9CA3AF",
            refunded: "#EF4444",
          };
          const statusCounts: OrderStatusCount[] = Object.entries(statusMap)
            .map(([status, count]) => ({
              status,
              count,
              color: statusColors[status] || "#9CA3AF",
            }))
            .sort((a, b) => b.count - a.count);
          setOrderStatusCounts(statusCounts);

          /* Build daily revenue from last 7 days */
          const days: DailyRevenue[] = [];
          for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().slice(0, 10);
            const dayLabel = d.toLocaleDateString("en-US", { weekday: "short" });
            const dayRevenue = orders
              .filter((o) => (o.created_at || "").slice(0, 10) === dateStr)
              .reduce((s, o) => s + (o.total || 0), 0);
            days.push({ date: dateStr, label: dayLabel, amount: dayRevenue });
          }
          setDailyRevenue(days);

          /* Build marketplace revenue */
          const mpMap: Record<string, { revenue: number; orders: number }> = {};
          orders.forEach((o) => {
            const mp = o.city?.includes("Mogadishu")
              ? "1688"
              : o.city?.includes("Hargeisa")
                ? "Taobao"
                : "YiwuGo";
            if (!mpMap[mp]) mpMap[mp] = { revenue: 0, orders: 0 };
            mpMap[mp].revenue += o.total || 0;
            mpMap[mp].orders += 1;
          });
          const mpColors: Record<string, string> = {
            "1688": "#FF5A0A",
            Taobao: "#FF6A00",
            YiwuGo: "#F97316",
          };
          const mpIcons: Record<string, string> = {
            "1688": "🏪",
            Taobao: "🛒",
            YiwuGo: "📦",
          };
          setMarketplaceRevenue(
            Object.entries(mpMap)
              .map(([marketplace, data]) => ({
                marketplace,
                ...data,
                color: mpColors[marketplace] || "#9CA3AF",
                icon: mpIcons[marketplace] || "📊",
              }))
              .sort((a, b) => b.revenue - a.revenue)
          );
        }

        /* Top products */
        if (productsRes.ok && productsRes.products) {
          const sorted = (productsRes.products as TopProduct[])
            .sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
            .slice(0, 6);
          setTopProducts(sorted);
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
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const unread = useMemo(
    () => activities.filter((a) => a.type === "order").length,
    [activities]
  );

  return (
    <div className="space-y-6">
      {/* ─── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-dark-900">Dashboard</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>
          <p className="text-sm text-dark-900/50">
            ChinaSuuq Mission Control — real-time operations overview
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick actions */}
          <a
            href="/admin/orders"
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/30"
          >
            <Plus className="h-3.5 w-3.5" />
            New Order
          </a>
          <button className="inline-flex items-center gap-1.5 rounded-xl border border-dark-900/10 bg-white px-3 py-2 text-xs font-semibold text-dark-900/70 hover:bg-dark-50 transition-colors">
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
          <a
            href="/admin/settings"
            className="inline-flex items-center gap-1.5 rounded-xl border border-dark-900/10 bg-white px-3 py-2 text-xs font-semibold text-dark-900/70 hover:bg-dark-50 transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

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
            <span>
              Could not load live data: {error}. Check that Supabase migration
              014 has been applied.
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ─── KPI Cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          title="Total Revenue"
          value={`$${animRevenue.toLocaleString()}`}
          icon={DollarSign}
          color="emerald"
          change={12}
          changeLabel="vs last week"
          delay={0}
        />
        <KPICard
          title="Total Orders"
          value={animOrders}
          icon={ShoppingCart}
          color="brand"
          change={8}
          changeLabel="vs last week"
          delay={1}
        />
        <KPICard
          title="Customers"
          value={animCustomers}
          icon={Users}
          color="violet"
          change={15}
          changeLabel="growing"
          delay={2}
        />
        <KPICard
          title="Active Shipments"
          value={animShipments}
          icon={Ship}
          color="sky"
          delay={3}
        />
      </div>

      {/* ─── Secondary KPI row ──────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl border border-dark-900/5 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50">
              <Clock3 className="h-4.5 w-4.5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-dark-900/50">Today&apos;s Orders</p>
              <p className="text-lg font-bold text-dark-900">
                {kpis?.todaysOrders ?? 0}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-2xl border border-dark-900/5 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
              <TrendingUp className="h-4.5 w-4.5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-dark-900/50">Today&apos;s Revenue</p>
              <p className="text-lg font-bold text-dark-900">
                ${(kpis?.todaysRevenue ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl border border-dark-900/5 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50">
              <Package className="h-4.5 w-4.5 text-rose-600" />
            </div>
            <div>
              <p className="text-xs text-dark-900/50">Pending Sourcing</p>
              <p className="text-lg font-bold text-dark-900">
                {kpis?.pendingSourcing ?? 0}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="rounded-2xl border border-dark-900/5 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50">
              <DollarSign className="h-4.5 w-4.5 text-brand-600" />
            </div>
            <div>
              <p className="text-xs text-dark-900/50">Avg Order Value</p>
              <p className="text-lg font-bold text-dark-900">
                ${(kpis?.avgOrderValue ?? 0).toFixed(0)}
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ─── Revenue Chart + Order Status Donut ─────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Revenue chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl border border-dark-900/5 bg-white p-5 shadow-sm lg:col-span-2"
        >
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="flex items-center gap-2 font-semibold text-dark-900">
                <BarChart3 className="h-4 w-4 text-dark-900/40" />
                Revenue — Last 7 Days
              </h3>
              <p className="text-xs text-dark-900/40 mt-1">
                Daily revenue trend
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-dark-900/50">
              <Calendar className="h-3.5 w-3.5" />
              {dailyRevenue.length > 0 &&
                `${dailyRevenue[0].label} — ${dailyRevenue[dailyRevenue.length - 1].label}`}
            </div>
          </div>
          {loading ? (
            <div className="h-40 animate-pulse rounded-xl bg-dark-50" />
          ) : (
            <RevenueBarChart data={dailyRevenue} />
          )}
        </motion.div>

        {/* Order status donut */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl border border-dark-900/5 bg-white p-5 shadow-sm"
        >
          <div className="mb-4">
            <h3 className="flex items-center gap-2 font-semibold text-dark-900">
              <BarChart3 className="h-4 w-4 text-dark-900/40" />
              Order Status
            </h3>
            <p className="text-xs text-dark-900/40 mt-1">
              Current pipeline
            </p>
          </div>
          {loading ? (
            <div className="h-40 animate-pulse rounded-xl bg-dark-50" />
          ) : orderStatusCounts.length > 0 ? (
            <OrderStatusDonut data={orderStatusCounts} />
          ) : (
            <p className="text-center text-sm text-dark-900/40 py-8">
              No order data
            </p>
          )}
        </motion.div>
      </div>

      {/* ─── Recent Orders Table ────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="rounded-2xl border border-dark-900/5 bg-white shadow-sm"
      >
        <div className="flex items-center justify-between p-5 pb-0">
          <h3 className="flex items-center gap-2 font-semibold text-dark-900">
            <Package className="h-4 w-4 text-dark-900/40" />
            Recent Orders
          </h3>
          <a
            href="/admin/orders"
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
          >
            View all
            <ChevronRight className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm mt-4">
            <thead>
              <tr className="border-b border-dark-900/5 bg-dark-50/50 text-[11px] font-semibold uppercase tracking-wider text-dark-900/40">
                <th className="px-5 py-3">Order</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3 hidden md:table-cell">City</th>
                <th className="px-5 py-3">Total</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 hidden lg:table-cell">Payment</th>
                <th className="px-5 py-3 hidden lg:table-cell">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-900/5">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
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
      </motion.div>

      {/* ─── Bottom row: Top Products + Marketplace + Activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Top Selling Products */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl border border-dark-900/5 bg-white p-5 shadow-sm"
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold text-dark-900">
              <Package className="h-4 w-4 text-dark-900/40" />
              Top Products
            </h3>
            <a
              href="/admin/products"
              className="text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
            >
              View all →
            </a>
          </div>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-dark-50" />
              ))}
            </div>
          ) : topProducts.length > 0 ? (
            <div className="space-y-2">
              {topProducts.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.04 }}
                  className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-dark-50/50 transition-colors"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-xs font-bold text-brand-600 shrink-0">
                    #{i + 1}
                  </div>
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
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-dark-900/40 py-8">
              No products yet
            </p>
          )}
        </motion.div>

        {/* Marketplace Revenue Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="rounded-2xl border border-dark-900/5 bg-white p-5 shadow-sm"
        >
          <div className="mb-4">
            <h3 className="flex items-center gap-2 font-semibold text-dark-900">
              <Globe className="h-4 w-4 text-dark-900/40" />
              Revenue by Marketplace
            </h3>
            <p className="text-xs text-dark-900/40 mt-1">
              Source distribution
            </p>
          </div>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-dark-50" />
              ))}
            </div>
          ) : marketplaceRevenue.length > 0 ? (
            <MarketplaceBreakdown data={marketplaceRevenue} />
          ) : (
            <p className="text-center text-sm text-dark-900/40 py-8">
              No marketplace data
            </p>
          )}
        </motion.div>

        {/* Live Activity Feed */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-2xl border border-dark-900/5 bg-white p-5 shadow-sm"
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold text-dark-900">
              <Activity className="h-4 w-4 text-dark-900/40" />
              Activity Feed
            </h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE
            </span>
          </div>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-dark-50" />
              ))}
            </div>
          ) : (
            <ActivityFeed events={activities} />
          )}
        </motion.div>
      </div>
    </div>
  );
}
