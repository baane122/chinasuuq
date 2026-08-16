"use client";
import { useEffect, useState } from "react";
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
} from "lucide-react";
import { motion } from "framer-motion";
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-900">Dashboard</h1>
          <p className="text-sm text-dark-900/50">
            ChinaSuuq Mission Control — real-time operations overview
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl border border-dark-900/10 bg-white px-3 py-1.5 text-xs font-semibold text-dark-900/70 hover:bg-dark-50"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4" />
          <span>Could not load live data: {error}. Check that the Supabase migration 014 has been applied.</span>
        </div>
      ) : null}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          title="Total Revenue"
          value={`$${(kpis?.totalRevenue ?? 0).toLocaleString()}`}
          icon={DollarSign}
          color="emerald"
          delay={0}
        />
        <KPICard
          title="Active Orders"
          value={kpis?.activeOrders ?? 0}
          icon={ShoppingCart}
          color="brand"
          delay={1}
        />
        <KPICard
          title="Delivered"
          value={kpis?.deliveredOrders ?? 0}
          change={kpis?.deliveryRate ? Math.round(kpis.deliveryRate) : 0}
          changeLabel="delivery rate"
          icon={CheckCircle2}
          color="sky"
          delay={2}
        />
        <KPICard
          title="Customers"
          value={kpis?.totalCustomers ?? 0}
          icon={Users}
          color="violet"
          delay={3}
        />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          title="Today's Orders"
          value={kpis?.todaysOrders ?? 0}
          icon={Clock3}
          color="amber"
          delay={4}
        />
        <KPICard
          title="Today's Revenue"
          value={`$${(kpis?.todaysRevenue ?? 0).toLocaleString()}`}
          icon={TrendingUp}
          color="emerald"
          delay={5}
        />
        <KPICard
          title="Pending Sourcing"
          value={kpis?.pendingSourcing ?? 0}
          icon={Package}
          color="rose"
          delay={6}
        />
        <KPICard
          title="Avg Order Value"
          value={`$${(kpis?.avgOrderValue ?? 0).toFixed(0)}`}
          icon={DollarSign}
          color="brand"
          delay={7}
        />
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
          <a href="/admin/payments" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
            View all →
          </a>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-dark-50/50 p-4">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-emerald-600" />
              <p className="text-xs font-medium text-dark-900/50">Confirmed</p>
            </div>
            <p className="mt-2 text-xl font-bold text-emerald-600">
              {formatUSD(paymentsToday.confirmedTotal)}
            </p>
            <p className="text-xs text-dark-900/40">total confirmed today</p>
          </div>
          <div className="rounded-xl bg-dark-50/50 p-4">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-amber-600" />
              <p className="text-xs font-medium text-dark-900/50">Pending</p>
            </div>
            <p className="mt-2 text-xl font-bold text-amber-600">{paymentsToday.pendingCount}</p>
            <p className="text-xs text-dark-900/40">awaiting confirmation</p>
          </div>
          <div className="rounded-xl bg-dark-50/50 p-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-rose-600" />
              <p className="text-xs font-medium text-dark-900/50">Failed</p>
            </div>
            <p className="mt-2 text-xl font-bold text-rose-600">{paymentsToday.failedCount}</p>
            <p className="text-xs text-dark-900/40">failed today</p>
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
            <a href="/admin/orders" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              View all →
            </a>
          </div>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-dark-50" />
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <p className="py-6 text-center text-sm text-dark-900/40">No orders yet</p>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((o) => (
                <a
                  key={o.id}
                  href="/admin/orders"
                  className="flex items-center justify-between rounded-xl p-3 transition hover:bg-dark-50/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-dark-900">
                      {o.order_number || o.id.slice(0, 8)}
                    </p>
                    <p className="truncate text-xs text-dark-900/45">
                      {o.customer_name || "Guest"} · {o.city || "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-dark-900">
                      ${(o.total || 0).toLocaleString()}
                    </p>
                    <StatusBadge status={o.status} />
                  </div>
                </a>
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
            <h3 className="font-semibold text-dark-900">Notifications</h3>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white">
                  {unread}
                </span>
              )}
              <Bell className="h-4 w-4 text-dark-900/30" />
            </div>
          </div>
          {notifications.length === 0 ? (
            <p className="py-6 text-center text-sm text-dark-900/40">No notifications yet</p>
          ) : (
            <div className="space-y-2">
              {notifications.slice(0, 5).map((n) => (
                <div
                  key={n.id}
                  className={`rounded-xl p-3 ${
                    n.read_at ? "bg-dark-50/50" : "bg-brand-50/50 ring-1 ring-brand-500/10"
                  }`}
                >
                  <p className="text-sm font-medium text-dark-900">{n.title}</p>
                  {n.body ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-dark-900/50">{n.body}</p>
                  ) : null}
                </div>
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
          <a href="/admin/payments" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
            View all →
          </a>
        </div>
        {recentPayments.length === 0 ? (
          <p className="py-6 text-center text-sm text-dark-900/40">No payments recorded yet</p>
        ) : (
          <div className="space-y-2">
            {recentPayments.map((p: any) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl p-3 hover:bg-dark-50/50"
              >
                <div>
                  <p className="text-sm font-medium text-dark-900">{p.customer_name || "Guest"}</p>
                  <p className="text-xs text-dark-900/45">
                    {p.order_number || p.id.slice(0, 8)} · {(p.method || "—").replace(/_/g, " ")}
                  </p>
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
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
