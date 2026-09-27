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
  const out: TranslationMap = {};
  const lang = (targetLang || "").trim();
  if (!lang) return out;

  const wanted: string[] = [];
  for (const text of texts || []) {
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed || wanted.includes(trimmed)) continue;
    wanted.push(trimmed);
  }
  if (wanted.length === 0) return out;

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
    try {
      const { data } = await supabase.functions.invoke("ai-translate", {
        body: { texts: batch, target_lang: lang },
      });
      const results = (data as { results?: unknown })?.results;
      if (!Array.isArray(results)) throw new Error("unavailable");

      for (const row of results as RemoteResult[]) {
        const source = typeof row?.source === "string" ? row.source : "";
        if (!source || !wanted.includes(source)) continue;
        const translated =
          typeof row?.translated === "string" && row.translated.trim() ? row.translated.trim() : source;
        out[source] = translated;
        remember(cacheKey(lang, source), translated);
      }
      // Anything the function did not answer for keeps its original text.
      for (const text of batch) if (out[text] === undefined) out[text] = text;
      saveToStorage();
    } catch {
      for (const text of batch) if (out[text] === undefined) out[text] = text;
    }
  }

  return out;
}
