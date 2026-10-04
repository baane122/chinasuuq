"use client";

/**
 * Operational Queue — Mission Control.
 *
 * A single triage list of the things that need a human decision right now:
 * orders waiting on payment confirmation and sourcing requests blocked on a
 * supplier choice. Data is queried directly from orders + sourcing_requests
 * tables (the old edge function was removed; this page produces the same view).
 *
 * Approve writes to the underlying row through the SAME helpers the neighbouring
 * Orders/Sourcing screens use, so the item disappears from the queue on the
 * next reload.
 *
 * HONEST LIMITS
 *  - Dismiss is client-side only: no persistence, items reappear after reload.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ClipboardList,
  CreditCard,
  RefreshCw,
  Check,
  X,
  ArrowRight,
  Loader2,
} from "lucide-react";
import {
  PageHeader,
  StatCard,
  PageGrid,
  SectionCard,
  EmptyState,
  ErrorState,
  SkeletonBlock,
  EMPTY_IMAGES,
} from "@/components/admin/ui";
import { useToast } from "@/components/admin/Toast";
import { updateOrder } from "@/lib/admin/supabase-data";

interface QueueItem {
  id: string;
  kind: "order_confirmation" | "purchase_blocked";
  priority: "high" | "normal" | "low";
  status: string;
  problem: string;
  why: string;
  evidence: string[];
  recommendedAction: string;
  orderId?: string;
  createdAt?: string;
}

export default function OperationalQueuePage() {
  const { success, error: toastError } = useToast();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: sess } = await supabase.auth.getSession();
    if (!sess?.session) {
      setError("Your admin session has expired. Sign in again and reopen this page.");
      setLoading(false);
      return;
    }
    try {
      // Orders needing payment confirmation
      const { data: pendingOrders, error: ordersErr } = await supabase
        .from("orders")
        .select("id, reference, status, payment_status, total_usd, created_at, customer_name")
        .in("status", ["pending", "confirmed"])
        .in("payment_status", ["pending"])
        .order("created_at", { ascending: false })
        .limit(50);

      // Sourcing requests awaiting decision
      const { data: pendingSourcing, error: srcErr } = await supabase
        .from("sourcing_requests")
        .select("id, reference, status, created_at, notes")
        .in("status", ["awaiting_supplier", "pending_approval"])
        .order("created_at", { ascending: false })
        .limit(50);

      const err = ordersErr || srcErr;
      if (err) {
        setError(err.message || "Could not load the operational queue.");
        setItems([]);
      } else {
        const queueItems: QueueItem[] = [
          ...(pendingOrders || []).map((o: any) => ({
            id: o.id,
            kind: "order_confirmation" as const,
            priority: "high" as const,
            status: o.payment_status,
            problem: `Order ${o.reference} — payment pending`,
            why: `Customer ${o.customer_name || "Guest"} — $${Number(o.total_usd || 0).toFixed(2)} unpaid`,
            evidence: [`admin_orders_view:${o.id}`],
            recommendedAction: "Confirm payment receipt and update order status",
            orderId: o.id,
            createdAt: o.created_at,
          })),
          ...(pendingSourcing || []).map((s: any) => ({
            id: s.id,
            kind: "purchase_blocked" as const,
            priority: "normal" as const,
            status: s.status,
            problem: `Sourcing request ${s.reference} — ${s.status}`,
            why: s.notes || "Awaiting supplier decision",
            evidence: [`sourcing_requests:${s.id}`],
            recommendedAction: "Review and approve or reject the sourcing request",
            createdAt: s.created_at,
          })),
        ];
        setItems(queueItems);
        setGeneratedAt(new Date().toISOString());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const approve = useCallback(
    async (item: QueueItem) => {
      if (item.kind !== "order_confirmation" || !item.orderId) return;
      setBusyId(item.id);
      const res = await updateOrder(item.orderId, { status: "confirmed" });
      setBusyId(null);
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        success("Order confirmed — it will drop off the queue on the next refresh.");
      } else {
        toastError(res.error || "Failed to confirm the order.");
      }
    },
    [success, toastError]
  );

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  }, []);

  const visible = items.filter((i) => !dismissed.has(i.id));
  const highCount = visible.filter((i) => i.priority === "high").length;
  const orderCount = visible.filter((i) => i.kind === "order_confirmation").length;
  const sourcingCount = visible.filter((i) => i.kind === "purchase_blocked").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operational Queue"
        subtitle="Every item that needs a staff decision right now — derived live from orders and sourcing"
        actions={
          <button onClick={load} disabled={loading} className="admin-btn-outline">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        }
      />

      <PageGrid>
        <StatCard label="Open items" value={visible.length} icon={AlertTriangle} tone="brand" delay={0} />
        <StatCard label="High priority" value={highCount} icon={AlertTriangle} tone="error" delay={1} />
        <StatCard label="Awaiting confirmation" value={orderCount} icon={CreditCard} tone="warning" delay={2} />
        <StatCard label="Sourcing decisions" value={sourcingCount} icon={ClipboardList} tone="info" delay={3} />
      </PageGrid>

      {generatedAt && !loading && !error && (
        <p className="text-xs text-dark-900/40 dark:text-neutral-500">
          Snapshot generated {new Date(generatedAt).toLocaleString()} · reloads fresh on every refresh.
        </p>
      )}

      <SectionCard
        title="Items needing attention"
        subtitle={
          dismissed.size > 0
            ? `${dismissed.size} dismissed locally — items reappear after reload.`
            : "Approve writes use the same path as the Orders/Sourcing screens."
        }
      >
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-[92px] w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : visible.length === 0 ? (
          <EmptyState
            image={EMPTY_IMAGES.generic}
            compact={false}
            title="Nothing needs your attention"
            subtitle="No orders awaiting confirmation, no sourcing requests blocked."
          />
        ) : (
          <div className="space-y-3">
            {visible.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-dark-900/[0.06] bg-warm-50 p-4 transition-colors hover:border-dark-900/10 dark:border-white/[0.08] dark:bg-dark-950"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600">
                      {item.kind === "order_confirmation" ? (
                        <CreditCard className="h-4.5 w-4.5" />
                      ) : (
                        <ClipboardList className="h-4.5 w-4.5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-dark-900 dark:text-neutral-100">{item.problem}</p>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                            item.priority === "high"
                              ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30"
                              : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30"
                          )}
                        >
                          {item.priority}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-dark-900/55 dark:text-neutral-400">{item.why}</p>
                      <p className="mt-1.5 text-xs text-dark-900/45 dark:text-neutral-500">
                        <span className="font-semibold">Suggested:</span> {item.recommendedAction}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.kind === "order_confirmation" && item.orderId && (
                      <button
                        onClick={() => approve(item)}
                        disabled={busyId === item.id}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                      >
                        {busyId === item.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        Approve
                      </button>
                    )}
                    <Link
                      href={
                        item.kind === "order_confirmation"
                          ? `/admin/orders?open=${item.orderId}`
                          : `/admin/sourcing?status=all`
                      }
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-dark-900/10 bg-white px-3 text-xs font-medium text-dark-900/70 transition hover:bg-dark-50 dark:border-white/10 dark:bg-dark-900 dark:text-neutral-300 dark:hover:bg-white/5"
                    >
                      Open <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    <button
                      onClick={() => dismiss(item.id)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-dark-900/40 transition hover:bg-dark-900/5 hover:text-dark-900 dark:text-neutral-500 dark:hover:bg-white/5"
                      title="Dismiss for this session"
                      aria-label="Dismiss"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
