import { describe, expect, it } from "vitest";
import {
  buildBreakdown,
  computeMomentum,
  shareOf,
  shelfFill,
  shelfHealth,
  RPC_MAX_DAYS,
  SHELF_TARGET,
} from "@/lib/admin/trendingInsights";
import type { TrendingRpcRow } from "@/lib/catalog";

/**
 * The Trending insights panel adds three numbers the console did not have:
 * where demand comes from, whether the shelf fills itself, and what is rising.
 * Each one can be wrong in a way that looks plausible on a dashboard, so the
 * rules are pinned here rather than tuned by eye:
 *
 *  - momentum compares RAW COUNTS over two equal windows; comparing scores would
 *    make every product look like it is rising, because the score decays with age
 *  - a breakdown must still add up to the true total; the part we did not
 *    enumerate is a labelled residual, not a rounding error folded into the top
 *    row
 *  - a previous window of zero has no percentage change
 *  - shelf shortfall counts slots that will render NOTHING
 */

function row(over: Partial<TrendingRpcRow> & { product_id: string }): TrendingRpcRow {
  return {
    name: "Product",
    marketplace: "1688",
    image_url: null,
    price_usd: null,
    price_cny: null,
    score: 0,
    event_count: 0,
    ...over,
  };
}

describe("shareOf", () => {
  it("returns the fraction of the total", () => {
    expect(shareOf(25, 100)).toBe(0.25);
  });

  it("returns 0 instead of NaN when the total is zero", () => {
    expect(shareOf(0, 0)).toBe(0);
  });

  it("never exceeds 1, so a bar cannot overflow its track", () => {
    expect(shareOf(120, 100)).toBe(1);
    expect(shareOf(-5, 100)).toBe(0);
  });
});

describe("buildBreakdown", () => {
  it("surfaces the unenumerated remainder instead of dropping it", () => {
    const b = buildBreakdown(100, [
      { key: "1688", count: 40 },
      { key: "taobao", count: 35 },
    ]);
    expect(b.total).toBe(100);
    expect(b.residual).toBe(25);
    expect(b.residualLabel).toBe("Other keys");
    // Every named row plus the residual must reconstruct the true total.
    expect(b.rows.reduce((n, r) => n + r.count, 0) + b.residual).toBe(b.total);
  });

  it("drops zero-count keys so the legend is not a wall of empty rows", () => {
    const b = buildBreakdown(10, [
      { key: "1688", count: 10 },
      { key: "yiwugo", count: 0 },
    ]);
    expect(b.rows).toEqual([{ key: "1688", count: 10 }]);
    expect(b.residual).toBe(0);
  });

  it("sorts busiest first", () => {
    const b = buildBreakdown(30, [
      { key: "taobao", count: 5 },
      { key: "1688", count: 20 },
      { key: "yiwugo", count: 5 },
    ]);
    expect(b.rows.map((r) => r.key)).toEqual(["1688", "taobao", "yiwugo"]);
  });

  it("trusts the counted rows over a stale total, so the bar is never over 100%", () => {
    const b = buildBreakdown(10, [{ key: "1688", count: 12 }]);
    expect(b.total).toBe(12);
    expect(b.residual).toBe(0);
  });
});

describe("computeMomentum", () => {
  it("subtracts the previous window's raw count", () => {
    const recent = [row({ product_id: "a", event_count: 30, score: 9 })];
    const wider = [row({ product_id: "a", event_count: 50, score: 14 })];
    const [m] = computeMomentum(recent, wider);
    expect(m).toMatchObject({ recent: 30, previous: 20, delta: 10, deltaPct: 50 });
  });

  it("reports a fall as a negative delta rather than hiding it", () => {
    const [m] = computeMomentum(
      [row({ product_id: "a", event_count: 5 })],
      [row({ product_id: "a", event_count: 40 })]
    );
    expect(m).toMatchObject({ recent: 5, previous: 35, delta: -30 });
    expect(m.deltaPct).toBeCloseTo(-85.714, 2);
  });

  it("says null — not infinity — when the previous window was empty", () => {
    const [m] = computeMomentum(
      [row({ product_id: "a", event_count: 7 })],
      [row({ product_id: "a", event_count: 7 })]
    );
    expect(m.previous).toBe(0);
    expect(m.deltaPct).toBeNull();
  });

  it("treats a product absent from the recent window as falling to zero", () => {
    const [m] = computeMomentum([], [row({ product_id: "gone", event_count: 9 })]);
    expect(m).toMatchObject({ recent: 0, previous: 9, delta: -9, deltaPct: -100 });
  });

  it("ranks by absolute movement so a collapse is as visible as a surge", () => {
    const recent = [
      row({ product_id: "up", event_count: 12 }),
      row({ product_id: "down", event_count: 0 }),
      row({ product_id: "flat", event_count: 20 }),
    ];
    const wider = [
      row({ product_id: "up", event_count: 14 }),
      row({ product_id: "down", event_count: 30 }),
      row({ product_id: "flat", event_count: 40 }),
    ];
    // |−30| > |+10| > |0| — a collapse outranks a flat product.
    expect(computeMomentum(recent, wider).map((m) => m.productId)).toEqual(["down", "up", "flat"]);
  });

  it("caps the list and never invents a row", () => {
    const many = Array.from({ length: 20 }, (_, i) => row({ product_id: `p${i}`, event_count: i + 1 }));
    expect(computeMomentum(many, many, 5)).toHaveLength(5);
    expect(computeMomentum([], [], 5)).toEqual([]);
  });

  it("ignores a negative or malformed count instead of printing a negative total", () => {
    const [m] = computeMomentum(
      [row({ product_id: "a", event_count: -3 })],
      [row({ product_id: "a", event_count: 6 })]
    );
    expect(m.recent).toBe(0);
    expect(m.previous).toBe(6);
  });
});

describe("shelfHealth", () => {
  const base = { id: "p1", title: "Cotton tee", images: ["https://x/a.jpg"], title_somali: "Funaanad", priceUsd: 3.2 };

  it("passes a complete product with no issues", () => {
    const h = shelfHealth([base]);
    expect(h).toMatchObject({ total: 1, clean: 1 });
    expect(h.rows).toEqual([]);
  });

  it("names every missing field on one product", () => {
    const h = shelfHealth([{ id: "p2", title: "Bare", images: [], title_somali: null, priceUsd: null, priceCnyMin: null }]);
    expect(h.rows[0].issues).toEqual(["no_photo", "no_somali_title", "no_price"]);
    expect(h.counts).toMatchObject({ no_photo: 1, no_somali_title: 1, no_price: 1 });
  });

  it("does not call a CNY-only product priceless", () => {
    const h = shelfHealth([{ ...base, id: "p3", priceUsd: null, priceCnyMin: 12.5 }]);
    expect(h.rows).toEqual([]);
  });

  it("flags an archived pin, because the shelf would show a ghost", () => {
    const h = shelfHealth([{ ...base, id: "p4", status: "archived" }]);
    expect(h.rows[0].issues).toEqual(["not_active"]);
  });

  it("treats a missing status as active, matching the RPC's own coalesce", () => {
    expect(shelfHealth([{ ...base, id: "p5", status: null }]).rows).toEqual([]);
  });

  it("returns an all-clear for an empty shelf rather than a divide-by-zero", () => {
    const h = shelfHealth([]);
    expect(h).toMatchObject({ total: 0, clean: 0 });
    expect(h.rows).toEqual([]);
  });
});

describe("shelfFill", () => {
  it("counts pinned slots first, then organic", () => {
    expect(shelfFill(3, 20)).toEqual({ target: SHELF_TARGET, pinned: 3, organic: 9, short: 0 });
  });

  it("reports the slots that will render nothing", () => {
    expect(shelfFill(2, 3)).toMatchObject({ pinned: 2, organic: 3, short: 7 });
  });

  it("caps pins at the target instead of claiming a negative organic count", () => {
    expect(shelfFill(20, 5)).toMatchObject({ pinned: 12, organic: 0, short: 0 });
  });

  it("shows a completely empty shelf as fully short", () => {
    expect(shelfFill(0, 0)).toMatchObject({ pinned: 0, organic: 0, short: 12 });
  });

  it("ignores negative inputs", () => {
    expect(shelfFill(-4, -2)).toMatchObject({ pinned: 0, organic: 0, short: 12 });
  });
});

describe("window cap", () => {
  it("keeps the published 90-day ceiling, so a comparison cannot ask for 180", () => {
    expect(RPC_MAX_DAYS).toBe(90);
    // fetchMomentum halves this; 90/2 = 45 means the previous window is always
    // the same length as the recent one.
    expect(RPC_MAX_DAYS / 2).toBe(45);
  });
});
