// ChinaSuuq — ai-vision: authenticated-customer vision extraction through the
// configured AI provider (per-task `vision` override, falling back to global).
//
// WHY: the mobile app's AI Scan called the vision model DIRECTLY with a key
// baked into the app bundle. This moves the call server-side so Mission
// Control's AI Provider settings govern the model/key — rotate or switch
// vendors in Settings → AI Provider → Vision and every app follows, no store
// release required.
//
// POST { screenshot_base64?: string, snapshot?: { title?, price?, priceMax?,
//         moqText?, url?, marketplace? } }
//   → { ok: true, raw: string, listing?, price_currency, cny_per_usd, model }
//
// Gate: any authenticated user (customers need AI Scan while browsing
// marketplaces — same policy as product-enrich). Payload size is bounded; the
// screenshot is already downscaled to ~0.35 quality client-side.
//
// MONEY: every marketplace except the 1$ Dollar Store quotes in yuan, and the
// app's whole billing chain assumes `price_cny` is yuan (USD = price_cny / the
// admin's exchange rate). A dollar figure saved in that field is a ¥5 item
// billed at $0.75 — a 6.7× undercharge — so the USD-native case is converted
// here, at the server's live rate, before the client ever sees the number.

import { corsHeaders } from "../_shared/cors.ts";
import { requireRole, unauthorized } from "../_shared/auth.ts";
import { loadAiProviderForTask } from "../_shared/ai-provider.ts";
import {
  DEFAULT_CNY_PER_USD,
  cnyPerUsd as fetchCnyPerUsd,
  isUsdNativeMarket,
  round2,
  usdToCnyEquivalent,
} from "../_shared/fx.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_IMAGE_B64 = 4_000_000; // ~3MB binary — generous over the 0.35-quality captures
// Must cover the whole moqText the app ships (4000 chars), or a page with many
// price lines buries the real MOQ line beyond the cut and the model guesses.
const MAX_MOQ_CHARS = 4000;
// A yuan unit price above this is a misread (a carton total, a stock count), not
// a product, so it is dropped instead of billed.
const MAX_PRICE_CNY = 1_000_000;

// Per-isolate, per-user rate limit (audit 2026-10-04, cost brake). Deliberately
// simple like ai-chat's anonymous limiter: it is a cost brake, not a fortress —
// Supabase scales isolates freely, so a global ledger would need a table; this
// bounds casual abuse per cold isolate. A real throttle belongs in a migration.
const userHits = new Map<string, { count: number; windowStart: number }>();
const MINUTE_MS = 60 * 1000;
const MAX_REQUESTS_PER_MINUTE_PER_USER = 20;

function rateLimited(userId: string): boolean {
  const now = Date.now();
  if (userHits.size > 5_000) {
    // prune expired entries before growing unbounded
    for (const [key, hit] of userHits) {
      if (now - hit.windowStart > MINUTE_MS) userHits.delete(key);
    }
  }
  const entry = userHits.get(userId);
  if (!entry || now - entry.windowStart > MINUTE_MS) {
    userHits.set(userId, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_REQUESTS_PER_MINUTE_PER_USER;
}

const SYSTEM_RULES =
  "This is a screenshot of a Chinese e-commerce product page (1688/Taobao/YiwuGo/1$-store style). " +
  "Extract the product into JSON exactly like:\n" +
  '{"title":"English translation of title","price_cny":number,"moq":number,"moq_text":"exact wording","category":"one word","variants":[{"label":"...","options":["..."]}],"images":[]}\n' +
  "CRITICAL RULES:\n" +
  "1. price_cny = the LOW end of the displayed price range (e.g. '¥ 35 ~ ¥ 43' → 35). If DOM hints give a price_range, USE IT.\n" +
  "2. moq = MINIMUM ORDER QUANTITY — look for: 起批 (e.g. '100件起批' → 100), 起购, 最少起订, 'minimum purchase' (e.g. '360 minimum purchase' → 360), 'Min. order', '≥ 100', batch/lot wording, or per-carton counts. This is THE most important field. Default null ONLY if truly absent.\n" +
  "3. moq_text = the exact wording found (Chinese OK).\n" +
  "4. category = what the product IS from the photo: shoes|clothing|electronics|cosmetics|hair|jewelry|kitchen|toys|bag|fabric|home|other.\n" +
  "5. variants = ONLY what is selectable on screen. Clothes → Color + Size. Shoes → Color + EU size numbers. Cosmetics/liquids → Capacity (30ml/100ml). Electronics → Model/Color. Translate option values to English. Empty [] if none.\n" +
  "6. images: leave empty. Reply with JSON only, no markdown.\n" +
  "7. When the DOM hints say the marketplace quotes in US DOLLARS, the printed numbers are dollars: put the dollar figure in price_usd as well as price_cny (same number); the server converts it to yuan at the live rate.";


function positiveNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : null;
  if (typeof raw === "string") {
    const m = raw.replace(/,/g, "").match(/([0-9]+(?:\.[0-9]+)?)/);
    if (m) {
      const n = parseFloat(m[1]);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
  }
  return null;
}

/** The model is told "JSON only", but fenced or prose-wrapped output happens. */
function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

/**
 * The printed price becomes a yuan number the app can divide by its exchange
 * rate. Three checks, in order of authority:
 *   1. a price the app scraped off the page beats anything the model recalls;
 *   2. on a dollar-quoted marketplace every number is dollars, so the reading is
 *      multiplied back into yuan at the live rate (otherwise a $5 listing is
 *      billed as ¥5 = $0.75);
 *   3. an out-of-range number is dropped rather than billed.
 */
export function normalizeListingPrice(
  raw: string,
  opts: { usdNative: boolean; cnyPerUsd: number; domPrice: number | null }
): { content: string; listing: Record<string, unknown> | null; notes: string[] } {
  const notes: string[] = [];
  const obj = extractJsonObject(raw);
  if (!obj) return { content: raw, listing: null, notes: ["json_unparseable"] };

  const modelCny = positiveNumber(obj.price_cny);
  const modelUsd = positiveNumber(obj.price_usd);
  // A yuan marketplace's price_usd is ignored on purpose: the only safe reading
  // of a ¥ page is the ¥ number, and mistaking dollars for yuan is the loss.
  const seen = opts.usdNative ? (modelUsd ?? modelCny) : modelCny;

  let price = seen;
  if (opts.domPrice !== null && opts.domPrice > 0) {
    // The app scraped this number off the live page; a compressed screenshot is
    // the weaker witness. Within 10% they are the same price, so leave it alone.
    if (price === null || Math.abs(price - opts.domPrice) / opts.domPrice > 0.1) {
      if (price !== null) notes.push(`price_replaced_by_dom:${price}->${opts.domPrice}`);
      price = opts.domPrice;
    }
  }

  if (price !== null) {
    const priceUsd = opts.usdNative ? price : null;
    const priceCny = opts.usdNative ? usdToCnyEquivalent(price, opts.cnyPerUsd) : round2(price);
    if (!Number.isFinite(priceCny) || priceCny <= 0 || priceCny > MAX_PRICE_CNY) {
      notes.push(`price_rejected_out_of_range:${price}`);
      obj.price_cny = null;
      if (priceUsd !== null) obj.price_usd = priceUsd;
    } else {
      obj.price_cny = priceCny;
      if (priceUsd !== null) {
        obj.price_usd = priceUsd;
        notes.push(`usd_native_converted:${priceUsd}->${priceCny}`);
      }
      obj.price_currency = opts.usdNative ? "USD->CNY" : "CNY";
    }
  } else {
    notes.push("price_not_found");
  }

  return { content: JSON.stringify(obj), listing: obj, notes };
}

export async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Live user_role enum after 202609210001 is (customer, staff, super_admin); 'admin'
  // was dropped, but 'admin'/'supplier' stay listed for forward/backward compat with
  // the original 202408010001 enum (same superset product-enrich uses). Without them
  // here, a profile carrying either role got a 401 and the mobile client silently
  // fell back to its bundled-key direct call (audit §3 MEDIUM).
  const caller = await requireRole(req, ["customer", "staff", "admin", "supplier", "super_admin"]);
  if (!caller) return unauthorized("auth_required");
  // Per-user cost brake (20 req/min per cold isolate) — see rateLimited() note.
  if (rateLimited(caller.userId)) {
    return json({ ok: false, error: "rate_limited", max_per_minute: MAX_REQUESTS_PER_MINUTE_PER_USER }, 429);
  }

  try {
    const body = await req.json();
    const screenshot: string = typeof body?.screenshot_base64 === "string"
      ? body.screenshot_base64
      : "";
    const snapshot = (body?.snapshot ?? {}) as Record<string, unknown>;
    if (!screenshot && !snapshot?.title) {
      return json({ ok: false, error: "nothing_to_scan" }, 422);
    }
    if (screenshot.length > MAX_IMAGE_B64) {
      return json({ ok: false, error: "screenshot_too_large" }, 413);
    }

    const marketplace = String(snapshot?.marketplace ?? "").trim().toLowerCase();
    const usdNative = isUsdNativeMarket(marketplace);
    const priceRange =
      snapshot?.price != null
        ? snapshot?.priceMax != null
          ? `${snapshot.price} ~ ${snapshot.priceMax}`
          : String(snapshot.price)
        : "unknown";
    const domPrice = positiveNumber(snapshot?.price);
    const moqEvidence = typeof snapshot?.moqText === "string" && snapshot.moqText
      ? `\nMOQ lines scraped from the page (AUTHORITY for the moq/moq_text fields — parse the number out of these, do NOT guess from the image):\n${snapshot.moqText.slice(0, MAX_MOQ_CHARS)}`
      : "";

    const userContent: unknown[] = [
      {
        type: "text",
        text:
          `${SYSTEM_RULES}\n` +
          `DOM hints: marketplace=${marketplace || "unknown"}, ` +
          `listing_currency=${usdNative ? "USD (this store prints dollars, not yuan)" : "CNY"}, ` +
          `title="${String(snapshot?.title ?? "")}", ` +
          `price_range_${usdNative ? "usd" : "cny"}=${priceRange}, url=${String(snapshot?.url ?? "")}` +
          moqEvidence,
      },
    ];
    if (screenshot) {
      userContent.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${screenshot}` },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const provider = await loadAiProviderForTask(supabase, "vision");
    if (!provider) {
      return json({ ok: false, error: "ai_provider_not_configured" }, 503);
    }

    let resp: Response;
    try {
      resp = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: provider.model,
          messages: [{ role: "user", content: userContent }],
          temperature: 0.1,
          max_tokens: 900,
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      // Timeout is an AbortSignal DOMException: classified by e.name (the
      // message is "The operation was aborted", never "TimeoutError").
      const name = (e as Error)?.name ?? "";
      if (name === "TimeoutError" || name === "AbortError") {
        return json({ ok: false, error: "model_timeout" }, 504);
      }
      return json({ ok: false, error: "model_unreachable" }, 502);
    }

    if (!resp.ok) {
      // Status only — the request headers held the key, so nothing from this
      // response body may be echoed back to the caller (ai-translate pattern).
      console.error("ai-vision: provider call failed, status", resp.status);
      return json({ ok: false, error: "provider_error", status: resp.status }, 502);
    }

    const data = await resp.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return json({ ok: false, error: "empty_response" }, 502);
    }

    const rate = usdNative ? await fetchCnyPerUsd(supabase) : DEFAULT_CNY_PER_USD;
    const normalized = normalizeListingPrice(content.trim(), {
      usdNative,
      cnyPerUsd: rate,
      domPrice,
    });

    return json({
      ok: true,
      raw: normalized.content,
      listing: normalized.listing,
      price_currency: usdNative ? "USD->CNY" : "CNY",
      cny_per_usd: usdNative ? rate : null,
      notes: normalized.notes,
      model: provider.model,
    }, 200);
  } catch (e) {
    // Stable code only — the raw exception message never reaches the caller.
    console.error("ai-vision: unhandled error", (e as Error)?.name, (e as Error)?.message);
    return json({ ok: false, error: "internal_error" }, 500);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(handler);
