"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import WhatsAppFAB from "@/components/landing/WhatsAppFAB";
import { supabase } from "@/lib/supabase";
import {
  Search, Package, MessageCircle, CheckCircle2, Circle, Loader2,
  ClipboardCheck, Boxes, Ship, Plane, MapPin, ShieldCheck, Home,
  Truck, CalendarClock, Sparkles,
} from "lucide-react";

const WA_NUMBER = "8615277074143";

/* ─── Types ──────────────────────────────────────────────────────── */
interface TrackedOrder {
  id: string;
  order_number: string;
  status: string;
  total: number;
  shipping_method: string | null;
  payment_status: string | null;
  created_at: string;
  updated_at: string | null;
  items_count: number;
}

interface Stage {
  status: string;
  location: string;
  done: boolean;
  active: boolean;
  timestamp: string | null;
  icon: React.ComponentType<{ className?: string }>;
}

/* ─── Same 15-stage pipeline as the mobile app ───────────────────── */
const STATUS_ORDER = [
  "pending", "confirmed", "purchasing", "purchased", "in_transit_china",
  "warehouse", "inspection", "consolidated", "shipped", "in_transit",
  "arrived_somalia", "customs", "ready_for_pickup", "out_for_delivery", "delivered",
];

function buildTimeline(order: TrackedOrder): Stage[] {
  const status = (order.status || "pending").toLowerCase();
  const idx = STATUS_ORDER.indexOf(status);
  const min = (s: string) => idx >= STATUS_ORDER.indexOf(s);

  const defs: { status: string; location: string; min: string; icon: Stage["icon"] }[] = [
    { status: "Order Placed", location: "Online", min: "pending", icon: CheckCircle2 },
    { status: "Payment Confirmed", location: "Online", min: "confirmed", icon: ShieldCheck },
    { status: "Purchased", location: "Marketplace · China", min: "purchasing", icon: ClipboardCheck },
    { status: "Arrived at Warehouse", location: "Guangzhou Warehouse", min: "in_transit_china", icon: Package },
    { status: "Quality Inspection", location: "Guangzhou Warehouse", min: "warehouse", icon: ShieldCheck },
    { status: "Consolidated", location: "Guangzhou, China", min: "consolidated", icon: Boxes },
    { status: "Shipped", location: "Guangzhou, China", min: "shipped", icon: Truck },
    { status: "In Transit", location: "Hong Kong Hub", min: "in_transit", icon: Plane },
    { status: "Arrived in Somalia", location: "Mogadishu Airport", min: "arrived_somalia", icon: MapPin },
    { status: "Customs Clearance", location: "Mogadishu Port", min: "customs", icon: ClipboardCheck },
    { status: "Ready for Pickup", location: "Mogadishu Warehouse", min: "ready_for_pickup", icon: Package },
    { status: "Out for Delivery", location: "Your Address", min: "out_for_delivery", icon: Truck },
    { status: "Delivered", location: "Your Address", min: "delivered", icon: Home },
  ];

  let activeFound = false;
  return defs.map((d) => {
    const done = min(d.min);
    const isActive = !activeFound && !done;
    if (isActive) activeFound = true;
    return {
      ...d,
      done,
      active: isActive,
      timestamp: done
        ? new Date(order.updated_at || order.created_at).toLocaleDateString("en-GB", {
            day: "numeric", month: "short",
          })
        : null,
    };
  });
}

function statusLabel(status: string): string {
  return (status || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function etaText(order: TrackedOrder): string {
  const method = (order.shipping_method || "air").toLowerCase();
  const start = new Date(order.created_at).getTime();
  const [minDays, maxDays] = method === "sea" ? [25, 40] : [7, 14];
  const fmt = (t: number) =>
    new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(start + minDays * 864e5)} – ${fmt(start + maxDays * 864e5)}`;
}

/* ─── Page ───────────────────────────────────────────────────────── */
export default function TrackPage() {
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const runSearch = async () => {
    const ref = query.trim();
    if (!ref || searching) return;
    setSearching(true);
    setNotFound(false);
    setOrder(null);
    try {
      // The live orders schema uses `reference` + `total_usd` (20260813
      // migration); older generations used `order_number` + `total`. Try the
      // live shape first and fall back so both schema generations track.
      const COLS_LIVE = "id, reference, status, total_usd, shipping_method, payment_status, created_at, updated_at";
      const COLS_LEGACY = "id, order_number, status, total, shipping_method, payment_status, created_at, updated_at";

      type TrackedRow = {
        id: string;
        reference?: string;
        order_number?: string;
        status: string;
        total_usd?: number;
        total?: number;
        shipping_method: string;
        payment_status: string;
        created_at: string;
        updated_at: string;
      };

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
      let row: TrackedRow | null = null;

      const attempt = async (cols: string, col: "reference" | "order_number") => {
        const { data, error } = await supabase
          .from("orders")
          .select(cols)
          .ilike(col, ref)
          .maybeSingle();
        if (error) return null; // wrong schema for these columns
        return (data as TrackedRow | null) ?? null;
      };

      row =
        (await attempt(COLS_LIVE, "reference")) ??
        (await attempt(COLS_LEGACY, "order_number"));

      // Raw UUID fallback (app deep-links share the raw id)
      if (!row && isUuid) {
        const byId = async (cols: string) => {
          const { data, error } = await supabase
            .from("orders")
            .select(cols)
            .eq("id", ref)
            .maybeSingle();
          if (error) return null;
          return (data as TrackedRow | null) ?? null;
        };
        row = (await byId(COLS_LIVE)) ?? (await byId(COLS_LEGACY));
      }

      if (row) {
        setOrder({
          id: row.id,
          order_number: row.reference ?? row.order_number ?? "",
          status: row.status,
          total: row.total_usd ?? row.total ?? 0,
          shipping_method: row.shipping_method,
          payment_status: row.payment_status,
          created_at: row.created_at,
          updated_at: row.updated_at,
          items_count: 0,
        });
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    } finally {
      setSearching(false);
    }
  };

  const timeline = order ? buildTimeline(order) : [];
  const progress = timeline.length > 0
    ? Math.round((timeline.filter((s) => s.done).length / timeline.length) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-warm-50">
      <Header />
      <main>
        {/* ── Hero + search ── */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-32 right-[-10%] h-[480px] w-[480px] rounded-full bg-brand-500/[0.08] blur-3xl" />
          </div>
          <div className="relative mx-auto max-w-3xl px-4 pb-12 pt-28 text-center sm:px-6 lg:pb-16 lg:pt-36">
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-600">
                <Sparkles className="h-3.5 w-3.5" />
                Live order tracking
              </span>
              <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-dark-900 sm:text-5xl">
                Where&apos;s my <span className="text-brand-500">order?</span>
              </h1>
              <p className="mx-auto mt-3 max-w-xl text-base text-dark-900/55">
                Enter your order reference to see real-time status — from purchase
                in China to your door in Somalia. Same tracking as the app.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5 }}
              className="mx-auto mt-8 flex max-w-xl items-center gap-2 rounded-2xl border border-dark-900/[0.08] bg-white p-2 shadow-lg shadow-dark-900/[0.06]"
            >
              <div className="flex flex-1 items-center gap-2 px-2">
                <Search className="h-4.5 w-4.5 shrink-0 text-dark-900/35" />
                <input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setNotFound(false); }}
                  onKeyDown={(e) => e.key === "Enter" && runSearch()}
                  placeholder="e.g. CS-2026-00125"
                  className="w-full bg-transparent text-sm font-medium text-dark-900 outline-none placeholder:text-dark-900/35"
                  aria-label="Order reference"
                />
              </div>
              <button
                onClick={runSearch}
                disabled={searching || !query.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-500/25 transition-all hover:bg-brand-600 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                Track
              </button>
            </motion.div>

            <AnimatePresence>
              {notFound && !searching && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mx-auto mt-6 max-w-md rounded-2xl border border-error/20 bg-error/5 p-4"
                >
                  <p className="text-sm font-semibold text-error">Order not found</p>
                  <p className="mt-1 text-xs text-dark-900/55">
                    No order matches that reference. Double-check it or contact support on WhatsApp.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* ── Result ── */}
        <div ref={resultRef} className="mx-auto max-w-3xl scroll-mt-24 px-4 pb-20 sm:px-6">
          {searching && (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
            </div>
          )}

          {order && !searching && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="space-y-5"
            >
              {/* Summary card */}
              <div className="overflow-hidden rounded-3xl border border-dark-900/[0.06] bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 p-6 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/10">
                      <Package className="h-5 w-5 text-brand-500" />
                    </div>
                    <div>
                      <p className="font-mono text-lg font-bold tracking-tight text-dark-900">
                        {order.order_number}
                      </p>
                      <p className="text-xs font-medium text-dark-900/45">
                        Placed {new Date(order.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-brand-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm shadow-brand-500/25">
                    {statusLabel(order.status)}
                  </span>
                </div>

                {/* Progress */}
                <div className="px-6 pb-5">
                  <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-dark-900/40">
                    <span>Progress</span>
                    <span className="text-brand-600">{progress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-dark-900/[0.06]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(progress, 6)}%` }}
                      transition={{ duration: 0.9, ease: "easeOut", delay: 0.2 }}
                      className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400"
                    />
                  </div>
                </div>

                {/* Facts row */}
                <div className="grid grid-cols-2 gap-px bg-dark-900/[0.05] sm:grid-cols-4">
                  {[
                    { label: "Items", value: String(order.items_count || 1), icon: Boxes },
                    { label: "Total", value: `$${(order.total || 0).toFixed(2)}`, icon: CheckCircle2 },
                    {
                      label: "Freight",
                      value: order.shipping_method ? `${order.shipping_method.charAt(0).toUpperCase()}${order.shipping_method.slice(1)}` : "Air",
                      icon: order.shipping_method === "sea" ? Ship : Plane,
                    },
                    { label: "ETA", value: etaText(order), icon: CalendarClock },
                  ].map((f) => (
                    <div key={f.label} className="bg-white p-4">
                      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-dark-900/40">
                        <f.icon className="h-3 w-3" />
                        {f.label}
                      </p>
                      <p className="mt-1 truncate text-sm font-bold text-dark-900">{f.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Timeline */}
              <div className="rounded-3xl border border-dark-900/[0.06] bg-white p-6 shadow-sm">
                <h2 className="text-sm font-bold uppercase tracking-wider text-dark-900/40">
                  Tracking timeline
                </h2>
                <div className="mt-5 space-y-0">
                  {timeline.map((s, i) => (
                    <motion.div
                      key={s.status}
                      initial={{ opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.25 + i * 0.05 }}
                      className="relative flex gap-4 pb-6 last:pb-0"
                    >
                      {/* connector */}
                      {i < timeline.length - 1 && (
                        <span
                          className={`absolute left-[17px] top-9 h-[calc(100%-28px)] w-0.5 rounded ${
                            timeline[i + 1].done ? "bg-brand-500" : "bg-dark-900/[0.08]"
                          }`}
                        />
                      )}
                      {/* node */}
                      <span className="relative z-10 mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center">
                        {s.done ? (
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 shadow-sm shadow-brand-500/30">
                            <s.icon className="h-4 w-4 text-white" />
                          </span>
                        ) : s.active ? (
                          <>
                            <span className="absolute inline-flex h-9 w-9 animate-ping rounded-full bg-brand-500/30" />
                            <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-brand-500 bg-white">
                              <s.icon className="h-4 w-4 text-brand-500" />
                            </span>
                          </>
                        ) : (
                          <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-dark-900/[0.08] bg-warm-100">
                            <Circle className="h-3 w-3 text-dark-900/25" />
                          </span>
                        )}
                      </span>
                      {/* text */}
                      <div className={`min-w-0 pt-1 ${s.done ? "" : s.active ? "" : "opacity-50"}`}>
                        <p className={`text-sm font-bold ${s.active ? "text-brand-600" : "text-dark-900"}`}>
                          {s.status}
                          {s.active && (
                            <span className="ml-2 rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-600">
                              Current
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-dark-900/45">
                          <MapPin className="h-3 w-3" />
                          {s.location}
                          {s.timestamp && (
                            <span className="ml-1 font-semibold text-dark-900/60">· {s.timestamp}</span>
                          )}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Support */}
              <div className="flex flex-col items-center justify-between gap-3 rounded-3xl border border-dark-900/[0.06] bg-white p-5 shadow-sm sm:flex-row">
                <p className="text-sm text-dark-900/60">
                  Questions about this shipment? Our team replies fast.
                </p>
                <a
                  href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`Tracking question for order ${order.order_number}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#25D366]/25 transition-all hover:bg-[#1fb857] active:scale-[0.97]"
                >
                  <MessageCircle className="h-4 w-4" />
                  Contact support
                </a>
              </div>
            </motion.div>
          )}

          {/* Empty state */}
          {!order && !searching && !notFound && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mx-auto max-w-md rounded-3xl border border-dark-900/[0.06] bg-white p-8 text-center shadow-sm"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/how-v2/06-receive.png"
                alt="Track your delivery"
                className="mx-auto h-40 w-40 object-contain"
                loading="lazy"
              />
              <h2 className="mt-4 text-lg font-bold text-dark-900">Track your order</h2>
              <p className="mt-1 text-sm text-dark-900/50">
                Enter your order reference above to see real-time tracking updates —
                the same live timeline you see in the ChinaSuuq app.
              </p>
            </motion.div>
          )}
        </div>
      </main>
      <Footer />
      <WhatsAppFAB />
    </div>
  );
}
