"use client";
import { useAdminData } from "@/lib/admin/store";
import { KPICard } from "@/components/admin/KPICard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Activity, Bell, CheckCircle2, Clock3, DollarSign, Package, ShoppingCart, Truck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export default function AdminDashboard() {
  const { summary, notifications, activity, orders, payments } = useAdminData();
  const unread = notifications.filter((n) => !n.read);
  const recentPayments = payments.filter((p) => p.status === "confirmed").slice(0, 5);
  const recentOrders = orders.filter((o) => ["in_transit", "customs", "out_for_delivery", "purchasing"].includes(o.status)).slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-dark-900">Dashboard</h1>
        <p className="text-sm text-dark-900/50">ChinaSuuq Mission Control — real-time operations overview</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard title="Revenue (Month)" value={`$${summary.revenue_usd_month.toLocaleString()}`} change={12} changeLabel="vs last month" icon={DollarSign} color="emerald" delay={0} />
        <KPICard title="Orders Open" value={summary.orders_open} change={8} changeLabel="vs last week" icon={ShoppingCart} color="brand" delay={1} />
        <KPICard title="In Transit" value={summary.orders_in_transit} icon={Truck} color="sky" delay={2} />
        <KPICard title="Active Products" value={summary.products_active} icon={Package} color="violet" delay={3} />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard title="Total Customers" value={summary.customers_total} icon={Users} color="amber" delay={4} />
        <KPICard title="Payments Pending" value={summary.payments_pending} icon={DollarSign} color="rose" delay={5} />
        <KPICard title="Shipments" value={summary.shipments_in_transit} icon={Truck} color="sky" delay={6} />
        <KPICard title="Open Quotes" value={summary.quotes_open} icon={Package} color="brand" delay={7} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl border border-dark-900/5 bg-white p-5 shadow-sm lg:col-span-2"
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-dark-900">Recent Activity</h3>
            <Activity className="h-4 w-4 text-dark-900/30" />
          </div>
          <div className="space-y-3">
            {activity.map((event) => (
              <div key={event.id} className="flex items-start gap-3">
                <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                <div>
                  <p className="text-sm text-dark-900">
                    <span className="font-medium">{event.actor}</span> {event.action}{" "}
                    <span className="font-medium text-brand-600">{event.target}</span>
                  </p>
                  <p className="text-xs text-dark-900/40">{new Date(event.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
              </div>
            ))}
          </div>
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
              {unread.length > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white">{unread.length}</span>
              )}
              <Bell className="h-4 w-4 text-dark-900/30" />
            </div>
          </div>
          <div className="space-y-3">
            {notifications.slice(0, 5).map((n) => (
              <a
                key={n.id}
                href={n.href || "#"}
                className={cn(
                  "block rounded-xl p-3 transition",
                  n.read ? "bg-dark-50/50" : "bg-brand-50/50 ring-1 ring-brand-500/10"
                )}
              >
                <p className="text-sm font-medium text-dark-900">{n.title}</p>
                <p className="mt-0.5 text-xs text-dark-900/50 line-clamp-2">{n.body}</p>
              </a>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Revenue Trend + Active Orders */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue Trend */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-2xl border border-dark-900/5 bg-white p-5 shadow-sm"
        >
          <h3 className="mb-4 font-semibold text-dark-900">Revenue Trend (7 days)</h3>
          <div className="flex items-end gap-2">
            {summary.trend.map((d) => {
              const maxRevenue = Math.max(...summary.trend.map((t) => t.revenue_usd));
              const height = maxRevenue > 0 ? (d.revenue_usd / maxRevenue) * 100 : 0;
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold text-dark-900/50">${(d.revenue_usd / 1000).toFixed(1)}k</span>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(height, 4)}%` }}
                    transition={{ delay: 0.3 }}
                    className="w-full rounded-t-lg bg-gradient-to-t from-brand-500 to-brand-400"
                  />
                  <span className="text-[10px] text-dark-900/40">{d.date.split(" ")[1]}</span>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Active Orders */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl border border-dark-900/5 bg-white p-5 shadow-sm"
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-dark-900">Active Orders</h3>
            <a href="/admin/orders" className="text-xs font-semibold text-brand-600 hover:text-brand-700">View all →</a>
          </div>
          <div className="space-y-3">
            {recentOrders.length === 0 && (
              <p className="py-6 text-center text-sm text-dark-900/40">No active orders</p>
            )}
            {recentOrders.map((o) => (
              <a key={o.id} href="/admin/orders" className="flex items-center justify-between rounded-xl p-3 transition hover:bg-dark-50/50">
                <div>
                  <p className="text-sm font-semibold text-dark-900">{o.reference}</p>
                  <p className="text-xs text-dark-900/45">{o.customer_name} · {o.city}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-dark-900">${o.total_usd.toLocaleString()}</p>
                  <StatusBadge status={o.status} />
                </div>
              </a>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Payments */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="rounded-2xl border border-dark-900/5 bg-white p-5 shadow-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-dark-900">Recent Confirmed Payments</h3>
          <a href="/admin/payments" className="text-xs font-semibold text-brand-600 hover:text-brand-700">View all →</a>
        </div>
        <div className="space-y-3">
          {recentPayments.map((p) => (
            <a key={p.id} href="/admin/payments" className="flex items-center justify-between rounded-xl p-3 transition hover:bg-dark-50/50">
              <div>
                <p className="text-sm font-medium text-dark-900">{p.customer_name}</p>
                <p className="text-xs text-dark-900/45">{p.reference} · {p.method.replace("_", " ")}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-emerald-600">${p.amount_usd.toLocaleString()}</p>
                <p className="text-xs text-dark-900/40">{new Date(p.received_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
              </div>
            </a>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
