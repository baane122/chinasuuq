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
//         moqText?, url? } }
//   → { ok: true, listing: VisionListing } | { ok: false, error }
//
// Gate: any authenticated user (customers need AI Scan while browsing
// marketplaces — same policy as product-enrich). Payload size is bounded; the
// screenshot is already downscaled to ~0.35 quality client-side.

import { corsHeaders } from "../_shared/cors.ts";
import { requireRole, unauthorized } from "../_shared/auth.ts";
import { loadAiProviderForTask } from "../_shared/ai-provider.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_IMAGE_B64 = 4_000_000; // ~3MB binary — generous over the 0.35-quality captures
const MAX_MOQ_CHARS = 1200;

const SYSTEM_RULES =
  "This is a screenshot of a Chinese e-commerce product page (1688/Taobao/YiwuGo/1$-store style). " +
  "Extract the product into JSON exactly like:\n" +
  '{"title":"English translation of title","price_cny":number,"moq":number,"moq_text":"exact wording","category":"one word","variants":[{"label":"...","options":["..."]}],"images":[]}\n' +
  "CRITICAL RULES:\n" +
  "1. price_cny = the LOW end of the displayed price range (e.g. '¥ 35 ~ ¥ 43' → 35). If DOM hints give a price_range_cny, USE IT.\n" +
  "2. moq = MINIMUM ORDER QUANTITY — look for: 起批 (e.g. '100件起批' → 100), 最少起订, 'minimum purchase', '≥ 100', batch/lot wording, or per-carton counts. This is THE most important field. Default null ONLY if truly absent.\n" +
  "3. moq_text = the exact wording found (Chinese OK).\n" +
  "4. category = what the product IS from the photo: shoes|clothing|electronics|cosmetics|hair|jewelry|kitchen|toys|bag|fabric|home|other.\n" +
  "5. variants = ONLY what is selectable on screen. Clothes → Color + Size. Shoes → Color + EU size numbers. Cosmetics/liquids → Capacity (30ml/100ml). Electronics → Model/Color. Translate option values to English. Empty [] if none.\n" +
  "6. images: leave empty. Reply with JSON only, no markdown.";

export async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const caller = await requireRole(req, ["customer", "staff", "super_admin"]);
  if (!caller) return unauthorized("auth_required");

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

    const priceRange =
      snapshot?.price != null
        ? snapshot?.priceMax != null
          ? `${snapshot.price} ~ ${snapshot.priceMax}`
          : String(snapshot.price)
        : "unknown";
    const moqEvidence = typeof snapshot?.moqText === "string" && snapshot.moqText
      ? `\nMOQ lines scraped from the page (AUTHORITY for the moq/moq_text fields — parse the number out of these, do NOT guess from the image):\n${snapshot.moqText.slice(0, MAX_MOQ_CHARS)}`
      : "";

    const userContent: unknown[] = [
      {
        type: "text",
        text:
          `${SYSTEM_RULES}\n` +
          `DOM hints: title="${String(snapshot?.title ?? "")}", price_range_cny=${priceRange}, url=${String(snapshot?.url ?? "")}` +
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

    const resp = await fetch(`${provider.baseUrl}/chat/completions`, {
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
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return json({ ok: false, error: "provider_error", status: resp.status, detail: detail.slice(0, 300) }, 502);
    }

    const data = await resp.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return json({ ok: false, error: "empty_response" }, 502);
    }

    return json({ ok: true, raw: content.trim(), model: provider.model }, 200);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message || "internal" }, 500);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(handler);
