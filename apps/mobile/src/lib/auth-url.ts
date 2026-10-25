/**
 * Parsing for the URLs Supabase emails to a customer's inbox.
 *
 * This lives apart from `lib/supabase.ts` because that file constructs the
 * client, which drags in AsyncStorage and expo-constants — none of which exist
 * in plain Node. Extracting the parser means `scripts/verify-auth-url.mjs` can
 * run the real function against real link shapes, which matters because these
 * shapes are not under our control: a dashboard template edit changes them, and
 * a link we misread is a customer who cannot get into their account.
 */

/** Where the app's own deep link points, declared by `scheme` in app.json. */
export const APP_DEEP_LINK_PREFIX = "chinasuuq://";

/**
 * Where Supabase should send a user after they tap an emailed link.
 *
 * `SITE_URL` in the dashboard cannot be relied on for a mobile build — it is one
 * global value shared with the web app, so a phone that taps a link built from
 * it lands in a browser instead of the app. Every email-producing call therefore
 * passes an explicit per-request redirect.
 */
export const VERIFY_REDIRECT = `${APP_DEEP_LINK_PREFIX}verify-email`;
export const RECOVERY_REDIRECT = `${APP_DEEP_LINK_PREFIX}set-password`;

export type AuthRedirectKind =
  | "recovery"
  | "signup"
  | "magiclink"
  | "emailchange"
  | "invite"
  | "unknown";

export interface AuthUrlTicket {
  /** PKCE single-use auth code, when the link carries one. */
  code?: string;
  accessToken?: string;
  refreshToken?: string;
  kind: AuthRedirectKind;
  /** Set when the link itself reported a failure (`?error_code=…`). */
  error?: string;
}

const KNOWN_AUTH_KINDS: ReadonlySet<string> = new Set([
  "recovery",
  "signup",
  "magiclink",
  "email_change",
  "invite",
]);

function normalizeKind(raw: string | null): AuthRedirectKind {
  switch (raw) {
    case "recovery":
      return "recovery";
    case "signup":
      return "signup";
    case "magiclink":
      return "magiclink";
    case "email_change":
      return "emailchange";
    case "invite":
      return "invite";
    default:
      // A link naming a type we do not model still produced a session, so it is
      // not an error — just an unknown intent for routing.
      return "unknown";
  }
}

/**
 * Split `a=1&b=2` into a plain object.
 *
 * Hand-rolled rather than `URLSearchParams` on purpose: this project has a
 * recorded history of code that typechecks, passes its Node harness, and then
 * fails on device because it assumed a web global the Hermes runtime did not
 * provide. `URLSearchParams` is nothing to this file's risk budget to rely on.
 *
 * `decodeURIComponent` is wrapped because a malformed escape (`%zz`) throws, and
 * a throwing parser here means a customer's reset link does not work.
 */
function decode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

function readAuthParams(rawUrl: string): Record<string, string> {
  const merged: Record<string, string> = {};
  const candidates: string[] = [];

  const queryAt = rawUrl.indexOf("?");
  const hashAt = rawUrl.indexOf("#");
  if (queryAt >= 0) {
    const end = hashAt > queryAt ? hashAt : rawUrl.length;
    candidates.push(rawUrl.slice(queryAt + 1, end));
  }
  if (hashAt >= 0) {
    const fragment = rawUrl.slice(hashAt + 1);
    // A fragment can itself be `/?code=…` or `code=…&type=…`.
    candidates.push(fragment.includes("?") ? fragment.slice(fragment.indexOf("?") + 1) : fragment);
  }

  const take = (search: string, onlyMissing: boolean) => {
    for (const pair of search.split("&")) {
      if (!pair) continue;
      const eq = pair.indexOf("=");
      const key = decode(eq < 0 ? pair : pair.slice(0, eq));
      if (!key) continue;
      if (onlyMissing && key in merged) continue;
      merged[key] = eq < 0 ? "" : decode(pair.slice(eq + 1));
    }
  };

  for (const search of candidates) take(search, false);

  // The dashboard template puts the real code inside `redirect_to`, so it can
  // only be read once the outer pass has found it.
  const nested = merged["redirect_to"];
  if (nested && nested.includes(APP_DEEP_LINK_PREFIX) && nested.includes("?")) {
    take(nested.slice(nested.indexOf("?") + 1), true);
  }
  return merged;
}

/**
 * Parse an incoming URL into an auth ticket, or null when the URL is not an
 * auth link at all (a pushed notification, a product deep link).
 */
export function parseAuthUrl(rawUrl: string | null | undefined): AuthUrlTicket | null {
  if (!rawUrl) return null;
  const p = readAuthParams(rawUrl);
  const code = p["code"];
  const accessToken = p["access_token"];
  const refreshToken = p["refresh_token"];
  const errorCode = p["error_code"] ?? p["error"];

  if (!code && !accessToken && !errorCode) return null;

  const stated = p["type"] ?? null;
  let kind = normalizeKind(stated);
  if (kind === "unknown" && !KNOWN_AUTH_KINDS.has(stated ?? "")) {
    // Fall back to the route our own redirect constants encode, because a
    // template edited on the dashboard can drop `type` while keeping the deep
    // link that tells us the intent.
    const path = rawUrl
      .replace(new RegExp(`^${APP_DEEP_LINK_PREFIX}\\/?`), "")
      .split(/[?#]/)[0]
      .toLowerCase();
    if (path.includes("set-password") || path.includes("reset")) kind = "recovery";
    else if (path.includes("verify")) kind = "signup";
  }
  return { code, accessToken, refreshToken, kind, error: errorCode };
}
