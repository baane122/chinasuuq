/**
 * Next.js API Route — ai-chat
 *
 * PLACEHOLDER: This route delegates to the Supabase Edge Function
 * `ai-chat` at `${SUPABASE_URL}/functions/v1/ai-chat`. Replace this handler
 * with a direct Next.js Edge Runtime implementation when Supabase functions
 * are not available in this deployment profile.
 *
 * CONTRACT:
 *   POST /api/ai-chat
 *   Body: { messages: AiMessage[], task?: string, temperature?: number, max_tokens?: number }
 *   → { ok: true, content: string } | { ok: false, error: string }
 *
 * TYPES are imported from src/lib/ai/types.ts so the route and the client
 * stay in sync without duplication.
 */
import { NextRequest, NextResponse } from "next/server";
import type { AiMessage } from "@/lib/ai/types";

// ── Re-export types so consumers of this route can import from either place ──
export type { AiMessage, AiCallOptions, AiCallFailure } from "@/lib/ai/types";

const VALID_TASKS = new Set(["copilot", "concierge", "translation", "vision", "extraction"]);

interface ChatBody {
  messages: AiMessage[];
  task?: string;
  temperature?: number;
  max_tokens?: number;
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

  // ── Parse body ──────────────────────────────────────────────────────────
  let body: ChatBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonResponse({ ok: false, error: "messages_required" }, 422);
  }
  if (messages.length > 24) {
    return jsonResponse({ ok: false, error: "too_many_messages" }, 422);
  }

  const task = body?.task ? String(body.task).toLowerCase() : undefined;
  if (task && !VALID_TASKS.has(task)) {
    return jsonResponse({ ok: false, error: "invalid_task" }, 422);
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
    const res = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/ai-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${req.headers.get("authorization") ?? ""}`,
      },
      body: JSON.stringify({
        messages,
        task,
        ...(typeof body?.temperature === "number" ? { temperature: body.temperature } : {}),
        ...(typeof body?.max_tokens === "number" ? { max_tokens: body.max_tokens } : {}),
      }),
    });

    const data = await res.json();
    return jsonResponse(data, res.status);
  } catch (err) {
    console.error("[ai-chat route] upstream error:", err);
    return jsonResponse({ ok: false, error: "internal_error" }, 500);
  }
}

export async function OPTIONS() {
  return jsonResponse({ ok: true }, 200);
}
