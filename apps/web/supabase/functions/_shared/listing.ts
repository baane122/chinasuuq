// ChinaSuuq — listing page reader shared by product-import.
//
// WHAT THIS DOES: given a marketplace detail URL, read the listing page a
// logged-in browser would read, and return the facts it actually contains.
//
// WHAT IT DOES NOT DO: invent. Every field is either found in the page or null.
// 1688/Taobao ship their detail text as IMAGES, so `description` is frequently
// absent while `images` has twenty entries — the importer must say that instead
// of letting a model write a description from nothing.
//
// SECURITY
//  - The URL is rebuilt from an allowlisted host, never fetched as given, so a
//    crafted link cannot point the function at an internal address (the same
//    class of bug the provider SSRF guard exists for).
//  - https only, port 443 only; redirects are followed but the FINAL host is
//    re-checked against the allowlist, which is how a redirect gets used to slip
//    past a host check.
//  - The page is untrusted content. Text is length-capped and returned as data;
//    nothing here executes or template-interpolates it.

export type ListingPlatform = "1688" | "taobao" | "tmall" | "yiwugo" | "chinagoods";

export interface ListingTarget {
  platform: ListingPlatform;
  host: string;
  url: string;
  itemId: string | null;
}

export interface ListingFacts {
  ok: boolean;
  /** Why the read failed, in a sentence a staff member can act on. */
  error: string | null;
  /** HTTP status of the page request, when it was attempted. */
  status: number | null;
  /** The URL that was actually requested (after any redirect). */
  requestedUrl: string | null;
  title: string | null;
  priceCny: number | null;
  priceCnyMax: number | null;
  moqText: string | null;
  description: string | null;
  images: string[];
  sellerName: string | null;
  /** True when the page answered but carried none of the fields we need
   *  (an anti-bot challenge, a login wall, or a JS-only shell). */
  blocked: boolean;
}

const MAX_IMAGES = 24;
const MAX_TEXT = 4000;

/** Host suffix → platform. Mirrors apps/web/src/lib/marketplaceLink.ts. */
const HOSTS: Array<{ suffix: string; platform: ListingPlatform }> = [
  { suffix: "1688.com", platform: "1688" },
  { suffix: "taobao.com", platform: "taobao" },
  { suffix: "tmall.com", platform: "tmall" },
  { suffix: "tmall.hk", platform: "tmall" },
  { suffix: "yiwugo.com", platform: "yiwugo" },
  { suffix: "chinagoods.com", platform: "chinagoods" },
];

const ID_QUERY_RE = /[?&#](?:offerId|goods_id|goodsId|productId|itemId|itemid|item_id|id)=([0-9]{5,20})/i;
const ID_PATH_RES: RegExp[] = [
  /\/offer\/([0-9]{5,20})\.html/i,
  /\/product\/detail\/([0-9]{5,20})\.html/i,
  // chinagoods serves both /product-detail/<id>.html and the two-segment
  // /product-detail/<slug>/<id>.html — one optional segment covers both.
  /\/product-detail\/(?:[^/]*\/)?[^/]*?([0-9]{9,20})\.html/i,
  /\/a\/([0-9]{9,20})\.html/i,
  /(?:^|[/?&])goods[_-]?id=([0-9]{5,20})/i,
  /\/goods\/([0-9]{5,20})\.html/i,
  /\/item\/([0-9]{5,20})/i,
];

function matchHost(hostname: string): { suffix: string; platform: ListingPlatform } | null {
  const host = hostname.toLowerCase();
  return HOSTS.find((h) => host === h.suffix || host.endsWith(`.${h.suffix}`)) ?? null;
}

/** Parse + allowlist. Returns null when the URL is not a supported listing. */
export function parseListingTarget(raw: string): ListingTarget | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "443") return null;

  const hit = matchHost(url.hostname);
  if (!hit) return null;

  const full = url.href;
  let itemId: string | null = null;
  const byQuery = full.match(ID_QUERY_RE);
  if (byQuery) itemId = byQuery[1];
  if (!itemId) {
    for (const re of ID_PATH_RES) {
      const m = full.match(re);
      if (m) {
        itemId = m[1];
        break;
      }
    }
  }

  return { platform: hit.platform, host: url.hostname.toLowerCase(), url: full, itemId };
}

/** True when a URL (e.g. a redirect target) is still on an allowlisted host. */
export function isAllowedHost(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    return u.protocol === "https:" && Boolean(matchHost(u.hostname));
  } catch {
    return false;
  }
}

/** A browser-ish header set. Marketplace pages refuse a bare fetch() UA. */
function headersFor(platform: ListingPlatform, cookies: string): HeadersInit {
  const referers: Record<string, string> = {
    "1688": "https://www.1688.com/",
    taobao: "https://www.taobao.com/",
    tmall: "https://www.tmall.com/",
    yiwugo: "https://www.yiwugo.com/",
    chinagoods: "https://www.chinagoods.com/",
  };
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Cache-Control": "no-cache",
    Referer: referers[platform] ?? "https://www.google.com/",
  };
  if (cookies) headers.Cookie = cookies;
  return headers;
}

/** Decode the handful of HTML entities that show up in titles. */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(Number.parseInt(h, 16)));
}

/**
 * Read one <meta> content value.
 *
 * The quoted value is matched with ITS OWN quote style (`[^"]*` for
 * `content="…"`), never `[^"']*`: an apostrophe inside a double-quoted value —
 * "men's short sleeve t-shirt" is the common case — used to end the match early
 * and every description containing one came back truncated or null.
 */
function metaContent(html: string, key: string): string | null {
  const patterns = [
    // property/name first, then content (double- or single-quoted).
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content="([^"]*)"`, "i"),
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content='([^']*)'`, "i"),
    // content first, then property/name.
    new RegExp(`<meta[^>]+content="([^"]*)"[^>]*(?:property|name)=["']${key}["']`, "i"),
    new RegExp(`<meta[^>]+content='([^']*)'[^>]*(?:property|name)=["']${key}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1] && m[1].trim()) return decodeEntities(m[1].trim());
  }
  return null;
}

/**
 * The identity of a photo, independent of how the CDN encoded it.
 *
 * The extension is stripped BEFORE the size markers, because alicdn emits the
 * cover both ways on the same page — `abc.jpg` in og:image and `abc_400x400.jpg`
 * in the gallery. While the extension survived, those two keys never matched and
 * every listing imported its cover twice.
 */
function imageKeyOf(raw: string): string {
  return raw
    .replace(/^http:/i, "https:")
    .replace(/[?#].*$/, "")
    .replace(/(?:\.(?:jpg|jpeg|png|webp))+$/i, "")
    .replace(/_\d+x\d+(?:xz)?$/i, "")
    .replace(/_(?:q\d+|sum|b|watermark)$/i, "")
    .toLowerCase();
}

/** A CDN thumbnail/icon that is never a product photo. */
const IMAGE_NOISE = /\/(?:tps|tfs|icons?|logos?|avatar|banner|ads?)\/|\b(?:logo|icon|avatar|placeholder|sprite)\b/i;
const IMAGE_HOST = /(?:alicdn|taobaocdn|yiwugo|chinagoods|tbcdn)\./i;
const IMAGE_EXT = /\.(?:jpg|jpeg|png|webp)(?:[?#]|$)/i;

/**
 * Every product photo the page references, in document order, deduped by CDN key.
 * The page order is the gallery order — what the supplier shows first — so it
 * stays the order the product is saved in.
 */
export function extractImages(html: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (rawUrl: string) => {
    const url = rawUrl.replace(/\\u002F/gi, "/").replace(/\\\//g, "/").replace(/^\/\//, "https://").trim();
    if (!/^https?:\/\//i.test(url)) return;
    if (!IMAGE_EXT.test(url)) return;
    if (!IMAGE_HOST.test(url)) return;
    if (IMAGE_NOISE.test(url)) return;
    const key = imageKeyOf(url);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(url.replace(/^http:\/\//i, "https://"));
  };

  for (const key of ["og:image", "twitter:image", "og:image:secure_url"]) {
    const v = metaContent(html, key);
    if (v) add(v);
  }

  const ldBlocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of ldBlocks) {
    const body = block.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, "");
    for (const m of body.matchAll(/"(?:image|contentUrl|url)"\s*:\s*"([^"]+)"/gi)) add(m[1]);
  }

  // Absolute AND protocol-relative, including the JSON-escaped spelling the
  // marketplace puts inside `__INIT_DATA__` (`https:\/\/img.alicdn.com\/…`).
  // The old class excluded a backslash, so every escaped URL was skipped and a
  // 1688 page that only ships escaped photos came back with no gallery at all.
  for (const m of html.matchAll(/(?:https?:)?(?:\\?\/){2}[^"'\s<>]*?\.(?:jpg|jpeg|png|webp)/gi)) {
    add(m[0]);
  }

  return out.slice(0, MAX_IMAGES);
}

/** Price range from og:price / JSON-LD / the visible "¥ 12.50" strings. */
export function extractPrice(html: string): { min: number | null; max: number | null } {
  const candidates: number[] = [];
  const push = (raw: string | null) => {
    if (!raw) return;
    const n = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n) && n > 0 && n < 10_000_000) candidates.push(n);
  };

  push(metaContent(html, "og:price:amount"));
  push(metaContent(html, "product:price:amount"));
  for (const m of html.matchAll(/"(?:price|lowPrice|highPrice|salePrice)"\s*:\s*"?(\d+(?:\.\d+)?)"?/gi)) push(m[1]);
  for (const m of html.matchAll(/[¥￥]\s*(\d{1,6}(?:\.\d{1,2})?)\s*(?:-|~|至)\s*[¥￥]?\s*(\d{1,6}(?:\.\d{1,2})?)/g)) {
    push(m[1]);
    push(m[2]);
  }

  if (!candidates.length) return { min: null, max: null };
  return { min: Math.min(...candidates), max: Math.max(...candidates) };
}

/** The MOQ wording, verbatim — moqIngest owns the interpretation, not this file. */
export function extractMoqText(html: string): string | null {
  const patterns = [
    /[0-9]{1,7}\s*(?:件|个|套|条|双|箱|盒|支|包|只|pcs?|pieces?)\s*起(?:批|订|购|售|卖)/i,
    /起(?:批|订|购)量?[:：\s]*[0-9]{1,7}/i,
    /minimum(?:\s+order)?\s*(?:quantity)?[:：\s]*[0-9]{1,7}/i,
    /[0-9]{1,7}\s*(?:件|个|套|条)\s*起/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[0]) return decodeEntities(m[0].trim()).slice(0, 200);
  }
  return null;
}

/** Visible-ish description text: og/meta description, JSON-LD, then <title>. */
export function extractDescription(html: string): string | null {
  for (const key of ["og:description", "description", "twitter:description"]) {
    const v = metaContent(html, key);
    if (v && v.length > 20) return v.slice(0, MAX_TEXT);
  }
  const ld = html.match(/"description"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (ld && ld[1].trim().length > 20) {
    try {
      return decodeEntities(JSON.parse(`"${ld[1]}"`) as string).slice(0, MAX_TEXT);
    } catch {
      return decodeEntities(ld[1]).slice(0, MAX_TEXT);
    }
  }
  return null;
}

export function extractTitle(html: string): string | null {
  for (const key of ["og:title", "twitter:title"]) {
    const v = metaContent(html, key);
    if (v && v.length > 3) return v.slice(0, 300);
  }
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t && t[1].trim()) return decodeEntities(t[1].replace(/\s+/g, " ").trim()).slice(0, 300);
  const ld = html.match(/"name"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (ld && ld[1].trim().length > 3) return decodeEntities(ld[1]).slice(0, 300);
  return null;
}

export function extractSeller(html: string): string | null {
  for (const m of html.matchAll(/"(?:companyName|sellerName|shopName|company_name)"\s*:\s*"((?:[^"\\]|\\.){2,80})"/gi)) {
    const v = decodeEntities(m[1]).trim();
    if (v) return v.slice(0, 120);
  }
  return null;
}

/**
 * Read one listing page. Returns `ok:false` with a reason when nothing could be
 * read, and `blocked:true` when the host answered but showed a challenge.
 *
 * `cookies` is the staff-synced marketplace session (marketplace_accounts). It is
 * what turns a login-wall answer into a real page; without it the biggest
 * marketplaces answer 200 with a verification interstitial, which is exactly the
 * `blocked` case.
 */
export async function readListing(
  target: ListingTarget,
  cookies: string,
  timeoutMs = 20_000
): Promise<ListingFacts> {
  const empty: ListingFacts = {
    ok: false,
    error: null,
    status: null,
    requestedUrl: target.url,
    title: null,
    priceCny: null,
    priceCnyMax: null,
    moqText: null,
    description: null,
    images: [],
    sellerName: null,
    blocked: false,
  };

  let resp: Response;
  try {
    resp = await fetch(target.url, {
      method: "GET",
      headers: headersFor(target.platform, cookies),
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const name = (e as Error)?.name ?? "";
    return {
      ...empty,
      error:
        name === "TimeoutError" || name === "AbortError"
          ? "The marketplace did not answer within 20 seconds. Try again, or paste the listing text instead."
          : "The marketplace could not be reached from the server.",
    };
  }

  if (!resp.ok) {
    return {
      ...empty,
      status: resp.status,
      error:
        resp.status === 404
          ? "That listing no longer exists on the marketplace (404)."
          : resp.status === 403 || resp.status === 401
            ? "The marketplace refused the request (anti-bot). Sync a marketplace session in Mission Control → Marketplaces, then retry."
            : `The marketplace answered HTTP ${resp.status}.`,
      blocked: resp.status === 401 || resp.status === 403,
    };
  }

  // A redirect off the allowlist is reported, never mined: the body would come
  // from a host this function never agreed to read.
  if (resp.url && !isAllowedHost(resp.url)) {
    return {
      ...empty,
      status: resp.status,
      requestedUrl: resp.url,
      error: `The listing redirected to a host outside the supported marketplaces (${new URL(resp.url).hostname}).`,
    };
  }

  let html: string;
  try {
    html = await resp.text();
  } catch {
    return { ...empty, status: resp.status, error: "The page body could not be read." };
  }

  if (html.length > 6_000_000) html = html.slice(0, 6_000_000);

  const images = extractImages(html);
  const title = extractTitle(html);
  const price = extractPrice(html);
  const challenge =
    /(?:验证码|安全验证|滑动验证|请登录|verify you are human|captcha|punish)/i.test(title ?? "") ||
    (!title && images.length === 0 && html.length < 2000);

  const facts: ListingFacts = {
    ok: Boolean(title || images.length || price.min !== null),
    error: null,
    status: resp.status,
    requestedUrl: resp.url || target.url,
    title,
    priceCny: price.min,
    priceCnyMax: price.max,
    moqText: extractMoqText(html),
    description: extractDescription(html),
    images,
    sellerName: extractSeller(html),
    blocked: challenge && images.length === 0,
  };

  if (!facts.ok) {
    facts.error = facts.blocked
      ? "The marketplace served a login/verification page instead of the listing. Sync a marketplace session in Mission Control → Marketplaces, then retry."
      : "The page loaded but carried no product title, price or photo — it is probably a JavaScript-only shell. Paste the listing text instead.";
  }
  return facts;
}
