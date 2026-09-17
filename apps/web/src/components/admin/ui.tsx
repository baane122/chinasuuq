"use client";

/**
 * ChinaSuuq Mission Control — shared design system.
 *
 * Every admin page composes these primitives so the whole dashboard feels
 * like one product. Brand colors come from globals.css @theme (Tailwind v4)
 * — never hardcode hex values here.
 */

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Generated illustrations (TT Image 2.5) ─────────────────────── */
export const EMPTY_IMAGES = {
  orders: "/admin/empty_orders.png",
  products: "/admin/empty_products.png",
  customers: "/admin/empty_customers.png",
  shipments: "/admin/empty_shipments.png",
  sourcing: "/admin/empty_sourcing.png",
  payments: "/admin/empty_payments.png",
  generic: "/admin/empty_generic.png",
} as const;

export type EmptyImageKey = keyof typeof EMPTY_IMAGES;

/* ─── PageHeader ─────────────────────────────────────────────────── */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-dark-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-dark-900/50">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </motion.div>
  );
}

/* ─── StatCard ───────────────────────────────────────────────────── */
const TONES: Record<string, { chip: string; text: string }> = {
  brand: { chip: "bg-brand-50 text-brand-600", text: "text-brand-600" },
  success: { chip: "bg-emerald-50 text-emerald-600", text: "text-emerald-600" },
  info: { chip: "bg-sky-50 text-sky-600", text: "text-sky-600" },
  warning: { chip: "bg-amber-50 text-amber-600", text: "text-amber-600" },
  error: { chip: "bg-rose-50 text-rose-600", text: "text-rose-600" },
  violet: { chip: "bg-violet-50 text-violet-600", text: "text-violet-600" },
};

export function StatCard({
  label,
  value,
  delta,
  deltaLabel,
  icon: Icon,
  tone = "brand",
  delay = 0,
  className,
}: {
  label: string;
  value: string | number;
  delta?: number;
  deltaLabel?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: keyof typeof TONES;
  delay?: number;
  className?: string;
}) {
  const t = TONES[tone] ?? TONES.brand;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.04, duration: 0.35, ease: "easeOut" }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-dark-900/[0.06] bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
        className
      )}
    >
      {/* accent edge */}
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-brand-500/0 via-brand-500/60 to-brand-500/0 opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-dark-900/40">
            {label}
          </p>
          <p className="mt-1.5 truncate text-[26px] font-bold leading-none tracking-tight text-dark-900">
            {value}
          </p>
          {delta !== undefined && (
            <div className="mt-2 flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                  delta >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                )}
              >
                {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}%
              </span>
              {deltaLabel && <span className="text-[11px] text-dark-900/40">{deltaLabel}</span>}
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", t.chip)}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ─── SectionCard ────────────────────────────────────────────────── */
export function SectionCard({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-dark-900/[0.06] bg-white shadow-sm", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dark-900/[0.06] px-5 py-4">
          <div>
            {title && <h2 className="text-[15px] font-bold text-dark-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-dark-900/45">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </div>
  );
}

/* ─── SearchInput ────────────────────────────────────────────────── */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-900/30" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="admin-input pl-10"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-dark-900/30 transition-colors hover:bg-dark-900/5 hover:text-dark-900/60"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ─── FilterChips ────────────────────────────────────────────────── */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all active:scale-[0.97]",
              active
                ? "border-brand-500 bg-brand-500 text-white shadow-sm shadow-brand-500/25"
                : "border-dark-900/10 bg-white text-dark-900/60 hover:border-dark-900/25 hover:text-dark-900"
            )}
          >
            {opt.label}
            {opt.count !== undefined && opt.count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-px text-[10px] font-bold",
                  active ? "bg-white/20 text-white" : "bg-dark-900/[0.06] text-dark-900/50"
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─── EmptyState ─────────────────────────────────────────────────── */
export function EmptyState({
  image = EMPTY_IMAGES.generic,
  title,
  subtitle,
  action,
  compact,
}: {
  image?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 text-center", compact ? "py-8" : "py-14")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image}
        alt=""
        className={cn("select-none", compact ? "h-24 w-24" : "h-40 w-40")}
        draggable={false}
      />
      <h3 className="mt-4 text-[15px] font-bold text-dark-900">{title}</h3>
      {subtitle && <p className="mt-1 max-w-sm text-sm text-dark-900/45">{subtitle}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ─── ErrorState ─────────────────────────────────────────────────── */
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-[15px] font-bold text-dark-900">Something went wrong</h3>
      <p className="mt-1 max-w-sm text-sm text-dark-900/45">
        {message || "We couldn't load this data. Check your connection and try again."}
      </p>
      {onRetry && (
        <button onClick={onRetry} className="admin-btn-outline mt-5">
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      )}
    </div>
  );
}

/* ─── Skeletons ──────────────────────────────────────────────────── */
export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-dark-900/[0.05]">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-5 py-4">
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonBlock
              key={c}
              className={cn("h-4", c === 0 ? "w-1/4" : c === cols - 1 ? "ml-auto w-16" : "w-1/5")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─── TableShell ───────────────────────────────────────────────────
 * Wraps a page's table area with loading / error / empty handling.
 * children render only when isLoading=false, error=null, hasData=true.
 */
export function TableShell({
  isLoading,
  error,
  hasData,
  filtered = true,
  emptyImage,
  emptyTitle,
  emptySubtitle,
  emptyAction,
  errorRetry,
  children,
}: {
  isLoading?: boolean;
  error?: string | null;
  hasData: boolean;
  /** false → show the big illustration; true → show a compact "no matches" hint */
  filtered?: boolean;
  emptyImage?: string;
  emptyTitle: string;
  emptySubtitle?: string;
  emptyAction?: React.ReactNode;
  errorRetry?: () => void;
  children: React.ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-dark-900/[0.06] bg-white shadow-sm">
        <SkeletonTable />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-dark-900/[0.06] bg-white shadow-sm">
        <ErrorState message={error} onRetry={errorRetry} />
      </div>
    );
  }
  if (!hasData) {
    return (
      <div className="rounded-2xl border border-dark-900/[0.06] bg-white shadow-sm">
        <EmptyState
          image={filtered ? EMPTY_IMAGES.generic : emptyImage}
          compact={filtered}
          title={filtered ? "No results match your filters" : emptyTitle}
          subtitle={filtered ? "Try clearing the search or choosing a different filter." : emptySubtitle}
          action={filtered ? undefined : emptyAction}
        />
      </div>
    );
  }
  return <>{children}</>;
}

/* ─── SidePanel (form drawer) ────────────────────────────────────── */
export function SidePanel({
  open,
  onClose,
  title,
  subtitle,
  footer,
  children,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-dark-950/40 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className={cn(
              "fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-warm-50 shadow-2xl",
              width
            )}
            role="dialog"
            aria-modal="true"
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-dark-900/[0.06] bg-white px-6 py-4">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-dark-900">{title}</h2>
                {subtitle && <p className="mt-0.5 text-xs text-dark-900/45">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="rounded-xl p-2 text-dark-900/40 transition-colors hover:bg-dark-900/5 hover:text-dark-900"
                aria-label="Close panel"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

            {/* Footer */}
            {footer && (
              <div className="border-t border-dark-900/[0.06] bg-white px-6 py-4">{footer}</div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/* ─── Field (label + input wrapper for forms) ────────────────────── */
export function Field({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div className="mb-4">
      <label className="admin-label">
        {label}
        {required && <span className="ml-0.5 text-brand-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-dark-900/40">{hint}</p>}
    </div>
  );
}

/* ─── PageGrid (responsive stat grid) ────────────────────────────── */
export function PageGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {children}
    </div>
  );
}
