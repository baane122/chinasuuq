/**
 * ChinaSuuq web AI client — chat completions through the `ai-chat` Supabase
 * Edge Function.
 *
 * NO provider key ships in the browser bundle anymore: the old hardcoded
 * direct credential leaked into the exported site chunks and is being
 * rotated. The public quote assistant and shipment concierge now send only
 * the conversation to the edge function, which resolves the Mission Control
 * provider server-side. Anonymous callers are allowed there but bounded by a
 * per-IP rate limit + request-size caps; the ONLY credential attached here is
 * the public Supabase anon key (same pattern as every other browser request).
 */

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiCallOptions {
  messages: AiMessage[];
  /** Kept for call-site compatibility; the server resolves the model. */
  tier?: "premium" | "fast" | "vision";
  temperature?: number;
  timeoutMs?: number;
  maxTokens?: number;
}

/**
 * Calls the ai-chat edge function. Returns the assistant's text content, or
 * null on any failure. Never throws — callers fall back gracefully.
 */
export async function aiChat(options: AiCallOptions): Promise<string | null> {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !anonKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
      },
      body: JSON.stringify({
        messages: options.messages,
        task: "concierge",
        ...(typeof options.temperature === "number" ? { temperature: options.temperature } : {}),
        ...(typeof options.maxTokens === "number" ? { max_tokens: options.maxTokens } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.ok) return null;
    const content: string | undefined = data?.content;
    return typeof content === "string" && content.trim().length > 0 ? content.trim() : null;
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
