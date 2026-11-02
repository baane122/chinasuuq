"use client";

/**
 * AI photo studio for the product editor.
 *
 * WHY: hotlinked 1688/Taobao photos expire, and a listing whose photos died
 * renders a placeholder on the customer shop. This panel generates a clean
 * catalog photo — restyled from the listing's own photo when one loads, from a
 * prompt built on the product's real fields when none does.
 *
 * HONESTY
 *  - Nothing is added to the product until the operator presses "Use this photo".
 *    A generation is a FILE in storage plus a preview, not a catalog change.
 *  - A failure is displayed with its reason. There is no silent retry and no
 *    placeholder painted as success.
 *  - The prompt is shown before generating, because a staff member has to be able
 *    to see what the model was told to draw.
 */

import { useMemo, useState } from "react";
import { Image as ImageIcon, Loader2, Sparkles, Wand2, X, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateProductImage, imageErrorCopy } from "@/lib/admin/productImport";
import { useToast } from "@/components/admin/Toast";

const MAX_PRODUCT_IMAGES = 24;

type Size = "1024x1024" | "1024x1536" | "1536x1024";

const SIZES: Array<{ value: Size; label: string }> = [
  { value: "1024x1024", label: "Square (catalog card)" },
  { value: "1024x1536", label: "Portrait" },
  { value: "1536x1024", label: "Landscape" },
];

export default function AiImageStudio({
  title,
  productId,
  category,
  attributes,
  existingImages,
  disabled = false,
  onUseImage,
}: {
  title: string;
  productId: string | null;
  category: string | null;
  attributes: Array<{ key: string; value: string }>;
  existingImages: string[];
  disabled?: boolean;
  onUseImage: (url: string) => void;
}) {
  const { success, error: toastError } = useToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"restyle" | "generate">(existingImages[0] ? "restyle" : "generate");
  const [reference, setReference] = useState<string>(existingImages[0] ?? "");
  const [size, setSize] = useState<Size>("1024x1024");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string; mode: string; model: string | null } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const specLine = useMemo(
    () =>
      attributes
        .filter((a) => a.key && a.value)
        .slice(0, 6)
        .map((a) => `${a.key}: ${a.value}`)
        .join(" · "),
    [attributes]
  );

  const atCap = existingImages.length >= MAX_PRODUCT_IMAGES;
  const canGenerate = Boolean(title.trim()) && !busy && !disabled && !atCap;

  const generate = async () => {
    setBusy(true);
    setFailure(null);
    setResult(null);
    const res = await generateProductImage({
      title: title.trim(),
      productId,
      category,
      attributes,
      referenceUrl: mode === "restyle" ? reference || null : null,
      mode,
      size,
    });
    if (res.ok && res.url) {
      setResult({ url: res.url, mode: res.mode ?? mode, model: res.model ?? null });
    } else {
      setFailure(imageErrorCopy(res));
    }
    setBusy(false);
  };

  const use = () => {
    if (!result) return;
    if (atCap) {
      toastError(`This product already holds ${MAX_PRODUCT_IMAGES} images — remove one first.`);
      return;
    }
    onUseImage(result.url);
    success("Photo added to the product. Save the product to publish it.");
    setResult(null);
    setOpen(false);
  };

  return (
    <div className="rounded-xl border border-brand-200/70 bg-gradient-to-br from-brand-50/70 to-white p-3 dark:border-brand-500/25 dark:from-brand-500/10 dark:to-transparent">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
          <Wand2 className="h-4 w-4" />
          AI product photo
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={disabled}
          className="admin-btn-outline h-8 px-2.5 text-[11px] disabled:opacity-40"
          aria-expanded={open}
        >
          {open ? "Hide" : "Open studio"}
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-dark-900/50 dark:text-neutral-400">
        Generates a clean studio photo from this product&apos;s title, specs and listing photo — for when the marketplace CDN photo is blocked or expired.
      </p>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Mode */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setMode("restyle")}
              disabled={!existingImages.length || busy}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
                mode === "restyle"
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-dark-900/10 bg-white text-dark-900/65 hover:border-brand-300 dark:border-white/10 dark:bg-dark-900 dark:text-neutral-300",
                !existingImages.length && "cursor-not-allowed opacity-40"
              )}
              title={existingImages.length ? "Keep the real product, replace the background" : "Add at least one listing photo first"}
            >
              <ImageIcon className="h-3.5 w-3.5" /> Restyle listing photo
            </button>
            <button
              type="button"
              onClick={() => setMode("generate")}
              disabled={busy}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
                mode === "generate"
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-dark-900/10 bg-white text-dark-900/65 hover:border-brand-300 dark:border-white/10 dark:bg-dark-900 dark:text-neutral-300"
              )}
            >
              <Sparkles className="h-3.5 w-3.5" /> Generate from scratch
            </button>
          </div>

          {mode === "restyle" && existingImages.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-dark-900/55 dark:text-neutral-400">Reference photo</p>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {existingImages.slice(0, 12).map((url) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setReference(url)}
                    className={cn(
                      "h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2",
                      reference === url ? "border-brand-500" : "border-transparent opacity-70 hover:opacity-100"
                    )}
                    aria-label="Use this photo as the reference"
                  >
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* What the model is told */}
          <div className="rounded-lg border border-dark-900/[0.06] bg-white/70 px-3 py-2 text-[11px] leading-relaxed text-dark-900/60 dark:border-white/[0.08] dark:bg-dark-900/60 dark:text-neutral-400">
            <p className="font-semibold text-dark-900/70 dark:text-neutral-300">Subject: {title.trim() || "(no title yet)"}</p>
            {category && <p>Category: {category}</p>}
            {specLine && <p>Specs respected: {specLine}</p>}
            <p className="mt-1 text-dark-900/40 dark:text-neutral-500">
              No text, logos, brand marks or certification badges are requested — nothing is added that the supplier did not state.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-dark-900/55 dark:text-neutral-400">
              <span className="sr-only sm:not-sr-only">Shape</span>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value as Size)}
                disabled={busy}
                className="admin-input h-9 py-0 text-xs"
              >
                {SIZES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={generate}
              disabled={!canGenerate}
              className="admin-btn-primary h-9 px-3 text-xs disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {busy ? "Generating…" : "Generate photo"}
            </button>
          </div>

          {atCap && (
            <p className="flex items-start gap-1.5 text-[11px] text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              This product already holds {MAX_PRODUCT_IMAGES} images (the maximum). Remove one before generating another.
            </p>
          )}

          {failure && (
            <div role="alert" className="rounded-lg border border-rose-300/60 bg-rose-50 px-3 py-2 text-[12px] leading-relaxed text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" /> Generation failed
              </p>
              <p className="mt-1 break-words">{failure}</p>
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-success/30 bg-white p-2 dark:bg-dark-900">
              <img src={result.url} alt="Generated product photo" className="mx-auto max-h-64 rounded-lg object-contain" />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] text-dark-900/45 dark:text-neutral-500">
                  {result.mode === "restyle" ? "Restyled from the listing photo" : "Generated from the product details"}
                  {result.model ? ` · ${result.model}` : ""} · stored in product-images
                </p>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setResult(null)} className="admin-btn-ghost h-8 px-2 text-[11px]">
                    <X className="h-3.5 w-3.5" /> Discard
                  </button>
                  <button type="button" onClick={use} className="admin-btn-primary h-8 px-2.5 text-[11px]">
                    <Check className="h-3.5 w-3.5" /> Use this photo
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
