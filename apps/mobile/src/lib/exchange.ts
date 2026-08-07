// Live CNY ↔ USD exchange rate with AsyncStorage cache + offline fallback.
// Self-contained (no external deps beyond AsyncStorage).
// Open-ER API is free & keyless: https://open.er-api.com/v6/latest/USD

import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_EXCHANGE_RATE } from "./constants";

const RATE_CACHE_KEY = "chinasuuq-cny-rate-cache";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // refresh every 6h
const FALLBACK_RATE = 7.25;

let cachedRate: number | null = null;
let cachedAt: number | null = null;

interface RateCache {
  rate: number;
  ts: number;
}

async function safeGet(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function safeSet(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    /* ignore storage failures */
  }
}

/**
 * Returns CNY per 1 USD (e.g. 7.25). Falls back to cached then default.
 */
export async function getCnyPerUsd(): Promise<number> {
  if (cachedRate && cachedAt && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedRate;
  }

  // in-memory failed → try storage cache
  const stored = await safeGet(RATE_CACHE_KEY);
  if (stored) {
    try {
      const parsed: RateCache = JSON.parse(stored);
      const age = Date.now() - parsed.ts;
      if (parsed.rate && age < CACHE_TTL_MS) {
        cachedRate = parsed.rate;
        cachedAt = parsed.ts;
        return parsed.rate;
      }
    } catch {
      /* corrupt cache ignore */
    }
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data: any = await res.json();
    const rate = Number(data?.rates?.CNY);
    if (rate && rate > 1) {
      cachedRate = rate;
      cachedAt = Date.now();
      await safeSet(
        RATE_CACHE_KEY,
        JSON.stringify({ rate, ts: Date.now() } satisfies RateCache)
      );
      return rate;
    }
  } catch {
    /* network fail — fall through */
  }

  // offline fallback
  const fallback = stored ? (JSON.parse(stored)?.rate as number) || FALLBACK_RATE : FALLBACK_RATE;
  return fallback;
}

/**
 * 1 CNY → USD.
 */
export async function cnyToUsd(cny: number): Promise<number> {
  const rate = await getCnyPerUsd();
  return cny / rate;
}

/**
 * Format a CNY amount into a USD string using a provided (or fetched) rate.
 */
export async function formatCnyAsUsd(cny: number, cnyPerUsd?: number): Promise<string> {
  const rate = cnyPerUsd ?? (await getCnyPerUsd());
  const usd = cny / rate;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(usd);
}

/**
 * Reset cache (used by pull-to-refresh / settings).
 */
export async function refreshExchangeRate(): Promise<number> {
  cachedRate = null;
  cachedAt = null;
  await safeSet(RATE_CACHE_KEY, "").catch(() => {});
  return getCnyPerUsd();
}
