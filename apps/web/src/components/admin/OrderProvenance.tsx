"use client";

import { useEffect, useState } from "react";
import { ExternalLink, ImageOff, PackageSearch } from "lucide-react";
import { getOrderItems } from "@/lib/admin/supabase-data";
import { cn, formatUSD } from "@/lib/utils";

/**
 * What every customer bought, and in which app.
 *
 * Reads order_items rows normalised from orders.items by
 * 202609240004_order_item_provenance.sql. Orders placed before that migration
 * have no recorded source, and this panel says so instead of guessing — the
 * previous behaviour inferred a marketplace from the customer's city.
 */

const KNOWN_LOGOS = new Set([
  "1688",
  "alibaba",
  "chinagoods",
  "dollarstore",
  "jd",
  "taobao",
  "yiwugo",
]);

function logoFor(key: string | null): string | null {
  const slug = (key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return KNOWN_LOGOS.has(slug) ? `/images/marketplaces/${slug}.webp` : null;
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Unit cost in USD. cost_price is authoritative; the mobile app records the CNY
 * unit price plus the rate it used, so that is the fallback. Neither means the
 * margin is genuinely unknown, and "—" is better than a invented number.
 */
function unitCostUsd(item: any): number | null {
  const cost = toNumber(item.cost_price);
  if (cost !== null) return cost;
  const cny = toNumber(item.unit_price_cny);
  const rate = toNumber(item.exchange_rate);
  if (cny !== null && rate && rate > 0) return cny / rate;
  return null;
}

const PIPELINE_STEPS = [
  { key: "is_sourced", label: "Sourced" },
  { key: "is_purchased", label: "Purchased" },
  { key: "is_received", label: "Received" },
  { key: "is_inspected", label: "Inspected" },
] as const;

export default function OrderProvenance({ orderId }: { orderId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getOrderItems(orderId).then((res) => {
      if (cancelled) return;
      if (res.ok) setItems(res.items);
      else setError(res.error || "Could not load line items");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const apps = distinctApps(items);

  return (
    <div className="space-y-3 rounded-2xl bg-white border border-dark-100/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-dark-900/50 uppercase tracking-wider">
            Items &amp; Source
          </p>
          <p className="mt-0.5 text-[11px] text-dark-900/40">
            {apps.length
              ? `Purchased in ${apps.join(", ")}`
              : "Which marketplace each line was bought in"}
          </p>
        </div>
        {items.length > 0 && (
          <span className="shrink-0 rounded-full bg-brand-500/10 px-2 py-0.5 text-[11px] font-bold text-brand-600">
            {items.length} {items.length === 1 ? "line" : "lines"}
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-dark-50" />
          ))}
        </div>
      ) : error ? (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-[11px] text-rose-600">
          {error}
        </p>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl bg-dark-50 px-3 py-4 text-xs text-dark-900/50">
          <PackageSearch className="h-4 w-4 shrink-0" />
          No line items were recorded for this order.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const unit = toNumber(item.unit_price);
            const cost = unitCostUsd(item);
            const margin = unit !== null && cost !== null ? unit - cost : null;
            const marginPct =
              margin !== null && unit ? (margin / unit) * 100 : null;
            const logo = logoFor(item.marketplace_key);
            const unknownApp =
              !item.marketplace_key || item.marketplace_key === "unknown";
            const moq = toNumber(item.moq_at_purchase);

            return (
              <li
                key={item.id}
                className="rounded-xl border border-dark-100/60 bg-dark-50/40 p-3"
              >
                <div className="flex gap-3">
                  {logo ? (
                    <img
                      src={logo}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-lg border border-dark-100 bg-white object-contain p-1"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dark-100 bg-white text-dark-900/30">
                      <ImageOff className="h-4 w-4" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-dark-900">
                      {item.product_name || "Unnamed item"}
                    </p>
                    {item.variant_name && (
                      <p className="text-[11px] text-dark-900/40">
                        {item.variant_name}
                      </p>
                    )}

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          unknownApp
                            ? "bg-dark-100 text-dark-900/50"
                            : "bg-brand-500/10 text-brand-700"
                        )}
                        title={
                          unknownApp
                            ? "This order predates per-line provenance, so the source app was never recorded."
                            : `Recorded source: ${item.marketplace_name}`
                        }
                      >
                        {unknownApp ? "Source unknown" : item.marketplace_name}
                      </span>

                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-dark-900/60 ring-1 ring-dark-100">
                        {item.quantity || 1} × {formatUSD(unit ?? 0)}
                      </span>

                      {moq !== null && (
                        <span
                          className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning"
                          title={`Minimum order quantity shown when this was added: ${moq}`}
                        >
                          MOQ {moq}
                        </span>
                      )}

                      {toNumber(item.unit_price_cny) !== null && (
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-dark-900/60 ring-1 ring-dark-100">
                          ¥{toNumber(item.unit_price_cny)}
                          {toNumber(item.exchange_rate)
                            ? ` @ ${toNumber(item.exchange_rate)}`
                            : ""}
                        </span>
                      )}

                      {item.source_url && (
                        <a
                          href={item.source_url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-brand-600 ring-1 ring-dark-100 hover:underline"
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                          Listing
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-dark-900">
                      {formatUSD(toNumber(item.total_price) ?? 0)}
                    </p>
                    <p
                      className={cn(
                        "mt-0.5 text-[11px] font-semibold tabular-nums",
                        margin === null
                          ? "text-dark-900/35"
                          : margin >= 0
                            ? "text-success"
                            : "text-error"
                      )}
                      title={
                        margin === null
                          ? "No supplier cost recorded for this line"
                          : `Sell ${formatUSD(unit ?? 0)} − cost ${formatUSD(cost ?? 0)} per unit`
                      }
                    >
                      {margin === null
                        ? "margin —"
                        : `${margin >= 0 ? "+" : "−"}${formatUSD(Math.abs(margin))}${
                            marginPct !== null ? ` · ${marginPct.toFixed(0)}%` : ""
                          }`}
                    </p>
                  </div>
                </div>

                <div className="mt-2.5 flex items-center gap-1.5 border-t border-dark-100/60 pt-2">
                  {PIPELINE_STEPS.map((step) => {
                    const done = Boolean(item[step.key]);
                    return (
                      <span
                        key={step.key}
                        title={`${step.label}: ${done ? "done" : "not yet"}`}
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                          done
                            ? "bg-success/10 text-success"
                            : "bg-dark-100 text-dark-900/35"
                        )}
                      >
                        {step.label}
                      </span>
                    );
                  })}
                  {item.origin === "orders_jsonb" && (
                    <span
                      className="ml-auto text-[10px] text-dark-900/35"
                      title="Normalised from the order's items JSON by the provenance trigger."
                    >
                      from order JSON
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function distinctApps(items: any[]): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    const key = item.marketplace_key;
    if (key && key !== "unknown") seen.add(String(item.marketplace_name || key));
  }
  return [...seen];
}
