/**
 * Next.js API Route — ai-translate
 *
 * PLACEHOLDER: This route delegates to the Supabase Edge Function
 * `ai-translate` at `${SUPABASE_URL}/functions/v1/ai-translate`. Replace this
 * handler with a direct Next.js Edge Runtime implementation when Supabase
 * functions are not available in this deployment profile.
 *
 * CONTRACT:
 *   POST /api/ai-translate
 *   Body: { texts: string[], target_lang: string }
 *   → { ok: true, results: { source, translated, cached }[], target_lang, counts }
 *     | { ok: false, error: string }
 *
 * Auth: requires a signed-in user (Bearer token). Anonymous calls are refused
 * because translation is a paid operation and the cache is per-user.
 */
import { NextRequest, NextResponse } from "next/server";

interface TranslateBody {
  texts?: unknown;
  target_lang?: unknown;
}

interface TranslateResult {
  source: string;
  translated: string;
  cached: boolean;
}

interface TranslateResponse {
  ok: boolean;
  results?: TranslateResult[];
  target_lang?: string;
  counts?: { requested: number; cached: number; translated: number };
  error?: string;
}

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

export async function POST(req: NextRequest) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return jsonResponse({ ok: true }, 200);
  }

  // ── Auth gate ───────────────────────────────────────────────────────────
  // Translation is a paid operation; only signed-in users may call this.
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  let body: TranslateBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const texts = body?.texts;
  if (!Array.isArray(texts) || texts.length === 0) {
    return jsonResponse({ ok: false, error: "texts_required" }, 422);
  }
  if (texts.length > 40) {
    return jsonResponse({ ok: false, error: "too_many_texts" }, 422);
  }
  for (const t of texts) {
    if (typeof t !== "string" || t.length === 0 || t.length > 2000) {
      return jsonResponse({ ok: false, error: "text_invalid" }, 422);
    }
  }

  const targetLang = body?.target_lang ? String(body.target_lang).trim() : "en";
  if (!targetLang || targetLang.length > 10) {
    return jsonResponse({ ok: false, error: "target_lang_required" }, 422);
  }

  // ── Delegate to Supabase Edge Function ──────────────────────────────────
  // TODO: Replace with direct AI provider call when not deploying via Supabase.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse(
      { ok: false, error: "not_configured", detail: "Supabase URL / Anon Key missing" },
      500,
    );
  }

  try {
    const res = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/ai-translate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseAnonKey,
        Authorization: authHeader,
      },
      body: JSON.stringify({ texts, target_lang: targetLang }),
    });

    const data = (await res.json()) as TranslateResponse;
    return jsonResponse(data, res.status);
  } catch (err) {
    console.error("[ai-translate route] upstream error:", err);
    return jsonResponse({ ok: false, error: "internal_error" }, 500);
  }
}

export async function OPTIONS() {
  return jsonResponse({ ok: true }, 200);
}
