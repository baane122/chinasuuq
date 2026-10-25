// Detect a Chinese-marketplace PRODUCT URL pasted into a native (non-WebView)
// surface — the search box is the one place the app already promises "paste a
// link". This is deliberately ONLY the parser: the scrape/AI-vision/review
// pipeline it hands off to is the existing one (PRODUCT_CAPTURE_SCRIPT +
// SmartProductForm + ai-vision inside app/marketplace/[marketplace].tsx), so
// there is exactly one scraper in this app.
//
// No expo-clipboard / expo-sharing is installed (package.json, checked), and
// adding packages is out of scope — so "clipboard paste" here means the user
// long-press-pastes into the search field. The share-target half therefore has
// no route to live in and is reported as a boundary, not silently skipped.

export interface DetectedProductLink {
  /** The platform as the marketplace registry spells it when supported; else the raw host family ("pinduoduo", "alibaba"). */
  platform: "1688" | "taobao" | "yiwugo" | "chinagoods" | "pinduoduo" | "alibaba";
  /** True when /marketplace/[id] can open this platform in the in-app browser. */
  browsable: boolean;
  /** Marketplace id for router.push({ pathname:"/marketplace/[marketplace]", params:{ marketplace } }) when browsable. */
  marketplaceId: "1688" | "taobao" | "yiwugo" | "chinagoods" | null;
  /** The listing id on that platform, when the URL carries one. */
  sourceId: string;
  url: string;
  /** Display name for the chip ("1688", "Taobao", …). */
  label: string;
}

const PLATFORM_LABEL: Record<DetectedProductLink["platform"], string> = {
  "1688": "1688",
  taobao: "Taobao",
  yiwugo: "YiwuGo",
  chinagoods: "ChinaGoods",
  pinduoduo: "Pinduoduo",
  alibaba: "Alibaba",
};

/** Host → platform. Matched on the host suffix so m./mobile./www. all work. */
const HOST_PLATFORMS: Array<{ suffix: string; platform: DetectedProductLink["platform"] }> = [
  { suffix: "1688.com", platform: "1688" },
  { suffix: "taobao.com", platform: "taobao" },
  // Tmall is Taobao's brand arm; the same in-app browser and the same capture rules handle it.
  { suffix: "tmall.com", platform: "taobao" },
  { suffix: "yangkeduo.com", platform: "pinduoduo" }, // Pinduoduo's share host
  { suffix: "pinduoduo.com", platform: "pinduoduo" },
  { suffix: "yiwugo.com", platform: "yiwugo" },
  { suffix: "chinagoods.com", platform: "chinagoods" },
  { suffix: "alibaba.com", platform: "alibaba" },
];

/** Product-id query params each platform uses, in priority order. */
const ID_PARAM_RE = /[?&#](?:offerId|goods_id|goodsId|productId|id|itemid|item_id)=([0-9]{5,20})/i;
/** …and the path shapes: /offer/654321098765.html, /product-detail/x/160…, /goods.html?goods_id=. */
const ID_PATH_RES = [
  /\/offer\/([0-9]{5,20})\.html/i,
  /\/product-detail\/[^/]*?_?([0-9]{9,20})\.html/i,
  /\/a\/([0-9]{9,20})\.html/i,
  /(?:^|[/?&])goods[_-]?id=([0-9]{5,20})/i,
];

function hostOf(url: string): string {
  try {
    const withoutProto = url.replace(/^[a-z]+:\/\//i, "").split(/[/?#]/)[0];
    return withoutProto.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Extract the first http(s) URL from arbitrary text and classify it. Returns
 * null for anything that is not a product link from a known platform (a bare
 * word, a YouTube link, an order-tracking page).
 */
export function detectProductLink(text: string | null | undefined): DetectedProductLink | null {
  if (!text) return null;
  const match = String(text).match(/https?:\/\/\S+/i);
  if (!match) return null;
  const url = match[0].replace(/[，,。)）\]"']+$/g, "");
  const host = hostOf(url);
  if (!host) return null;

  const hit = HOST_PLATFORMS.find(
    ({ suffix }) => host === suffix || host.endsWith(`.${suffix}`)
  );
  if (!hit) return null;

  // Only a URL that looks like a LISTING, not the site's home/search page.
  let sourceId = "";
  const param = url.match(ID_PARAM_RE);
  if (param) sourceId = param[1];
  if (!sourceId) {
    for (const re of ID_PATH_RES) {
      const m = url.match(re);
      if (m) {
        sourceId = m[1];
        break;
      }
    }
  }
  // Home/search pages of these hosts are "browsable" but not smart-add-able;
  // requiring an id keeps the banner honest about what was detected.
  if (!sourceId) return null;

  const marketplaceId =
    hit.platform === "1688" || hit.platform === "taobao" || hit.platform === "yiwugo" || hit.platform === "chinagoods"
      ? hit.platform
      : null;

  return {
    platform: hit.platform,
    browsable: marketplaceId !== null,
    marketplaceId,
    sourceId,
    url,
    label: PLATFORM_LABEL[hit.platform],
  };
}
