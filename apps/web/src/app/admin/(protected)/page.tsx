"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { cn, formatUSD, formatDate } from "@/lib/utils";
import {
  ShoppingCart,
  DollarSign,
  Users,
  Truck,
  TrendingUp,
  TrendingDown,
  Loader2,
  ArrowUpRight,
  Package,
  ClipboardList,
  AlertTriangle,
  Clock,
  Boxes,
  Ship,
  CheckCircle2,
  RefreshCw,
  CreditCard,
} from "lucide-react";
import type { Order } from "@/types";

const ORDER_STATUSES = [
  "pending", "confirmed", "purchasing", "purchased", "in_transit_china",
  "warehouse", "inspection", "consolidated", "shipped", "in_transit",
  "arrived_somalia", "customs", "ready_for_pickup", "out_for_delivery",
  "delivered", "cancelled",
];

const statusColors: Record<string, string> = {
  pending: "bg-amber-50 text-amber-600",
  confirmed: "bg-blue-50 text-blue-600",
  purchasing: "bg-indigo-50 text-indigo-600",
  purchased: "bg-indigo-50 text-indigo-600",
  in_transit_china: "bg-orange-50 text-orange-600",
  warehouse: "bg-purple-50 text-purple-600",
  inspection: "bg-pink-50 text-pink-600",
  consolidated: "bg-cyan-50 text-cyan-600",
  shipped: "bg-green-50 text-green-600",
  in_transit: "bg-cyan-50 text-cyan-600",
  arrived_somalia: "bg-teal-50 text-teal-600",
  customs: "bg-fuchsia-50 text-fuchsia-600",
  ready_for_pickup: "bg-emerald-50 text-emerald-600",
  out_for_delivery: "bg-lime-50 text-lime-600",
  delivered: "bg-green-50 text-green-600",
  cancelled: "bg-red-50 text-red-600",
};

interface PipelineCount {
  status: string;
  count: number;
}

export default function AdminDashboard() {
  const [kpis, setKpis] = useState({
    totalOrders: 0,
    revenue: 0,
    activeCustomers: 0,
    pendingShipments: 0,
    totalProducts: 0,
    pendingSourcing: 0,
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [pipeline, setPipeline] = useState<PipelineCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [
        ordersResult,
        customersResult,
        shipmentsResult,
        productsResult,
        sourcingResult,
        recentOrdersResult,
      ] = await Promise.all([
        supabase.from("orders").select("id, total_usd, status, created_at", { count: "exact" }),
        supabase.from("customers").select("id", { count: "exact" }),
        supabase.from("shipments").select("id, status", { count: "exact" }).in("status", ["preparing", "loaded"]),
        supabase.from("source_products").select("id", { count: "exact" }),
        supabase.from("sourcing_requests").select("id", { count: "exact" }).in("status", ["pending", "assigned"]),
        supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(8),
      ]);

      const totalRevenue = (ordersResult.data || []).reduce((sum, o) => sum + (o.total_usd || 0), 0);

      setKpis({
        totalOrders: ordersResult.count || 0,
        revenue: totalRevenue,
        activeCustomers: customersResult.count || 0,
        pendingShipments: shipmentsResult.count || 0,
        totalProducts: productsResult.count || 0,
        pendingSourcing: sourcingResult.count || 0,
      });
      setRecentOrders((recentOrdersResult.data as Order[]) || []);

      // Build pipeline counts
      const counts: Record<string, number> = {};
      (ordersResult.data || []).forEach((o) => {
        counts[o.status] = (counts[o.status] || 0) + 1;
      });
      setPipeline(
        ORDER_STATUSES.map((s) => ({ status: s, count: counts[s] || 0 }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-sm text-dark-400">Loading command center...</p>
        </div>
      </div>
    );
  }

  const activePipeline = pipeline.filter((p) => p.status !== "cancelled" && p.status !== "delivered");
  const deliveredCount = pipeline.find((p) => p.status === "delivered")?.count || 0;
  const maxPipeline = Math.max(1, ...activePipeline.map((p) => p.count));
  const pendingRevenue = recentOrders
    .filter((o) => ["pending", "confirmed"].includes(o.status))
    .reduce((s, o) => s + (o.total_usd || 0), 0);

  const kpiCards = [
    { key: "totalOrders" as const, label: "Total Orders", value: kpis.totalOrders, icon: ShoppingCart, color: "bg-blue-50 text-blue-600", isRevenue: false },
    { key: "revenue" as const, label: "Revenue", value: kpis.revenue, icon: DollarSign, color: "bg-green-50 text-green-600", isRevenue: true },
    { key: "activeCustomers" as const, label: "Customers", value: kpis.activeCustomers, icon: Users, color: "bg-purple-50 text-purple-600", isRevenue: false },
    { key: "pendingShipments" as const, label: "Pending Shipments", value: kpis.pendingShipments, icon: Truck, color: "bg-brand-50 text-brand-500", isRevenue: false },
    { key: "totalProducts" as const, label: "Products", value: kpis.totalProducts, icon: Package, color: "bg-indigo-50 text-indigo-600", isRevenue: false },
    { key: "pendingSourcing" as const, label: "Sourcing Queue", value: kpis.pendingSourcing, icon: ClipboardList, color: "bg-amber-50 text-amber-600", isRevenue: false },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-900">Command Center</h1>
          <p className="text-sm text-dark-400">Live operational overview of ChinaSuuq.</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-xl bg-dark-900 px-4 py-2 text-sm font-medium text-white hover:bg-dark-800 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-600 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => window.location.reload()} className="font-medium text-brand-500 hover:underline">
            Retry
          </button>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpiCards.map((card) => (
          <div key={card.key} className="rounded-2xl bg-white border border-dark-100/50 p-4 shadow-sm">
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", card.color)}>
              <card.icon className="h-5 w-5" />
            </div>
            <p className="mt-3 text-2xl font-bold text-dark-900">
              {card.isRevenue ? formatUSD(card.value) : card.value.toLocaleString()}
            </p>
            <p className="text-sm text-dark-400">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Pipeline + Quick Stats */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Order Pipeline */}
        <div className="lg:col-span-2 rounded-2xl bg-white border border-dark-100/50 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-dark-900">Order Pipeline</h2>
            <div className="flex items-center gap-2 text-sm">
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-4 w-4" /> {deliveredCount} delivered
              </span>
            </div>
          </div>
          <div className="space-y-2.5">
            {activePipeline.map((item) => (
              <div key={item.status} className="flex items-center gap-3">
                <span className="w-36 truncate text-xs font-medium text-dark-600 capitalize">
                  {item.status.replace(/_/g, " ")}
                </span>
                <div className="flex-1 h-2.5 rounded-full bg-dark-50 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all duration-500"
                    style={{ width: `${(item.count / maxPipeline) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-sm font-semibold text-dark-900">{item.count}</span>
              </div>
            ))}
            {activePipeline.every((p) => p.count === 0) && (
              <p className="text-sm text-dark-400 text-center py-6">No orders in pipeline yet.</p>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="rounded-2xl bg-white border border-dark-100/50 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-dark-900 mb-4">Quick Stats</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-dark-50 p-3">
              <span className="flex items-center gap-2 text-sm text-dark-500"><DollarSign className="h-4 w-4 text-green-500" /> Avg. Order Value</span>
              <span className="text-sm font-semibold text-dark-900">
                {kpis.totalOrders > 0 ? formatUSD(kpis.revenue / kpis.totalOrders) : "$0.00"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-dark-50 p-3">
              <span className="flex items-center gap-2 text-sm text-dark-500"><Clock className="h-4 w-4 text-amber-500" /> Pending Revenue</span>
              <span className="text-sm font-semibold text-amber-600">{formatUSD(pendingRevenue)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-dark-50 p-3">
              <span className="flex items-center gap-2 text-sm text-dark-500"><AlertTriangle className="h-4 w-4 text-red-500" /> In Transit</span>
              <span className="text-sm font-semibold text-dark-900">
                {pipeline.filter((p) => ["in_transit_china", "in_transit", "shipped"].includes(p.status)).reduce((s, p) => s + p.count, 0)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-dark-50 p-3">
              <span className="flex items-center gap-2 text-sm text-dark-500"><CreditCard className="h-4 w-4 text-blue-500" /> Exchange Rate</span>
              <span className="text-sm font-semibold text-dark-900">CNY→USD</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="rounded-2xl bg-white border border-dark-100/50 shadow-sm">
        <div className="flex items-center justify-between border-b border-dark-100 px-6 py-4">
          <h2 className="text-lg font-bold text-dark-900">Recent Orders</h2>
          <a href="/admin/orders" className="flex items-center gap-1 text-sm font-medium text-brand-500 hover:text-brand-600">
            View all <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-50 bg-dark-50/50">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Reference</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-50">
              {recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-dark-400">
                    No orders yet.
                  </td>
                </tr>
              ) : (
                recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-dark-50/50 transition-colors">
                    <td className="px-6 py-3.5 text-sm font-medium text-brand-500">{order.reference}</td>
                    <td className="px-6 py-3.5 text-sm text-dark-600">{(order as any).customer_id || "—"}</td>
                    <td className="px-6 py-3.5 text-sm font-medium text-dark-900">{formatUSD(order.total_usd)}</td>
                    <td className="px-6 py-3.5">
                      <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", statusColors[order.status] || "bg-dark-50 text-dark-500")}>
                        {order.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-sm text-dark-400">{formatDate(order.created_at ?? new Date().toISOString())}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
