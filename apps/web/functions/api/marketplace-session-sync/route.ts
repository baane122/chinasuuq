/**
 * Next.js API Route — marketplace-session-sync
 *
 * PLACEHOLDER: This route delegates to the Supabase Edge Function
 * `marketplace-session-sync` at `${SUPABASE_URL}/functions/v1/marketplace-session-sync`.
 * Replace this handler with a direct Next.js Edge Runtime implementation when
 * Supabase functions are not available in this deployment profile.
 *
 * CONTRACT:
 *   POST /api/marketplace-session-sync
 *   Body: { marketplace: string, cookies: string }
 *   → { ok: true, marketplace, pairs, updated_at }
 *     | { ok: false, error: string }
 *
 * Auth: staff-only (roles: staff, admin, super_admin). This is a privileged
 * write that updates the shared marketplace session cookie store.
 */
import { NextRequest, NextResponse } from "next/server";

const MAX_COOKIES_BYTES = 32 * 1024; // 32 KB

interface SyncBody {
  marketplace?: unknown;
  cookies?: unknown;
}

interface SyncResponse {
  ok: boolean;
  marketplace?: string;
  pairs?: number;
  updated_at?: string;
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

  // ── Auth gate: staff only ──────────────────────────────────────────────
  // TODO: Replace with actual JWT verification when implementing directly.
  // For now, forward the Authorization header to the Supabase edge function
  // which performs its own role gate.
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  let body: SyncBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const marketplace = String(body?.marketplace ?? "").trim().toLowerCase();
  const cookies = String(body?.cookies ?? "").trim();

  if (!marketplace || marketplace.length > 40) {
    return jsonResponse({ ok: false, error: "marketplace_required" }, 422);
  }
  if (!cookies) {
    return jsonResponse({ ok: false, error: "cookies_required" }, 422);
  }
  if (cookies.length > MAX_COOKIES_BYTES) {
    return jsonResponse({ ok: false, error: "cookies_too_large" }, 413);
  }

  // Basic well-formedness check
  const pairs = cookies
    .split(";")
    .map((p) => p.trim())
    .filter((p) => /^[^=\s]+=?.*$/.test(p));
  if (pairs.length === 0 || /[<>"\u0000-\u001f]/.test(cookies)) {
    return jsonResponse({ ok: false, error: "cookies_malformed" }, 400);
  }

  // ── Delegate to Supabase Edge Function ──────────────────────────────────
  // TODO: Replace with direct database write when not deploying via Supabase.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse(
      { ok: false, error: "not_configured", detail: "Supabase URL / Anon Key missing" },
      500,
    );
  }

  try {
    const res = await fetch(
      `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/marketplace-session-sync`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseAnonKey,
          Authorization: authHeader,
        },
        body: JSON.stringify({ marketplace, cookies }),
      },
    );

    const data = (await res.json()) as SyncResponse;
    return jsonResponse(data, res.status);
  } catch (err) {
    console.error("[marketplace-session-sync route] upstream error:", err);
    return jsonResponse({ ok: false, error: "internal_error" }, 500);
  }
}

export async function OPTIONS() {
  return jsonResponse({ ok: true }, 200);
}
