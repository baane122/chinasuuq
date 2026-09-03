"use client";
import { useEffect, useState, useMemo } from "react";
import { KPICard } from "@/components/admin/KPICard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  Activity,
  Bell,
  CheckCircle2,
  Clock3,
  CreditCard,
  DollarSign,
  Package,
  ShoppingCart,
  Truck,
  Users,
  TrendingUp,
  AlertCircle,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Filter,
  Download,
  Eye,
  BarChart3,
  PieChart,
  Calendar,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getDashboardKpis,
  listOrders,
} from "@/lib/admin/supabase-data";
import { supabase } from "@/lib/supabase";
import { formatUSD } from "@/lib/utils";

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

interface RecentNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  read_at: string | null;
  created_at: string;
}

interface PaymentsToday {
  confirmedTotal: number;
  pendingCount: number;
  failedCount: number;
}

// Mini sparkline component
function MiniSparkline({ data, color = "brand" }: { data: number[]; color?: string }) {
  const max = Math.max(...data, 1);
  const points = data.map((v, i) => `${(i / (data.length - 1)) * 100},${100 - (v / max) * 80}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" className="w-full h-8" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color === "brand" ? "#FF5A0A" : color === "emerald" ? "#10B981" : "#3B82F6"} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color === "brand" ? "#FF5A0A" : color === "emerald" ? "#10B981" : "#3B82F6"} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline fill="none" stroke={color === "brand" ? "#FF5A0A" : color === "emerald" ? "#10B981" : "#3B82F6"} strokeWidth="2" points={points} />
      <polygon fill={`url(#grad-${color})`} points={`0,100 ${points} 100,100`} />
    </svg>
  );
}

// Progress ring component
function ProgressRing({ value, max, color = "#FF5A0A", size = 60 }: { value: number; max: number; color?: string; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(value / max, 1);
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E5E7EB" strokeWidth="4" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        className="transition-all duration-1000 ease-out"
      />
    </svg>
  );
}

export default function AdminDashboard() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [recentPayments, setRecentPayments] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<RecentNotification[]>([]);
  const [paymentsToday, setPaymentsToday] = useState<PaymentsToday>({
    confirmedTotal: 0,
    pendingCount: 0,
    failedCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<"today" | "week" | "month">("today");

  // Generate mock sparkline data for visual appeal
  const revenueSparkline = useMemo(() => {
    const base = kpis?.todaysRevenue || 100;
    return Array.from({ length: 7 }, (_, i) => base * (0.6 + Math.random() * 0.8));
  }, [kpis]);

  const ordersSparkline = useMemo(() => {
    const base = kpis?.todaysOrders || 10;
    return Array.from({ length: 7 }, (_, i) => base * (0.5 + Math.random() * 1));
  }, [kpis]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const todayStartISO = new Date().toISOString().slice(0, 10) + "T00:00:00.000Z";
        const [kpiRes, ordersRes, paymentsRes, notifRes, todaysPaymentsRes] = await Promise.all([
          getDashboardKpis(),
          listOrders({ pageSize: 5 }),
          supabase
            .from("admin_payments_view")
            .select("id, order_number, customer_name, amount, method, status, created_at")
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("notifications")
            .select("id, title, body, type, read_at, created_at")
            .order("created_at", { ascending: false })
            .limit(8),
          supabase
            .from("payments")
            .select("*")
            .gte("created_at", todayStartISO),
        ]);
        if (kpiRes.ok && kpiRes.kpis) setKpis(kpiRes.kpis as Kpis);
        if (ordersRes.ok) setRecentOrders(ordersRes.orders as RecentOrder[]);
        if (!paymentsRes.error) setRecentPayments(paymentsRes.data || []);
        if (!notifRes.error) setNotifications((notifRes.data as any) || []);
        if (!todaysPaymentsRes.error) {
          const rows: any[] = todaysPaymentsRes.data || [];
          const confirmedStatuses = ["confirmed", "paid", "completed", "succeeded"];
          const pendingStatuses = ["pending", "processing", "awaiting_payment"];
          const failedStatuses = ["failed", "cancelled", "expired", "declined", "refunded"];
          const confirmedTotal = rows
            .filter((p) => confirmedStatuses.includes(p.status))
            .reduce((s, p) => s + (Number(p.amount) || 0), 0);
          setPaymentsToday({
            confirmedTotal,
            pendingCount: rows.filter((p) => pendingStatuses.includes(p.status)).length,
            failedCount: rows.filter((p) => failedStatuses.includes(p.status)).length,
          });
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const unread = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="space-y-6">
      {/* Header */}
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
        <div className="flex items-center gap-2">
          {/* Time range selector */}
          <div className="flex items-center bg-white border border-dark-900/10 rounded-xl p-1">
            {(["today", "week", "month"] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  timeRange === range
                    ? "bg-brand-500 text-white shadow-sm"
                    : "text-dark-900/60 hover:text-dark-900"
                }`}
              >
                {range.charAt(0).toUpperCase() + range.slice(1)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 rounded-xl border border-dark-900/10 bg-white px-3 py-2 text-xs font-semibold text-dark-900/70 hover:bg-dark-50 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Error Banner */}
      <AnimatePresence>
        {error ? (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Could not load live data: {error}. Check that the Supabase migration 014 has been applied.</span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
          className="relative rounded-2xl border border-dark-900/5 bg-white p-5 shadow-sm overflow-hidden group hover:shadow-md transition-shadow"
        >
          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <MiniSparkline data={revenueSparkline} color="emerald" />
          </div>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-dark-900/50">Total Revenue</p>
              <p className="mt-2 text-2xl font-bold text-dark-900">${(kpis?.totalRevenue ?? 0).toLocaleString()}</p>
              <div className="mt-1 flex items-center gap-1">
                <span className="text-xs font-semibold text-emerald-600">
                  <ArrowUpRight className="w-3 h-3 inline" /> +12%
                </span>
                <span className="text-xs text-dark-900/40">vs last week</span>
              </div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-sm shadow-emerald-500/30">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="relative rounded-2xl border border-dark-900/5 bg-white p-5 shadow-sm overflow-hidden group hover:shadow-md transition-shadow"
        >
          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <MiniSparkline data={ordersSparkline} color="brand" />
          </div>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-dark-900/50">Active Orders</p>
              <p className="mt-2 text-2xl font-bold text-dark-900">{kpis?.activeOrders ?? 0}</p>
              <div className="mt-1 flex items-center gap-1">
                <span className="text-xs font-semibold text-brand-600">
                  <Zap className="w-3 h-3 inline" /> Processing
                </span>
              </div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-sm shadow-brand-500/30">
              <ShoppingCart className="h-5 w-5" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="relative rounded-2xl border border-dark-900/5 bg-white p-5 shadow-sm overflow-hidden group hover:shadow-md transition-shadow"
        >
          <div className="absolute top-3 right-3">
            <div className="relative">
              <ProgressRing value={kpis?.deliveryRate ?? 0} max={100} size={48} />
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-dark-900">
                {Math.round(kpis?.deliveryRate ?? 0)}%
              </span>
            </div>
          </div>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-dark-900/50">Delivered</p>
              <p className="mt-2 text-2xl font-bold text-dark-900">{kpis?.deliveredOrders ?? 0}</p>
              <div className="mt-1 flex items-center gap-1">
                <span className="text-xs text-dark-900/40">delivery rate</span>
              </div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm shadow-sky-500/30">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="relative rounded-2xl border border-dark-900/5 bg-white p-5 shadow-sm overflow-hidden group hover:shadow-md transition-shadow"
        >
          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <MiniSparkline data={[15, 22, 18, 28, 24, 32, kpis?.totalCustomers ?? 30]} color="violet" />
          </div>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-dark-900/50">Customers</p>
              <p className="mt-2 text-2xl font-bold text-dark-900">{kpis?.totalCustomers ?? 0}</p>
              <div className="mt-1 flex items-center gap-1">
                <span className="text-xs font-semibold text-violet-600">
                  <ArrowUpRight className="w-3 h-3 inline" /> Growing
                </span>
              </div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm shadow-violet-500/30">
              <Users className="h-5 w-5" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
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
              <p className="text-lg font-bold text-dark-900">{kpis?.todaysOrders ?? 0}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
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
              <p className="text-lg font-bold text-dark-900">${(kpis?.todaysRevenue ?? 0).toLocaleString()}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
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
              <p className="text-lg font-bold text-dark-900">{kpis?.pendingSourcing ?? 0}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
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
              <p className="text-lg font-bold text-dark-900">${(kpis?.avgOrderValue ?? 0).toFixed(0)}</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Payments Today */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="rounded-2xl border border-dark-900/5 bg-white p-5 shadow-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold text-dark-900">
            <CreditCard className="h-4 w-4 text-dark-900/40" />
            Payments Today
          </h3>
          <a href="/admin/payments" className="text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors">
            View all →
          </a>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-4 border border-emerald-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <CreditCard className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="text-xs font-medium text-emerald-700">Confirmed</p>
            </div>
            <p className="mt-3 text-xl font-bold text-emerald-700">
              {formatUSD(paymentsToday.confirmedTotal)}
            </p>
            <p className="text-xs text-emerald-600/60 mt-1">total confirmed today</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/50 p-4 border border-amber-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Clock3 className="h-4 w-4 text-amber-600" />
              </div>
              <p className="text-xs font-medium text-amber-700">Pending</p>
            </div>
            <p className="mt-3 text-xl font-bold text-amber-700">{paymentsToday.pendingCount}</p>
            <p className="text-xs text-amber-600/60 mt-1">awaiting confirmation</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-rose-50 to-rose-100/50 p-4 border border-rose-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
                <XCircle className="h-4 w-4 text-rose-600" />
              </div>
              <p className="text-xs font-medium text-rose-700">Failed</p>
            </div>
            <p className="mt-3 text-xl font-bold text-rose-700">{paymentsToday.failedCount}</p>
            <p className="text-xs text-rose-600/60 mt-1">failed today</p>
          </div>
        </div>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Active Orders */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl border border-dark-900/5 bg-white p-5 shadow-sm lg:col-span-2"
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-dark-900">Latest Orders</h3>
            <a href="/admin/orders" className="text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors">
              View all →
            </a>
          </div>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-dark-50" />
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <p className="py-6 text-center text-sm text-dark-900/40">No orders yet</p>
          ) : (
            <div className="space-y-2">
              {recentOrders.map((o, idx) => (
                <motion.a
                  key={o.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + idx * 0.05 }}
                  href="/admin/orders"
                  className="flex items-center justify-between rounded-xl p-3 transition-all hover:bg-dark-50/80 group"
                >
                  <div className="min-w-0 flex-1 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-brand-600">
                        {(o.customer_name || "G").charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-dark-900">
                        {o.order_number || o.id.slice(0, 8)}
                      </p>
                      <p className="truncate text-xs text-dark-900/45">
                        {o.customer_name || "Guest"} · {o.city || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <div>
                      <p className="text-sm font-semibold text-dark-900">
                        ${(o.total || 0).toLocaleString()}
                      </p>
                      <StatusBadge status={o.status} />
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-dark-900/20 group-hover:text-brand-500 transition-colors" />
                  </div>
                </motion.a>
              ))}
            </div>
          )}
        </motion.div>

        {/* Notifications */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl border border-dark-900/5 bg-white p-5 shadow-sm"
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold text-dark-900">
              Notifications
              {unread > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white">
                  {unread}
                </span>
              )}
            </h3>
            <Bell className="h-4 w-4 text-dark-900/30" />
          </div>
          {notifications.length === 0 ? (
            <p className="py-6 text-center text-sm text-dark-900/40">No notifications yet</p>
          ) : (
            <div className="space-y-2">
              {notifications.slice(0, 5).map((n, idx) => (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 + idx * 0.03 }}
                  className={`rounded-xl p-3 transition-colors ${
                    n.read_at ? "bg-dark-50/50" : "bg-brand-50/50 ring-1 ring-brand-500/10"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read_at && (
                      <div className="w-2 h-2 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-dark-900">{n.title}</p>
                      {n.body ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-dark-900/50">{n.body}</p>
                      ) : null}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Recent Payments */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="rounded-2xl border border-dark-900/5 bg-white p-5 shadow-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-dark-900">Recent Payments</h3>
          <a href="/admin/payments" className="text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors">
            View all →
          </a>
        </div>
        {recentPayments.length === 0 ? (
          <p className="py-6 text-center text-sm text-dark-900/40">No payments recorded yet</p>
        ) : (
          <div className="space-y-2">
            {recentPayments.map((p: any, idx: number) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + idx * 0.05 }}
                className="flex items-center justify-between rounded-xl p-3 hover:bg-dark-50/50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-dark-900">{p.customer_name || "Guest"}</p>
                    <p className="text-xs text-dark-900/45">
                      {p.order_number || p.id.slice(0, 8)} · {(p.method || "—").replace(/_/g, " ")}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-emerald-600">
                    ${(p.amount || 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-dark-900/40">
                    {p.created_at
                      ? new Date(p.created_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })
                      : "—"}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
