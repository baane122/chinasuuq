"use client";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  // Order statuses
  draft: "bg-gray-100 text-gray-700",
  awaiting_payment: "bg-amber-50 text-amber-700 border-amber-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  purchasing: "bg-blue-50 text-blue-700 border-blue-200",
  in_warehouse: "bg-violet-50 text-violet-700 border-violet-200",
  in_transit: "bg-sky-50 text-sky-700 border-sky-200",
  customs: "bg-orange-50 text-orange-700 border-orange-200",
  out_for_delivery: "bg-brand-50 text-brand-700 border-brand-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
  refunded: "bg-rose-50 text-rose-700 border-rose-200",
  // Payment statuses
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-rose-50 text-rose-700 border-rose-200",
  // Quote statuses
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  declined: "bg-rose-50 text-rose-700 border-rose-200",
  expired: "bg-gray-100 text-gray-500 border-gray-200",
  // Warehouse statuses
  expected: "bg-blue-50 text-blue-700 border-blue-200",
  received: "bg-violet-50 text-violet-700 border-violet-200",
  inspecting: "bg-amber-50 text-amber-700 border-amber-200",
  consolidated: "bg-sky-50 text-sky-700 border-sky-200",
  ready: "bg-emerald-50 text-emerald-700 border-emerald-200",
  shipped: "bg-sky-50 text-sky-700 border-sky-200",
  // Sourcing
  open: "bg-amber-50 text-amber-700 border-amber-200",
  quoted: "bg-blue-50 text-blue-700 border-blue-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  fulfilled: "bg-emerald-50 text-emerald-700 border-emerald-200",
  // Priority
  low: "bg-gray-100 text-gray-600 border-gray-200",
  normal: "bg-sky-50 text-sky-700 border-sky-200",
  high: "bg-amber-50 text-amber-700 border-amber-200",
  urgent: "bg-rose-50 text-rose-700 border-rose-200",
  // General
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  inactive: "bg-gray-100 text-gray-500 border-gray-200",
  individual: "bg-sky-50 text-sky-700 border-sky-200",
  business: "bg-violet-50 text-violet-700 border-violet-200",
  // Shipping modes
  air: "bg-brand-50 text-brand-700 border-brand-200",
  sea: "bg-blue-50 text-blue-700 border-blue-200",
  land: "bg-amber-50 text-amber-700 border-amber-200",
  // Roles
  super_admin: "bg-rose-50 text-rose-700 border-rose-200",
  admin: "bg-brand-50 text-brand-700 border-brand-200",
  ops: "bg-sky-50 text-sky-700 border-sky-200",
  finance: "bg-emerald-50 text-emerald-700 border-emerald-200",
  support: "bg-violet-50 text-violet-700 border-violet-200",
  warehouse: "bg-amber-50 text-amber-700 border-amber-200",
};

const LABEL_MAP: Record<string, string> = {
  awaiting_payment: "Awaiting Payment",
  in_warehouse: "In Warehouse",
  out_for_delivery: "Out for Delivery",
  in_transit: "In Transit",
  super_admin: "Super Admin",
  bank_transfer: "Bank Transfer",
  premier_wallet: "Premier Wallet",
  usdt: "USDT",
  individual: "Individual",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const label = LABEL_MAP[status] || status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const style = STATUS_STYLES[status] || "bg-gray-100 text-gray-600";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize", style, className)}>
      {label}
    </span>
  );
}
