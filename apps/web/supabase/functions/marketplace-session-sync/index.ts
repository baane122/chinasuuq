// ChinaSuuq — marketplace-session-sync: staff upload the shared marketplace
// login SESSION (cookies) so logged-in customers' WebViews can inherit it.
//
// WHY (2026-10-03 product decision): the old model shipped the shared account
// username+password to every device (RPC get_shared_marketplace_account,
// granted to ANON — audit §2 CRITICAL leak). New model: credentials stay
// staff-only (migration 202610030003), and the invisible "already logged in"
// marketplace experience for signed-in customers is carried by COOKIES
// (migration 202610030006 RPC get_marketplace_session). Someone has to put
// fresh cookies in the DB: this function is that door — staff-role only, and
// the mobile app's staff-gated "Sync session" button is the caller (it reads
// the WebView's native cookie jar via @react-native-cookies and posts it here).
//
// POST { marketplace: string, cookies: string }
//   cookies format: "name=val; name2=val2" (what cookieInjectScript consumes).
//   → 200 { ok: true, marketplace, pairs, updated_at }
//   → 4xx { ok: false, error }
//
// AUTH: requireStaffOrAdmin (profiles.role staff/super_admin). Writes use the
// CALLER's JWT — marketplace_accounts RLS already admits staff updates.
// Hardening: cookies are opaque secrets, so (a) TLS-only (edge runtime is),
// (b) size cap 32KB (a real session is <8KB), (c) the row is only ever the
// shared+active account for that marketplace — this function cannot plant a
// row for an arbitrary account. If no shared row exists yet it creates one
// with is_shared/is_active set and NO credentials (username/password NULL),
// because the session model needs no credentials at all.
import { corsHeaders } from "../_shared/cors.ts";
import { requireStaffOrAdmin, unauthorized, userClient } from "../_shared/auth.ts";

const MAX_COOKIES_BYTES = 32 * 1024;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const caller = await requireStaffOrAdmin(req);
  if (!caller) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const marketplace = String(body?.marketplace ?? "").trim().toLowerCase();
  const cookies = String(body?.cookies ?? "").trim();
  if (!marketplace || marketplace.length > 40) {
    return json({ ok: false, error: "marketplace_required" }, 400);
  }
  if (!cookies || cookies.length > MAX_COOKIES_BYTES) {
    return json(
      { ok: false, error: cookies ? "cookies_too_large" : "cookies_required" },
      400,
    );
  }
  // Basic well-formedness: at least one name=value pair, no quotes/control
  // junk that would break cookieInjectScript.
  const pairs = cookies
    .split(";")
    .map((p) => p.trim())
    .filter((p) => /^[^=\s]+=?.*$/.test(p));
  if (pairs.length === 0 || /[<>"\u0000-\u001f]/.test(cookies)) {
    return json({ ok: false, error: "cookies_malformed" }, 400);
  }

  const db = userClient(req);
  if (!db) return json({ ok: false, error: "unauthorized" }, 401);
  const now = new Date().toISOString();

  // Upsert onto the shared+active row for this marketplace.
  const { data: existing } = await db
    .from("marketplace_accounts")
    .select("id")
    .eq("marketplace_type", marketplace)
    .eq("is_shared", true)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  let err: unknown;
  if (existing) {
    ({ error: err } = await db
      .from("marketplace_accounts")
      .update({
        cookies,
        cookies_updated_at: now,
        cookies_updated_by: caller.userId,
        last_verified_at: now,
        health: "active",
        updated_at: now,
      })
      .eq("id", existing.id));
  } else {
    ({ error: err } = await db.from("marketplace_accounts").insert({
      marketplace_type: marketplace,
      is_shared: true,
      is_active: true,
      cookies,
      cookies_updated_at: now,
      cookies_updated_by: caller.userId,
      last_verified_at: now,
      health: "active",
    }));
  }
  if (err) {
    console.error("marketplace-session-sync write failed", err);
    return json({ ok: false, error: "write_failed" }, 500);
  }

  return json({ ok: true, marketplace, pairs: pairs.length, updated_at: now });
});
