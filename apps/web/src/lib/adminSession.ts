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

// NOTE: The hardcoded recovery code that previously lived here has been
// removed for security. Use the server-side recovery flow if needed.
export const defaultRecoveryCode = "";
