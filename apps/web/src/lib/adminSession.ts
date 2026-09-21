"use client";

// Admin session helper.
// The only supported path is real Supabase Auth. If Supabase Auth is
// temporarily unavailable, the admin login page surfaces the error instead
// of falling back to a hardcoded recovery code (which would be a security
// hole baked into the client bundle).
//
// If you need to grant emergency access while Auth is down, set the env var
// NEXT_PUBLIC_ADMIN_RECOVERY_CODE on the server and verify it in an Edge
// Function or a server-side route. Never embed a recovery code here.

// DEV-ONLY. NEXT_PUBLIC_DEV_BUILD is set only in local .env.local; it is
// absent in production builds, so every fallback below is inert there.
export const isDevBuild = process.env.NEXT_PUBLIC_DEV_BUILD === "1";

const FALLBACK_FLAG = "chinasuuq-admin-fallback";

export const defaultRecoveryCode = isDevBuild ? "chinasuuq-dev" : "";

// Renders the "Use recovery code" entry point. Hidden entirely in production
// so the recovery path can never be reached (an empty code must never match).
export const showRecoveryEntry = isDevBuild;

export function setAdminFallbackSession(active: boolean): void {
  try {
    if (active) localStorage.setItem(FALLBACK_FLAG, "1");
    else localStorage.removeItem(FALLBACK_FLAG);
  } catch {}
}

// Only meaningful in dev builds. The protected layout must combine this with
// `isDevBuild` — a stray localStorage flag must never unlock the admin UI.
export function hasAdminFallbackSession(): boolean {
  try {
    return localStorage.getItem(FALLBACK_FLAG) === "1";
  } catch {
    return false;
  }
}
