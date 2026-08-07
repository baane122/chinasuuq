import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge security layer (Next.js 16 `proxy` file convention — replaces the
 * deprecated `middleware` file).
 *
 * NOTE on auth: admin access control is enforced client-side by the protected
 * layout (`src/app/admin/(protected)/layout.tsx`), which reads the Supabase
 * session from localStorage. A server-side cookie gate here would not reflect
 * that client session and would spuriously redirect authenticated users, so we
 * deliberately do NOT redirect based on cookies — we only harden headers.
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  // ── Security headers ──────────────────────────────────────
  // Clickjacking / MIME-sniffing / referrer / feature-policy protection.
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );

  // Baseline CSP for a static export. 'unsafe-inline' is required for Next's
  // inline <style> and next/font. 'unsafe-eval' covers dev-only tooling and is
  // safe on the compiled production bundle. img/connect sources allow Supabase
  // storage + APIs, lk888 media, Google translate + fonts.
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://*.lk888.ai https://*.googleusercontent.com https://*.googleapis.com",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co https://*.lk888.ai https://translate.googleapis.com",
      "frame-src 'self' https://*.supabase.co",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  );

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
