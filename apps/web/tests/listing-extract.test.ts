import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractDescription,
  extractImages,
  extractMoqText,
  extractPrice,
  extractSeller,
  extractTitle,
  isAllowedHost,
  parseListingTarget,
  readListing,
} from "../supabase/functions/_shared/listing";

/**
 * Every field the importer saves comes from THIS reader, so two mistakes are
 * expensive:
 *
 *  1. Reading the wrong text. An apostrophe inside a double-quoted meta tag used
 *     to end the match, so "men's cotton tee" arrived as "men" — or, because
 *     the extractor then falls through to the next key, as nothing at all.
 *  2. Reading nothing and reporting it as an empty product. A login wall must
 *     come back `blocked` with a sentence staff can act on, never as a draft
 *     with a title and zero photos that looks like a real listing.
 *
 * The fixtures below are trimmed to the shapes these marketplaces actually
 * serve. They pin behaviour, not HTML in general.
 */

describe("parseListingTarget", () => {
  it("reads a 1688 offer path and keeps the marketplace identity", () => {
    const t = parseListingTarget("https://detail.1688.com/offer/723456789012.html");
    expect(t).toMatchObject({ platform: "1688", host: "detail.1688.com", itemId: "723456789012" });
  });

  it("reads a Taobao item id from the query string", () => {
    const t = parseListingTarget("https://item.taobao.com/item.htm?spm=a1z10&id=654321098765");
    expect(t).toMatchObject({ platform: "taobao", itemId: "654321098765" });
  });

  it("keeps Tmall distinct from Taobao", () => {
    expect(parseListingTarget("https://detail.tmall.com/item.htm?id=1122334455")?.platform).toBe("tmall");
    expect(parseListingTarget("https://detail.tmall.hk/item.htm?id=1122334455")?.platform).toBe("tmall");
  });

  it("reads a YiwuGo detail path", () => {
    expect(parseListingTarget("https://www.yiwugo.com/product/detail/991234567.html")).toMatchObject({
      platform: "yiwugo",
      itemId: "991234567",
    });
  });

  it("reads a ChinaGoods two-segment detail path", () => {
    // Regression: a single-segment pattern returned a null id here, so the
    // import was filed against a search page instead of the product.
    expect(parseListingTarget("https://www.chinagoods.com/product-detail/x/1601234567890.html")).toMatchObject({
      platform: "chinagoods",
      itemId: "1601234567890",
    });
  });

  it("accepts a bare host paste and supplies https", () => {
    expect(parseListingTarget("detail.1688.com/offer/555666777888.html")?.itemId).toBe("555666777888");
  });

  it("rejects plain http, because the reader only ever fetches https", () => {
    expect(parseListingTarget("http://detail.1688.com/offer/723456789012.html")).toBeNull();
  });

  it("rejects a non-443 port and embedded credentials", () => {
    expect(parseListingTarget("https://detail.1688.com:8443/offer/723456789012.html")).toBeNull();
    expect(parseListingTarget("https://user:pass@detail.1688.com/offer/723456789012.html")).toBeNull();
  });

  it("rejects lookalike hosts that merely contain the marketplace name", () => {
    expect(parseListingTarget("https://fake1688.com/offer/723456789012.html")).toBeNull();
    expect(parseListingTarget("https://detail.1688.com.evil.example/offer/723456789012.html")).toBeNull();
    expect(parseListingTarget("https://www.youtube.com/watch?v=1")).toBeNull();
  });

  it("rejects input that is not a URL at all", () => {
    expect(parseListingTarget("")).toBeNull();
    expect(parseListingTarget("https://")).toBeNull();
  });
});

describe("isAllowedHost", () => {
  it("accepts subdomains of a supported marketplace over https", () => {
    expect(isAllowedHost("https://detail.1688.com/offer/1.html")).toBe(true);
    expect(isAllowedHost("https://www.chinagoods.com/a/1.html")).toBe(true);
  });

  it("rejects the same host over http, and any foreign host", () => {
    expect(isAllowedHost("http://detail.1688.com/offer/1.html")).toBe(false);
    expect(isAllowedHost("https://evil.example/offer/1.html")).toBe(false);
    expect(isAllowedHost("not a url")).toBe(false);
  });
});

describe("extractTitle", () => {
  it("prefers og:title over the <title> element", () => {
    const html = `<head><title>1688 - 商品页</title>
<meta property="og:title" content="Cotton T-Shirt Wholesale" /></head>`;
    expect(extractTitle(html)).toBe("Cotton T-Shirt Wholesale");
  });

  it("falls back to <title>, collapsing whitespace and decoding entities", () => {
    const html = "<title>  Men&#39;s   Linen Shirt\n</title>";
    expect(extractTitle(html)).toBe("Men's Linen Shirt");
  });

  it("falls back to the JSON-LD product name", () => {
    const html = `<script type="application/ld+json">{"@type":"Product","name":"Bamboo Cutting Board"}</script>`;
    expect(extractTitle(html)).toBe("Bamboo Cutting Board");
  });

  it("returns null rather than guessing", () => {
    expect(extractTitle("<body></body>")).toBeNull();
  });
});

describe("extractDescription", () => {
  it("keeps an apostrophe inside a double-quoted meta value", () => {
    // Regression: `content="[^"]*"` was matched as `[^"']*`, so this came back
    // as "Men" and then failed the length check.
    const text = "Men's short sleeve cotton tee, breathable summer top for daily wear.";
    const html = `<meta property="og:description" content="${text}" />`;
    expect(extractDescription(html)).toBe(text);
  });

  it("reads a single-quoted meta value", () => {
    const html = `<meta name="description" content='Women&#39;s linen dress, relaxed fit for summer.' />`;
    expect(extractDescription(html)).toBe("Women's linen dress, relaxed fit for summer.");
  });

  it("falls back to a JSON-LD description with escaped quotes", () => {
    // String.raw so the backslash-quotes reach the parser, which is how the
    // marketplace actually serialises them.
    const html = String.raw`<script type="application/ld+json">{"description":"A \"premium\" cotton tee for summer wear."}</script>`;
    expect(extractDescription(html)).toBe('A "premium" cotton tee for summer wear.');
  });

  it("ignores a stub description too short to be useful", () => {
    expect(extractDescription(`<meta property="og:description" content="Shop now" />`)).toBeNull();
  });
});

describe("extractPrice", () => {
  it("reads the og price", () => {
    const html = `<meta property="og:price:amount" content="12.50" />`;
    expect(extractPrice(html)).toEqual({ min: 12.5, max: 12.5 });
  });

  it("reads a JSON-LD price range", () => {
    const html = `<script type="application/ld+json">{"@type":"Product","lowPrice":8.5,"highPrice":15.5}</script>`;
    expect(extractPrice(html)).toEqual({ min: 8.5, max: 15.5 });
  });

  it("reads the visible ¥ range when there is no structured data", () => {
    expect(extractPrice("<span>￥ 12.50 - ￥ 18.90</span>")).toEqual({ min: 12.5, max: 18.9 });
  });

  it("returns nulls instead of 0 when no price is present", () => {
    expect(extractPrice("<p>Call for price</p>")).toEqual({ min: null, max: null });
  });
});

describe("extractMoqText", () => {
  it("returns the Chinese MOQ wording verbatim", () => {
    expect(extractMoqText("<div>起批量</div><div>2件起批</div>")).toBe("2件起批");
  });

  it("reads an English minimum order line", () => {
    expect(extractMoqText("<p>Minimum order quantity: 50</p>")).toBe("Minimum order quantity: 50");
  });

  it("returns null when the page states no minimum", () => {
    expect(extractMoqText("<p>In stock</p>")).toBeNull();
  });
});

describe("extractImages", () => {
  it("prioritises the og:image, which is the supplier's cover photo", () => {
    const html = `<body><img src="https://img.alicdn.com/imgextra/i1/body.jpg" /></body>
<meta property="og:image" content="https://cbu01.alicdn.com/img/ibank/cover.jpg" />`;
    expect(extractImages(html)[0]).toBe("https://cbu01.alicdn.com/img/ibank/cover.jpg");
  });

  it("collapses CDN size and format variants of the same photo", () => {
    const html = [
      `<img src="https://img.alicdn.com/imgextra/i1/abc_400x400.jpg" />`,
      `<img src="https://img.alicdn.com/imgextra/i1/abc.jpg" />`,
      `<img src="https://img.alicdn.com/imgextra/i1/abc.jpg.webp" />`,
      `<img src="https://img.alicdn.com/imgextra/i1/def_Q90.jpg" />`,
      `<img src="https://img.alicdn.com/imgextra/i1/def.jpg" />`,
    ].join("");
    expect(extractImages(html)).toEqual([
      "https://img.alicdn.com/imgextra/i1/abc_400x400.jpg",
      "https://img.alicdn.com/imgextra/i1/def_Q90.jpg",
    ]);
  });

  it("keeps gallery order and upgrades http URLs", () => {
    const html = [
      `<img src="http://img.alicdn.com/imgextra/i1/one.jpg" />`,
      `<img src="https://img.alicdn.com/imgextra/i1/two.jpg" />`,
    ].join("");
    expect(extractImages(html)).toEqual([
      "https://img.alicdn.com/imgextra/i1/one.jpg",
      "https://img.alicdn.com/imgextra/i1/two.jpg",
    ]);
  });

  it("unescapes JSON-embedded slashes and protocol-relative URLs", () => {
    const html = `{"img":"https:\\/\\/img.alicdn.com\\/imgextra\\/i1\\/escaped.jpg"}<img src="//img.alicdn.com/imgextra/i1/rel.jpg" />`;
    expect(extractImages(html)).toEqual([
      "https://img.alicdn.com/imgextra/i1/escaped.jpg",
      "https://img.alicdn.com/imgextra/i1/rel.jpg",
    ]);
  });

  it("drops chrome: logos, foreign hosts and non-photo files", () => {
    const html = [
      `<img src="https://img.alicdn.com/logo/shop.png" />`,
      `<img src="https://img.alicdn.com/imgextra/i1/sprite.jpg" />`,
      `<img src="https://stats.example.com/pixel.jpg" />`,
      `<img src="https://img.alicdn.com/imgextra/i1/demo.mp4" />`,
      `<img src="https://img.alicdn.com/imgextra/i1/real.jpg" />`,
    ].join("");
    expect(extractImages(html)).toEqual(["https://img.alicdn.com/imgextra/i1/real.jpg"]);
  });

  it("caps the gallery so one listing cannot flood the importer", () => {
    const html = Array.from({ length: 40 }, (_, i) => `<img src="https://img.alicdn.com/imgextra/i1/p${i}.jpg" />`).join("");
    expect(extractImages(html)).toHaveLength(24);
  });

  it("returns no images for a verification page", () => {
    expect(extractImages("<html><body>请完成安全验证</body></html>")).toEqual([]);
  });
});

describe("extractSeller", () => {
  it("reads the company name from embedded page state", () => {
    const html = `<script>window.__INIT__={"companyName":"Yiwu Sunrise Trading Co., Ltd."}</script>`;
    expect(extractSeller(html)).toBe("Yiwu Sunrise Trading Co., Ltd.");
  });
});

describe("readListing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const target = parseListingTarget("https://detail.1688.com/offer/723456789012.html")!;

  const PAGE = `<!doctype html><html><head>
<meta property="og:title" content="Men's cotton t-shirt wholesale" />
<meta property="og:description" content="Men's short sleeve cotton tee, breathable summer top for daily wear." />
<meta property="og:price:amount" content="12.50" />
<meta property="og:image" content="https://cbu01.alicdn.com/img/ibank/2024/a.jpg" />
</head><body>2件起批</body></html>`;

  it("returns the facts the page actually carries", async () => {
    vi.stubGlobal("fetch", async () => new Response(PAGE, { status: 200 }));
    const facts = await readListing(target, "cookie=1");
    expect(facts).toMatchObject({
      ok: true,
      error: null,
      status: 200,
      blocked: false,
      title: "Men's cotton t-shirt wholesale",
      priceCny: 12.5,
      moqText: "2件起批",
    });
    expect(facts.images).toEqual(["https://cbu01.alicdn.com/img/ibank/2024/a.jpg"]);
  });

  it("reports an anti-bot 403 as blocked, with the fix in the message", async () => {
    vi.stubGlobal("fetch", async () => new Response("Forbidden", { status: 403 }));
    const facts = await readListing(target, "");
    expect(facts.ok).toBe(false);
    expect(facts.blocked).toBe(true);
    expect(facts.error).toMatch(/anti-bot/i);
    expect(facts.error).toMatch(/Sync a marketplace session/);
  });

  it("refuses a redirect that leaves the allowlist", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: true, status: 200, url: "https://evil.example/x", text: async () => PAGE }) as unknown as Response);
    const facts = await readListing(target, "");
    expect(facts.ok).toBe(false);
    expect(facts.images).toEqual([]);
    expect(facts.error).toMatch(/outside the supported marketplaces/);
  });

  it("reports a JavaScript-only shell as unread, not as an empty listing", async () => {
    vi.stubGlobal("fetch", async () => new Response(`<html><body><script>${"void 0;".repeat(400)}</script></body></html>`, { status: 200 }));
    const facts = await readListing(target, "");
    expect(facts.ok).toBe(false);
    expect(facts.error).toMatch(/JavaScript-only shell/);
  });

  it("names the timeout instead of failing silently", async () => {
    vi.stubGlobal("fetch", async () => {
      const err = new Error("timed out");
      err.name = "TimeoutError";
      throw err;
    });
    const facts = await readListing(target, "");
    expect(facts.ok).toBe(false);
    expect(facts.status).toBeNull();
    expect(facts.error).toMatch(/20 seconds/);
  });
});
