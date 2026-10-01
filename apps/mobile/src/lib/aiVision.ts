/**
 * AiVisionScan — AI Vision fallback for product capture.
 * Takes a snapshot (DOM text hints + on-screen screenshot as base64) and asks
 * gemini-3.1-flash-image to produce a structured listing JSON that feeds
 * straight into SmartProductForm's CapturedListing — same shape as the
 * DOM capture, so the review flow is unchanged.
 *
 * Used when the DOM capture fails or looks incomplete (punish pages, heavy
 * JS renders, the 1$ store's SPA shell, etc.). Self-healing: no per-site
 * selectors to maintain.
 */
import { aiChat, extractJson, AI_URL, AI_KEY, AI_MODEL_VISION } from "@/lib/ai";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";

export interface VisionListing {
  title: string;
  price_cny: number;
  moq?: number | null;
  moq_text?: string | null;
  category?: string | null;      // e.g. "shoes", "clothing", "electronics", "cosmetics", "hair", "jewelry", "kitchen", "toys", "bag", "fabric"
  variants?: {
    label: string;          // e.g. "Color", "Size (EU)", "Capacity (ml)", "Material"
    options: string[];      // e.g. ["Red", "Blue"] / ["39","40","41"] / ["100ml","250ml"]
  }[];
  images?: string[];
}

interface ScanInput {
  /** Raw screenshot of the WebView viewport (base64, no data: prefix). */
  screenshotBase64?: string | null;
  /** Best-effort DOM hints from VISION_SNAPSHOT_SCRIPT. */
  snapshot?: {
    title?: string;
    price?: number | null;
    /** High end of the on-page price range, when present. */
    priceMax?: number | null;
    /** MOQ lines scraped from the page (起批/起订/MOQ wording). */
    moqText?: string;
    images?: string[];
    url?: string;
  } | null;
}

/**
 * Server-side vision scan via the ai-vision edge function (Mission-Control
 * configured provider). Returns the model's RAW text (JSON expected), or null
 * when the function is unavailable — the caller then falls back to the direct
 * provider call. Session is attached automatically by supabase-js; on
 * functions/v1 the Authorization header carries the user's JWT.
 */
async function serverVisionScan(input: ScanInput): Promise<string | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const url = SUPABASE_URL.replace(/\/+$/, "");
    if (!url) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35_000);
    const res = await fetch(`${url}/functions/v1/ai-vision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        screenshot_base64: input.screenshotBase64 || undefined,
        snapshot: input.snapshot
          ? {
              title: input.snapshot.title,
              price: input.snapshot.price,
              priceMax: (input.snapshot as { priceMax?: number | null }).priceMax,
              moqText: (input.snapshot as { moqText?: string }).moqText,
              url: input.snapshot.url,
            }
          : {},
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.ok && typeof data.raw === "string" ? data.raw : null;
  } catch {
    return null;
  }
}

/**
 * Ask the vision model to structure the on-screen product.
 * Returns null on any failure — caller falls back to manual entry.
 */
export async function aiVisionScanListing(input: ScanInput): Promise<VisionListing | null> {
  // Feed the model the scraped price range so it doesn't misread the LOW end
  // from a compressed screenshot, and the MOQ lines so it stops guessing.
  const priceRange =
    input.snapshot?.price != null
      ? input.snapshot.priceMax != null
        ? `${input.snapshot.price} ~ ${input.snapshot.priceMax}`
        : String(input.snapshot.price)
      : "unknown";
  const moqEvidence = input.snapshot?.moqText
    ? `\nMOQ lines scraped from the page (AUTHORITY for the moq/moq_text fields — parse the number out of these, do NOT guess from the image):\n${input.snapshot.moqText.slice(0, 1200)}`
    : "";
  const hasHints = !!(input.snapshot && (input.snapshot.title || input.snapshot.price != null));
  const hints = hasHints
    ? `DOM hints: title="${input.snapshot?.title ?? ""}", price_range_cny=${priceRange}, url=${input.snapshot?.url ?? ""}` + moqEvidence
    : moqEvidence || "No DOM hints available — rely on the screenshot.";

  const userContent: any[] = [
    {
      type: "text",
      text:
        "This is a screenshot of a Chinese e-commerce product page (1688/Taobao/YiwuGo/1$-store style). " +
        "Extract the product into JSON exactly like:\n" +
        '{"title":"English translation of title","price_cny":number,"moq":number,"moq_text":"exact wording","category":"one word","variants":[{"label":"...","options":["..."]}],"images":[]}\n' +
        "CRITICAL RULES:\n" +
        "1. price_cny = the LOW end of the displayed price range (e.g. '¥ 35 ~ ¥ 43' → 35). If DOM hints give a price_range_cny, USE IT.\n" +
        "2. moq = MINIMUM ORDER QUANTITY — look for: 起批 (e.g. '100件起批' → 100), 最少起订, 'minimum purchase', '≥ 100', batch/lot wording, or per-carton counts. This is THE most important field — scan the whole screenshot carefully. Default null ONLY if truly absent.\n" +
        "3. moq_text = the exact wording found (Chinese OK).\n" +
        "4. category = what the product IS from the photo: shoes|clothing|electronics|cosmetics|hair|jewelry|kitchen|toys|bag|fabric|home|other.\n" +
        "5. variants = ONLY what is selectable on screen. Clothes → Color + Size. Shoes → Color + EU size numbers. Cosmetics/liquids → Capacity (30ml/100ml). Electronics → Model/Color. Translate option values to English. Empty [] if none.\n" +
        "6. images: leave empty. Reply with JSON only, no markdown.\n" +
        hints,
    },
  ];

  if (input.screenshotBase64) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${input.screenshotBase64}` },
    });
  } else if (!input.snapshot?.title) {
    return null; // nothing at all to work with
  }

  // SERVER-FIRST: try the ai-vision edge function — it resolves the provider
  // from Mission Control's AI Provider settings (per-task `vision` override),
  // so provider changes need no app release. Falls back to the direct call
  // below when the function is unavailable (not deployed / logged out / 404).
  const serverRaw = await serverVisionScan(input);
  const raw = serverRaw ?? (await aiChat(
    [{ role: "user", content: userContent as unknown as string }],
    { tier: "vision", timeoutMs: 35_000, temperature: 0.1, maxTokens: 900 }
  ));
  const parsed = raw ? extractJson<VisionListing>(raw) : null;
  if (!parsed || !parsed.title) return null;

  // The model sometimes returns ranges ("35 ~ 43") or worded values
  // ("Minimum purchase of 100 items") — parse the FIRST number robustly.
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && isFinite(v) && v > 0) return v;
    if (typeof v === "string") {
      const m = v.replace(/,/g, "").match(/([0-9]+(?:\.[0-9]+)?)/);
      if (m) {
        const n = parseFloat(m[1]);
        return isFinite(n) && n > 0 ? n : null;
      }
    }
    return null;
  };

  const price = num(parsed.price_cny);
  if (!price) return null;
  const moqNum = num(parsed.moq);
  return {
    title: String(parsed.title).slice(0, 160),
    price_cny: price,
    moq: moqNum != null ? Math.max(1, Math.round(moqNum)) : null,
    moq_text:
      (typeof parsed.moq_text === "string" && parsed.moq_text) ||
      (typeof parsed.moq === "string" ? parsed.moq : null) ||
      (moqNum != null ? `${Math.round(moqNum)}件起批` : null),
    variants: Array.isArray(parsed.variants)
      ? parsed.variants
          .filter((v) => v && v.label && Array.isArray(v.options) && v.options.length > 0)
          .slice(0, 4)
      : [],
    images: Array.isArray(parsed.images) ? parsed.images.slice(0, 3) : [],
  };
}
