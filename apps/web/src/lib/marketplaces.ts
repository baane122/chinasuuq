// ─────────────────────────────────────────────────────────────────────────────
// ChinaSuuq marketplace catalog — WEB mirror of the mobile catalog
// (apps/mobile/src/lib/marketplaces.ts). Keep ids, brandColors and homeUrls
// in sync with mobile so the pre-login web pages, the admin dashboard and the
// app all present the same six markets.
// ─────────────────────────────────────────────────────────────────────────────

export interface MarketplaceInfo {
  id: string;
  name: string;
  displayName: string;
  tagline: string;
  description: string;
  stat: string;
  icon: string; // /markets/*.png — same artwork as the mobile app
  brandColor: string;
  shortMark: string;
  homeUrl: string;
  loginWalled: boolean;
  highlights: string[];
  bestFor: string;
}

export const MARKETPLACE_CATALOG: MarketplaceInfo[] = [
  {
    id: "1688",
    name: "1688",
    displayName: "1688",
    tagline: "China's #1 wholesale & factories",
    description:
      "Factory-direct wholesale marketplace — the source behind most Chinese online stores. Best prices when buying in bulk.",
    stat: "50M+ items",
    icon: "/markets/1688.webp",
    brandColor: "#FF5000",
    shortMark: "1688",
    homeUrl: "https://m.1688.com",
    loginWalled: false,
    highlights: ["Factory-direct pricing", "Bulk & MOQ friendly", "Wideest supplier network"],
    bestFor: "Resellers and bulk buyers",
  },
  {
    id: "taobao",
    name: "Taobao",
    displayName: "Taobao 淘宝",
    tagline: "Retail giant — widest selection",
    description:
      "The largest consumer marketplace in China. Trending gadgets, fashion, home goods — single items welcome.",
    stat: "100M+ items",
    icon: "/markets/taobao.webp",
    brandColor: "#FF6A00",
    shortMark: "淘",
    homeUrl: "https://m.taobao.com",
    loginWalled: true,
    highlights: ["Huge retail variety", "Trending consumer goods", "Single-item friendly"],
    bestFor: "Personal shopping and unique finds",
  },
  {
    id: "yiwugo",
    name: "YiwuGo",
    displayName: "YiwuGo 义乌",
    tagline: "Yiwu wholesale market online",
    description:
      "The world's biggest small-commodities market, online. Toys, accessories, hardware, party supplies and more.",
    stat: "2M+ SKUs",
    icon: "/markets/yiwugo.webp",
    brandColor: "#E23744",
    shortMark: "义",
    homeUrl: "https://www.yiwugo.com",
    loginWalled: false,
    highlights: ["Small-commodity king", "Very low unit prices", "Mixed-carton orders"],
    bestFor: "Shop owners stocking variety",
  },
  {
    id: "chinagoods",
    name: "Chinagoods",
    displayName: "Chinagoods",
    tagline: "Official Yiwu market platform",
    description:
      "The official online platform of the Yiwu market — direct-from-market stalls with digitized inventory.",
    stat: "3M+ goods",
    icon: "/markets/chinagoods.webp",
    brandColor: "#00A0E9",
    shortMark: "CG",
    homeUrl: "https://www.chinagoods.com",
    loginWalled: false,
    highlights: ["Official Yiwu platform", "Stall-direct sourcing", "Category deep catalog"],
    bestFor: "General merchandise restocking",
  },
  {
    id: "dollarstore",
    name: "1$ Dollar Store",
    displayName: "1$ Dollar Store",
    tagline: "Everything $1 — bulk bargains",
    description:
      "One-dollar wholesale store, curated for resellers. Fixed $1 pricing across thousands of everyday items, ready for bulk ordering and consolidation.",
    stat: "10K+ items",
    icon: "/markets/dollarstore.webp",
    brandColor: "#FF5A0A",
    shortMark: "$1",
    homeUrl: "https://www.huolangjun666.com/#/home",
    loginWalled: false,
    highlights: ["Everything $1", "Reseller bulk bargains", "Curated for Somalia"],
    bestFor: "Resellers hunting fixed-price bulk stock",
  },
];

export const MARKETPLACE_IDS = MARKETPLACE_CATALOG.map((m) => m.id);

export function getMarketplace(id: string): MarketplaceInfo | undefined {
  return MARKETPLACE_CATALOG.find((m) => m.id === id);
}

// Live row from the Supabase `marketplaces` table (managed by the admin
// dashboard). Rows update copy, urls and active state; the table stores
// description_en/so + base_url only — tagline and stat stay catalog editorial.
export interface LiveMarketplace {
  id: string;
  name: string;
  slug: string | null;
  marketplace_type: string;
  logo_url: string | null;
  description_en: string | null;
  description_so: string | null;
  base_url: string;
  is_active: boolean | null;
}

/** Merge live admin-managed rows over the static catalog. Rows update copy,
 *  urls and active state; catalog keeps artwork and editorial content. */
export function mergeMarketplaces(live: LiveMarketplace[] | null | undefined): MarketplaceInfo[] {
  if (!live || live.length === 0) return MARKETPLACE_CATALOG;
  const byType = new Map(live.map((r) => [r.marketplace_type, r]));
  const merged = MARKETPLACE_CATALOG.map((cat) => {
    const row = byType.get(cat.id);
    if (!row) return cat;
    return {
      ...cat,
      displayName: row.name || cat.displayName,
      homeUrl: row.base_url || cat.homeUrl,
    };
  });
  // Admin-added marketplaces without a catalog entry get a generic card. The DB
  // records no tagline/stat/highlights for them, so the card says as little as
  // possible instead of inventing any.
  const known = new Set(MARKETPLACE_IDS);
  const extra = live
    .filter((r) => r.is_active !== false && !known.has(r.marketplace_type))
    .map((r) => ({
      id: r.marketplace_type,
      name: r.name,
      displayName: r.name,
      tagline: "New marketplace",
      description:
        r.description_en ||
        r.description_so ||
        "A new sourcing marketplace added by the ChinaSuuq team. Contact us on WhatsApp to order from it.",
      stat: "New",
      icon: r.logo_url || "/images/marketplaces/chinasuuq.webp",
      brandColor: "#FF5A0A",
      shortMark: r.name.slice(0, 2).toUpperCase(),
      homeUrl: r.base_url,
      loginWalled: false,
      highlights: [],
      bestFor: "Ask us for details",
    }));
  return [...merged, ...extra];
}
