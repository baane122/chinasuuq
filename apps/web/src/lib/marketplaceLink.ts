/**
 * Marketplace product-link parsing for the admin importer.
 *
 * WHY: the Products console's AI Extract box sent raw pasted text to a model and
 * hoped. A pasted 1688/Taobao/YiwuGo/ChinaGoods detail URL is structured data —
 * the platform and the listing id are IN the URL — so this module reads them
 * deterministically instead of paying a model to guess, and gives the Import
 * Studio something honest to validate before any request leaves the browser.
 *
 * This is ONLY the parser. Fetching the page, extracting images, translating and
 * writing the product all happen in the `product-import` edge function, which
 * re-validates the host against its own allowlist: a parsed hint from here is
 * never trusted server-side (that is what keeps a crafted URL out of the SSRF
 * path).
 *
 * The mobile app has its own copy in apps/mobile/src/lib/productLink.ts, which
 * additionally classifies links for the in-app browser. The rules agree; the
 * platform ids here are exactly `MARKETPLACE_CODES` in lib/admin/productWrites.
 */

export type ImportPlatform = "1688" | "taobao" | "tmall" | "yiwugo" | "chinagoods" | "pinduoduo" | "alibaba";

/** Platforms the importer can write to `source_products.marketplace`. */
export const IMPORTABLE_PLATFORMS: readonly ImportPlatform[] = ["1688", "taobao", "tmall", "yiwugo", "chinagoods"];

export interface ParsedMarketplaceLink {
  /** The raw URL the operator pasted (trimmed, protocol added when missing). */
  url: string;
  platform: ImportPlatform;
  /** Human label ("1688", "Taobao", …). */
  label: string;
  /** Listing id on that platform, when the URL carries one. */
  itemId: string | null;
  /** The marketplace column this product should be stored under; null when the
   *  platform has no column in the live table (pinduoduo/alibaba). */
  marketplace: "1688" | "taobao" | "yiwugo" | "chinagoods" | null;
  /** A clean detail URL when the platform's shape is known, else null — the
   *  importer then keeps whatever the page redirected to. Never invented. */
  canonicalUrl: string | null;
}

const LABELS: Record<ImportPlatform, string> = {
  "1688": "1688",
  taobao: "Taobao",
  tmall: "Tmall",
  yiwugo: "YiwuGo",
  chinagoods: "ChinaGoods",
  pinduoduo: "Pinduoduo",
  alibaba: "Alibaba",
};

/** Host suffix → platform. Suffix matching keeps m./mobile./www. working. */
const HOSTS: Array<{ suffix: string; platform: ImportPlatform }> = [
  { suffix: "1688.com", platform: "1688" },
  { suffix: "taobao.com", platform: "taobao" },
  { suffix: "tmall.com", platform: "tmall" },
  { suffix: "tmall.hk", platform: "tmall" },
  { suffix: "yiwugo.com", platform: "yiwugo" },
  { suffix: "chinagoods.com", platform: "chinagoods" },
  { suffix: "yangkeduo.com", platform: "pinduoduo" },
  { suffix: "pinduoduo.com", platform: "pinduoduo" },
  { suffix: "alibaba.com", platform: "alibaba" },
];

const ID_QUERY_RE = /[?&#](?:offerId|goods_id|goodsId|productId|itemId|itemid|item_id|id)=([0-9]{5,20})/i;
const ID_PATH_RES: RegExp[] = [
  /\/offer\/([0-9]{5,20})\.html/i,                       // detail.1688.com/offer/…
  /\/product\/detail\/([0-9]{5,20})\.html/i,             // yiwugo detail
  // chinagoods serves both /product-detail/<id>.html and the two-segment
  // /product-detail/<slug>/<id>.html — one optional segment covers both.
  /\/product-detail\/(?:[^/]*\/)?[^/]*?([0-9]{9,20})\.html/i,
  /\/a\/([0-9]{9,20})\.html/i,
  /(?:^|[/?&])goods[_-]?id=([0-9]{5,20})/i,
  /\/goods\/([0-9]{5,20})\.html/i,
  /\/item\/([0-9]{5,20})/i,
];

/** Add https:// when a bare host was pasted, and drop wrapping punctuation. */
export function normalizePastedUrl(raw: string): string {
  let s = (raw ?? "").trim();
  s = s.replace(/^[<("'《]+/, "").replace(/[>)"'》。，,]+$/, "");
  s = s.replace(/^[a-z]+:\/\//i, (m) => m.toLowerCase());
  if (!/^https?:\/\//i.test(s)) s = `https://${s.replace(/^\/+/, "")}`;
  return s;
}

function hostOf(url: string): string {
  const withoutProto = url.replace(/^[a-z]+:\/\//i, "").split(/[/?#]/)[0] ?? "";
  return withoutProto.toLowerCase().replace(/:\d+$/, "");
}

function platformForHost(host: string): { suffix: string; platform: ImportPlatform } | null {
  for (const entry of HOSTS) {
    if (host === entry.suffix || host.endsWith(`.${entry.suffix}`)) return entry;
  }
  return null;
}

function canonicalFor(platform: ImportPlatform, itemId: string | null): string | null {
  if (!itemId) return null;
  switch (platform) {
    case "1688":
      return `https://detail.1688.com/offer/${itemId}.html`;
    case "taobao":
      return `https://item.taobao.com/item.htm?id=${itemId}`;
    case "tmall":
      return `https://detail.tmall.com/item.htm?id=${itemId}`;
    default:
      // YiwuGo / ChinaGoods path shapes vary by listing generation; the pasted
      // URL (after redirects) is the truth, so nothing is synthesised here.
      return null;
  }
}

/** Parse one pasted URL. Returns null for non-marketplace or non-listing URLs. */
export function parseMarketplaceLink(raw: string): ParsedMarketplaceLink | null {
  if (!raw || !raw.trim()) return null;
  const url = normalizePastedUrl(raw);
  const host = hostOf(url);
  if (!host) return null;
  const hit = platformForHost(host);
  if (!hit) return null;

  let itemId: string | null = null;
  const byQuery = url.match(ID_QUERY_RE);
  if (byQuery) itemId = byQuery[1];
  if (!itemId) {
    for (const re of ID_PATH_RES) {
      const m = url.match(re);
      if (m) {
        itemId = m[1];
        break;
      }
    }
  }

  const marketplace =
    hit.platform === "1688" || hit.platform === "taobao" || hit.platform === "yiwugo" || hit.platform === "chinagoods"
      ? hit.platform
      : hit.platform === "tmall"
        ? "taobao"
        : null;

  return {
    url,
    platform: hit.platform,
    label: LABELS[hit.platform],
    itemId,
    marketplace,
    canonicalUrl: canonicalFor(hit.platform, itemId),
  };
}

export interface ParsedLinksResult {
  links: ParsedMarketplaceLink[];
  /** Lines that were not usable, with the reason — shown verbatim, never dropped. */
  rejected: Array<{ raw: string; reason: string }>;
  /** Duplicates of an earlier link (by url+itemId), reported instead of re-imported. */
  duplicates: string[];
}

/**
 * Parse a pasted block (one link per line, commas tolerated). A listing without
 * an item id is rejected: the import endpoint needs a concrete listing, and a
 * marketplace home/search page would silently import the wrong product.
 */
export function parseMarketplaceLinks(raw: string): ParsedLinksResult {
  const lines = (raw ?? "")
    .split(/[\n,]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const links: ParsedMarketplaceLink[] = [];
  const rejected: Array<{ raw: string; reason: string }> = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const parsed = parseMarketplaceLink(line);
    if (!parsed) {
      const host = hostOf(normalizePastedUrl(line));
      rejected.push({
        raw: line,
        reason: host
          ? `${host} is not a supported marketplace (1688, Taobao, Tmall, YiwuGo, ChinaGoods)`
          : "not a URL",
      });
      continue;
    }
    if (!parsed.itemId) {
      rejected.push({ raw: line, reason: "no listing id in the URL — open the product page itself, not a search or home page" });
      continue;
    }
    if (!parsed.marketplace) {
      rejected.push({ raw: line, reason: `${parsed.label} has no marketplace column in the catalog yet` });
      continue;
    }
    const key = `${parsed.marketplace}:${parsed.itemId}`;
    if (seen.has(key)) {
      duplicates.push(line);
      continue;
    }
    seen.add(key);
    links.push(parsed);
  }

  return { links, rejected, duplicates };
}

/** Compact display text for a chip: "1688 · 723456789012". */
export function linkChipLabel(link: ParsedMarketplaceLink): string {
  return link.itemId ? `${link.label} · ${link.itemId}` : link.label;
}
