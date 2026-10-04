/**
 * ChinaSuuq mobile AI client — routes through Supabase Edge Functions only.
 *
 * NO provider key ships in this bundle anymore (the old hardcoded direct
 * credential leaked into the APK and is being rotated). Every
 * chat call goes to the `ai-chat` edge function via supabase-js, which
 * attaches the signed-in user's JWT automatically; the function resolves the
 * Mission Control provider server-side, so switching/rotating providers needs
 * no app release. Logged-out or failed calls return null and callers fall
 * back gracefully — nothing here ever throws.
 *
 * Translation goes to `ai-translate` via src/api/translate.ts (paid cache,
 * JWT-gated).
 */
import { supabase as sb } from "./supabase";
import { translateTexts } from "../api/translate";

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Returns assistant text, or null on any failure. Never throws. */
export async function aiChat(
  messages: AiMessage[],
  opts?: { timeoutMs?: number }
): Promise<string | null> {
  try {
    const call = sb.functions
      .invoke("ai-chat", { body: { messages } })
      .then(({ data, error }) => {
        if (error || !data || !(data as { ok?: boolean }).ok) return null;
        const content = (data as { content?: unknown }).content;
        return typeof content === "string" && content.trim() ? content.trim() : null;
      })
      .catch(() => null);
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), opts?.timeoutMs ?? 25_000)
    );
    return await Promise.race([call, timeout]);
  } catch {
    return null;
  }
}

/** Extract first JSON value from a (possibly fenced) AI response. */
export function extractJson<T = unknown>(text: string): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  const open = candidate[start];
  const close = open === "[" ? "]" : "}";
  const end = candidate.lastIndexOf(close);
  if (end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/**
 * Translate product text to EN + SO through the ai-translate edge function
 * (server-side provider + durable cache; JWT attached by invoke()). Returns
 * null when nothing could be translated — logged out, offline, or the server
 * refused — so the caller shows its honest retry message instead of a
 * silent passthrough of the Chinese original.
 *
 * On top of the server's durable cache, a small in-memory TTL cache keyed by
 * the exact source text makes repeat translations free: text translated in
 * the last 30 minutes is answered from memory with zero edge-function round
 * trips, and two simultaneous asks for the same text share one in-flight call
 * instead of firing twice. Failed (null) results are deliberately NOT cached
 * so "try again" really retries.
 */
const TRANSLATION_TTL_MS = 30 * 60 * 1000;
const MAX_TRANSLATION_CACHE = 80;
const productTranslationCache = new Map<
  string,
  { at: number; value: { en: string; so: string } }
>();
const productTranslationInflight = new Map<
  string,
  Promise<{ en: string; so: string } | null>
>();

function cacheProductTranslation(key: string, value: { en: string; so: string }): void {
  productTranslationCache.delete(key);
  productTranslationCache.set(key, { at: Date.now(), value });
  while (productTranslationCache.size > MAX_TRANSLATION_CACHE) {
    const oldest = productTranslationCache.keys().next();
    if (oldest.done) break;
    productTranslationCache.delete(oldest.value);
  }
}

export async function aiTranslateProduct(
  title: string,
  description?: string
): Promise<{ en: string; so: string } | null> {
  const key = `${title}\u0000${description?.trim() ?? ""}`;
  const hit = productTranslationCache.get(key);
  if (hit) {
    if (Date.now() - hit.at < TRANSLATION_TTL_MS) return hit.value;
    productTranslationCache.delete(key);
  }
  const pending = productTranslationInflight.get(key);
  if (pending) return pending;

  const call = translateProductUncached(title, description).then((value) => {
    if (value) cacheProductTranslation(key, value);
    return value;
  });
  productTranslationInflight.set(key, call);
  void call.finally(() => productTranslationInflight.delete(key));
  return call;
}

async function translateProductUncached(
  title: string,
  description?: string
): Promise<{ en: string; so: string } | null> {
  const sources = description && description.trim() ? [title, description] : [title];
  const [enMap, soMap] = await Promise.all([
    translateTexts(sources, "en"),
    translateTexts(sources, "so"),
  ]);
  const enTitle = enMap[title] ?? "";
  const soTitle = soMap[title] ?? "";
  if (!enTitle || !soTitle) return null;

  // translateTexts maps anything it could not translate back to itself. When
  // NEITHER language moved for ANY input the call did nothing real.
  if (enTitle === title && soTitle === title) {
    if (!description || (enMap[description] === description && soMap[description] === description)) {
      return null;
    }
  }

  const enDesc = description ? enMap[description] ?? "" : "";
  const soDesc = description ? soMap[description] ?? "" : "";
  return {
    en: enDesc && enDesc !== enTitle ? `${enTitle}\n\n${enDesc}` : enTitle,
    so: soDesc && soDesc !== soTitle ? `${soTitle}\n\n${soDesc}` : soTitle,
  };
}

export interface RankedProduct {
  id: string;
  reason: string;
}

/** Rank products for a natural-language query. Returns null on failure. */
export async function aiRankProducts(
  query: string,
  products: { id: string; title: string; category: string; price_usd: number }[]
): Promise<RankedProduct[] | null> {
  const raw = await aiChat(
    [
      {
        role: "user",
        content:
          "You are a shopping assistant. Given the customer query and product list JSON, pick the best 5 matches. " +
          'Reply with JSON array [{"id":"...","reason":"one short line"}] only.\n\n' +
          `Query: ${query}\nProducts: ${JSON.stringify(products)}`,
      },
    ],
    { timeoutMs: 20_000 }
  );
  const parsed = raw ? extractJson<RankedProduct[]>(raw) : null;
  if (parsed && Array.isArray(parsed) && parsed.length > 0)
    return parsed.slice(0, 5);
  return null;
}
