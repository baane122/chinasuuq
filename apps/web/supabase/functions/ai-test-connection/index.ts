// ChinaSuuq — Test AI provider connection (admin-triggered).
// POST { base_url?, api_key?, model?, task? }
// Attempts a minimal GET <base_url>/models to verify credentials, then reports
// whether the requested model is actually served.
//
// WHY THE OPTIONAL FIELDS (fixed 2026-10-04): the Mission Control AI tab shows
// the stored key as a mask and tells the operator "leave blank to keep" — but
// this function used to answer a blank key with 422 missing_fields, so
// "Test connection" could never succeed for an already-saved provider. Now a
// blank key/base_url/model resolve to the STORED config server-side, per task
// (task → global fallback), exactly like the functions that make the calls.
//
// EXFIL TRAP: resolving a secret from the table means a caller could send
// base_url=https://attacker.example with a blank key and ask us to attach the
// real secret. The stored key is therefore only ever used when the effective
// base_url has the SAME host as the stored provider (or base_url was omitted).

import { corsHeaders } from "../_shared/cors.ts";
import { requireStaffOrAdmin, unauthorized } from "../_shared/auth.ts";
import {
  validateProviderBaseUrl,
  loadAiProviderConfig,
  loadAiProviderForTask,
  type AiProviderConfig,
  type AiTask,
} from "../_shared/ai-provider.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const VALID_TASKS: AiTask[] = ["copilot", "translation", "vision", "extraction"];

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).host === new URL(b).host;
  } catch {
    return false;
  }
}

export async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  // SECURITY: this endpoint performs server-side requests to arbitrary
  // base_urls with caller-supplied credentials — an open SSRF/abuse probe if
  // left anonymous. Restrict to verified staff/admins. (requireAdmin 401'd
  // every staff account because the live role enum has no 'admin' variant.)
  const admin = await requireStaffOrAdmin(req);
  if (!admin) return unauthorized("staff_required");

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const rawBaseUrl = String((body as Record<string, unknown>)?.base_url || "").trim();
    const baseUrlArg = rawBaseUrl ? rawBaseUrl.replace(/\/+$/, "") : "";
    const api_key = String((body as Record<string, unknown>)?.api_key || "").trim();
    const modelArg = String((body as Record<string, unknown>)?.model || "").trim();
    const taskRaw = String((body as Record<string, unknown>)?.task || "").trim();
    const task = VALID_TASKS.includes(taskRaw as AiTask) ? (taskRaw as AiTask) : null;
    if (taskRaw && !task) {
      return json({ ok: false, error: "unknown_task", detail: "task must be one of " + VALID_TASKS.join(", ") }, 422);
    }

    // Stored provider for this task (task row → global row). Service role:
    // both tables deny anon/authenticated.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );
    const stored: AiProviderConfig | null = task
      ? await loadAiProviderForTask(supabase, task)
      : await loadAiProviderConfig(supabase);

    const base_url = baseUrlArg || stored?.baseUrl || "";
    const model = modelArg || stored?.model || "";
    let key = api_key;

    if (!key) {
      if (!stored) {
        return json({
          ok: false,
          error: "no_stored_provider",
          detail: "No saved provider to test" + (task ? " for " + task : "") + " — paste an API key first.",
        }, 200);
      }
      if (baseUrlArg && !sameHost(baseUrlArg, stored.baseUrl)) {
        // Refuse to hand the stored secret to a different host.
        return json({
          ok: false,
          error: "api_key_required",
          detail: "That base URL is not the stored provider's host, so the saved key cannot be reused here. Paste the key for this endpoint.",
        }, 200);
      }
      key = stored.apiKey;
    }

    if (!base_url || !key || !model) {
      const missing = [!base_url && "base_url", !key && "api_key", !model && "model"].filter(Boolean).join(", ");
      return json({
        ok: false,
        error: "missing_fields",
        detail: missing + " could not be resolved from the request or the stored provider",
      }, 422);
    }

    // SSRF guard: this function fetches a caller-supplied URL server-side, so it
    // must satisfy the same rules as the stored provider config. Without this an
    // admin token could probe https://169.254.169.254/ (cloud metadata) or any
    // internal host.
    const urlError = validateProviderBaseUrl(base_url);
    if (urlError) {
      return json({ ok: false, error: urlError, detail: "base_url must be https with a public host and no credentials or port" }, 422);
    }

    const modelsUrl = base_url + "/models";

    const resp = await fetch(modelsUrl, {
      method: "GET",
      headers: {
        "Authorization": "Bearer " + key,
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
        ? "Connection successful" + (api_key ? "" : " with the stored key") + ". Model is available."
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
