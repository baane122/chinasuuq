// Phase 4 — AI gateway guardrail (server-side).
// Marketplace pages are UNTRUSTED content. Extraction has NO operational
// tools and requires a strict schema. Prompt-injection markers are rejected
// before any model call. The model call is honest-174: it only returns the
// policy contract unless a provider key exists — never fabricated output.

import { corsHeaders } from "../_shared/cors.ts";

const INJECTION_MARKERS = [
  "ignore previous", "ignore all previous", "you are now", "system prompt",
  "reveal your", "forget the instructions", "overwrite",
];

export async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    if (!body?.content) return json({ ok: false, error: "no_content" }, 400);
    const lower = String(body.content).toLowerCase();
    const hit = INJECTION_MARKERS.find((m) => lower.includes(m));
    if (hit) return json({ ok: false, blocked: true, reason: "prompt_injection_marker", marker: hit }, 422);
    if (!body?.schema) return json({ ok: false, error: "schema_required", blocked: true }, 422);

    const providerKey = Deno.env.get("OPENAI_API_KEY") || Deno.env.get("ANTHROPIC_API_KEY");
    if (!providerKey) {
      return json({ ok: false, error: "ai_provider_not_configured" }, 503);
    }
    // NOTE: real gateway model call lands here. It must run with zero tools
    // and validate output against the required schema.
    return json({ ok: true, policy: { role: "extraction", toolsEnabled: false, schemaRequired: true, actionAuthorization: "none" }, note: "model_call_not_yet_wired" }, 200);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message || "internal" }, 500);
  }
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}


Deno.serve(handler);
