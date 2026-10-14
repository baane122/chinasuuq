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
 *
 * CONVENTION NOTE: `edgeFetch` in ../supabase.ts is the sanctioned way to call
 * an edge function, and it already attaches `apikey` + the caller's JWT (and
 * since 2026-10-14 a default deadline of its own). This module deliberately
 * keeps its own `fetch` because an AI call needs two things `edgeFetch` still
 * does not give the caller: a deadline the CALLER picks (the quote form asks
 * for 12 s, the default is 30 s — a hung model answer must not sit on a form a
 * customer is filling in) and the HTTP STATUS, which is what separates "rate
 * limited, ask again shortly" from "the assistant is down". The header set
 * therefore mirrors `edgeFetch` exactly — a hand-rolled fetch
 * that forgot the Authorization header used to answer 401 at the gateway before
 * the function ran, which is why the public AI features looked broken.
 */

import { supabase } from "../supabase";

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
 * Why an AI call did not answer. Surfaced in the console and used by the
 * components to decide between "the assistant is busy" and "check your
 * connection"; a deployment error and a flaky network are not the same
 * message to a customer.
 */
export type AiCallFailure =
  | "not_configured"
  | "offline"
  | "timeout"
  | "unauthorized"
  | "rate_limited"
  | "server"
  | "empty"
  | "unknown";

/**
 * The Bearer token to send with the function call.
 *
 * This client used to send only the `apikey` header and no Authorization at
 * all. Supabase edge functions default to `verify_jwt = on`, and the gateway
 * answers those requests 401 *before the function runs* — so the public quote
 * assistant and the shipment concierge on /track silently returned nothing,
 * which reads as "the AI is broken" rather than "the request was never
 * accepted". `ai-chat` explicitly supports an anon-key bearer on its rate-limited
 * anonymous path, so sending the anon key when nobody is signed in works under
 * both gateway settings, and a signed-in customer or staff member arrives with
 * the role the function is allowed to check for.
 */
async function bearerToken(anonKey: string): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || anonKey;
  } catch {
    return anonKey;
  }
}

function describeStatus(status: number): AiCallFailure {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "rate_limited";
  return "server";
}

/**
 * Calls the ai-chat edge function. Returns the assistant's text content, or
 * null on any failure. Never throws — callers fall back gracefully. The reason
 * is logged (never the conversation, which can carry a customer's address) so a
 * silent fallback is at least diagnosable.
 */
export async function aiChat(options: AiCallOptions): Promise<string | null> {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !anonKey) {
    // A build-time misconfiguration, not a runtime blip: the exported site was
    // built without its public env pair, so every AI affordance is dead on
    // every page. Say so loudly once per call instead of returning null.
    console.warn(
      "[ai-chat] not_configured: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing from this build"
    );
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  let failure: AiCallFailure | null = null;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${await bearerToken(anonKey)}`,
      },
      body: JSON.stringify({
        messages: options.messages,
        task: "concierge",
        ...(typeof options.temperature === "number" ? { temperature: options.temperature } : {}),
        ...(typeof options.maxTokens === "number" ? { max_tokens: options.maxTokens } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      failure = describeStatus(res.status);
      return null;
    }
    const data = await res.json();
    if (!data?.ok) {
      failure = "server";
      return null;
    }
    const content: string | undefined = data?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      failure = "empty";
      return null;
    }
    return content.trim();
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const message = err instanceof Error ? err.message : String(err ?? "");
    failure =
      controller.signal.aborted || name === "AbortError"
        ? "timeout"
        : err instanceof TypeError || /fetch|network/i.test(message)
          ? "offline"
          : "unknown";
    return null;
  } finally {
    clearTimeout(timer);
    // One diagnosable line per silent fallback — the reason only, never the
    // conversation, which can contain a customer's address and phone number.
    if (failure) console.warn(`[ai-chat] no answer: ${failure}`);
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
