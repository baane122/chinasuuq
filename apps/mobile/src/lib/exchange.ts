// Single reactive FX store for the whole app.
//
// TABLE CONTRACT (exchange_rates): `rate` ALWAYS means "how many units of
// from_currency equal 1 unit of to_currency".
//   ('CNY','USD') = CNY per 1 USD (e.g. 6.6)   →  USD = CNY / rate
//   ('SOS','USD') = SOS per 1 USD (e.g. 530)   →  SOS = USD * rate
// A CNY→USD row with 0 < rate < 1 was entered upside-down: flip it (1/rate).
//
// Source order on refresh: memory → AsyncStorage (15 min TTL) → the
// admin-managed `exchange_rates` table → open.er-api.com (USD base) → the
// DEFAULT_* offline constants. An implausible value (outside the sane ranges
// below) is never applied — the last good cached value is kept and a
// console.warn is logged.
//
// Screens should read the store through useFx()/getFxSync(); money math
// rounds to cents only at the final display step.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { useSyncExternalStore } from "react";
import { DEFAULT_CNY_PER_USD, DEFAULT_SOS_PER_USD } from "./constants";
import { supabase } from "./supabase";

export { DEFAULT_CNY_PER_USD, DEFAULT_SOS_PER_USD };

const FX_CACHE_KEY = "chinasuuq-fx-cache";
const CACHE_TTL_MS = 15 * 60 * 1000; // refresh every 15min so admin rate changes land quickly

export interface FxSnapshot {
  cnyPerUsd: number;
  usdPerCny: number;
  sosPerUsd: number;
  ready: boolean; // a live/managed rate has been loaded (not just the offline default)
}

type FxSource = "default" | "storage" | "exchange_rates" | "er-api";

interface FxState {
  cnyPerUsd: number;
  sosPerUsd: number;
  updatedAt: number;
  source: FxSource;
}

const fx: FxState = {
  cnyPerUsd: DEFAULT_CNY_PER_USD,
  sosPerUsd: DEFAULT_SOS_PER_USD,
  updatedAt: 0,
  source: "default",
};

let ready = false;
let hydrated = false;
let inflight: Promise<void> | null = null;
let appStateWired = false;

const listeners = new Set<() => void>();

// Snapshot object is rebuilt only on mutation so useSyncExternalStore's
// Object.is comparison does not loop forever.
let snap: FxSnapshot = buildSnap();

function buildSnap(): FxSnapshot {
  return {
    cnyPerUsd: fx.cnyPerUsd,
    usdPerCny: 1 / fx.cnyPerUsd,
    sosPerUsd: fx.sosPerUsd,
    ready,
  };
}

function notify(): void {
  snap = buildSnap();
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* a listener must never break the store */
    }
  });
}

// ── plausibility guards ────────────────────────────────────────────────────

function saneCnyPerUsd(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  const rate = n < 1 ? 1 / n : n; // flipped row: USD-per-CNY entered as CNY-per-USD
  // Same band as public.fx_rates() and the admin's src/lib/fx.ts (2–20). If the
  // phone were stricter than the server it would silently reject a rate the
  // owner is allowed to save and price the app on a stale number.
  return rate >= 2 && rate <= 20 ? rate : null;
}

function saneSosPerUsd(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  const rate = n < 1 ? 1 / n : n;
  return rate >= 100 && rate <= 5000 ? rate : null;
}

function applyRates(
  next: { cnyPerUsd?: number | null; sosPerUsd?: number | null },
  source: FxSource,
  at = Date.now()
): void {
  let changed = false;
  if (next.cnyPerUsd != null) {
    const sane = saneCnyPerUsd(next.cnyPerUsd);
    if (sane === null) {
      console.warn(`[exchange] implausible CNY→USD rate ${next.cnyPerUsd}; keeping ${fx.cnyPerUsd}`);
    } else if (sane !== fx.cnyPerUsd) {
      fx.cnyPerUsd = sane;
      changed = true;
    }
  }
  if (next.sosPerUsd != null) {
    const sane = saneSosPerUsd(next.sosPerUsd);
    if (sane === null) {
      console.warn(`[exchange] implausible SOS→USD rate ${next.sosPerUsd}; keeping ${fx.sosPerUsd}`);
    } else if (sane !== fx.sosPerUsd) {
      fx.sosPerUsd = sane;
      changed = true;
    }
  }
  const wasReady = ready;
  const wasStale = Date.now() - fx.updatedAt >= CACHE_TTL_MS;
  fx.updatedAt = at;
  fx.source = source;
  if (source !== "default") ready = true;
  if (changed || ready !== wasReady || wasStale) {
    notify();
    if (changed || source !== "storage") void persist();
  }
}

// ── AsyncStorage ───────────────────────────────────────────────────────────

interface FxCache {
  cnyPerUsd?: number;
  sosPerUsd?: number;
  rate?: number; // legacy shape: CNY-per-USD only
  ts: number;
}

async function persist(): Promise<void> {
  try {
    await AsyncStorage.setItem(
      FX_CACHE_KEY,
      JSON.stringify({ cnyPerUsd: fx.cnyPerUsd, sosPerUsd: fx.sosPerUsd, ts: fx.updatedAt } satisfies FxCache)
    );
  } catch {
    /* ignore storage failures */
  }
}

async function hydrateFromStorage(): Promise<void> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(FX_CACHE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as FxCache;
    if (!parsed || typeof parsed.ts !== "number") return;
    applyRates({ cnyPerUsd: parsed.cnyPerUsd ?? parsed.rate, sosPerUsd: parsed.sosPerUsd }, "storage", parsed.ts);
  } catch {
    /* corrupt cache ignore */
  }
}

// ── remote sources ─────────────────────────────────────────────────────────

/**
 * Read both active pairs from the admin-managed `exchange_rates` table in one
 * round trip. The live table (per the admin Rates screen) uses
 * from_currency/to_currency/effective_from; the original migration
 * (202408010003) named them source_currency/target_currency/valid_from —
 * try live names first, then migration names. Rows are ordered newest-first,
 * so the first row per from_currency wins.
 */
async function fetchRatesFromSupabase(): Promise<{ cnyPerUsd: number | null; sosPerUsd: number | null }> {
  const vocabs = [
    { from: "from_currency", to: "to_currency", order: "effective_from" },
    { from: "source_currency", to: "target_currency", order: "valid_from" },
  ];
  for (const v of vocabs) {
    try {
      const { data, error } = await supabase
        .from("exchange_rates")
        .select(`rate, ${v.from}, ${v.to}`)
        .eq("is_active", true)
        .in(v.to, ["USD"])
        .order(v.order, { ascending: false });
      if (error || !data) continue;
      let cny: number | null = null;
      let sos: number | null = null;
      for (const row of data as unknown as Record<string, unknown>[]) {
        const from = String(row[v.from] ?? "");
        const rate = Number(row.rate);
        if (from === "CNY" && cny === null) cny = rate;
        if (from === "SOS" && sos === null) sos = rate;
      }
      if (cny !== null || sos !== null) return { cnyPerUsd: saneCnyPerUsd(cny), sosPerUsd: saneSosPerUsd(sos) };
    } catch {
      /* table missing / offline — fall through to the public API */
    }
  }
  return { cnyPerUsd: null, sosPerUsd: null };
}

/** open.er-api.com with USD as base: rates.CNY = CNY per USD, rates.SOS = SOS per USD. */
async function fetchRatesFromErApi(): Promise<{ cnyPerUsd: number | null; sosPerUsd: number | null }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: controller.signal });
    clearTimeout(timer);
    const data: any = await res.json();
    return { cnyPerUsd: Number(data?.rates?.CNY) || null, sosPerUsd: Number(data?.rates?.SOS) || null };
  } catch {
    return { cnyPerUsd: null, sosPerUsd: null };
  }
}

function refreshRemote(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    const db = await fetchRatesFromSupabase();
    let cny = db.cnyPerUsd;
    let sos = db.sosPerUsd;
    let source: FxSource | null = cny !== null || sos !== null ? "exchange_rates" : null;
    if (cny === null || sos === null) {
      const api = await fetchRatesFromErApi();
      if (api.cnyPerUsd !== null || api.sosPerUsd !== null) {
        if (cny === null) cny = saneCnyPerUsd(api.cnyPerUsd);
        if (sos === null) sos = saneSosPerUsd(api.sosPerUsd);
        source = source ?? "er-api";
      }
    }
    if (source) applyRates({ cnyPerUsd: cny, sosPerUsd: sos }, source);
    else console.warn("[exchange] no reachable rate source; keeping last good value");
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function ensureFx(): Promise<void> {
  if (!hydrated) {
    hydrated = true;
    await hydrateFromStorage();
  }
  if (Date.now() - fx.updatedAt < CACHE_TTL_MS && ready) return;
  await refreshRemote();
}

// ── public API ─────────────────────────────────────────────────────────────

/** Synchronous read of the store — never awaits, never throws. */
export function getFxSync(): FxSnapshot {
  return snap;
}

export function subscribeFx(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive hook: returns the cached rate immediately (no wrong-rate flash)
 *  and re-renders when the store refreshes. */
export function useFx(): FxSnapshot {
  return useSyncExternalStore(subscribeFx, getFxSync, getFxSync);
}

/** Load from storage/remote (non-blocking) and re-pull whenever the app
 *  returns to the foreground. Call once at boot. */
export function warmFx(): void {
  void ensureFx();
  if (!appStateWired) {
    appStateWired = true;
    AppState.addEventListener("change", (status) => {
      if (status === "active") void refreshRemote();
    });
  }
}

/** Force a refresh (pull-to-refresh / settings / app-focus). Does not mutate
 *  the store with bad values; safe to fire-and-forget from render paths. */
export async function refreshFx(): Promise<FxSnapshot> {
  hydrated = true;
  await refreshRemote();
  return getFxSync();
}

/** CNY → USD, SOS → USD etc. with the live store; NaN-safe. */
export function cnyToUsdSync(cny: number): number {
  const n = Number(cny);
  return Number.isFinite(n) ? n / fx.cnyPerUsd : 0;
}

export function usdToCnySync(usd: number): number {
  const n = Number(usd);
  return Number.isFinite(n) ? n * fx.cnyPerUsd : 0;
}

export function usdToSosSync(usd: number): number {
  const n = Number(usd);
  return Number.isFinite(n) ? n * fx.sosPerUsd : 0;
}

export function sosToUsdSync(sos: number): number {
  const n = Number(sos);
  return Number.isFinite(n) ? n / fx.sosPerUsd : 0;
}

export function cnyToSosSync(cny: number): number {
  return usdToSosSync(cnyToUsdSync(cny));
}

/**
 * Last known CNY per 1 USD, for synchronous row-mapping (db/index.ts).
 * Reads the warmed store; only a truly cold start returns the default.
 */
export function getCachedCnyPerUsdSync(): number {
  return fx.cnyPerUsd;
}

/**
 * Returns CNY per 1 USD. Source order: cached (memory/AsyncStorage, 15min
 * TTL) → `exchange_rates` table → open.er-api.com → offline constants.
 */
export async function getCnyPerUsd(): Promise<number> {
  await ensureFx();
  return fx.cnyPerUsd;
}

/**
 * 1 CNY → USD.
 */
export async function cnyToUsd(cny: number): Promise<number> {
  await getCnyPerUsd();
  return cnyToUsdSync(cny);
}

/**
 * Format a CNY amount into a USD string using a provided (or live) rate.
 * Rounding to cents happens here, at the display step.
 */
export async function formatCnyAsUsd(cny: number, cnyPerUsd?: number): Promise<string> {
  const rate = Number(cnyPerUsd) > 0 ? Number(cnyPerUsd) : await getCnyPerUsd();
  const usd = Number(cny) / rate;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(usd) ? usd : 0);
}

/**
 * Reset + force-pull (used by pull-to-refresh / settings).
 */
export async function refreshExchangeRate(): Promise<number> {
  fx.updatedAt = 0;
  await refreshFx();
  return fx.cnyPerUsd;
}
