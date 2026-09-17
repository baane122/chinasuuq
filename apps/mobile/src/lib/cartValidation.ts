// Deterministic cart validation (Phase 2 — smart cart).
// Client-side checks only. The trusted backend remains authoritative for
// payable totals and placement — offline carts stay DRAFTS and every order is
// revalidated against supplier state before purchase.
import { validateMOQ } from "./moq";
import type { OrderRules } from "./moq";

export type CartItemStatus = "draft" | "valid" | "needs_review" | "stale";

export interface ValidatedCartItem {
  itemId: string;
  status: CartItemStatus;
  problems: string[];
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

export function validateCartItem(opts: {
  itemId: string;
  quantity: number;
  rules: OrderRules;
  quoteFreshMs?: number;
  capturedAt?: number;
}): ValidatedCartItem {
  const problems: string[] = [];
  const res = validateMOQ(opts.rules, opts.quantity);
  if (!res.valid) problems.push(res.message);

  let status: CartItemStatus = "draft";
  if (problems.length === 0) status = "valid";
  if (problems.length > 0) status = "needs_review";

  // Stale quote → must revalidate before purchase.
  if (opts.quoteFreshMs && opts.capturedAt && Date.now() - opts.capturedAt > opts.quoteFreshMs) {
    status = "stale";
    problems.push("quote_expired_revalidation_required");
  }

  return { itemId: opts.itemId, status, problems };
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
