"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type {
  AdminActivityEvent,
  AdminCustomer,
  AdminDashboardSummary,
  AdminMarketplaceAccount,
  AdminNotification,
  AdminOrder,
  AdminPayment,
  AdminProduct,
  AdminQuote,
  AdminRate,
  AdminShipment,
  AdminSourcingRequest,
  AdminStaffMember,
  AdminSupplier,
  OrderStatus,
  PaymentStatus,
} from "./types";
import { SEED_NOTIFICATIONS, SEED_ACTIVITY, SEED_CUSTOMERS } from "./seed";
import { SEED_ORDERS } from "./seed-orders";
import { SEED_PRODUCTS, SEED_SHIPMENTS, SEED_QUOTES, SEED_PAYMENTS, SEED_RATES, SEED_SUPPLIERS, SEED_STAFF, SEED_MARKETPLACE_ACCOUNTS, SEED_SOURCING } from "./seed-rest";

export type AdminEntityMap = {
  customers: AdminCustomer;
  orders: AdminOrder;
  products: AdminProduct;
  shipments: AdminShipment;
  quotes: AdminQuote;
  payments: AdminPayment;
  rates: AdminRate;
  suppliers: AdminSupplier;
  staff: AdminStaffMember;
  marketplaceAccounts: AdminMarketplaceAccount;
  sourcing: AdminSourcingRequest;
};

const initial = {
  customers: SEED_CUSTOMERS,
  orders: SEED_ORDERS,
  products: SEED_PRODUCTS,
  shipments: SEED_SHIPMENTS,
  quotes: SEED_QUOTES,
  payments: SEED_PAYMENTS,
  rates: SEED_RATES,
  suppliers: SEED_SUPPLIERS,
  staff: SEED_STAFF,
  marketplaceAccounts: SEED_MARKETPLACE_ACCOUNTS,
  sourcing: SEED_SOURCING,
};

function keyFor(entity: keyof AdminEntityMap) {
  return `chinasuuq-admin-${entity}`;
}

function loadPersisted<T>(entity: keyof AdminEntityMap, fallback: T[]): T[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(keyFor(entity));
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function persist<T>(entity: keyof AdminEntityMap, value: T[]) {
  try { localStorage.setItem(keyFor(entity), JSON.stringify(value)); } catch { /* preview mode */ }
}

export function useAdminData() {
  const [data, setData] = useState(initial);
  const [notifications, setNotifications] = useState(SEED_NOTIFICATIONS);
  const [activity, setActivity] = useState(SEED_ACTIVITY);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    setData({
      customers: loadPersisted("customers", initial.customers),
      orders: loadPersisted("orders", initial.orders),
      products: loadPersisted("products", initial.products),
      shipments: loadPersisted("shipments", initial.shipments),
      quotes: loadPersisted("quotes", initial.quotes),
      payments: loadPersisted("payments", initial.payments),
      rates: loadPersisted("rates", initial.rates),
      suppliers: loadPersisted("suppliers", initial.suppliers),
      staff: loadPersisted("staff", initial.staff),
      marketplaceAccounts: loadPersisted("marketplaceAccounts", initial.marketplaceAccounts),
      sourcing: loadPersisted("sourcing", initial.sourcing),
    });
    try {
      const raw = localStorage.getItem("chinasuuq-admin-notifications");
      if (raw) setNotifications(JSON.parse(raw));
    } catch { /* seed */ }
  }, []);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    // Keep the UI responsive while checking the live API. RLS / service-role
    // boundaries should never blank the admin console.
    try { await supabase.from("orders").select("id").limit(1); } catch { /* preview mode */ }
    setLastUpdated(new Date());
    window.setTimeout(() => setIsRefreshing(false), 500);
  }, []);

  const updateEntity = useCallback(<K extends keyof AdminEntityMap>(entity: K, id: string, patch: Partial<AdminEntityMap[K]>) => {
    setData((current) => {
      const next = current[entity].map((row) => row.id === id ? { ...row, ...patch } : row) as AdminEntityMap[K][];
      persist(entity, next);
      return { ...current, [entity]: next };
    });
  }, []);

  const addEntity = useCallback(<K extends keyof AdminEntityMap>(entity: K, row: AdminEntityMap[K]) => {
    setData((current) => {
      const next = [row, ...current[entity]] as AdminEntityMap[K][];
      persist(entity, next);
      return { ...current, [entity]: next };
    });
  }, []);

  const removeEntity = useCallback(<K extends keyof AdminEntityMap>(entity: K, id: string) => {
    setData((current) => {
      const next = current[entity].filter((row) => row.id !== id);
      persist(entity, next);
      return { ...current, [entity]: next };
    });
  }, []);

  const updateOrderStatus = useCallback((id: string, status: OrderStatus) => {
    updateEntity("orders", id, { status, updated_at: new Date().toISOString() });
  }, [updateEntity]);

  const updatePaymentStatus = useCallback((id: string, status: PaymentStatus) => {
    updateEntity("payments", id, { status, confirmed_by: status === "confirmed" ? "Admin User" : undefined });
  }, [updateEntity]);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((current) => {
      const next = current.map((item) => item.id === id ? { ...item, read: true } : item);
      try { localStorage.setItem("chinasuuq-admin-notifications", JSON.stringify(next)); } catch { /* preview */ }
      return next;
    });
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((current) => {
      const next = current.map((item) => ({ ...item, read: true }));
      try { localStorage.setItem("chinasuuq-admin-notifications", JSON.stringify(next)); } catch { /* preview */ }
      return next;
    });
  }, []);

  const summary: AdminDashboardSummary = useMemo(() => {
    const revenue = data.orders.filter((o) => o.payment_status === "confirmed").reduce((sum, o) => sum + o.total_usd, 0);
    const open = data.orders.filter((o) => !["delivered", "cancelled", "refunded"].includes(o.status)).length;
    const inTransit = data.orders.filter((o) => ["in_transit", "customs", "out_for_delivery"].includes(o.status)).length;
    const pendingPayments = data.payments.filter((p) => p.status === "pending").length;
    const openQuotes = data.quotes.filter((q) => ["draft", "sent"].includes(q.status)).length;
    const openSourcing = data.sourcing.filter((r) => ["open", "quoted"].includes(r.status)).length;
    return {
      revenue_usd_today: data.orders.filter((o) => o.created_at > new Date(Date.now() - 86_400_000).toISOString()).reduce((sum, o) => sum + o.total_usd, 0),
      revenue_usd_month: revenue,
      orders_today: data.orders.filter((o) => o.created_at > new Date(Date.now() - 86_400_000).toISOString()).length,
      orders_open: open,
      orders_in_transit: inTransit,
      customers_total: data.customers.length,
      products_active: data.products.filter((p) => p.status === "active").length,
      shipments_in_transit: data.shipments.filter((s) => ["shipped", "in_transit"].includes(s.status)).length,
      payments_pending: pendingPayments,
      quotes_open: openQuotes,
      sourcing_open: openSourcing,
      alerts: [
        ...notifications.filter((n) => !n.read).map((n) => ({ id: n.id, kind: n.kind === "order" ? "danger" as const : "warning" as const, title: n.title, body: n.body, created_at: n.created_at })),
      ],
      trend: ["Aug 06", "Aug 07", "Aug 08", "Aug 09", "Aug 10", "Aug 11", "Aug 12"].map((date, i) => ({ date, revenue_usd: [4200, 5860, 3920, 7410, 6830, 9210, Math.max(2200, revenue * 0.18)][i], orders: [7, 9, 6, 12, 10, 15, Math.max(3, data.orders.length)][i] })),
    };
  }, [data, notifications]);

  return { ...data, notifications, activity, summary, updateEntity, addEntity, removeEntity, updateOrderStatus, updatePaymentStatus, markNotificationRead, markAllNotificationsRead, refresh, isRefreshing, lastUpdated };
}

export type AdminData = ReturnType<typeof useAdminData>;
