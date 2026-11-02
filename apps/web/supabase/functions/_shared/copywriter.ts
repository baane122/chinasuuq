// ChinaSuuq — bilingual product copy + category from listing evidence.
//
// WHY A SHARED MODULE: the importer drafts copy for a whole batch, so the prompt,
// the JSON contract and the validation must be identical for draft #1 and #40 —
// and a second copy of the prompt is how the two drift.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: the model may REWRITE what the page said
// and TRANSLATE it; it may not INVENT specs, materials, certifications or
// dimensions. A hallucinated "100% cotton" on a synthetic fabric is a refund and
// a customer complaint, so:
//   · every number the model returns (price, MOQ) is discarded — those come from
//     the page reader, not from the model;
//   · the model is told to omit anything it cannot see, and to return null
//     instead of a guess;
//   · anything it does return is length-capped and stripped of markup here.

import type { AiProviderConfig } from "./ai-provider.ts";
import type { ListingFacts } from "./listing.ts";

export interface ProductCopy {
  titleEnglish: string | null;
  titleSomali: string | null;
  descriptionEnglish: string | null;
  descriptionSomali: string | null;
  /** One of the catalog category NAMES the caller supplied, or null. */
  categoryName: string | null;
  /** Suggested attribute rows the model read off the page (never invented specs:
   *  the prompt requires the value to appear in the evidence). */
  attributes: Array<{ key: string; value: string }>;
  /** Model + timing, so the draft can say what wrote it. */
  model: string | null;
}

export interface CopywriteResult {
  ok: boolean;
  error: string | null;
  copy: ProductCopy;
}

const INJECTION_MARKERS = [
  "ignore previous", "ignore all previous", "ignore the above", "you are now",
  "system prompt", "reveal your", "forget the instructions", "overwrite",
];

const MAX_EVIDENCE_CHARS = 6000;
const MAX_TITLE_CHARS = 160;
const MAX_DESCRIPTION_CHARS = 1200;
const MAX_ATTRIBUTES = 12;
const MAX_ATTR_CHARS = 80;

const EMPTY_COPY: ProductCopy = {
  titleEnglish: null,
  titleSomali: null,
  descriptionEnglish: null,
  descriptionSomali: null,
  categoryName: null,
  attributes: [],
  model: null,
};

function stripMarkup(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value
    .replace(/<[^>]*>/g, " ")
    .replace(/[*_`#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean ? clean.slice(0, max) : null;
}

/** Does the model's value actually appear in the evidence it was given? */
function grounded(value: string, evidence: string): boolean {
  const needle = value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").trim();
  if (!needle) return false;
  const haystack = evidence.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ");
  return haystack.includes(needle);
}

function clampPrice(n: number | null): number | null {
  return n !== null && Number.isFinite(n) && n > 0 && n < 10_000_000 ? Math.round(n * 100) / 100 : null;
}

export interface CopywriteInput {
  facts: ListingFacts;
  /** The exact marketplace label the operator pasted ("1688", "Taobao", …). */
  marketplaceLabel: string;
  /** The live `categories.name_en` list — the ONLY category values allowed back. */
  categoryNames: string[];
  /** Listing text pasted by staff, used when the page could not be read. */
  pastedText: string | null;
}

/**
 * Ask the configured `extraction` provider for bilingual copy + category.
 * Never throws; a failure returns the raw facts (title untouched) with a reason,
 * because a draft with a Chinese-only title is still savable and useful.
 */
export async function writeProductCopy(
  provider: AiProviderConfig,
  input: CopywriteInput
): Promise<CopywriteResult> {
  const { facts } = input;
  const evidenceParts: string[] = [];
  if (facts.title) evidenceParts.push(`Listing title: ${facts.title}`);
  if (facts.priceCny !== null) {
    evidenceParts.push(
      `Supplier price: CNY ${facts.priceCny}${facts.priceCnyMax && facts.priceCnyMax !== facts.priceCny ? ` – ${facts.priceCnyMax}` : ""}`
    );
  }
  if (facts.moqText) evidenceParts.push(`Order minimum wording: ${facts.moqText}`);
  if (facts.sellerName) evidenceParts.push(`Seller: ${facts.sellerName}`);
  if (facts.description) evidenceParts.push(`Listing description: ${facts.description}`);
  if (input.pastedText) evidenceParts.push(`Pasted listing text: ${input.pastedText.slice(0, MAX_EVIDENCE_CHARS)}`);
  if (facts.images.length) evidenceParts.push(`Photos found: ${facts.images.length} (product photos on the listing)`);

  const evidence = evidenceParts.join("\n").slice(0, MAX_EVIDENCE_CHARS);
  const lower = evidence.toLowerCase();
  const injected = INJECTION_MARKERS.find((m) => lower.includes(m));
  if (injected) {
    return { ok: false, error: `The listing text contains a prompt-injection marker ("${injected}").`, copy: EMPTY_COPY };
  }
  if (!evidence.trim()) {
    return { ok: false, error: "There is no listing evidence to write copy from.", copy: EMPTY_COPY };
  }

  const categories = input.categoryNames.length ? input.categoryNames.join(" | ") : "(no categories configured)";
  const system = [
    "You write product copy for ChinaSuuq, a China-to-Somalia wholesale marketplace.",
    "You receive FACTS read from a Chinese supplier listing. You rewrite and translate them.",
    "RULES:",
    "1. Never invent a specification, material, size, certification or claim that is not in the facts.",
    "2. If a fact is missing, omit it. Do not write 'unknown', 'N/A' or a guess.",
    "3. The English description is 2-3 short sentences of plain selling copy — no marketing superlatives, no guarantees, no prices (the price is shown separately).",
    "4. The Somali description is a faithful translation of the English one, not a second attempt.",
    "5. The Somali title is a natural Somali product name, not a transliteration.",
    "6. category MUST be exactly one of the allowed values, or the string \"none\".",
    "7. attributes: only values copied from the facts (colour, material, size, capacity). Omit the key entirely when unsure. Never guess.",
    "8. Output ONE JSON object and nothing else.",
    "",
    `Allowed categories: ${categories}`,
    "",
    'Output shape: {"title_english":"","title_somali":"","description_english":"","description_somali":"","category":"none","attributes":[{"key":"","value":""}]}',
  ].join("\n");

  const user = `Marketplace: ${input.marketplaceLabel}\n\nFACTS:\n"""\n${evidence}\n"""`;

  let resp: Response;
  try {
    resp = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.3,
        max_tokens: 1400,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (e) {
    const name = (e as Error)?.name ?? "";
    return {
      ok: false,
      error: name === "TimeoutError" || name === "AbortError" ? "The AI provider timed out writing the copy." : "The AI provider could not be reached.",
      copy: { ...EMPTY_COPY, model: provider.model },
    };
  }

  if (!resp.ok) {
    return {
      ok: false,
      error: `The AI provider answered HTTP ${resp.status}. Check Settings → AI Provider.`,
      copy: { ...EMPTY_COPY, model: provider.model },
    };
  }

  let raw = "";
  try {
    const payload = await resp.json();
    raw = String(payload?.choices?.[0]?.message?.content ?? "");
  } catch {
    return { ok: false, error: "The AI provider returned an unreadable response.", copy: { ...EMPTY_COPY, model: provider.model } };
  }

  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return { ok: false, error: `The AI provider did not return JSON (${raw.length} characters).`, copy: { ...EMPTY_COPY, model: provider.model } };
  }

  // Category must be a REAL row, matched case-insensitively against the supplied list.
  const wanted = String(parsed.category ?? "").trim().toLowerCase();
  const categoryName =
    wanted && wanted !== "none"
      ? input.categoryNames.find((c) => c.trim().toLowerCase() === wanted) ??
        input.categoryNames.find((c) => c.trim().toLowerCase().includes(wanted)) ??
        null
      : null;

  const attributes: Array<{ key: string; value: string }> = [];
  if (Array.isArray(parsed.attributes)) {
    for (const row of parsed.attributes.slice(0, MAX_ATTRIBUTES * 2)) {
      const o = (row ?? {}) as Record<string, unknown>;
      const key = stripMarkup(o.key, MAX_ATTR_CHARS);
      const value = stripMarkup(o.value, MAX_ATTR_CHARS);
      if (!key || !value) continue;
      // An attribute the page does not support is a hallucination: drop it and
      // let the operator add it by hand if it is real.
      if (!grounded(value, evidence)) continue;
      if (attributes.some((a) => a.key.toLowerCase() === key.toLowerCase())) continue;
      attributes.push({ key, value });
      if (attributes.length >= MAX_ATTRIBUTES) break;
    }
  }

  const copy: ProductCopy = {
    titleEnglish: stripMarkup(parsed.title_english, MAX_TITLE_CHARS),
    titleSomali: stripMarkup(parsed.title_somali, MAX_TITLE_CHARS),
    descriptionEnglish: stripMarkup(parsed.description_english, MAX_DESCRIPTION_CHARS),
    descriptionSomali: stripMarkup(parsed.description_somali, MAX_DESCRIPTION_CHARS),
    categoryName,
    attributes,
    model: provider.model,
  };

  if (!copy.titleEnglish && !copy.descriptionEnglish) {
    return { ok: false, error: "The AI provider returned no usable copy.", copy };
  }
  return { ok: true, error: null, copy };
}

/**
 * A deterministic fallback title for when the model is unavailable: keep the
 * original title as the English title so the draft is still identifiable, rather
 * than leaving the field blank and calling the import "done".
 */
export function fallbackTitle(facts: ListingFacts): string | null {
  return facts.title ? facts.title.slice(0, MAX_TITLE_CHARS) : null;
}

export function clampFactsToNumbers(facts: ListingFacts): { priceCny: number | null; priceCnyMax: number | null } {
  return { priceCny: clampPrice(facts.priceCny), priceCnyMax: clampPrice(facts.priceCnyMax) };
}
