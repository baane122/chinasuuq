// One typed description of every marketplace ChinaSuuq browses inside the
// WebView, so "which app did this come from" has a single answer instead of a
// host string compared in four places.
//
// Values are derived from the repo, not invented:
//   slugs / display names / host list  — src/lib/marketplaces.ts,
//                                        src/lib/constants.ts MARKETPLACES
//   base URLs                          — seed.sql `marketplaces.base_url` and
//                                        the `homeUrl`/`home` literals the
//                                        WebView actually loads
//   showsMoq                           — seed.sql `features.moq_required`
//   locales                            — src/i18n/en.json + so.json
//
// CAVEAT, STATED HONESTLY: no search endpoint is exercised anywhere in this
// repo — the browser screen opens each marketplace's home page and the
// customer searches in-page. The templates below are the public search paths
// for those sites and are UNVERIFIED until loaded in a WebView; `null` marks a
// marketplace whose search path we do not know at all, so callers fall back to
// the home page rather than landing on a 404.
//
// `chinasuuq` is deliberately absent: it is the app's own curated catalog, has
// no WebView host, and therefore has nothing to match a URL against.

import type { Locale } from "@/types";

export type MarketplaceSlug =
  | "1688"
  | "taobao"
  | "yiwugo"
  | "alibaba"
  | "chinagoods"
  | "jd"
  | "dollarstore";

export type Currency = "CNY" | "USD" | "SOS";

export interface MarketplaceDefinition {
  slug: MarketplaceSlug;
  /** Name shown to customers. */
  name: string;
  /** Store front the WebView loads. */
  baseUrl: string;
  /**
   * Registrable domains this marketplace appears under. Matching is
   * "hostname === host || hostname ends with '.' + host", which is what covers
   * the www./m./detail./s. variants seen in real browsing and pasted links.
   */
  hosts: readonly string[];
  /** Search results URL, "{query}" placeholder. null = path unknown. */
  searchUrlTemplate: string | null;
  /** Currency the marketplace quotes listing prices in. */
  currency: Currency;
  /**
   * exchange_rates(source_currency, target_currency) pair that converts
   * `currency` into the app's display currency. null = already USD.
   */
  rateKey: { from: Currency; to: Currency } | null;
  /** Whether a listing normally shows a minimum order quantity. */
  showsMoq: boolean;
  /** Locales ChinaSuuq can present this marketplace's chrome in. */
  locales: readonly Locale[];
}

const ALL_LOCALES: readonly Locale[] = ["en", "so"];
const CNY_TO_USD = { from: "CNY", to: "USD" } as const;

export const MARKETPLACE_REGISTRY: Record<MarketplaceSlug, MarketplaceDefinition> = {
  "1688": {
    slug: "1688",
    name: "1688",
    baseUrl: "https://m.1688.com",
    hosts: ["1688.com"],
    searchUrlTemplate: "https://s.1688.com/selloffer/offer_search.htm?keywords={query}",
    currency: "CNY",
    rateKey: CNY_TO_USD,
    showsMoq: true,
    locales: ALL_LOCALES,
  },
  taobao: {
    slug: "taobao",
    name: "Taobao",
    baseUrl: "https://m.taobao.com",
    hosts: ["taobao.com"],
    searchUrlTemplate: "https://s.taobao.com/search?q={query}",
    currency: "CNY",
    rateKey: CNY_TO_USD,
    // Retail: single-unit purchase is the point, so no MOQ line.
    showsMoq: false,
    locales: ALL_LOCALES,
  },
  yiwugo: {
    slug: "yiwugo",
    name: "YiwuGo",
    baseUrl: "https://www.yiwugo.com",
    hosts: ["yiwugo.com"],
    searchUrlTemplate: null,
    currency: "CNY",
    rateKey: CNY_TO_USD,
    showsMoq: true,
    locales: ALL_LOCALES,
  },
  alibaba: {
    slug: "alibaba",
    name: "Alibaba",
    baseUrl: "https://m.alibaba.com",
    hosts: ["alibaba.com"],
    searchUrlTemplate: "https://www.alibaba.com/trade/search?SearchText={query}",
    currency: "CNY",
    rateKey: CNY_TO_USD,
    showsMoq: true,
    locales: ALL_LOCALES,
  },
  chinagoods: {
    slug: "chinagoods",
    name: "ChinaGoods",
    baseUrl: "https://www.chinagoods.com",
    hosts: ["chinagoods.com"],
    searchUrlTemplate: null,
    currency: "CNY",
    rateKey: CNY_TO_USD,
    showsMoq: true,
    locales: ALL_LOCALES,
  },
  jd: {
    slug: "jd",
    name: "JD.com",
    baseUrl: "https://m.jd.com",
    hosts: ["jd.com"],
    searchUrlTemplate: "https://search.jd.com/Search?keyword={query}",
    currency: "CNY",
    rateKey: CNY_TO_USD,
    showsMoq: false,
    locales: ALL_LOCALES,
  },
  dollarstore: {
    slug: "dollarstore",
    name: "1$ Dollar Store",
    baseUrl: "https://www.huolangjun666.com/#/home",
    hosts: ["huolangjun666.com"],
    // Hash-routed SPA: no server-side search URL exists to build.
    searchUrlTemplate: null,
    // The only marketplace that quotes in USD, so no conversion applies.
    currency: "USD",
    rateKey: null,
    // No seed row for this one; its own copy is bulk/reseller-only.
    showsMoq: true,
    locales: ALL_LOCALES,
  },
};

export const MARKETPLACE_SLUGS = Object.keys(MARKETPLACE_REGISTRY) as MarketplaceSlug[];

/** Lowercase hostname of an absolute or bare URL, or null if unparseable. */
export function hostnameOf(url: string): string | null {
  let rest = (url || "").trim().toLowerCase();
  if (!rest) return null;
  const scheme = rest.indexOf("://");
  if (scheme >= 0) rest = rest.slice(scheme + 3);
  // A hash route can carry the host after '#/' with no scheme at all.
  else if (rest.startsWith("//")) rest = rest.slice(2);
  const end = rest.search(/[/?#]/);
  if (end >= 0) rest = rest.slice(0, end);
  const host = rest.split("@").pop()?.split(":")[0];
  return host && host.includes(".") ? host : null;
}

function entryForHost(host: string): MarketplaceDefinition | null {
  for (const slug of MARKETPLACE_SLUGS) {
    const entry = MARKETPLACE_REGISTRY[slug];
    for (const domain of entry.hosts) {
      if (host === domain || host.endsWith(`.${domain}`)) return entry;
    }
  }
  return null;
}

/** True when the URL's host belongs to a marketplace ChinaSuuq browses. */
export function isKnownHost(url: string): boolean {
  const host = hostnameOf(url);
  return host !== null && entryForHost(host) !== null;
}

/** The marketplace a URL came from, or null for an outside link. */
export function registryFor(url: string): MarketplaceDefinition | null {
  const host = hostnameOf(url);
  return host === null ? null : entryForHost(host);
}

/** Resolve a `Product.marketplace` / `marketplace_key` value to its entry. */
export function marketplaceBySlug(slug: string | null | undefined): MarketplaceDefinition | null {
  if (!slug) return null;
  const key = String(slug).toLowerCase();
  return (MARKETPLACE_SLUGS as string[]).includes(key)
    ? MARKETPLACE_REGISTRY[key as MarketplaceSlug]
    : null;
}

/**
 * Search results URL for a marketplace. Falls back to its home page when the
 * search path is unknown, so an unverified template can never strand the
 * customer on a 404 inside the WebView.
 */
export function searchUrlFor(slug: MarketplaceSlug, query: string): string {
  const entry = MARKETPLACE_REGISTRY[slug];
  const q = (query || "").trim();
  if (!entry.searchUrlTemplate || !q) return entry.baseUrl;
  return entry.searchUrlTemplate.replace("{query}", encodeURIComponent(q));
}
