"use client";

// Admin session helper.
// Primary path is Supabase Auth. Fallback: if the GoTrue service is having
// schema issues (e.g. "Database error querying schema"), allow a local recovery
// session so Mission Control stays usable. The recovery code is stored in a
// localStorage flag; this is NOT a security boundary, it's a resilience bridge
// until Supabase restarts the Auth service. Replace/remove when Supabase Auth
// is healthy.

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

// Matches the value used in the login guard.
export const defaultRecoveryCode = "ChinaSuuq-2026"; // user can change in Settings
