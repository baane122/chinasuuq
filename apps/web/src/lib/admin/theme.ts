/**
 * Chart palette for Mission Control (dashboard donut / marketplace bars).
 *
 * These used to be raw hex literals scattered through
 * `(protected)/page.tsx` (STATUS_COLORS, MARKETPLACE_STYLE). SVG chart
 * primitives (stroke/fill on <circle>, <div> gradient stops) can't take a
 * Tailwind utility class, so the single source of truth for chart colour lives
 * here instead. Every value maps to a token in globals.css @theme so a future
 * re-brand is a one-line change rather than a hex hunt.
 */

// Mirror of the @theme tokens (globals.css). Keep in sync.
export const chartPalette = {
  brand: "#FF5A0A", // --color-brand-500
  success: "#12B76A", // --color-success
  warning: "#F79009", // --color-warning
  info: "#2970FF", // --color-info
  neutral: "#A8A29E", // --color-dark-300 (unrecognised / fallback)
  sky: "#0EA5E9",
  violet: "#8B5CF6",
  blue: "#3B82F6",
  orange: "#F97316",
} as const;

/** Donut/bar colour per normalised (mobile) order status. */
export const STATUS_COLORS: Record<string, string> = {
  pending: chartPalette.warning,
  confirmed: chartPalette.blue,
  purchasing: chartPalette.blue,
  purchased: chartPalette.success,
  warehouse: chartPalette.violet,
  inspection: chartPalette.violet,
  consolidated: chartPalette.violet,
  shipped: chartPalette.sky,
  in_transit: chartPalette.sky,
  customs: chartPalette.orange,
  out_for_delivery: chartPalette.brand,
  delivered: chartPalette.success,
  cancelled: chartPalette.neutral,
};

/** Per-marketplace chart styling (icon stays a glyph, colour maps to a token). */
export const MARKETPLACE_STYLE: Record<string, { color: string; icon: string }> = {
  "1688": { color: chartPalette.brand, icon: "🏪" },
  taobao: { color: chartPalette.orange, icon: "🛒" },
  yiwugo: { color: chartPalette.info, icon: "📦" },
  chinagoods: { color: chartPalette.brand, icon: "🏪" },
  dollarstore: { color: chartPalette.orange, icon: "🛒" },
  unattributed: { color: chartPalette.neutral, icon: "📊" },
};

export function marketplaceStyle(name: string) {
  return (
    MARKETPLACE_STYLE[name.trim().toLowerCase().replace(/\s+/g, "")] || {
      color: chartPalette.neutral,
      icon: "📊",
    }
  );
}
