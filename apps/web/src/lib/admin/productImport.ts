"use client";

/**
 * Client for the `product-import` edge function.
 *
 * WHY A SEPARATE MODULE: the Import Studio runs a small queue (one link per
 * request, a few at a time) and has to render three distinguishable outcomes per
 * row — read, read-with-gaps, not-read — without collapsing them into one
 * "failed" state. That is a different shape from the single `edgeFetch` call the
 * old Extract box made, and keeping it here means the drawer holds no transport
 * logic.
 *
 * NOTHING HERE WRITES. A draft is data; saving goes through `createProduct` in
 * lib/admin/productWrites.ts, so an import cannot bypass the payload rules a
 * hand-added product obeys.
 */

import { edgeFetch } from "@/lib/supabase";
import type { ParsedMarketplaceLink } from "@/lib/marketplaceLink";
import { EMPTY_PRODUCT_FORM, type ProductFormValues } from "@/lib/admin/productWrites";

export interface ImportDraftFields {
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
}

export interface ImportDraftResult {
  url: string;
  platform: string;
  marketplace: "1688" | "taobao" | "yiwugo" | "chinagoods" | null;
  itemId: string | null;
  ok: boolean;
  message: string;
  warnings: string[];
  draft: ImportDraftFields;
  model: string | null;
}

export type ImportRowState =
  | { phase: "queued" }
  | { phase: "reading" }
  | { phase: "ready"; result: ImportDraftResult }
  | { phase: "failed"; reason: string; result: ImportDraftResult | null };

interface ImportResponse {
  ok: boolean;
  error?: string;
  results?: ImportDraftResult[];
  categories?: string[];
  provider?: string | null;
  aiAvailable?: boolean;
  limit?: number;
}

/** One link per request is deliberate: a slow 1688 page must not delay the other
 *  39, and one failure must not discard the successful drafts beside it. */
const PER_CALL = 1;

/**
 * Read a batch of links and report each row as it lands.
 * `onRow` fires for "reading" before the request and once with the outcome.
 */
export async function runImportQueue(
  links: ParsedMarketplaceLink[],
  opts: {
    pastedText?: string | null;
    generateCopy?: boolean;
    timeoutMs?: number;
    onRow: (link: ParsedMarketplaceLink, state: ImportRowState) => void;
  }
): Promise<void> {
  const batches: ParsedMarketplaceLink[][] = [];
  for (let i = 0; i < links.length; i += PER_CALL) batches.push(links.slice(i, i + PER_CALL));

  // Two in flight: enough to hide provider latency, few enough that a staff
  // member watching the queue sees rows resolve in a predictable order.
  const CONCURRENCY = 2;
  let cursor = 0;

  const worker = async () => {
    while (cursor < batches.length) {
      const batch = batches[cursor++];
      for (const link of batch) opts.onRow(link, { phase: "reading" });
      try {
        const res = await edgeFetch<ImportResponse>("product-import", {
          method: "POST",
          body: {
            links: batch.map((l) => l.url),
            pastedText: opts.pastedText ?? undefined,
            generateCopy: opts.generateCopy !== false,
          },
          timeoutMs: opts.timeoutMs ?? 75_000,
        });

        if (!res.ok || !res.results) {
          const reason =
            res.error === "staff_required"
              ? "This account is not staff, so it cannot import."
              : res.error === "too_many_links"
                ? `Send at most ${res.limit ?? 4} links per request.`
                : res.error
                  ? `The import service answered "${res.error}".`
                  : "The import service returned no drafts.";
          for (const link of batch) opts.onRow(link, { phase: "failed", reason, result: null });
          continue;
        }

        const byUrl = new Map(res.results.map((r) => [r.url, r]));
        for (const link of batch) {
          const result =
            byUrl.get(link.url) ??
            (link.itemId ? res.results.find((r) => r.itemId === link.itemId) : undefined);
          if (!result) {
            opts.onRow(link, {
              phase: "failed",
              reason: "The service did not return a draft for this link.",
              result: null,
            });
          } else if (result.ok) {
            opts.onRow(link, { phase: "ready", result });
          } else {
            opts.onRow(link, { phase: "failed", reason: result.message, result });
          }
        }
      } catch (e) {
        const reason =
          (e as Error)?.name === "EdgeTimeoutError"
            ? "Reading the listing took too long. Retry this link, or paste the listing text."
            : `The import request failed: ${(e as Error)?.message ?? "unknown error"}`;
        for (const link of batch) opts.onRow(link, { phase: "failed", reason, result: null });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
}

export interface GeneratedImage {
  ok: boolean;
  url?: string;
  storagePath?: string;
  model?: string;
  mode?: "generate" | "restyle";
  message?: string;
  error?: string;
}

/** Generate one product photo. Returns the stored URL or a reason — never a guess. */
export async function generateProductImage(opts: {
  title: string;
  productId?: string | null;
  category?: string | null;
  attributes?: Array<{ key: string; value: string }>;
  referenceUrl?: string | null;
  mode?: "generate" | "restyle";
  size?: "1024x1024" | "1024x1536" | "1536x1024";
  timeoutMs?: number;
}): Promise<GeneratedImage> {
  try {
    return await edgeFetch<GeneratedImage>("ai-image", {
      method: "POST",
      body: {
        title: opts.title,
        productId: opts.productId ?? undefined,
        category: opts.category ?? undefined,
        attributes: opts.attributes ?? undefined,
        referenceUrl: opts.referenceUrl ?? undefined,
        mode: opts.mode ?? (opts.referenceUrl ? "restyle" : "generate"),
        size: opts.size ?? "1024x1024",
      },
      timeoutMs: opts.timeoutMs ?? 180_000,
    });
  } catch (e) {
    return {
      ok: false,
      error: "request_failed",
      message:
        (e as Error)?.name === "EdgeTimeoutError"
          ? "Image generation timed out (the provider allows two minutes)."
          : `The image request failed: ${(e as Error)?.message ?? "unknown error"}`,
    };
  }
}

/** Human copy for every ai-image error code. Shown verbatim, never swallowed. */
export function imageErrorCopy(res: GeneratedImage): string {
  if (res.message) return res.message;
  switch (res.error) {
    case "ai_provider_not_configured":
      return "Image generation has no provider. Set it in Settings → AI Provider → Image.";
    case "bucket_missing":
      return "The product-images bucket does not exist. Run 202610161300_product_media_bucket.sql in Supabase.";
    case "storage_write_denied":
      return "Storage refused the write. Run 202610161300_product_media_bucket.sql so staff can upload.";
    case "provider_no_image_edit":
      return "This provider cannot restyle from a reference photo. Use Generate instead.";
    case "provider_refused":
      return "The image provider refused the request. Check the model name in Settings → AI Provider → Image.";
    case "reference_unreachable":
      return "The listing photo could not be downloaded. Use Generate instead.";
    case "reference_not_decodable":
      return "The listing photo is not a readable image. Use Generate instead.";
    default:
      return res.error ? `Image generation failed (${res.error}).` : "Image generation failed.";
  }
}

/**
 * Turn a server draft into the SAME form shape the hand-add editor uses, so a
 * saved import goes through one payload builder, one validation pass and one
 * set of NOT NULL fallbacks. Nothing about an import is special-cased at write
 * time — that is what keeps the two paths from drifting.
 *
 * `categoryId` is resolved by the caller against the live category rows; a
 * category name that matches no row is kept as text, exactly like the editor's
 * orphan handling.
 */
export function formValuesFromDraft(
  draft: ImportDraftFields,
  marketplace: string,
  resolveCategoryId: (name: string | null) => string | null
): ProductFormValues {
  return {
    ...EMPTY_PRODUCT_FORM,
    marketplace,
    source_product_id: draft.source_product_id ?? "",
    source_url: draft.source_url,
    source_seller_id: draft.source_seller_id ?? "",
    seller_name: draft.seller_name ?? "",
    title_original: draft.title_original ?? "",
    title_english: draft.title_english ?? "",
    title_somali: draft.title_somali ?? "",
    description_original: draft.description_original ?? "",
    description_english: draft.description_english ?? "",
    description_somali: draft.description_somali ?? "",
    images: draft.images,
    categoryId: resolveCategoryId(draft.category_name),
    categoryText: draft.category_name && !resolveCategoryId(draft.category_name) ? draft.category_name : null,
    attributes: draft.attributes.map((a) => ({ key: a.key, value: a.value })),
    // The MOQ number is NOT set from the wording: moqIngest owns the reading, and
    // `moq_raw_text` preserves the evidence for that reader. A model-guessed
    // number here would block real orders. `moq: 0` is this codebase's "not
    // stated" (the parser and resolveMoq both treat 0 as absent), and no
    // `moq_source` is written because the parser has not run yet — claiming
    // "regex" before it does would be provenance for a reading nobody made.
    moq: "",
    moq_raw_text: draft.moq_text ?? "",
    moq_source: "",
    price_cny_min: draft.price_cny_min !== null ? String(draft.price_cny_min) : "",
    price_cny_max: draft.price_cny_max !== null ? String(draft.price_cny_max) : "",
    acquisition_method: draft.attributes.length || draft.description_english ? "AI import" : "import",
    data_confidence: draft.description_english ? "0.7" : "0.5",
    // Imports land as drafts: the operator reviews, adds the price if it was
    // missing, and publishes deliberately.
    status: "draft",
  };
}
