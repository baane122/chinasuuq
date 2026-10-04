// ChinaSuuq — ai-proxy: staff-gated chat completions through the configured
// AI provider (per-task `copilot` override, falling back to the global config).
//
// WHY: the Copilot page used to call the provider DIRECTLY from the browser
// with a hardcoded key baked into the bundle. Anyone could extract it. This
// function moves the model call server-side: the browser sends only the
// conversation; the key never leaves the edge runtime. Mission Control now
// uses the SAME provider configuration as every other AI task — change it in
// Settings → AI Provider and the Copilot follows.
//
// POST { messages: [{role, content}...], temperature?, max_tokens? }
//   → { ok: true, content: "..." } | { ok: false, error }
// Roles are limited to system/user/assistant; messages are length-capped.

import { corsHeaders } from "../_shared/cors.ts";
import { requireStaffOrAdmin, unauthorized } from "../_shared/auth.ts";
import { loadAiProviderForTask } from "../_shared/ai-provider.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_MESSAGES = 24;
const MAX_CHARS_PER_MESSAGE = 12_000;

export async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const caller = await requireStaffOrAdmin(req);
  if (!caller) return unauthorized("staff_required");

  try {
    const body = await req.json();
    const rawMessages = Array.isArray(body?.messages) ? body.messages : [];
    if (rawMessages.length === 0) {
      return json({ ok: false, error: "messages_required" }, 422);
    }
    if (rawMessages.length > MAX_MESSAGES) {
      return json({ ok: false, error: "too_many_messages" }, 422);
    }

    // Keep only clean, bounded chat turns.
    const messages = rawMessages
      .filter(
        (m: unknown): m is { role: string; content: string } =>
          !!m &&
          typeof (m as { role?: unknown }).role === "string" &&
          typeof (m as { content?: unknown }).content === "string" &&
          ["system", "user", "assistant"].includes((m as { role: string }).role)
      )
      .map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content.slice(0, MAX_CHARS_PER_MESSAGE),
      }));
    if (messages.length === 0) {
      return json({ ok: false, error: "no_valid_messages" }, 422);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const provider = await loadAiProviderForTask(supabase, "copilot");
    if (!provider) {
      return json({ ok: false, error: "ai_provider_not_configured" }, 503);
    }

    const temperature = typeof body?.temperature === "number"
      ? Math.min(Math.max(body.temperature, 0), 2)
      : 0.4;
    const maxTokens = typeof body?.max_tokens === "number"
      ? Math.min(Math.max(Math.round(body.max_tokens), 16), 4000)
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
      console.error("ai-proxy: provider call failed, status", resp.status);
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
    console.error("ai-proxy: unhandled error", (e as Error)?.name, (e as Error)?.message);
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
