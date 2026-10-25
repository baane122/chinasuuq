"use client";

/**
 * Product image manager for Mission Control.
 *
 * Replaces the old newline `<textarea>`: the ORDER of `source_products.images`
 * is the order the customer shop renders (index 0 = the cover), so this
 * component reorders, sets a cover and deletes per image instead of regenerating
 * the whole array from a paste.
 *
 * HONEST UPLOAD STATE (verified 2026-10-16): the `product-images` bucket now
 * exists, but storage WRITE RULES cannot be created from code (Management API
 * token is 401; dashboard-only). `uploadProductImage` therefore answers
 * `{ok:false, reason:"…run supabase/migrations/202610161300_product_media_bucket.sql…"}`.
 * That sentence is shown verbatim — inline and via toast — the URL path keeps
 * working, and an upload is never presented as a success it wasn't.
 *
 * Broken-link detection (`probeImageUrl`) matters because the catalogue hotlinks
 * 1688/Taobao CDN URLs that expire or refuse non-Chinese referers: "blocked"
 * (403 — the host is answering, customers may still fail to load it) and
 * "broken" (nothing there) are different diagnoses and get different icons.
 */

import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  HelpCircle,
  ImageOff,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Star,
  UploadCloud,
  X,
} from "lucide-react";
import { probeImageUrl, uploadProductImage, PRODUCT_IMAGE_BUCKET } from "@/lib/catalog";
import { useToast } from "@/components/admin/Toast";
import { cn } from "@/lib/utils";

/** Same ceiling as `normalizeImages` in lib/catalog.ts — never accept more. */
export const MAX_PRODUCT_IMAGES = 24;

type ProbeState = "ok" | "blocked" | "broken" | "unknown" | "checking";

const PROBE_META: Record<Exclude<ProbeState, "checking">, { label: string; tip: string; className: string }> = {
  ok: {
    label: "Reachable",
    tip: "The browser could load this URL.",
    className: "bg-success/15 text-success",
  },
  blocked: {
    label: "Blocked",
    tip: "Blocked — the host answered 403 (1688/Taobao hotlink protection against foreign referers). Customers outside China may still see a broken image.",
    className: "bg-warning/15 text-warning",
  },
  broken: {
    label: "Broken",
    tip: "Broken — nothing loaded at this URL. The listing image has probably expired; re-capture it or upload a copy.",
    className: "bg-error/15 text-error",
  },
  unknown: {
    label: "Unknown",
    tip: "Unknown — the browser could not test this URL (CORS or offline). Not proof it works, not proof it is broken.",
    className: "bg-dark-900/10 text-dark-900/50 dark:bg-white/10 dark:text-neutral-400",
  },
};

function isAcceptableUrl(raw: string): boolean {
  return /^(https?:\/\/\S+|data:image\/[a-z]+;base64,\S+|\/\S+)$/i.test(raw);
}

export default function ImageManager({
  images,
  onChange,
  productId,
  disabled = false,
}: {
  images: string[];
  onChange: (next: string[]) => void;
  productId: string | null;
  disabled?: boolean;
}) {
  const { success, error: toastError } = useToast();
  const [pasteDraft, setPasteDraft] = useState("");
  const [probes, setProbes] = useState<Record<string, ProbeState>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const move = (from: number, to: number) => {
    if (disabled || to < 0 || to >= images.length || from === to) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const addPasted = () => {
    const candidates = pasteDraft
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!candidates.length) {
      toastError("Paste one or more image URLs first (one per line).");
      return;
    }
    const invalid = candidates.filter((u) => !isAcceptableUrl(u));
    const seen = new Set(images);
    const fresh: string[] = [];
    for (const u of candidates) {
      if (!isAcceptableUrl(u) || seen.has(u)) continue;
      seen.add(u);
      fresh.push(u);
    }
    const room = MAX_PRODUCT_IMAGES - images.length;
    const accepted = fresh.slice(0, Math.max(0, room));
    if (accepted.length) onChange([...images, ...accepted]);
    setPasteDraft("");
    const notes: string[] = [];
    if (invalid.length) notes.push(`${invalid.length} not a valid URL`);
    if (fresh.length > accepted.length) notes.push(`${fresh.length - accepted.length} over the ${MAX_PRODUCT_IMAGES}-image cap`);
    if (accepted.length && notes.length) toastError(`${accepted.length} added; ${notes.join(", ")}.`);
    else if (accepted.length) success(`${accepted.length} image${accepted.length === 1 ? "" : "s"} added.`);
    else toastError(notes.length ? `Nothing added: ${notes.join(", ")}.` : "Nothing new to add.");
  };

  const handleFiles = async (files: FileList | File[]) => {
    if (disabled) return;
    const list = Array.from(files);
    if (!list.length) return;
    setUploading(true);
    setUploadError(null);
    let added = 0;
    // Accumulate in a local copy: the parent's `images` prop does not update
    // inside this loop, so each push is based on the last known array.
    const next = [...images];
    for (const file of list) {
      const outcome = await uploadProductImage(file, productId);
      if (outcome.ok && outcome.url) {
        if (!next.includes(outcome.url) && next.length < MAX_PRODUCT_IMAGES) {
          next.push(outcome.url);
          added++;
          onChange(next);
        }
      } else {
        // Verbatim, never softened: the migration sentence is the actionable part.
        setUploadError(outcome.reason ?? "Upload failed for an unknown reason.");
        toastError(outcome.reason ?? "Upload failed.");
      }
    }
    if (added) success(`${added} file${added === 1 ? "" : "s"} uploaded to ${PRODUCT_IMAGE_BUCKET}.`);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const checkImage = async (url: string) => {
    setProbes((p) => ({ ...p, [url]: "checking" }));
    const result = await probeImageUrl(url);
    setProbes((p) => ({ ...p, [url]: result }));
  };

  const checkAll = async () => {
    for (const url of images) await checkImage(url);
  };

  return (
    <div className="rounded-xl border border-dark-900/[0.06] bg-white p-4 dark:border-white/[0.08] dark:bg-dark-900">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-dark-400">
          Images{" "}
          <span className="ml-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-bold text-brand-700 dark:text-brand-300">
            {images.length}/{MAX_PRODUCT_IMAGES}
          </span>
        </p>
        <button
          type="button"
          onClick={checkAll}
          disabled={!images.length}
          className="admin-btn-ghost h-8 text-xs"
          title="Test every URL in this list (HEAD request per image)"
        >
          <Search className="h-3.5 w-3.5" /> Check all links
        </button>
      </div>
      <p className="mb-3 text-[11px] leading-snug text-dark-900/45 dark:text-neutral-400">
        This order IS the customer-facing order: image 1 is the cover photo on the shop card.
        Reorder with the arrows or drag a thumbnail onto another.
      </p>

      {images.length === 0 ? (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-dashed border-dark-900/15 px-4 py-5 text-sm text-dark-900/40 dark:border-white/15 dark:text-neutral-500">
          <ImageOff className="h-4 w-4" /> No images on this product yet — the shop shows a placeholder.
        </div>
      ) : (
        <ul className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((url, i) => {
            const probe = probes[url];
            const meta = probe && probe !== "checking" ? PROBE_META[probe] : null;
            return (
              <li
                key={`${url}-${i}`}
                draggable={!disabled}
                onDragStart={() => setDragFrom(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragFrom !== null) move(dragFrom, i);
                  setDragFrom(null);
                }}
                className={cn(
                  "group rounded-xl border border-dark-900/[0.08] bg-warm-50 p-2 dark:border-white/[0.08] dark:bg-dark-950",
                  dragFrom === i && "opacity-50",
                  !disabled && "cursor-grab"
                )}
              >
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Image ${i + 1}`}
                    className="h-20 w-full rounded-lg object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.opacity = "0.25";
                    }}
                    draggable={false}
                  />
                  {i === 0 && (
                    <span className="absolute left-1 top-1 rounded-full bg-brand-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                      Cover
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => checkImage(url)}
                    className={cn(
                      "absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full",
                      meta ? meta.className : "bg-white/80 text-dark-900/40 dark:bg-dark-900/70 dark:text-neutral-400"
                    )}
                    title={
                      probe === "checking"
                        ? "Checking…"
                        : meta
                          ? `${meta.label}: ${meta.tip}`
                          : "Check whether this URL still loads (broken 1688/Taobao links are common)"
                    }
                    aria-label={`Check link for image ${i + 1}${meta ? ` — ${meta.label}` : ""}`}
                  >
                    {probe === "checking" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : meta?.label === "Reachable" ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : meta?.label === "Blocked" ? (
                      <ShieldAlert className="h-3.5 w-3.5" />
                    ) : meta?.label === "Broken" ? (
                      <X className="h-3.5 w-3.5" />
                    ) : (
                      <HelpCircle className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <p className="mt-1 truncate text-[10px] text-dark-900/40 dark:text-neutral-500" title={url}>
                  {url.replace(/^https?:\/\//, "")}
                </p>
                <div className="mt-1 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, i - 1)}
                    disabled={disabled || i === 0}
                    className="admin-btn-ghost h-6 flex-1 px-0 disabled:opacity-30"
                    title="Move up (earlier for customers)"
                    aria-label={`Move image ${i + 1} up`}
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, i + 1)}
                    disabled={disabled || i === images.length - 1}
                    className="admin-btn-ghost h-6 flex-1 px-0 disabled:opacity-30"
                    title="Move down"
                    aria-label={`Move image ${i + 1} down`}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                  {i > 0 && (
                    <button
                      type="button"
                      onClick={() => move(i, 0)}
                      disabled={disabled}
                      className="admin-btn-ghost h-6 flex-1 px-0 hover:text-brand-600"
                      title="Set as cover (moves to position 1)"
                      aria-label={`Set image ${i + 1} as cover`}
                    >
                      <Star className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onChange(images.filter((_, k) => k !== i))}
                    disabled={disabled}
                    className="admin-btn-ghost h-6 flex-1 px-0 hover:text-error"
                    title="Remove this image"
                    aria-label={`Remove image ${i + 1}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add by URL — newline or comma separated, still accepts the old paste flow. */}
      <div className="mb-3">
        <label className="admin-label" htmlFor="product-image-paste">
          Add image URLs
        </label>
        <div className="flex gap-2">
          <textarea
            id="product-image-paste"
            value={pasteDraft}
            onChange={(e) => setPasteDraft(e.target.value)}
            rows={2}
            disabled={disabled}
            placeholder={"https://example.com/1.jpg\nhttps://example.com/2.jpg"}
            className="admin-input flex-1 resize-none font-mono text-xs"
          />
          <button type="button" onClick={addPasted} disabled={disabled || !pasteDraft.trim()} className="admin-btn-outline self-end whitespace-nowrap">
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </div>

      {/* Upload — honest about the dashboard-only storage rules blocker. */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!disabled) void handleFiles(e.dataTransfer.files);
        }}
        className="rounded-xl border border-dashed border-dark-900/15 bg-warm-50 px-4 py-3 text-center dark:border-white/15 dark:bg-dark-950"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          multiple
          className="sr-only"
          id="product-image-upload"
          onChange={(e) => void handleFiles(e.target.files ?? [])}
          disabled={disabled || uploading}
        />
        <label
          htmlFor="product-image-upload"
          className={cn(
            "inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-brand-600 dark:text-brand-400",
            (disabled || uploading) && "cursor-not-allowed opacity-50"
          )}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          {uploading ? "Uploading…" : "Choose files"}
        </label>
        <p className="mt-1 text-[11px] text-dark-900/45 dark:text-neutral-500">
          or drag images here — uploads go to the <span className="font-mono">{PRODUCT_IMAGE_BUCKET}</span> bucket
          (max 6 MB, png/jpg/webp/gif/avif). Hotlinked URLs stay supported either way.
        </p>
        {uploadError && (
          <div
            role="alert"
            className="mt-2 rounded-lg border border-rose-300/60 bg-rose-50 px-3 py-2 text-left text-[12px] leading-relaxed text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
          >
            <p className="font-semibold">Upload did not succeed — the URL path below still works:</p>
            <p className="mt-1 break-words font-mono text-[11px]">{uploadError}</p>
          </div>
        )}
      </div>

      <p className="mt-2 flex items-start gap-1.5 text-[11px] text-dark-900/40 dark:text-neutral-500">
        <RefreshCw className="mt-0.5 h-3 w-3 shrink-0" />
        Marketplace links (1688/Taobao) expire. A "Blocked" icon means the host refused the test request — the image may
        still fail for real customers, so re-capture or upload a copy when in doubt.
      </p>
    </div>
  );
}
