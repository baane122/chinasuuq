import { describe, expect, it } from "vitest";
import {
  parseMarketplaceLink,
  parseMarketplaceLinks,
  normalizePastedUrl,
  linkChipLabel,
} from "@/lib/marketplaceLink";

/**
 * The Import Studio decides what to send from THIS parser, so a link it
 * mis-reads is either a wasted AI call or — worse — a product filed under the
 * wrong marketplace. These tests pin the shapes each marketplace actually uses,
 * plus the rejections that keep a home/search page from being imported as if it
 * were a product.
 */

describe("parseMarketplaceLink", () => {
  it("reads a 1688 offer path", () => {
    const p = parseMarketplaceLink("https://detail.1688.com/offer/723456789012.html");
    expect(p).toMatchObject({ platform: "1688", itemId: "723456789012", marketplace: "1688" });
  });

  it("reads the mobile subdomain and drops tracking params from the canonical URL", () => {
    const p = parseMarketplaceLink("https://m.1688.com/offer/723456789012.html?spm=abc");
    expect(p?.itemId).toBe("723456789012");
    expect(p?.canonicalUrl).toBe("https://detail.1688.com/offer/723456789012.html");
  });

  it("reads a Taobao item id from the query string", () => {
    const p = parseMarketplaceLink("https://item.taobao.com/item.htm?id=654321098765");
    expect(p).toMatchObject({ platform: "taobao", itemId: "654321098765", marketplace: "taobao" });
  });

  it("files Tmall under the taobao marketplace column", () => {
    const p = parseMarketplaceLink("https://detail.tmall.com/item.htm?spm=x&id=1122334455");
    expect(p?.platform).toBe("tmall");
    expect(p?.marketplace).toBe("taobao");
  });

  it("reads a YiwuGo detail path", () => {
    const p = parseMarketplaceLink("https://www.yiwugo.com/product/detail/991234567.html");
    expect(p).toMatchObject({ platform: "yiwugo", itemId: "991234567" });
  });

  it("reads a ChinaGoods two-segment detail path", () => {
    // Regression: a single-segment pattern left this id null, so the link was
    // rejected as a search page even though it was a real listing.
    const p = parseMarketplaceLink("https://www.chinagoods.com/product-detail/x/1601234567890.html");
    expect(p).toMatchObject({ platform: "chinagoods", itemId: "1601234567890" });
  });

  it("accepts a bare host paste by adding https://", () => {
    const p = parseMarketplaceLink("detail.1688.com/offer/555666777888.html");
    expect(p?.itemId).toBe("555666777888");
  });

  it("rejects a non-marketplace host", () => {
    expect(parseMarketplaceLink("https://www.youtube.com/watch?v=1")).toBeNull();
  });

  it("parses a listing URL with no id, so the caller can explain why it is unusable", () => {
    // The parser reports what it found; rejecting the *import* is the batch
    // parser's job, because the reason ("search page, not a listing") is
    // something a staff member needs to read.
    const p = parseMarketplaceLink("https://detail.1688.com/page/index.html");
    expect(p).not.toBeNull();
    expect(p?.itemId).toBeNull();
  });
});

describe("normalizePastedUrl", () => {
  it("strips wrapping punctuation a chat app adds", () => {
    expect(normalizePastedUrl("《https://item.taobao.com/item.htm?id=123456789》")).toBe(
      "https://item.taobao.com/item.htm?id=123456789"
    );
  });

  it("keeps an existing protocol", () => {
    expect(normalizePastedUrl("http://detail.1688.com/offer/123456789.html")).toBe(
      "http://detail.1688.com/offer/123456789.html"
    );
  });
});

describe("parseMarketplaceLinks", () => {
  it("splits one link per line and tolerates commas", () => {
    const r = parseMarketplaceLinks(
      "https://detail.1688.com/offer/723456789012.html\nhttps://item.taobao.com/item.htm?id=654321098765"
    );
    expect(r.links).toHaveLength(2);
    expect(r.rejected).toHaveLength(0);
  });

  it("reports a duplicate instead of importing the same listing twice", () => {
    const r = parseMarketplaceLinks(
      "https://detail.1688.com/offer/723456789012.html\nhttps://m.1688.com/offer/723456789012.html"
    );
    expect(r.links).toHaveLength(1);
    expect(r.duplicates).toHaveLength(1);
  });

  it("rejects a listing URL with no id, and says why", () => {
    const r = parseMarketplaceLinks("https://detail.1688.com/");
    expect(r.links).toHaveLength(0);
    expect(r.rejected[0]?.reason).toMatch(/listing id/);
  });

  it("rejects an unsupported host and names it", () => {
    const r = parseMarketplaceLinks("https://example.com/product/1");
    expect(r.links).toHaveLength(0);
    expect(r.rejected[0]?.reason).toMatch(/not a supported marketplace/);
  });

  it("rejects a marketplace with no catalog column", () => {
    // Pinduoduo is a real marketplace but has no `source_products.marketplace`
    // value, so importing it would write a row nothing can filter.
    const r = parseMarketplaceLinks("https://mobile.yangkeduo.com/goods.html?goods_id=123456789");
    expect(r.links).toHaveLength(0);
    expect(r.rejected[0]?.reason).toMatch(/no marketplace column/);
  });
});

describe("linkChipLabel", () => {
  it("shows platform and id for a listing", () => {
    const p = parseMarketplaceLink("https://detail.1688.com/offer/723456789012.html");
    expect(p && linkChipLabel(p)).toBe("1688 · 723456789012");
  });
});
