/**
 * AiVisionScan — AI Vision fallback for product capture.
 * Takes a snapshot (DOM text hints + on-screen screenshot as base64) and asks
 * the server-configured vision model (resolved by the ai-vision edge function
 * from Mission Control) to produce a structured listing JSON that feeds
 * straight into SmartProductForm's CapturedListing — same shape as the
 * DOM capture, so the review flow is unchanged.
 *
 * Used when the DOM capture fails or looks incomplete (punish pages, heavy
 * JS renders, the 1$ store's SPA shell, etc.). Self-healing: no per-site
 * selectors to maintain.
 *
 * SERVER-ONLY: the scan goes through the ai-vision edge function, which
 * resolves the provider from Mission Control. There is no bundled-key
 * fallback anymore — when the edge call fails (offline, logged out, 401/403
 * because the function's role list excludes the caller's role), this returns
 * null and the caller shows its honest Alert/manual-entry path. NOTE: the
 * edge function's allowed-role list is owned server-side (admin/supplier
 * support is fixed in ai-vision itself); the client stays fallback-free.
 */
import { extractJson } from "@/lib/ai";
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
  /** Which marketplace the page came from ("1688", "yiwugo", …). */
  marketplace?: string | null;
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
 * when the function is unavailable — the caller then surfaces its
 * Alert/manual-entry path. Every failure path logs the HTTP status + error
 * code via console.warn("[aiVision]", …) so 401/403/413/502/503/timeout are
 * no longer invisible. Session is attached automatically by supabase-js;
 * on functions/v1 the Authorization header carries the user's JWT.
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
              // Which marketplace the page came from — the server prompt uses
              // it to pick the right MOQ wording to look for.
              marketplace: input.marketplace ?? undefined,
            }
          : {},
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      // Surface WHY the scan failed instead of collapsing into silence:
      // 401/403 role refusal, 413 screenshot_too_large,
      // 503 ai_provider_not_configured, 502 provider error, 422 nothing_to_scan.
      const bodyError = await res.json().catch(() => null);
      console.warn("[aiVision]", res.status, bodyError?.error ?? "unparsed_body");
      return null;
    }
    let data: { ok?: boolean; raw?: unknown } | null = null;
    try {
      data = await res.json();
    } catch {
      console.warn("[aiVision]", res.status, "malformed_json_body");
    }
    return data?.ok && typeof data.raw === "string" ? data.raw : null;
  } catch (err) {
    // Timeout (controller.abort()) and plain network failures land here.
    console.warn("[aiVision]", "request_failed", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Ask the vision model to structure the on-screen product.
 * Returns null on any failure — caller falls back to manual entry.
 */
export async function aiVisionScanListing(input: ScanInput): Promise<VisionListing | null> {
  // The prompt is built server-side (ai-vision); the client only ships the
  // screenshot + DOM hints. Without either there is nothing to work with.
  if (!input.screenshotBase64 && !input.snapshot?.title) return null;

  // SERVER-ONLY: the ai-vision edge function resolves the provider from
  // Mission Control's AI Provider settings (per-task `vision` override), so
  // provider changes need no app release. When it is unavailable (not
  // deployed / logged out / role refused) there is no direct-key fallback —
  // the scan simply fails and the caller falls back to manual entry.
  const raw = await serverVisionScan(input);
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
    // The server extracts category (see VisionListing.category) but this was
    // dropping it, so callers always read empty. Pass it through (trimmed),
    // or null when the model gave nothing usable.
    category:
      typeof parsed.category === "string" && parsed.category.trim()
        ? parsed.category.trim()
        : null,
    variants: Array.isArray(parsed.variants)
      ? parsed.variants
          .filter((v) => v && v.label && Array.isArray(v.options) && v.options.length > 0)
          .slice(0, 4)
      : [],
    images: Array.isArray(parsed.images) ? parsed.images.slice(0, 3) : [],
  };
}
