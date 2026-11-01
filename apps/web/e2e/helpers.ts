import type { Page, Route } from "@playwright/test";

/**
 * Deterministic Supabase stand-ins.
 *
 * The suite must not depend on production data or on the network: a test that
 * needs a real order to exist fails for reasons that have nothing to do with the
 * code under review, and it cannot run offline. Every Supabase request is
 * therefore answered here, in the exact shapes supabase-js expects.
 */

const SUPABASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://athkmrvsaijwgsyvwrbp.supabase.co").replace(/\/$/, "");

export const isSupabase = (url: string) => url.startsWith(SUPABASE) || /\.supabase\.(co|in)\//.test(url);

/** A row shaped like public.order_tracking_public, which is what /track reads. */
export function trackingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    order_number: "CS-2026-00125",
    status: "shipped",
    payment_status: "paid",
    shipping_method: "air",
    destination_city: "Mogadishu",
    created_at: "2026-10-01T09:00:00+00:00",
    updated_at: "2026-10-20T09:00:00+00:00",
    ...overrides,
  };
}

/** Answer every `order_tracking_public` read with `rows`. */
export async function stubTracking(page: Page, rows: unknown[]) {
  await page.route("**/rest/v1/order_tracking_public**", async (route: Route) => {
    // PostgREST returns a JSON array for a list read; `maybeSingle()` maps an
    // empty array to `data: null, error: null`.
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-range": rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0" },
      body: JSON.stringify(rows),
    });
  });
}

/** Kill the connection, the way a dead 2G link does. */
export async function stubOffline(page: Page) {
  await page.route("**/rest/v1/**", (route) => route.abort("failed"));
  await page.route("**/auth/v1/**", (route) => route.abort("failed"));
}

/** No session: every auth read answers 401 and every token exchange 400. */
export async function stubSignedOut(page: Page) {
  await page.route("**/auth/v1/**", (route) => {
    const url = route.request().url();
    if (url.includes("/token")) {
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "invalid_grant", error_description: "Invalid login credentials" }),
      });
    }
    return route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "no session" }),
    });
  });
  await page.route("**/rest/v1/rpc/auth_context**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "null" })
  );
}
