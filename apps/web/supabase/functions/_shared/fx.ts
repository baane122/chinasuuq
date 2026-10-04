// ChinaSuuq — the money contract, in one place.
//
// `exchange_rates.rate` means "how many units of from_currency equal ONE unit
// of to_currency": ('CNY','USD') = 6.68 is 6.68 yuan to the dollar (1 CNY =
// $0.1497), and ('SOS','USD') = 530 is 530 shilling to the dollar. Migration
// 202610030007 makes exactly one row per pair active and flips a sub-1 CNY→USD
// or SOS→USD entry, so a rate typed the wrong way round cannot reach a price.
//
// Every edge function reads the live pair through public.fx_rates(), which also
// returns the admin's service fee, so no function keeps its own 7.25 literal.
//
// WHY USD_NATIVE_MARKETS IS HERE: the app bills as `USD = price_cny / rate`.
// One marketplace (the 1$ Dollar Store) prints dollars, and an AI reading of its
// page lands in the same `price_cny` field. Treating that $5 as ¥5 charges
// $0.75 — a 6.7× loss on every order — so the dollar-quoted case is converted
// server-side before a client ever sees the number.

// Offline/empty-table fallback only — must equal public.fx_rates()'s own
// fallback (6.66, the owner's saved rate) or a cold function call would price a
// quote differently from the admin looking at the same row.
export const DEFAULT_CNY_PER_USD = 6.66;
export const MAX_PRICE_CNY = 10_000_000;

export const USD_NATIVE_MARKETS: ReadonlySet<string> = new Set([
  "dollarstore", "dollar store", "1$", "1$ dollar store",
  "one dollar", "onedollar", "huolangjun", "huolangjun666.com",
]);

/** True when the marketplace prints US dollars instead of yuan. */
export function isUsdNativeMarket(marketplace: string | null | undefined): boolean {
  return USD_NATIVE_MARKETS.has((marketplace || "").trim().toLowerCase());
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Yuan-equivalent of a dollar amount at the live rate. */
export function usdToCnyEquivalent(usd: number, cnyPerUsd: number): number {
  return round2(usd * cnyPerUsd);
}

/**
 * The live CNY-per-USD rate from `fx_rates()`, service-role client required.
 * Falls back to DEFAULT_CNY_PER_USD when the RPC is missing or answers garbage
 * — a stale default is a small error, an inverted rate is a large one.
 */
export async function cnyPerUsd(client: {
  rpc: (fn: string) => Promise<{ data: unknown }>;
}): Promise<number> {
  try {
    const { data } = await client.rpc("fx_rates");
    const n = Number((data as Record<string, unknown> | null)?.cny_per_usd);
    return Number.isFinite(n) && n >= 2 && n <= 20 ? n : DEFAULT_CNY_PER_USD;
  } catch {
    return DEFAULT_CNY_PER_USD;
  }
}
