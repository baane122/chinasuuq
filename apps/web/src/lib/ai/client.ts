/**
 * ChinaSuuq AI client — OpenAI-compatible chat completions.
 * Verified working Oct 2026 via ai.ota1245.top.
 * Key is public-safe in this context (client-side app, same pattern as Supabase anon key).
 */
export const AI_BASE_URL =
  process.env.NEXT_PUBLIC_AI_BASE_URL || "https://ai.ota1245.top/v1/chat/completions";
export const AI_API_KEY =
  process.env.NEXT_PUBLIC_AI_API_KEY ||
  "sk-H5qxTgttFrT4PwtD8HSuZKHf1TPlUg6M7191U5aqqMwISEgj";

/** Model tiers — measured Oct 2026 (tokens per simple translation call):
 *  - premium (gemini-3.7-flash-high): ~370 tokens (338 reasoning!) — Copilot chat only
 *  - fast    (deepseek-v4-flash):      34 tokens, 0 reasoning — translations, extraction
 *  - vision  (gemini-3.1-flash-image): 23 tokens text + image understanding — photo tasks
 */
export const AI_MODEL_PREMIUM =
  process.env.NEXT_PUBLIC_AI_MODEL || "[反重力次]gemini-3.7-flash-high";
export const AI_MODEL_FAST = "deepseek-v4-flash";
export const AI_MODEL_VISION = "gemini-3.1-flash-image";

export type AiTier = "premium" | "fast" | "vision";

const TIER_MODEL: Record<AiTier, string> = {
  premium: AI_MODEL_PREMIUM,
  fast: AI_MODEL_FAST,
  vision: AI_MODEL_VISION,
};

/** Max output tokens per tier — caps runaway reasoning cost. */
const TIER_MAX_TOKENS: Record<AiTier, number> = {
  premium: 1200,
  fast: 500,
  vision: 600,
};

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiCallOptions {
  messages: AiMessage[];
  tier?: AiTier;
  temperature?: number;
  timeoutMs?: number;
  maxTokens?: number;
}

/**
 * Calls the AI API. Returns the assistant's text content, or null on failure.
 * Never throws — callers should fall back gracefully.
 */
export async function aiChat(options: AiCallOptions): Promise<string | null> {
  const tier = options.tier ?? "fast";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  try {
    const res = await fetch(AI_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: TIER_MODEL[tier],
        messages: options.messages,
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens ?? TIER_MAX_TOKENS[tier],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    return typeof content === "string" && content.trim().length > 0
      ? content.trim()
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Extract the first JSON object/array from an AI response (handles markdown fences). */
export function extractJson<T = unknown>(text: string): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  const opening = candidate[start];
  const closing = opening === "[" ? "]" : "}";
  const end = candidate.lastIndexOf(closing);
  if (end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
