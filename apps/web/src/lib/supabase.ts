import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  // Increase timeout for network resilience
  global: {
    headers: { "x-timeout": "30000" }, // 30 second timeout
  },
});

// ── Edge Function helper (browser → Supabase Edge Functions) ──────────────
// SECURITY: this is the ONLY sanctioned way to call Edge Functions from the
// web app. It attaches the anon `apikey` plus the signed-in user's JWT so
// functions can verify the caller's identity/role server-side. Never fetch
// `/api/...` relative paths — the site is a static export and has no server.
//
// SECURITY NOTE: there is deliberately NO service-role client here. This
// module is imported by client components; a service-role key in a browser
// bundle would hand full database control to every visitor. Privileged
// operations belong in Edge Functions, which hold SUPABASE_SERVICE_ROLE_KEY
// server-side and verify the caller's JWT + admin role before acting.
/**
 * Default deadline for an edge-function call (ms).
 *
 * WHY 35 s and not something snappier: `edgeFetch` is shared by staff CRUD
 * (ai-settings save / test / reset, which answer in a second or two) AND by
 * browser calls that legitimately wait on a model — `ai-proxy` copilot chat and
 * `ai-extraction`. Every one of those functions already enforces its own
 * provider deadline server-side and answers before it (ai-proxy 30 s,
 * ai-extraction 25 s, ai-test-connection 15 s, ai-chat 30 s), so a client budget
 * below ~30 s would cut off calls that were going to succeed. 35 s = the slowest
 * legitimate server-side answer (30 s) plus response overhead, which means this
 * default only fires when the request is genuinely hung — an unreachable region
 * or a dead socket — and a staff button therefore un-wedges instead of spinning
 * forever. A call that needs a different budget passes its own `timeoutMs`
 * explicitly: shorter for a plain staff write, larger (or 0 to opt out) for any
 * future long AI call.
 */
export const DEFAULT_EDGE_TIMEOUT_MS = 35_000;

/**
 * Named failure: WE abandoned the request at our own deadline. Distinct from
 * the function refusing or the gateway erroring, so a caller can print
 * "timed out" instead of a stack and retry, rather than reporting a failure
 * that never happened server-side.
 */
export class EdgeTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EdgeTimeoutError";
  }
}

/** Is this error our abort (either abort flavour below)? */
function isAbortLike(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  const name = (err as { name?: unknown } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

/**
 * Build the request's deadline signal.
 *
 * `AbortSignal.timeout()` does this in one call and its abort carries the
 * distinguishing name "TimeoutError", but it is missing from Safari < 16 and
 * Chrome/Android-WebView < 103 — this is a static export served to whatever
 * browser a customer or field staff member has on their phone, so it cannot be
 * assumed. Where it is absent we fall back to the equivalent controller + timer
 * (whose abort name is "AbortError"); callers never see the difference, both
 * paths raise EdgeTimeoutError.
 */
function deadlineSignal(timeoutMs: number): { signal?: AbortSignal; dispose: () => void } {
  if (timeoutMs <= 0) return { dispose: () => {} };
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return { signal: AbortSignal.timeout(timeoutMs), dispose: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, dispose: () => clearTimeout(timer) };
}

export async function edgeFetch<T = Record<string, unknown>>(
  functionName: string,
  init: { method?: "GET" | "POST" | "DELETE"; body?: unknown; timeoutMs?: number } = {}
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const url = supabaseUrl as string;
  const anon = supabaseAnonKey as string;
  const token = session?.access_token ?? anon;

  const timeoutMs = init.timeoutMs ?? DEFAULT_EDGE_TIMEOUT_MS;
  const { signal, dispose } = deadlineSignal(timeoutMs);
  try {
    const res = await fetch(`${url}/functions/v1/${functionName}`, {
      method: init.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        apikey: anon,
        Authorization: `Bearer ${token}`,
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      ...(signal ? { signal } : {}),
    });

    let payload: T;
    try {
      payload = (await res.json()) as T;
    } catch (err) {
      // A deadline that fires while the body is still streaming aborts HERE, not
      // at fetch() — without this check it would be misreported as the "non-JSON
      // response" branch, i.e. as a gateway error page we never actually got.
      if (isAbortLike(err, signal)) {
        throw new EdgeTimeoutError(`${functionName} did not finish within ${timeoutMs} ms — the response was cut off before it completed.`);
      }
      // Non-JSON response (e.g. gateway HTML error page)
      throw new Error(`${functionName} returned a non-JSON response (${res.status})`);
    }
    return payload;
  } catch (err) {
    // Name OUR abort; anything else keeps travelling exactly as it did before.
    if (err instanceof EdgeTimeoutError) throw err;
    if (isAbortLike(err, signal)) {
      throw new EdgeTimeoutError(`${functionName} did not answer within ${timeoutMs} ms — the request was abandoned by us, not refused by the server.`);
    }
    throw err;
  } finally {
    dispose();
  }
}
