/**
 * Error classification for the public `/track` lookup.
 *
 * Lives in `src/lib/track/` rather than inside the page component so it can be
 * executed by `npm run verify:track` (a `page.tsx` is not importable from Node),
 * and because this distinction is not tracking-specific: any customer-facing
 * read that shows "not found" owes the reader a separate answer for "we could
 * not ask".
 */

/**
 * Did the request never reach Postgres, or did Postgres answer?
 *
 * A lookup that fails and an order that does not exist used to draw the same
 * red "Order not found" card on this public page — so a customer with a paid,
 * shipped order was told in their own language that the order was missing, and
 * the natural next action became a WhatsApp to support. supabase-js hands back
 * a bare TypeError when the fetch itself dies; any real database answer carries
 * a code (and usually a details/hint), including the PGRST116 that genuinely
 * means "no row".
 *
 * Deliberately biased toward "transport": a wrong "we could not connect, try
 * again" costs one tap, a wrong "your order does not exist" costs trust and a
 * support ticket.
 */
export function isTransportError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { code?: string; message?: string; details?: string; hint?: string };
  const msg = String(e.message ?? "").toLowerCase();
  if (
    /failed to fetch|fetch failed|networkerror|network request|load failed|network connection was lost|timeout|timed out|abort|enotfound|econnrefused|econnreset|could not connect|service unreachable/.test(
      msg
    )
  )
    return true;
  // Nothing above matched, and the object carries no database answer either
  // (no code, no details, no hint) — so treat it as transport rather than
  // letting an unfamiliar engine's wording become a "your order is missing".
  return !e.code && !e.details && !e.hint;
}
