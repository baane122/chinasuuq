// ChinaSuuq — product-import: one pasted marketplace link → one reviewable draft.
//
// WHY THIS EXISTS
// The Products console could only "extract" from pasted TEXT: a staff member had
// to open the listing, copy the page, and paste it. The link itself is the input
// a buyer actually has, so this function turns a 1688/Taobao/Tmall/YiwuGo/
// ChinaGoods detail URL into a draft the operator reviews before saving:
//
//   link → page read (staff marketplace session) → images + price + MOQ wording
//        → bilingual copy + category (AI `extraction` provider) → draft JSON
//
// WHAT IT DOES NOT DO: write to `source_products`. Saving stays in the admin UI
// through the SAME `createProduct` payload path as a hand-added product, so an
// import cannot bypass validation, RLS, or the change-detection rules. This
// function is read-only against the catalog and returns a draft.
//
// AUTH: staff/super_admin. Imports spend AI credits and read with the shared
// marketplace session (a credential), so a customer must never reach this.
//
// HONESTY: every field of the draft says where it came from. `warnings` lists the
// things that are missing (no description on the page, no MOQ wording, AI copy
// unavailable) so the review screen can ask for them instead of the operator
// discovering a blank field at save time.
//
// POST { links: string[], pastedText?: string, generateCopy?: boolean }
//   → { ok, results: DraftResult[], categories: string[], provider: string|null }

import { corsHeaders } from "../_shared/cors.ts";
import { deny, staffGate } from "../_shared/auth.ts";
import { loadAiProviderForTask } from "../_shared/ai-provider.ts";
import { parseListingTarget, readListing, type ListingFacts } from "../_shared/listing.ts";
import { fallbackTitle, writeProductCopy, type ProductCopy } from "../_shared/copywriter.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/** One import per call keeps each page-read inside the edge wall clock. The UI
 *  sends links one at a time so a slow listing cannot stall the other 39. */
const MAX_LINKS_PER_CALL = 4;
const MAX_PASTED_TEXT = 20_000;

export interface ImportDraft {
  /** Stable client-side key so the UI can update the right row. */
  url: string;
  platform: string;
  marketplace: "1688" | "taobao" | "yiwugo" | "chinagoods" | null;
  itemId: string | null;
  ok: boolean;
  /** One sentence for the row's status line, always set. */
  message: string;
  /** Non-fatal gaps the operator should fill or accept. */
  warnings: string[];
  draft: {
    source_url: string;
    source_product_id: string | null;
    source_seller_id: string | null;
    seller_name: string | null;
    title_original: string | null;
    title_english: string | null;
    title_somali: string | null;
    description_original: string | null;
    description_english: string | null;
    description_somali: string | null;
    images: string[];
    price_cny_min: number | null;
    price_cny_max: number | null;
    moq_text: string | null;
    category_name: string | null;
    attributes: Array<{ key: string; value: string }>;
  };
  /** What produced the copy, or null when it is a raw read. */
  model: string | null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function emptyDraft(
  url: string,
  platform: string,
  marketplace: ImportDraft["marketplace"],
  itemId: string | null
): ImportDraft["draft"] {
  return {
    source_url: url,
    source_product_id: itemId,
    source_seller_id: null,
    seller_name: null,
    title_original: null,
    title_english: null,
    title_somali: null,
    description_original: null,
    description_english: null,
    description_somali: null,
    images: [],
    price_cny_min: null,
    price_cny_max: null,
    moq_text: null,
    category_name: null,
    attributes: [],
  };
}

function draftsWarnings(facts: ListingFacts, copy: ProductCopy | null, copyAttempted: boolean): string[] {
  const warnings: string[] = [];
  if (!facts.title) warnings.push("No title on the page — type one before saving.");
  if (!facts.images.length) warnings.push("No product photos found on the page — add images before publishing.");
  if (facts.priceCny === null) warnings.push("No price found — enter the supplier price before saving.");
  if (!facts.moqText) warnings.push("No order-minimum wording found — the MOQ falls back to a staff review.");
  if (!facts.description) {
    warnings.push("The listing has no text description (these marketplaces ship detail as images), so the description below is written from the title and photos.");
  }
  if (copyAttempted && !copy) warnings.push("AI copy was unavailable — the fields hold the original listing text.");
  if (copy && copy.attributes.length === 0) warnings.push("No specs could be read off the page — add colour/size/material by hand if the listing states them.");
  return warnings;
}

export async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const gate = await staffGate(req);
  if (!gate.caller) return deny(gate, "product-import");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const rawLinks = Array.isArray(body.links)
    ? body.links.map((l) => String(l ?? "").trim()).filter(Boolean)
    : body.link
      ? [String(body.link).trim()]
      : [];
  if (!rawLinks.length) return json({ ok: false, error: "links_required" }, 400);
  if (rawLinks.length > MAX_LINKS_PER_CALL) {
    return json({ ok: false, error: "too_many_links", limit: MAX_LINKS_PER_CALL }, 400);
  }

  const pastedText = typeof body.pastedText === "string" ? body.pastedText.slice(0, MAX_PASTED_TEXT) : null;
  const generateCopy = body.generateCopy !== false;

  // Service client: category list + the staff-synced marketplace session are
  // both staff-readable only; the caller has already been verified as staff.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: categoryRows } = await supabase
    .from("categories")
    .select("name_en,name_so,slug")
    .eq("is_active", true);
  const categoryNames: string[] = (categoryRows ?? [])
    .map((c: Record<string, unknown>) => String(c.name_en ?? "").trim())
    .filter(Boolean);

  // Cast: supabase-js returns a thenable, the shared helper types a Promise.
  const provider = generateCopy
    ? await loadAiProviderForTask(
        supabase as unknown as Parameters<typeof loadAiProviderForTask>[0],
        "extraction"
      )
    : null;

  const results: ImportDraft[] = [];

  for (const rawUrl of rawLinks) {
    const target = parseListingTarget(rawUrl);
    if (!target) {
      results.push({
        url: rawUrl,
        platform: "unknown",
        marketplace: null,
        itemId: null,
        ok: false,
        message: "Not a supported marketplace listing URL (1688, Taobao, Tmall, YiwuGo, ChinaGoods).",
        warnings: [],
        draft: emptyDraft(rawUrl, "unknown", null, null),
        model: null,
      });
      continue;
    }

    const marketplace: ImportDraft["marketplace"] =
      target.platform === "tmall" ? "taobao" : (target.platform as ImportDraft["marketplace"]);
    const platformLabel = target.platform === "tmall" ? "Tmall" : target.platform;

    // The staff-synced session for this marketplace, when one exists.
    let cookies = "";
    try {
      const { data: sessionRows } = await supabase
        .from("marketplace_accounts")
        .select("cookies")
        .eq("marketplace_type", marketplace ?? target.platform)
        .eq("is_shared", true)
        .eq("is_active", true)
        .not("cookies", "is", null)
        .limit(1);
      const row = (sessionRows ?? [])[0] as Record<string, unknown> | undefined;
      cookies = row ? String(row.cookies ?? "") : "";
    } catch {
      cookies = "";
    }

    const facts = await readListing(target, cookies);
    const draft = emptyDraft(facts.requestedUrl ?? target.url, target.platform, marketplace, target.itemId);
    draft.title_original = facts.title;
    draft.source_url = facts.requestedUrl ?? draft.source_url;
    draft.price_cny_min = facts.priceCny;
    draft.price_cny_max = facts.priceCnyMax;
    draft.moq_text = facts.moqText;
    draft.description_original = facts.description;
    draft.images = facts.images;
    draft.seller_name = facts.sellerName;

    if (!facts.ok) {
      results.push({
        url: target.url,
        platform: platformLabel,
        marketplace,
        itemId: target.itemId,
        ok: false,
        message: facts.error ?? "The listing could not be read.",
        warnings: cookies ? [] : ["No marketplace session is synced for this platform, so the page was read anonymously."],
        draft,
        model: null,
      });
      continue;
    }

    let copy: ProductCopy | null = null;
    let copyError: string | null = null;
    if (provider) {
      const written = await writeProductCopy(provider, {
        facts,
        marketplaceLabel: platformLabel,
        categoryNames,
        pastedText: rawLinks.length === 1 ? pastedText : null,
      });
      if (written.ok) copy = written.copy;
      else copyError = written.error;
    }

    draft.title_english = copy?.titleEnglish ?? fallbackTitle(facts);
    draft.title_somali = copy?.titleSomali ?? null;
    draft.description_english = copy?.descriptionEnglish ?? null;
    draft.description_somali = copy?.descriptionSomali ?? null;
    draft.category_name = copy?.categoryName ?? null;
    draft.attributes = copy?.attributes ?? [];

    const warnings = draftsWarnings(facts, copy, Boolean(provider));
    if (!provider && generateCopy) warnings.push("No AI provider is configured for Extraction — open Settings → AI Provider to enable automatic copy.");
    if (copyError) warnings.push(copyError);

    const found = [facts.title ? "title" : null, facts.priceCny !== null ? "price" : null, facts.images.length ? `${facts.images.length} photos` : null].filter(Boolean);
    results.push({
      url: target.url,
      platform: platformLabel,
      marketplace,
      itemId: target.itemId,
      ok: true,
      message: `Read ${found.join(", ") || "the listing"}.`,
      warnings,
      draft,
      model: copy?.model ?? null,
    });
  }

  return json({
    ok: true,
    results,
    categories: categoryNames,
    provider: provider ? provider.model : null,
    // A caller can tell "the page was read" from "AI was skipped" without
    // guessing why the copy is Chinese-only.
    aiAvailable: Boolean(provider),
  });
}

Deno.serve(handler);
