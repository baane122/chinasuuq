// ChinaSuuq — ai-image: generate a clean product photo for a catalog listing.
//
// WHY. A large share of listings carry 1688/Taobao CDN photos that expire or
// refuse non-Chinese referers, so a card renders a placeholder. Re-photographing
// is not an option for an imported product; generating a studio shot from the
// listing's own subject is. This function is the server half — the credential
// never reaches the browser, matching every other AI feature here.
//
// TWO MODES
//   generate — text → image, prompt built from the product's real fields.
//   restyle  — an existing product photo → the same subject in a clean studio
//              setting (keeps what the product IS; changes only the background).
// Restyle is the honest default: a text-only prompt invents a product that may
// not match what the supplier ships, so the UI prefers restyle when the listing
// already has at least one working image.
//
// WHAT IT WILL NOT DO
//  - Invent brand marks, certifications, text or labels in the photo (the prompt
//    forbids them; a generated "CE" badge on an uncertified item is a legal
//    problem, not a cosmetic one).
//  - Return a URL it did not store. The image is uploaded to the public
//    `product-images` bucket and the URL returned is the stored object's.
//  - Pretend a failed generation succeeded: every failure carries a code the UI
//    renders verbatim (not_configured, bucket_missing, provider_refused, …).
//
// AUTH: staff/super_admin. Generation costs money per call.
//
// POST { productId?, title, category?, attributes?, referenceUrl?, mode?, aspect? }
//   → { ok, url, storagePath, model, mode, revisedPrompt? }

import { corsHeaders } from "../_shared/cors.ts";
import { deny, staffGate } from "../_shared/auth.ts";
import { loadAiProviderForTask } from "../_shared/ai-provider.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BUCKET = "product-images";
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;
const MAX_TITLE = 300;
const MAX_ATTRIBUTES = 12;

const ALLOWED_SIZES = new Set(["1024x1024", "1024x1536", "1536x1024"]);

type Mode = "generate" | "restyle";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * The prompt. Deliberately narrow: a product photo for a marketplace card, with
 * the constraints that keep it usable and legal.
 */
function buildPrompt(opts: {
  title: string;
  category: string | null;
  attributes: Array<{ key: string; value: string }>;
  mode: Mode;
}): string {
  const specs = opts.attributes
    .slice(0, MAX_ATTRIBUTES)
    .map((a) => `${a.key}: ${a.value}`)
    .join(", ");
  const subject = opts.category ? `${opts.title} (${opts.category})` : opts.title;
  const lines = [
    opts.mode === "restyle"
      ? `Recreate the SAME product shown in the reference photo: ${subject}.`
      : `Professional product photograph of: ${subject}.`,
    specs ? `Product specifications to respect: ${specs}.` : "",
    "Style: e-commerce catalog photo, single product, centered, full product visible, soft even studio lighting, subtle contact shadow, seamless light neutral background, high resolution, sharp focus, colour-accurate.",
    "STRICT: no text, no logos, no brand marks, no watermarks, no certification badges, no price tags, no human models, no hands, no props unrelated to the product. Do not add features the product does not have.",
  ];
  return lines.filter(Boolean).join("\n");
}

function extensionFor(mime: string): string {
  if (mime.includes("webp")) return "webp";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  return "png";
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Download a reference photo with a hard size cap and a real content-type check. */
async function fetchReference(url: string): Promise<{ bytes: Uint8Array; mime: string } | { error: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: "reference_url_malformed" };
  }
  if (parsed.protocol !== "https:") return { error: "reference_url_must_be_https" };

  let resp: Response;
  try {
    resp = await fetch(parsed.href, {
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { error: "reference_unreachable" };
  }
  if (!resp.ok) return { error: `reference_http_${resp.status}` };

  const mime = (resp.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!/^image\/(png|jpe?g|webp)$/.test(mime)) return { error: `reference_not_an_image_(${mime || "unknown"})` };

  const buf = new Uint8Array(await resp.arrayBuffer());
  if (buf.byteLength === 0) return { error: "reference_empty" };
  if (buf.byteLength > MAX_REFERENCE_BYTES) return { error: "reference_too_large" };

  // Trust the bytes, not only the header: a HTML error page served as image/png
  // would otherwise be sent to the provider as a "photo".
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
  const isWebp = buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
  if (!isPng && !isJpg && !isWebp) return { error: "reference_not_decodable" };

  return { bytes: buf, mime };
}

export async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const gate = await staffGate(req);
  if (!gate.caller) return deny(gate, "ai-image");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const title = String(body.title ?? "").trim().slice(0, MAX_TITLE);
  if (!title) return json({ ok: false, error: "title_required" }, 400);

  const category = body.category ? String(body.category).slice(0, 120) : null;
  const attributes = Array.isArray(body.attributes)
    ? body.attributes
        .slice(0, MAX_ATTRIBUTES)
        .map((a) => {
          const o = (a ?? {}) as Record<string, unknown>;
          return { key: String(o.key ?? "").trim().slice(0, 60), value: String(o.value ?? "").trim().slice(0, 60) };
        })
        .filter((a) => a.key && a.value)
    : [];

  const requestedMode: Mode = body.mode === "generate" ? "generate" : "restyle";
  const referenceUrl = body.referenceUrl ? String(body.referenceUrl).trim() : null;
  // restyle without a usable reference silently becomes a plain generation —
  // reported in the response as `mode`, never assumed by the caller.
  const mode: Mode = requestedMode === "restyle" && referenceUrl ? "restyle" : "generate";
  const size = ALLOWED_SIZES.has(String(body.size ?? "")) ? String(body.size) : "1024x1024";
  const productId = typeof body.productId === "string" && /^[0-9a-f-]{36}$/i.test(body.productId) ? body.productId : null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Cast adapts supabase-js's PostgrestBuilder (a thenable, not a Promise) to the
  // shared helper's deliberately minimal structural type — same as ai-chat.
  const provider = await loadAiProviderForTask(
    supabase as unknown as Parameters<typeof loadAiProviderForTask>[0],
    "image"
  );
  if (!provider) {
    return json({
      ok: false,
      error: "ai_provider_not_configured",
      message: "Image generation has no provider. Set one in Settings → AI Provider → Image.",
    }, 503);
  }

  const prompt = buildPrompt({ title, category, attributes, mode });

  let imageBytes: Uint8Array | null = null;
  let imageMime = "image/png";
  let revisedPrompt: string | null = null;

  if (mode === "restyle" && referenceUrl) {
    const ref = await fetchReference(referenceUrl);
    if ("error" in ref) {
      return json({ ok: false, error: ref.error, message: "The listing photo could not be used as a reference. Try Generate instead." }, 422);
    }

    // OpenAI-compatible /images/edits takes multipart form data. A provider that
    // only implements /images/generations answers 404 here — surfaced, not hidden.
    const form = new FormData();
    form.append("model", provider.model);
    form.append("prompt", prompt);
    form.append("size", size);
    form.append("n", "1");
    // Cut a plain ArrayBuffer out of the view: a Uint8Array can be backed by a
    // SharedArrayBuffer, which Blob does not accept (and which would let the
    // provider read memory that is still being written).
    const refBody = ref.bytes.buffer.slice(
      ref.bytes.byteOffset,
      ref.bytes.byteOffset + ref.bytes.byteLength
    ) as ArrayBuffer;
    form.append(
      "image",
      new Blob([refBody], { type: ref.mime }),
      `reference.${extensionFor(ref.mime)}`
    );

    let resp: Response;
    try {
      resp = await fetch(`${provider.baseUrl}/images/edits`, {
        method: "POST",
        headers: { Authorization: `Bearer ${provider.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
    } catch (e) {
      const name = (e as Error)?.name ?? "";
      return json({
        ok: false,
        error: name === "TimeoutError" || name === "AbortError" ? "provider_timeout" : "provider_unreachable",
        message: "The image provider did not answer. Try Generate instead, or retry shortly.",
      }, 502);
    }

    if (resp.status === 404 || resp.status === 405) {
      return json({
        ok: false,
        error: "provider_no_image_edit",
        message: "This provider does not support restyling from a reference photo. Use Generate instead.",
      }, 422);
    }
    if (!resp.ok) {
      return json({ ok: false, error: "provider_refused", status: resp.status }, 502);
    }

    const payload = (await resp.json().catch(() => null)) as Record<string, unknown> | null;
    const first = ((payload?.data as Array<Record<string, unknown>> | undefined) ?? [])[0] ?? null;
    if (!first) return json({ ok: false, error: "provider_returned_no_image" }, 502);
    if (typeof first.b64_json === "string" && first.b64_json) {
      imageBytes = base64ToBytes(first.b64_json);
    } else if (typeof first.url === "string" && first.url) {
      const downloaded = await fetchReference(first.url);
      if ("error" in downloaded) return json({ ok: false, error: "provider_image_unreadable" }, 502);
      imageBytes = downloaded.bytes;
      imageMime = downloaded.mime;
    }
    if (typeof first.revised_prompt === "string") revisedPrompt = first.revised_prompt.slice(0, 600);
  } else {
    let resp: Response;
    try {
      resp = await fetch(`${provider.baseUrl}/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: provider.model, prompt, n: 1, size }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (e) {
      const name = (e as Error)?.name ?? "";
      return json({
        ok: false,
        error: name === "TimeoutError" || name === "AbortError" ? "provider_timeout" : "provider_unreachable",
        message: "The image provider did not answer within two minutes.",
      }, 502);
    }
    if (!resp.ok) return json({ ok: false, error: "provider_refused", status: resp.status }, 502);

    const payload = (await resp.json().catch(() => null)) as Record<string, unknown> | null;
    const first = ((payload?.data as Array<Record<string, unknown>> | undefined) ?? [])[0] ?? null;
    if (!first) return json({ ok: false, error: "provider_returned_no_image" }, 502);
    if (typeof first.b64_json === "string" && first.b64_json) {
      imageBytes = base64ToBytes(first.b64_json);
    } else if (typeof first.url === "string" && first.url) {
      const downloaded = await fetchReference(first.url);
      if ("error" in downloaded) return json({ ok: false, error: "provider_image_unreadable" }, 502);
      imageBytes = downloaded.bytes;
      imageMime = downloaded.mime;
    }
    if (typeof first.revised_prompt === "string") revisedPrompt = first.revised_prompt.slice(0, 600);
  }

  if (!imageBytes || imageBytes.byteLength === 0) {
    return json({ ok: false, error: "provider_returned_no_image" }, 502);
  }

  const owner = productId ?? "unassigned";
  const path = `${owner}/ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionFor(imageMime)}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, imageBytes, { contentType: imageMime, upsert: false });

  if (uploadError) {
    const message = uploadError.message ?? "upload refused";
    // The bucket is created by 202610161300_product_media_bucket.sql, which needs
    // the dashboard. Name that, because "bucket not found" is not actionable on
    // its own and this button would otherwise look broken.
    const bucketMissing = /bucket not found/i.test(message);
    const denied = /row-level security|Unauthorized|AccessDenied/i.test(message);
    return json({
      ok: false,
      error: bucketMissing ? "bucket_missing" : denied ? "storage_write_denied" : "storage_upload_failed",
      message: bucketMissing
        ? `The ${BUCKET} storage bucket does not exist yet. Run supabase/migrations/202610161300_product_media_bucket.sql in the Supabase SQL editor, then retry.`
        : denied
          ? `Storage refused the write: run 202610161300_product_media_bucket.sql so staff can upload to ${BUCKET}.`
          : message,
    }, 500);
  }

  const { data: publicUrl } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return json({
    ok: true,
    url: publicUrl.publicUrl,
    storagePath: path,
    model: provider.model,
    mode,
    size,
    revisedPrompt,
  });
}

Deno.serve(handler);
