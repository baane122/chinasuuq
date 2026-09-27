// Deterministic cart validation (Phase 2 — smart cart).
// Client-side checks only. The trusted backend remains authoritative for
// payable totals and placement — offline carts stay DRAFTS and every order is
// revalidated against supplier state before purchase.
import { validateMOQ, nextValidQuantity } from "./moq";
import type { MoqLocale, OrderRules } from "./moq";

export type CartItemStatus = "draft" | "valid" | "needs_review" | "stale";

export interface ValidatedCartItem {
  itemId: string;
  status: CartItemStatus;
  problems: string[];
  /**
   * One-tap fix: the smallest quantity that satisfies EVERY structural rule
   * (floor, carton multiples, increment). Null when there is nothing to jump
   * to, so the UI never renders a button that changes nothing.
   */
  fixTo: number | null;
  /** The minimum this line is short of, when it is short of one. */
  minimum: number | null;
}

// A pending quote (shipping/fees unknown) must be labeled-pending, never a
// final precise delivered total. Returns the payable-now (known) vs pending.
export interface QuoteBreakdown {
  goodsCny: string;
  knownLinesCny: string;
  pendingLines: number;
  payableNowCny?: string;
  landedTotal?: undefined; // never a fabrication
}

/**
 * Validate one cart line. The `rules` come from moqOrderRules() — i.e. they
 * already carry the resolved MOQ, the listing's price ladder and its carton
 * size — so this function never re-reads marketplace text.
 */
export function validateCartItem(opts: {
  itemId: string;
  quantity: number;
  rules: OrderRules;
  quoteFreshMs?: number;
  capturedAt?: number;
  locale?: MoqLocale;
}): ValidatedCartItem {
  const problems: string[] = [];
  const locale = opts.locale ?? "en";
  const res = validateMOQ(opts.rules, opts.quantity, undefined, locale);
  let fixTo: number | null = null;
  let minimum: number | null = null;
  if (!res.valid) {
    problems.push(res.message);
    minimum = res.suggestedMin ?? opts.rules.productMoq;
    fixTo =
      res.suggestedQty ??
      nextValidQuantity(opts.rules, Math.max(opts.quantity, opts.rules.productMoq));
  }

  let status: CartItemStatus = "draft";
  if (problems.length === 0) status = "valid";
  if (problems.length > 0) status = "needs_review";

  // Stale quote → must revalidate before purchase.
  if (opts.quoteFreshMs && opts.capturedAt && Date.now() - opts.capturedAt > opts.quoteFreshMs) {
    status = "stale";
    problems.push("quote_expired_revalidation_required");
  }

  return { itemId: opts.itemId, status, problems, fixTo, minimum };
}

// Sum ONLY known lines for payable-now; leave the rest pending. This mirrors
// the review sheet rule: unknown shipping/duties are never estimated as final.
export function payableNow(opts: { goodsCny: number; feeCny?: number; domesticCny?: number }): QuoteBreakdown {
  const known =
    opts.goodsCny + (opts.feeCny ?? 0) + (opts.domesticCny ?? 0);
  return {
    goodsCny: opts.goodsCny.toFixed(2),
    knownLinesCny: known.toFixed(2),
    pendingLines: 2, // international shipping + duties
    payableNowCny: known.toFixed(2),
    landedTotal: undefined,
  };
}
