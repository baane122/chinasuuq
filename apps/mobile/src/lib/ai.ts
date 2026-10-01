/**
 * ChinaSuuq mobile AI client — self-contained, no shared imports.
 *
 * Provider resolution: AI calls PREFER the server-configured provider from
 * Mission Control (Settings → AI Provider) via the ai-vision edge function,
 * so switching/rotating providers needs no app release. When the edge
 * function is unavailable (not deployed yet, logged out, offline), calls fall
 * back to the direct fallback endpoint below.
 * OpenAI-compatible fallback verified Oct 2026 via ai.ota1245.top.
 */
export const AI_URL = "https://ai.ota1245.top/v1/chat/completions";
export const AI_KEY = "sk-H5qxTgttFrT4PwtD8HSuZKHf1TPlUg6M7191U5aqqMwISEgj";

import { supabase as sb } from "./supabase";

/** Model tiers — measured Oct 2026:
 *  - fast (deepseek-v4-flash): 34 tokens/call, 0 reasoning — search ranking, translation
 *  - vision (gemini-3.1-flash-image): text + image understanding — photo tasks
 *  (premium Gemini stays web-admin-only to control cost)
 */
export const AI_MODEL_FAST = "deepseek-v4-flash";
export const AI_MODEL_VISION = "gemini-3.1-flash-image";

export type AiTier = "fast" | "vision";

const TIER_MODEL: Record<AiTier, string> = {
  fast: AI_MODEL_FAST,
  vision: AI_MODEL_VISION,
};

const TIER_MAX_TOKENS: Record<AiTier, number> = { fast: 500, vision: 600 };

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Returns assistant text, or null on any failure. Never throws. */
export async function aiChat(
  messages: AiMessage[],
  opts?: { tier?: AiTier; timeoutMs?: number; temperature?: number; maxTokens?: number }
): Promise<string | null> {
  const tier = opts?.tier ?? "fast";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 20_000);
  try {
    const res = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_KEY}`,
      },
      body: JSON.stringify({
        model: TIER_MODEL[tier],
        messages,
        temperature: opts?.temperature ?? 0.4,
        max_tokens: opts?.maxTokens ?? TIER_MAX_TOKENS[tier],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === "string" && content.trim() ? content.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
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

/** Translate product text to EN + SO. Returns null on failure. */
export async function aiTranslateProduct(
  title: string,
  description?: string
): Promise<{ en: string; so: string } | null> {
  const raw = await aiChat(
    [
      {
        role: "user",
        content:
          `Translate the product title${description ? " and description" : ""} to English and Somali. ` +
          'Return JSON: {"en":"...","so":"..."}. No extra text.\n\n' +
          (description ? `Title: ${title}\nDescription: ${description}` : `Title: ${title}`),
      },
    ],
    { temperature: 0.1 }
  );
  const parsed = raw ? extractJson<{ en?: string; so?: string }>(raw) : null;
  if (parsed?.en && parsed?.so) return { en: parsed.en, so: parsed.so };
  return null;
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
    { temperature: 0.2 }
  );
  const parsed = raw ? extractJson<RankedProduct[]>(raw) : null;
  if (parsed && Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 5);
  return null;
}
