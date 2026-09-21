// ChinaSuuq — Test AI provider connection (admin-triggered).
// POST with { base_url, api_key, model }
// Attempts a minimal GET /models or /v1/models call to verify credentials.
// Returns success + model list, or detailed error for the admin to fix.

import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin, unauthorized } from "../_shared/auth.ts";

export async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  // SECURITY: this endpoint performs server-side requests to arbitrary
  // base_urls with caller-supplied credentials — an open SSRF/abuse probe if
  // left anonymous. Restrict to verified admins.
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized("admin_required");

  try {
    const body = await req.json();
    const { base_url, api_key, model } = body || {};

    if (!base_url || !api_key || !model) {
      return json({ ok: false, error: "missing_fields", detail: "base_url, api_key, and model are all required" }, 422);
    }

    // Normalize base URL
    const url = base_url.trim().replace(/\/$/, "");
    const modelsUrl = url + "/models";

    const resp = await fetch(modelsUrl, {
      method: "GET",
      headers: {
        "Authorization": "Bearer " + api_key,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (resp.status === 401) {
      return json({ ok: false, error: "unauthorized", detail: "API key is invalid or expired" }, 200);
    }
    if (resp.status === 403) {
      return json({ ok: false, error: "forbidden", detail: "API key lacks required permissions" }, 200);
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return json({ ok: false, error: "http_" + resp.status, detail: text.slice(0, 500) }, 200);
    }

    const data = await resp.json();
    const models = Array.isArray(data?.data) ? data.data.map((m: any) => m.id || m.name).filter(Boolean) : [];
    const modelFound = models.some((m: string) => m.toLowerCase() === model.toLowerCase());

    return json({
      ok: true,
      models_available: models.length,
      model_found: modelFound,
      model_requested: model,
      note: modelFound
        ? "Connection successful. Model is available."
        : "Connection successful but model '" + model + "' not found in available models. Models: " + models.slice(0, 10).join(", "),
    }, 200);
  } catch (e) {
    const msg = (e as Error).message || "unknown";
    if (msg.includes("timeout")) {
      return json({ ok: false, error: "timeout", detail: "Connection timed out after 15s — check base URL" }, 200);
    }
    return json({ ok: false, error: "connection_failed", detail: msg }, 200);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}


Deno.serve(handler);
