// ChinaSuuq — AI provider settings CRUD (admin-configurable).
// GET:  returns current settings (key masked) + per-task overrides
// POST: saves new settings (validates before save). With a `task` field in
//       the body, saves a per-task override instead of the global config.
// DELETE: with ?task=<name>, removes that task's override (falls back to
//       the global provider). Without, 405.
// All writes are audited with updated_by.
//
// WRITE GATE (audit 2026-10-04): POST/DELETE rewrite the GLOBAL provider
// api_key/base_url that every other AI function loads — a staff account could
// redirect all AI traffic and capture the replacement key (config poisoning).
// Writes therefore require super_admin. GET stays staff-readable: the key is
// masked there, and Mission Control's staff views need to see the config.
// The live user_role enum is (customer, staff, super_admin) after migration
// 202609210001 — there is no 'admin' variant, so the write list is exactly
// ["super_admin"].

import { corsHeaders } from "../_shared/cors.ts";
import { requireRole, requireStaffOrAdmin, unauthorized } from "../_shared/auth.ts";
import { validateProviderBaseUrl, type AiTask } from "../_shared/ai-provider.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const VALID_TASKS: AiTask[] = ["copilot", "translation", "vision", "extraction"];

// Matches the live user_role enum; 'admin' does not exist (202609210001).
const SUPER_ADMIN_ONLY = ["super_admin"];

export async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // SECURITY: this function manages the AI provider secret via the service
  // role. Only authenticated staff may call it — previously ANY anonymous
  // visitor could read settings and overwrite the provider (settings
  // poisoning, since ai-extraction trusts base_url from this table).
  // NOTE: the live user_role enum has no 'admin' variant (dropped by
  // migration 202609210001), so requireAdmin(['admin','super_admin']) 401'd
  // every staff account — this was the "Could not reach the AI settings
  // service" failure on the admin Settings → AI Provider tab.
  const isWrite = req.method === "POST" || req.method === "DELETE";
  const admin = isWrite
    ? await requireRole(req, SUPER_ADMIN_ONLY)
    : await requireStaffOrAdmin(req);
  if (!admin) return unauthorized(isWrite ? "super_admin_required" : "staff_required");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const taskParam = url.searchParams.get("task");

      // Per-task read
      if (taskParam) {
        if (!VALID_TASKS.includes(taskParam as AiTask)) {
          return json({ ok: false, error: "invalid_task" }, 422);
        }
        const { data, error } = await supabase
          .from("ai_provider_tasks")
          .select("*")
          .eq("task", taskParam)
          .maybeSingle();
        if (error) {
          // Stable code; the Postgres message is logged server-side only.
          console.error("ai-settings: task read failed", error.message);
          return json({ ok: false, error: "settings_read_failed" }, 500);
        }
        if (!data) return json({ ok: true, configured: false, override: false }, 200);

        const apiKey = String(data.api_key || "");
        return json({
          ok: true,
          configured: Boolean(data.is_configured && data.api_key),
          override: Boolean(data.is_configured && data.api_key),
          base_url: data.base_url || "",
          model: data.model || "",
          api_key_masked: maskKey(apiKey),
          updated_at: data.updated_at,
        }, 200);
      }

      // Global read (existing behavior) + task override summary
      const { data, error } = await supabase
        .from("ai_provider_config")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

      const { data: tasks, error: tasksErr } = await supabase
        .from("ai_provider_tasks")
        .select("task, base_url, model, api_key, is_configured, updated_at");

      const taskList = (tasksErr ? [] : (tasks ?? [])).map((t: Record<string, unknown>) => ({
        task: t.task,
        base_url: t.base_url || "",
        model: t.model || "",
        api_key_masked: maskKey(String(t.api_key || "")),
        configured: Boolean(t.is_configured && t.api_key),
        updated_at: t.updated_at,
      }));

      if (error || !data) {
        return json({ ok: false, error: "not_configured", tasks: taskList }, 200);
      }

      return json({
        ok: true,
        is_configured: Boolean(data.is_configured && data.api_key),
        base_url: data.base_url || "",
        model: data.model || "",
        api_key_masked: maskKey(String(data.api_key || "")),
        updated_at: data.updated_at,
        updated_by: data.updated_by,
        tasks: taskList,
      }, 200);
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { api_key, base_url, model, task } = body || {};

      // Validation (updated_by comes from the verified admin JWT, not the body)
      const errors: string[] = [];

      // For a task save, an empty api_key means "keep the existing key" so
      // an admin can change just the model without re-pasting the secret.
      const isTaskSave = typeof task === "string" && task.length > 0;
      if (isTaskSave && !VALID_TASKS.includes(task as AiTask)) {
        return json({ ok: false, errors: ["invalid_task"] }, 422);
      }

      if (isTaskSave) {
        // Resolve existing override so an omitted key keeps the old secret.
        let existingKey = "";
        if (!api_key || String(api_key).trim().length === 0) {
          const { data: existing } = await supabase
            .from("ai_provider_tasks")
            .select("api_key, is_configured")
            .eq("task", task)
            .maybeSingle();
          existingKey = String((existing as Record<string, unknown> | null)?.api_key || "");
        }
        const keyToStore = api_key && String(api_key).trim().length >= 10
          ? String(api_key).trim()
          : existingKey;

        if (keyToStore.length < 10) errors.push("api_key_too_short");
        if (!base_url || typeof base_url !== "string") {
          errors.push("base_url_required");
        } else {
          const urlError = validateProviderBaseUrl(base_url.trim().replace(/\/+$/, ""));
          if (urlError) errors.push(urlError);
        }
        if (!model || typeof model !== "string" || model.trim().length === 0) {
          errors.push("model_required");
        }
        if (errors.length > 0) return json({ ok: false, errors }, 422);

        const { error } = await supabase
          .from("ai_provider_tasks")
          .upsert({
            task,
            base_url: base_url.trim().replace(/\/+$/, ""),
            api_key: keyToStore,
            model: model.trim(),
            is_configured: true,
            updated_by: admin.userId,
            updated_at: new Date().toISOString(),
          }, { onConflict: "task" });

        if (error) {
          // Stable code; the Postgres message is logged server-side only.
          console.error("ai-settings: task override write failed", error.message);
          return json({ ok: false, error: "settings_write_failed" }, 500);
        }
        return json({ ok: true, message: "saved", task }, 200);
      }

      // Global save (existing behavior, unchanged)
      if (!api_key || typeof api_key !== "string" || api_key.trim().length < 10) {
        errors.push("api_key_too_short");
      }
      // ai-extraction refuses non-https providers, so accepting http here would
      // save a configuration that silently never works.
      if (!base_url || typeof base_url !== "string") {
        errors.push("base_url_required");
      } else {
        // Reject non-https and internal hosts at save time: ai-extraction will
        // refuse to call them anyway, so saving one produces a silently dead setup.
        const urlError = validateProviderBaseUrl(base_url.trim().replace(/\/+$/, ""));
        if (urlError) errors.push(urlError);
      }
      if (!model || typeof model !== "string" || model.trim().length === 0) {
        errors.push("model_required");
      }

      if (errors.length > 0) {
        return json({ ok: false, errors }, 422);
      }

      const { error } = await supabase
        .from("ai_provider_config")
        .upsert({
          id: 1,
          base_url: base_url.trim().replace(/\/+$/, ""),
          api_key: api_key.trim(),
          model: model.trim(),
          is_configured: true,
          updated_by: admin.userId,
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });

      if (error) {
        // Stable code; the Postgres message is logged server-side only.
        console.error("ai-settings: global provider write failed", error.message);
        return json({ ok: false, error: "settings_write_failed" }, 500);
      }

      return json({ ok: true, message: "saved" }, 200);
    }

    if (req.method === "DELETE") {
      // Remove a per-task override: ?task=translation → that task falls back
      // to the global provider again.
      const url = new URL(req.url);
      const taskParam = url.searchParams.get("task");
      if (!taskParam) return json({ ok: false, error: "task_required" }, 422);
      if (!VALID_TASKS.includes(taskParam as AiTask)) {
        return json({ ok: false, error: "invalid_task" }, 422);
      }
      const { error } = await supabase
        .from("ai_provider_tasks")
        .delete()
        .eq("task", taskParam);
      if (error) {
        // Stable code; the Postgres message is logged server-side only.
        console.error("ai-settings: task override delete failed", error.message);
        return json({ ok: false, error: "settings_write_failed" }, 500);
      }
      return json({ ok: true, message: "removed", task: taskParam }, 200);
    }

    return json({ ok: false, error: "method_not_allowed" }, 405);
  } catch (e) {
    // Stable code only — the raw exception message never reaches the caller.
    console.error("ai-settings: unhandled error", (e as Error)?.name, (e as Error)?.message);
    return json({ ok: false, error: "internal_error" }, 500);
  }
}

function maskKey(apiKey: string): string {
  return apiKey.length > 8
    ? apiKey.slice(0, 4) + "..." + apiKey.slice(-4)
    : apiKey ? "***" : "";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}


Deno.serve(handler);
