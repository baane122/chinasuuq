// ChinaSuuq — ai-chat: chat completions for CUSTOMER-FACING surfaces through
// the Mission Control–configured provider (per-task `copilot` resolution, the
// same path ai-proxy uses for staff).
//
// WHY: the quote assistant and the shipment concierge live on PUBLIC pages and
// used to call the provider directly from the browser with a key baked into
// the bundle. Anyone could extract it and anonymous visitors could spend the
// key without limit. This function moves the model call server-side: the
// browser sends only the conversation; the key never leaves the edge runtime.
//
// Auth: any signed-in role in {customer, staff, super_admin} rides free (their
// JWT is verified). Anonymous callers are ALSO allowed — but only through a
// per-isolate IP rate limiter (20 req/hour), a ~8 KB request-body cap, and a
// 4 000-character cap on the total message content. Errors come back as
// { ok: false, error } with 413/429 status codes.
//
// POST { messages: [{role, content}...], task?: 'copilot'|'concierge',
//        temperature?, max_tokens? }
//   → { ok: true, content: "..." } | { ok: false, error }
// The `task` label is accepted for UI attribution; provider resolution today
// uses the `copilot` provider (ai_provider_tasks has no 'concierge' row — new
// task keys land in _shared/ai-provider.ts's AiTask list first).

import { corsHeaders } from "../_shared/cors.ts";
import { requireRole } from "../_shared/auth.ts";
import { loadAiProviderForTask } from "../_shared/ai-provider.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_MESSAGES = 24;
const MAX_CHARS_PER_MESSAGE = 12_000;

// Anonymous protections.
const ANON_MAX_BODY_BYTES = 8_192; // ~8 KB request body
const ANON_MAX_TOTAL_CHARS = 4_000; // sum of all message content
const ANON_MAX_REQUESTS_PER_HOUR = 20;

const SIGNED_IN_ROLES = ["customer", "staff", "super_admin"];

// Per-isolate rate limit for anonymous callers. Deliberately simple: it is a
// cost brake, not a fortress — Supabase scales isolates freely, so a global
// ledger would need a table; this bounds casual abuse per cold isolate.
const anonHits = new Map<string, { count: number; windowStart: number }>();
const HOUR_MS = 60 * 60 * 1000;

function anonRateLimited(ip: string): boolean {
  const now = Date.now();
  if (anonHits.size > 5_000) {
    // prune expired entries before growing unbounded
    for (const [key, hit] of anonHits) {
      if (now - hit.windowStart > HOUR_MS) anonHits.delete(key);
    }
  }
  const entry = anonHits.get(ip);
  if (!entry || now - entry.windowStart > HOUR_MS) {
    anonHits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > ANON_MAX_REQUESTS_PER_HOUR;
}

function callerIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}

function hasBearer(req: Request): boolean {
  return (req.headers.get("Authorization") ?? "").startsWith("Bearer ");
}

// supabase-js ALWAYS sends a Bearer token — for a logged-out visitor that is
// the anon key (JWT role="anon"). Treating that as "signed in" made every
// anonymous call hit requireRole and 401, which killed the public quote/track
// pages' AI features. An anon-key bearer therefore rides the rate-limited
// anonymous path; a real user JWT still must pass the role check below.
function bearerIsAnonKey(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return payload?.role === "anon";
  } catch {
    return false;
  }
}

export async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    // 1. Authenticate when a token is present; a BAD token is a hard 401
    //    (never silently treated as anonymous). No token → anon path.
    const signedIn = hasBearer(req) && !bearerIsAnonKey(req);
    if (signedIn) {
      const caller = await requireRole(req, SIGNED_IN_ROLES);
      if (!caller) return json({ ok: false, error: "unauthorized" }, 401);
    }

    // 2. Parse the body. Anonymous callers get a raw-size cap before parsing.
    const raw = await req.text();
    if (!signedIn && raw.length > ANON_MAX_BODY_BYTES) {
      return json({ ok: false, error: "request_too_large", max_bytes: ANON_MAX_BODY_BYTES }, 413);
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: "invalid_json" }, 400);
    }

    const rawMessages = Array.isArray(body?.messages) ? body.messages : [];
    if (rawMessages.length === 0) {
      return json({ ok: false, error: "messages_required" }, 422);
    }
    if (rawMessages.length > MAX_MESSAGES) {
      return json({ ok: false, error: "too_many_messages" }, 422);
    }

    // Keep only clean, bounded chat turns (same filter as ai-proxy).
    const messages = (rawMessages as unknown[])
      .filter(
        (m): m is { role: string; content: string } =>
          !!m &&
          typeof (m as { role?: unknown }).role === "string" &&
          typeof (m as { content?: unknown }).content === "string" &&
          ["system", "user", "assistant"].includes((m as { role: string }).role)
      )
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS_PER_MESSAGE) }));
    if (messages.length === 0) {
      return json({ ok: false, error: "no_valid_messages" }, 422);
    }

    // 3. Anonymous guards: total content cap, then the per-IP rate limit.
    if (!signedIn) {
      const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
      if (totalChars > ANON_MAX_TOTAL_CHARS) {
        return json(
          { ok: false, error: "message_content_too_long", max_chars: ANON_MAX_TOTAL_CHARS },
          413
        );
      }
      if (anonRateLimited(callerIp(req))) {
        return json(
          { ok: false, error: "rate_limited", max_per_hour: ANON_MAX_REQUESTS_PER_HOUR },
          429
        );
      }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 'copilot' is the chat task in ai_provider_tasks; 'concierge' (and any
    // unknown label) resolves to the same provider until it gets its own row.
    // The cast adapts supabase-js's PostgrestBuilder (a thenable, not a
    // Promise) to the shared helper's deliberately minimal structural type.
    const provider = await loadAiProviderForTask(
      supabase as unknown as Parameters<typeof loadAiProviderForTask>[0],
      "copilot"
    );
    if (!provider) {
      return json({ ok: false, error: "ai_provider_not_configured" }, 503);
    }

    const temperature = typeof body?.temperature === "number"
      ? Math.min(Math.max(body.temperature, 0), 2)
      : 0.4;
    const maxTokens = typeof body?.max_tokens === "number"
      ? Math.min(Math.max(Math.round(body.max_tokens), 16), signedIn ? 4000 : 800)
      : 1200;

    let resp: Response;
    try {
      resp = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: provider.model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      // Timeout is an AbortSignal DOMException: classified by e.name (the
      // message is "The operation was aborted", never "TimeoutError").
      const name = (e as Error)?.name ?? "";
      if (name === "TimeoutError" || name === "AbortError") {
        return json({ ok: false, error: "model_timeout" }, 504);
      }
      return json({ ok: false, error: "model_unreachable" }, 502);
    }

    if (!resp.ok) {
      // Status only — the request headers held the key, so nothing from this
      // response body may be echoed back to the caller (ai-translate pattern).
      console.error("ai-chat: provider call failed, status", resp.status);
      return json({ ok: false, error: "provider_error", status: resp.status }, 502);
    }

    const data = await resp.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return json({ ok: false, error: "empty_response" }, 502);
    }

    return json({ ok: true, content: content.trim(), model: provider.model }, 200);
  } catch (e) {
    // Stable code only — the raw exception message never reaches the caller.
    console.error("ai-chat: unhandled error", (e as Error)?.name, (e as Error)?.message);
    return json({ ok: false, error: "internal_error" }, 500);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(handler);
