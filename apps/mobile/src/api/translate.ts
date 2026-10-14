// Client half of Stage 3 translation. Server work lives in the ai-translate
// edge function, which owns the paid provider and the durable cache; this file
// only keeps the app from re-asking for strings it already has.
//
// Best-effort like the rest of the offline-first mobile layer: a logged-out
// user, a dead backend or a refused batch returns the ORIGINAL strings rather
// than throwing, because untranslated Chinese text still renders.
//
// Caches are checked before the network and merged with what the function
// reports, so a warm list costs one call and a cold one costs ceil(n/40).

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";

/** Must stay <= the caps in functions/ai-translate. */
const MAX_BATCH = 40;
const MAX_CHARS = 2000;

const STORE_KEY = "chinasuuq-translate-cache";
const MAX_ENTRIES = 400;

export type TranslationMap = Record<string, string>;

type RemoteResult = { source?: unknown; translated?: unknown };

// Insertion order doubles as recency: re-reads delete+set, eviction drops the
// first key. One Map, no dependency.
const cache = new Map<string, string>();
let loaded = false;

const cacheKey = (lang: string, text: string) => `${lang}\u0000${text}`;

function recall(key: string): string | undefined {
  const value = cache.get(key);
  if (value === undefined) return undefined;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function remember(key: string, value: string): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

async function loadFromStorage(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (!raw) return;
    const entries = JSON.parse(raw) as [string, string][];
    if (!Array.isArray(entries)) return;
    for (const [key, value] of entries) {
      if (typeof key === "string" && typeof value === "string") remember(key, value);
    }
  } catch {
    /* corrupt or unreadable cache: start empty */
  }
}

function saveToStorage(): void {
  if (!loaded) return;
  AsyncStorage.setItem(STORE_KEY, JSON.stringify([...cache.entries()])).catch(() => {
    /* storage failures must not lose the translations already in memory */
  });
}

/**
 * Translate `texts` into `targetLang`, reusing every cached string.
 * Returns a map keyed by the trimmed source string; anything that could not be
 * translated maps to itself.
 */
export async function translateTexts(texts: string[], targetLang: string): Promise<TranslationMap> {
  return (await translateTextsDetailed(texts, targetLang)).map;
}

export interface TranslationOutcome {
  map: TranslationMap;
  /**
   * Sources whose batch never made it back (network, timeout, rate limit,
   * malformed response). The WebView pipeline needs this to un-stamp the DOM
   * nodes it reserved for them — otherwise one failed request leaves that
   * text Chinese for the rest of the page's life.
   */
  failed: string[];
}

/** Same as translateTexts, but also reports which strings could not be served. */
export async function translateTextsDetailed(
  texts: string[],
  targetLang: string
): Promise<TranslationOutcome> {
  const out: TranslationMap = {};
  const failed: string[] = [];
  const lang = (targetLang || "").trim();
  if (!lang) return { map: out, failed };

  const wanted: string[] = [];
  for (const text of texts || []) {
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed || wanted.includes(trimmed)) continue;
    wanted.push(trimmed);
  }
  if (wanted.length === 0) return { map: out, failed };

  await loadFromStorage();

  const misses: string[] = [];
  for (const text of wanted) {
    const hit = recall(cacheKey(lang, text));
    if (hit !== undefined) out[text] = hit;
    else if (text.length > MAX_CHARS) out[text] = text; // the server refuses these
    else misses.push(text);
  }

  for (let i = 0; i < misses.length; i += MAX_BATCH) {
    const batch = misses.slice(i, i + MAX_BATCH);
    let results: RemoteResult[] | null = null;
    try {
      // A 429 on an earlier batch parks the rest of this loop instead of
      // spending the remaining quota on calls that would also be refused.
      await waitForTranslateWindow();
      results = await requestBatch(batch, lang);
      if (!results) {
        // The contract is "every requested string has a map entry" — a caller
        // that does `map[t] || t` hides the gap, but one that reads map[t]
        // directly would render undefined. Keep the original text in the map
        // and record the string as failed so the WebView can un-stamp its nodes.
        for (const text of batch) {
          if (out[text] === undefined) out[text] = text;
          failed.push(text);
        }
      } else {
        for (const row of results) {
          const source = typeof row?.source === "string" ? row.source : "";
          if (!source || !wanted.includes(source)) continue;
          const translated =
            typeof row?.translated === "string" && row.translated.trim() ? row.translated.trim() : source;
          out[source] = translated;
          remember(cacheKey(lang, source), translated);
        }
        // Anything the function did not answer for keeps its original text.
        for (const text of batch) {
          if (out[text] === undefined) {
            out[text] = text;
            failed.push(text);
          }
        }
      }
      saveToStorage();
    } catch (error) {
      console.warn(`[translate] batch of ${batch.length} → ${lang} threw`, error);
      for (const text of batch) {
        if (out[text] === undefined) out[text] = text;
        failed.push(text);
      }
    }
  }

  return { map: out, failed };
}

/**
 * One network call for one batch, de-duplicated and time-boxed.
 *
 * Two things used to make the first paint slow on flaky connections: the same
 * batch could be requested twice (a NAV re-injection racing the first
 * answer), and `functions.invoke` has no timeout of its own, so a hung
 * request stalled every later batch in the loop. Identical in-flight batches
 * now share one promise, and a slow one is abandoned at REQUEST_TIMEOUT_MS.
 * Returns null when the batch could not be served.
 *
 * Rate limits are handled separately from other failures. ai-translate allows
 * MAX_REQUESTS_PER_MINUTE_PER_USER calls, and the old behaviour — treat 429
 * like any error, drain the next batch immediately — burned the whole quota on
 * one cold page and then left the text Chinese anyway (the in-page retry gives
 * up after 3 fails). A 429 now parks every later batch until the window opens.
 */
const REQUEST_TIMEOUT_MS = 9000;
const RATE_LIMIT_PARK_MS = 20000;
/** Server said "try again shortly" (503 from the new auth gate) — a much shorter pause. */
const TRANSIENT_PARK_MS = 8000;
const inFlight = new Map<string, Promise<RemoteResult[] | null>>();
let parkUntil = 0;

/** Never fire a batch before this moment (set by a 429 response). */
function translateCooldownRemaining(): number {
  return Math.max(0, parkUntil - Date.now());
}

function httpStatus(error: any): number {
  return Number(error?.context?.response?.status ?? error?.statusCode ?? 0);
}

function isRateLimitError(error: any): boolean {
  if (httpStatus(error) === 429) return true;
  return /429|rate[_ -]?limit/i.test(String(error?.message ?? ""));
}

/**
 * 503 from the edge functions means the gate could not reach auth or the profile
 * row — the session is fine and the next call may work. Parking a short while
 * beats burning the retry budget on a server hiccup.
 */
function isTransientServerError(error: any): boolean {
  if (httpStatus(error) === 503) return true;
  return /503|service_unavailable|retryable|profile_unreadable|auth_unavailable/i.test(
    String(error?.message ?? "")
  );
}

async function waitForTranslateWindow(): Promise<void> {
  const remaining = translateCooldownRemaining();
  if (remaining <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, remaining));
}

function requestBatch(batch: string[], lang: string): Promise<RemoteResult[] | null> {
  const key = `${lang}\u0000${batch.join("\u0001")}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const call = (async (): Promise<RemoteResult[] | null> => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const invoke = supabase.functions.invoke("ai-translate", {
        body: { texts: batch, target_lang: lang },
      });
      const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), REQUEST_TIMEOUT_MS);
      });
      const raced = await Promise.race([invoke, timeout]);
      if (raced === "timeout") {
        console.warn(`[translate] ai-translate timed out after ${REQUEST_TIMEOUT_MS}ms (${batch.length} texts)`);
        return null;
      }
      const { data, error } = raced as { data?: unknown; error?: unknown };
      if (error) {
        if (isRateLimitError(error)) {
          parkUntil = Date.now() + RATE_LIMIT_PARK_MS;
          console.warn(
            `[translate] rate limited by ai-translate; pausing translation for ${RATE_LIMIT_PARK_MS / 1000}s`
          );
        } else if (isTransientServerError(error)) {
          parkUntil = Date.now() + TRANSIENT_PARK_MS;
          console.warn(
            `[translate] ai-translate unavailable (server said retryable); pausing ${TRANSIENT_PARK_MS / 1000}s`
          );
        } else {
          console.warn("[translate] ai-translate invoke error", error);
        }
        return null;
      }
      const results = (data as { results?: unknown })?.results;
      if (!Array.isArray(results)) {
        // Rate-limited / degraded payloads have no results array.
        console.warn("[translate] ai-translate returned no results array", data);
        return null;
      }
      return results as RemoteResult[];
    } catch (error) {
      console.warn("[translate] ai-translate threw", error);
      return null;
    } finally {
      if (timer) clearTimeout(timer);
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, call);
  return call;
}
