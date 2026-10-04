"use client";

/**
 * The single source of exchange-rate truth for the admin.
 *
 * THE ONE RULE (easy to read backwards, so it is stated once here and nowhere
 * else): `exchange_rates.rate` answers "how many units of `from_currency` equal
 * ONE unit of `to_currency`". Therefore
 *   ('CNY','USD') = 6.6  →  6.6 ¥ per $1  →  USD = CNY / 6.6  →  1 CNY = $0.1515
 *   ('SOS','USD') = 530  →  530 SOS per $1  →  SOS = USD * 530
 * A CNY amount is divided by the rate, never multiplied by it. Multiplying is
 * what made a ¥1,000 quote bill as $6,680.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/** Used only when the table is empty or unreachable — never as an edit default.
 *  6.66 is the owner's saved rate (Admin → Settings, 2026-10-03) and the same
 *  fallback `public.fx_rates()` uses, so an unreachable table can't price the
 *  admin differently from the server. */
export const DEFAULT_CNY_PER_USD = 6.66;
export const DEFAULT_SOS_PER_USD = 530;
/** Matches the NULL-row fallback inside public.fx_rates(). */
export const DEFAULT_SERVICE_FEE_PCT = 0.05;

export interface FxRates {
  /** CNY per 1 USD. Divide a CNY amount by this to get USD. */
  cnyPerUsd: number;
  /** 1 / cnyPerUsd. For display only ("1 CNY = $0.1515"), never for chaining. */
  usdPerCny: number;
  /** SOS per 1 USD. Multiply a USD amount by this to get SOS. */
  sosPerUsd: number;
  /**
   * Service fee as a fraction (0.05 = 5%), read from `service_fee_pct` in the
   * fx_rates() RPC. Only for estimates: when an order row carries its own
   * stored service_fee_pct / server-stamped service_fee_usd, that is the
   * authority and this is the fallback for a row with neither.
   */
  serviceFeePct: number;
  /**
   * True only when `cnyPerUsd` came back from an active ('CNY','USD') row we
   * actually read. Anything else — unreachable table, empty table, an
   * out-of-band value that failed the band check — is the last known or the
   * offline default, which is a display fallback, not a number to bill a
   * customer on. Money-writing screens must refuse when this is false.
   */
  fromLiveRow: boolean;
}

/**
 * Plausible band for a stored rate. A value outside it is a typo rather than a
 * market rate, so it must not be billed on.
 *
 * THESE FOUR NUMBERS MIRROR public.fx_rates() (migration 202610030007) — if the
 * SQL bands ever move, these have to move with them or the admin and the server
 * will price the same row differently. Exported so every band message reads them
 * instead of repeating a literal that can drift.
 */
export const CNY_PER_USD_MIN = 2;
export const CNY_PER_USD_MAX = 20;
export const SOS_PER_USD_MIN = 100;
export const SOS_PER_USD_MAX = 5000;

function buildRates(
  cnyPerUsd: number,
  sosPerUsd: number,
  serviceFeePct: number,
  fromLiveRow = false
): FxRates {
  return { cnyPerUsd, usdPerCny: 1 / cnyPerUsd, sosPerUsd, serviceFeePct, fromLiveRow };
}

function positiveNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * An admin quoting the pair the other way round types 0.15 where 6.6 belongs, so
 * a sub-1 value is flipped instead of stored. Returns null when the result is
 * still outside the plausible band; callers then keep the last good value.
 */
export function normalizeCnyPerUsd(raw: number): number | null {
  const value = positiveNumber(raw);
  if (value === null) return null;
  const oriented = value < 1 ? 1 / value : value;
  return oriented < CNY_PER_USD_MIN || oriented > CNY_PER_USD_MAX ? null : oriented;
}

export function normalizeSosPerUsd(raw: number): number | null {
  const value = positiveNumber(raw);
  if (value === null) return null;
  const oriented = value < 1 ? 1 / value : value;
  return oriented < SOS_PER_USD_MIN || oriented > SOS_PER_USD_MAX ? null : oriented;
}

export const fxRatesUnavailableMessage =
  "Exchange rate unavailable — the live CNY→USD row could not be read, so amounts below are the last known or offline default and must not be billed on.";

let lastGood: FxRates = buildRates(
  DEFAULT_CNY_PER_USD,
  DEFAULT_SOS_PER_USD,
  DEFAULT_SERVICE_FEE_PCT
);
let cached: Promise<FxRates> | null = null;
const subscribers = new Set<(fx: FxRates) => void>();

async function loadRates(): Promise<{ rates: FxRates; reachedDb: boolean }> {
  try {
    // One active row per pair is a DB guarantee (202610030007: partial unique
    // index + trigger). newest-effective_from-first keeps that reading correct on
    // a deployment where the constraint has not landed yet.
    const { data, error } = await supabase
      .from("exchange_rates")
      .select("from_currency, to_currency, rate")
      .eq("is_active", true)
      .order("effective_from", { ascending: false })
      .limit(200);

    if (error) return { rates: { ...lastGood, fromLiveRow: false }, reachedDb: false };

    let cnyRaw: number | null = null;
    let sosRaw: number | null = null;
    for (const row of (data as any[]) || []) {
      const from = String(row?.from_currency ?? "").toUpperCase();
      const to = String(row?.to_currency ?? "").toUpperCase();
      const rate = positiveNumber(row?.rate);
      if (rate === null) continue;
      if (from === "CNY" && to === "USD" && cnyRaw === null) cnyRaw = rate;
      else if (from === "SOS" && to === "USD" && sosRaw === null) sosRaw = rate;
    }

    const cnyPerUsd = cnyRaw === null ? lastGood.cnyPerUsd : (normalizeCnyPerUsd(cnyRaw) ?? lastGood.cnyPerUsd);
    const sosPerUsd = sosRaw === null ? lastGood.sosPerUsd : (normalizeSosPerUsd(sosRaw) ?? lastGood.sosPerUsd);

    // The fee percentage has no column in exchange_rates — fx_rates() is its
    // only reader (it normalizes the historical 5-vs-0.05 shapes), so take it
    // from that RPC payload. Unreachable RPC keeps the last known fee; the
    // rates themselves already came back above.
    const { data: fxPayload, error: rpcError } = await supabase.rpc("fx_rates");
    const rpcFee = rpcError ? null : positiveNumber((fxPayload as any)?.service_fee_pct);
    const serviceFeePct = rpcFee ?? lastGood.serviceFeePct;

    // `fromLiveRow` is only true when an active CNY→USD row was actually read and
    // survived the band check. A default or last-known number is fine to show,
    // never to price a customer with.
    lastGood = buildRates(cnyPerUsd, sosPerUsd, serviceFeePct, cnyRaw !== null);
    return { rates: lastGood, reachedDb: true };
  } catch {
    return { rates: { ...lastGood, fromLiveRow: false }, reachedDb: false };
  }
}

/** Shared, deduplicated fetch: N admin screens mount, Supabase is hit once. */
export function getFxRates(): Promise<FxRates> {
  if (!cached) {
    cached = loadRates().then(({ rates, reachedDb }) => {
      // A DB we could not reach is retryable on the next mount; an empty table
      // is a legitimate answer and the defaults stand until a rate exists.
      if (!reachedDb) cached = null;
      return rates;
    });
  }
  return cached;
}

/**
 * Called after Settings writes a new rate: drop the cache and re-read once so
 * every mounted admin screen shows the same new number. Each subscriber added
 * through subscribeFx() (useFx included) is notified with the fresh value.
 */
export function invalidateFx(): void {
  cached = null;
  const next = getFxRates();
  for (const notify of subscribers) void next.then(notify);
}

/**
 * Fires `cb` with the fresh rates whenever invalidateFx() re-reads the table.
 * Returns the unsubscribe. useFx() registers through this same list, so there
 * is exactly one notification path.
 */
export function subscribeFx(cb: (fx: FxRates) => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** Reads the shared cached rates; triggers the one fetch on first use. */
export function useFx(): FxRates {
  const [fx, setFx] = useState<FxRates>(lastGood);

  useEffect(() => {
    let active = true;
    const notify = (next: FxRates) => {
      if (active) setFx(next);
    };
    const unsubscribe = subscribeFx(notify);
    void getFxRates().then(notify);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return fx;
}

/* ── Pure conversion helpers ───────────────────────────────────────
 * Keep full precision between steps: roundCents() belongs only to the final
 * display/store value. Rounding mid-chain drifts the SOS total by hundreds.
 */

export function usdFromCny(cny: number, cnyPerUsd: number): number {
  const amount = Number(cny);
  if (!Number.isFinite(amount) || !Number.isFinite(cnyPerUsd) || cnyPerUsd <= 0) return 0;
  return amount / cnyPerUsd;
}

export function cnyFromUsd(usd: number, cnyPerUsd: number): number {
  const amount = Number(usd);
  if (!Number.isFinite(amount) || !Number.isFinite(cnyPerUsd) || cnyPerUsd <= 0) return 0;
  return amount * cnyPerUsd;
}

export function sosFromUsd(usd: number, sosPerUsd: number): number {
  const amount = Number(usd);
  if (!Number.isFinite(amount) || !Number.isFinite(sosPerUsd) || sosPerUsd <= 0) return 0;
  return amount * sosPerUsd;
}

export function roundCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function formatSos(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "SOS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

/**
 * The human sentence the owner thinks in, e.g.
 * "1 CNY = $0.1515 · 1 CNY = 80.3 SOS · $1 = 530 SOS". Derived, never typed.
 */
export function derivedReadout(cnyPerUsd: number, sosPerUsd: number): string {
  if (!Number.isFinite(cnyPerUsd) || cnyPerUsd <= 0 || !Number.isFinite(sosPerUsd) || sosPerUsd <= 0) {
    return "Enter a rate to see the derived conversions";
  }
  const usdPerCny = 1 / cnyPerUsd;
  return `1 CNY = $${usdPerCny.toFixed(4)} · 1 CNY = ${(usdPerCny * sosPerUsd).toFixed(1)} SOS · $1 = ${sosPerUsd} SOS`;
}
