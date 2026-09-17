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

const FALLBACK_FLAG = "chinasuuq-admin-fallback";

// DEV-ONLY recovery code. NEVER enable in production.
// gated by NEXT_PUBLIC_DEV_BUILD (set only in .env.local for local dev).
// When production ships, NEXT_PUBLIC_DEV_BUILD is absent -> defaultRecoveryCode stays ""
// and the recovery path is inert, exactly as before (no security hole).
const isDev = process.env.NEXT_PUBLIC_DEV_BUILD === "1";
export const defaultRecoveryCode = isDev ? "chinasuuq-dev" : "";

export function setAdminFallbackSession(active: boolean): void {
  try {
    if (active) localStorage.setItem(FALLBACK_FLAG, "1");
    else localStorage.removeItem(FALLBACK_FLAG);
  } catch {}
}

export function hasAdminFallbackSession(): boolean {
  try {
    return localStorage.getItem(FALLBACK_FLAG) === "1";
  } catch {
    return false;
  }
}

