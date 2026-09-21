// ChinaSuuq — AI provider settings CRUD (admin-configurable).
// GET:  returns current settings (key masked)
// POST: saves new settings (validates before save)
// All writes are audited with updated_by.

import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin, unauthorized } from "../_shared/auth.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

export async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // SECURITY: this function manages the AI provider secret via the service
  // role. Only authenticated admins may call it — previously ANY anonymous
  // visitor could read settings and overwrite the provider (settings
  // poisoning, since ai-extraction trusts base_url from this table).
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized("admin_required");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("settings")
        .select("value, updated_at, updated_by")
        .eq("key", "ai_provider")
        .single();

      if (error || !data) {
        return json({ ok: false, error: "not_configured" }, 200);
      }

      // Mask the API key in response (show last 4 chars only)
      const val = data.value as Record<string, unknown>;
      const apiKey = String(val.api_key || "");
      const masked = apiKey.length > 8
        ? apiKey.slice(0, 4) + "..." + apiKey.slice(-4)
        : apiKey ? "***" : "";

      return json({
        ok: true,
        is_configured: Boolean(val.is_configured && val.api_key),
        base_url: val.base_url || "",
        model: val.model || "",
        api_key_masked: masked,
        updated_at: data.updated_at,
        updated_by: data.updated_by,
      }, 200);
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { api_key, base_url, model } = body || {};

      // Validation (updated_by comes from the verified admin JWT, not the body)
      const errors: string[] = [];
      if (!api_key || typeof api_key !== "string" || api_key.trim().length < 10) {
        errors.push("api_key_too_short");
      }
      if (!base_url || typeof base_url !== "string") {
        errors.push("base_url_required");
      } else if (!base_url.startsWith("http://") && !base_url.startsWith("https://")) {
        errors.push("base_url_invalid_protocol");
      }
      if (!model || typeof model !== "string" || model.trim().length === 0) {
        errors.push("model_required");
      }

      if (errors.length > 0) {
        return json({ ok: false, errors }, 422);
      }

      const { error } = await supabase
        .from("settings")
        .upsert({
          key: "ai_provider",
          value: {
            api_key: api_key.trim(),
            base_url: base_url.trim().replace(/\/$/, ""),
            model: model.trim(),
            is_configured: true,
          },
          updated_by: admin.userId,
          updated_at: new Date().toISOString(),
        }, { onConflict: "key" });

      if (error) {
        return json({ ok: false, error: error.message }, 500);
      }

      return json({ ok: true, message: "saved" }, 200);
    }

    return json({ ok: false, error: "method_not_allowed" }, 405);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message || "internal" }, 500);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}


Deno.serve(handler);
