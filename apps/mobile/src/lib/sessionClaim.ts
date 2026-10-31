/**
 * Reading the `session_id` claim out of a Supabase access token.
 *
 * This lives apart from `store/auth.ts` for the same reason `auth-url.ts` does:
 * the store imports AsyncStorage, zustand and the Supabase client, so it cannot
 * be loaded in plain Node. Keeping the parser pure means the verifier can run
 * the exact function that ships against real token shapes.
 *
 * Why the claim matters: the one-device rule needs to know which server-side
 * session ("this phone") a token belongs to. `session_id` survives refresh-token
 * rotation, so it is a stable name for one device's login; `access_token` is
 * replaced on every refresh and cannot be used as a marker.
 */

/** Minimal base64url decoder.
 *
 * `atob` is not guaranteed on every Hermes build, and a polyfill for a
 * 40-byte payload is not worth a dependency. Digits are the only bytes a JSON
 * claim can contain, so a byte-wise decode is sufficient.
 */
export function base64UrlDecode(input: string): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  let out = "";
  for (const ch of normalized) {
    const idx = chars.indexOf(ch);
    if (idx === -1) throw new Error("invalid base64");
    value = (value << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((value >> bits) & 0xff);
    }
  }
  return out;
}

/**
 * The `session_id` claim of an access token, or null.
 *
 * Null is a valid, safe answer: the caller then simply claims the device on the
 * next opportunity instead of caching "already claimed".
 */
export function sessionClaim(accessToken: string | undefined | null): string | null {
  if (!accessToken) return null;
  const part = accessToken.split(".")[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(part));
    return typeof payload?.session_id === "string" && payload.session_id.length > 0
      ? payload.session_id
      : null;
  } catch {
    return null;
  }
}
