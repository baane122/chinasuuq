"use client";

/**
 * Import Studio — paste marketplace links, review drafts, save.
 *
 * WHAT IT REPLACES: the single-input "AI Extract from listing" box, which could
 * only chew on pasted TEXT one product at a time and had no way to show what it
 * found before writing.
 *
 * THE FLOW
 *   1. Paste links → parsed locally (platform + item id) before anything is sent.
 *   2. Read      → `product-import` returns a draft per link: images, price,
 *                  MOQ wording, bilingual copy, category.
 *   3. Review    → each row shows a cover photo, the copy, and its warnings.
 *                  Rows can be edited, skipped, or re-read.
 *   4. Save      → selected rows go through `createProduct`, the same writer a
 *                  hand-added product uses. Imports land as DRAFTS.
 *
 * THE RULES THIS SCREEN OBEYS (the rest of Mission Control lives by them too)
 *  - A failed read is not an empty draft. The row says why, and nothing is saved.
 *  - A draft missing a price or a photo is still shown — with the gap named —
 *    instead of being dropped or silently saved incomplete.
 *  - "Saved 8 of 10" names the two that failed and why. Partial is reported.
 *  - Nothing is written until the operator presses Save.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckSquare,
  ExternalLink,
  ImageOff,
  Loader2,
  Package,
  RefreshCw,
  Sparkles,
  Square,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SidePanel, Field } from "@/components/admin/ui";
import { useToast } from "@/components/admin/Toast";
import {
  generateProductImage,
  imageErrorCopy,
  runImportQueue,
  formValuesFromDraft,
  type ImportRowState,
} from "@/lib/admin/productImport";
import {
  buildProductPayload,
  createProduct,
  validateProductForm,
  type ProductFormValues,
} from "@/lib/admin/productWrites";
import type { CatalogProduct, CategoryRow } from "@/lib/catalog";
import { parseMarketplaceLinks, type ParsedMarketplaceLink } from "@/lib/marketplaceLink";

interface Row {
  key: string;
  link: ParsedMarketplaceLink;
  state: ImportRowState;
  /** Operator's live edit of the server draft (null until a draft arrives). */
  form: ProductFormValues | null;
  selected: boolean;
  aiImageBusy: boolean;
  aiImageMessage: { ok: boolean; text: string } | null;
}

function rowKey(link: ParsedMarketplaceLink): string {
  return `${link.marketplace}:${link.itemId ?? link.url}`;
}

function categoryResolver(categories: CategoryRow[]): (name: string | null) => string | null {
  const key = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return (name) => {
    const wanted = key(name);
    if (!wanted) return null;
    return (
      categories.find(
        (c) => key(c.name_en) === wanted || key(c.name_so) === wanted || key(c.slug?.replace(/-/g, " ")) === wanted
      )?.id ?? null
    );
  };
}

export default function ImportStudio({
  open,
  onClose,
  categories,
  canEdit,
  restrictedNotice,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  categories: CategoryRow[];
  canEdit: boolean;
  restrictedNotice: string | null;
  /** One call per saved product, so the page can add rows without refetching. */
  onImported: (saved: CatalogProduct) => void;
}) {
  const { success, error: toastError } = useToast();
  const [rawLinks, setRawLinks] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [generateCopy, setGenerateCopy] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const abortRef = useRef({ aborted: false });

  const resolveCategory = useMemo(() => categoryResolver(categories), [categories]);
  const readOnly = !canEdit || !!restrictedNotice;

  const parsed = useMemo(() => parseMarketplaceLinks(rawLinks), [rawLinks]);
  const selectedCount = rows.filter((r) => r.selected && r.form).length;

  const patchRow = useCallback((key: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }, []);

  const applyState = useCallback(
    (link: ParsedMarketplaceLink, state: ImportRowState) => {
      const key = rowKey(link);
      setRows((prev) =>
        prev.map((r) => {
          if (r.key !== key) return r;
          if (state.phase === "ready") {
            return {
              ...r,
              state,
              form:
                r.form ??
                formValuesFromDraft(state.result.draft, link.marketplace ?? "1688", resolveCategory),
            };
          }
          if (state.phase === "failed") {
            return {
              ...r,
              state,
              form:
                r.form ??
                (state.result
                  ? formValuesFromDraft(state.result.draft, link.marketplace ?? "1688", resolveCategory)
                  : null),
            };
          }
          return { ...r, state };
        })
      );
    },
    [resolveCategory]
  );

  const startRead = async () => {
    if (!parsed.links.length) {
      setNotice({ ok: false, text: "Paste at least one marketplace product link first." });
      return;
    }
    if (readOnly) {
      setNotice({ ok: false, text: restrictedNotice ?? "This account cannot write the catalog." });
      return;
    }

    setNotice(null);
    setRunning(true);
    abortRef.current = { aborted: false };

    // Keep drafts already read: a re-read must not discard an edit in progress.
    const existing = new Map(rows.map((r) => [r.key, r]));
    setRows(
      parsed.links.map(
        (link) =>
          existing.get(rowKey(link)) ?? {
            key: rowKey(link),
            link,
            state: { phase: "queued" },
            form: null,
            selected: true,
            aiImageBusy: false,
            aiImageMessage: null,
          }
      )
    );

    await runImportQueue(parsed.links, {
      pastedText: parsed.links.length === 1 ? pastedText : null,
      generateCopy,
      onRow: applyState,
    });
    setRunning(false);
  };

  const retryOne = async (row: Row) => {
    setRunning(true);
    await runImportQueue([row.link], {
      pastedText: pastedText || null,
      generateCopy,
      onRow: applyState,
    });
    setRunning(false);
  };

  const setFormField = <K extends keyof ProductFormValues>(key: string, field: K, value: ProductFormValues[K]) => {
    setRows((prev) =>
      prev.map((r) => (r.key === key && r.form ? { ...r, form: { ...r.form, [field]: value } } : r))
    );
  };

  const aiPhotoForRow = async (row: Row) => {
    const form = row.form;
    if (!form) return;
    const title = form.title_english.trim() || form.title_original.trim() || form.title_somali.trim();
    if (!title) {
      patchRow(row.key, {
        aiImageMessage: { ok: false, text: "Give the draft a title first — the prompt is built from it." },
      });
      return;
    }
    patchRow(row.key, { aiImageBusy: true, aiImageMessage: null });
    const res = await generateProductImage({
      title,
      category: form.categoryText ?? categories.find((c) => c.id === form.categoryId)?.name_en ?? null,
      attributes: form.attributes,
      referenceUrl: form.images[0] ?? null,
      mode: form.images.length ? "restyle" : "generate",
    });
    if (res.ok && res.url) {
      const url = res.url;
      patchRow(row.key, {
        aiImageBusy: false,
        aiImageMessage: {
          ok: true,
          text:
            res.mode === "restyle"
              ? "Studio photo restyled from the listing photo — set as cover."
              : "Generated photo set as cover.",
        },
      });
      setRows((prev) =>
        prev.map((r) =>
          r.key === row.key && r.form
            ? { ...r, form: { ...r.form, images: [url, ...r.form.images.filter((u) => u !== url)] } }
            : r
        )
      );
    } else {
      patchRow(row.key, { aiImageBusy: false, aiImageMessage: { ok: false, text: imageErrorCopy(res) } });
    }
  };

  const saveSelected = async () => {
    if (readOnly) {
      toastError(restrictedNotice ?? "This account cannot write the catalog.");
      return;
    }
    const targets = rows.filter((r) => r.selected && r.form);
    if (!targets.length) {
      setNotice({ ok: false, text: "Select at least one draft with data to save." });
      return;
    }

    setSaving(true);
    setNotice(null);
    const failures: string[] = [];
    let saved = 0;

    for (const row of targets) {
      const form = row.form!;
      const errs = validateProductForm(form);
      if (Object.keys(errs).length > 0) {
        failures.push(`${row.link.itemId ?? row.link.label}: ${Object.values(errs)[0]}`);
        patchRow(row.key, { selected: false });
        continue;
      }
      try {
        const { payload } = buildProductPayload(form, null, categories);
        const res = await createProduct(payload);
        if (res.ok) {
          saved += 1;
          onImported(res.data);
          setRows((prev) => prev.filter((r) => r.key !== row.key));
        } else {
          failures.push(`${row.link.itemId ?? row.link.label}: ${res.reason}`);
        }
      } catch (e) {
        failures.push(`${row.link.itemId ?? row.link.label}: ${(e as Error).message}`);
      }
    }

    setSaving(false);
    if (saved > 0) success(`${saved} product${saved === 1 ? "" : "s"} imported as draft.`);
    if (failures.length) {
      setNotice({
        ok: false,
        text: `Saved ${saved} of ${targets.length}. Not saved — ${failures.join("; ")}`,
      });
      toastError(`${failures.length} draft${failures.length === 1 ? "" : "s"} did not save.`);
    } else {
      setNotice({
        ok: true,
        text: `Imported ${saved} product${saved === 1 ? "" : "s"} as drafts. Open one to review and publish.`,
      });
    }
  };

  const readyCount = rows.filter((r) => r.state.phase === "ready").length;
  const failedCount = rows.filter((r) => r.state.phase === "failed").length;

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="Import from marketplace"
      subtitle="Paste 1688 / Taobao / Tmall / YiwuGo / ChinaGoods product links"
      width="max-w-3xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-dark-900/55 dark:text-neutral-400">
            {rows.length === 0
              ? "Nothing read yet."
              : `${readyCount} ready · ${failedCount} failed · ${selectedCount} selected`}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="admin-btn-ghost">
              Close
            </button>
            <button
              onClick={saveSelected}
              disabled={readOnly || saving || selectedCount === 0}
              className="admin-btn-primary"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save {selectedCount > 0 ? `${selectedCount} ` : ""}as draft
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {restrictedNotice && (
          <div role="status" className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
            {restrictedNotice}
          </div>
        )}

        {/* ── Input ── */}
        <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-500/30 dark:bg-brand-500/10">
          <div className="flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
            <Sparkles className="h-4 w-4" />
            Marketplace links
          </div>
          <p className="mt-1 text-xs text-dark-900/55 dark:text-neutral-400">
            One link per line. Each is read with the marketplace session synced in Mission Control → Marketplaces, then
            translated, categorised and written as a draft for you to review.
          </p>
          <label htmlFor="import-links" className="sr-only">
            Marketplace product links
          </label>
          <textarea
            id="import-links"
            value={rawLinks}
            onChange={(e) => setRawLinks(e.target.value)}
            rows={4}
            disabled={readOnly || running}
            placeholder={"https://detail.1688.com/offer/723456789012.html\nhttps://item.taobao.com/item.htm?id=654321098765"}
            className="admin-input mt-2 w-full resize-y font-mono text-xs"
          />

          {rawLinks.trim() && (
            <div className="mt-2 space-y-1 text-[11px]">
              {parsed.links.length > 0 && (
                <p className="text-success">
                  {parsed.links.length} link{parsed.links.length === 1 ? "" : "s"} ready:{" "}
                  {parsed.links.map((l) => l.label).join(", ")}
                </p>
              )}
              {parsed.rejected.map((r) => (
                <p key={r.raw} className="text-error">
                  {r.raw} — {r.reason}
                </p>
              ))}
              {parsed.duplicates.length > 0 && (
                <p className="text-warning">
                  {parsed.duplicates.length} duplicate link{parsed.duplicates.length === 1 ? "" : "s"} ignored.
                </p>
              )}
            </div>
          )}

          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] font-semibold text-brand-700 dark:text-brand-300">
              Paste listing text too (used when the page cannot be read)
            </summary>
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              rows={3}
              disabled={readOnly || running}
              placeholder="Copy the listing title/description from the page. Only used for a single link."
              className="admin-input mt-2 w-full resize-y text-xs"
            />
          </details>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-dark-900/65 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={generateCopy}
                onChange={(e) => setGenerateCopy(e.target.checked)}
                disabled={readOnly || running}
                className="h-4 w-4 accent-brand-500"
              />
              Write English + Somali copy with AI
            </label>
            <button
              onClick={startRead}
              disabled={readOnly || running || !parsed.links.length}
              className="admin-btn-primary whitespace-nowrap"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {running ? "Reading…" : `Read ${parsed.links.length || ""} link${parsed.links.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>

        {notice && <p className={cn("text-xs", notice.ok ? "text-success" : "text-error")}>{notice.text}</p>}

        {/* ── Drafts ── */}
        {rows.map((row) => (
          <DraftCard
            key={row.key}
            row={row}
            categories={categories}
            disabled={readOnly || saving}
            onToggle={() => patchRow(row.key, { selected: !row.selected })}
            onRetry={() => void retryOne(row)}
            onAiPhoto={() => void aiPhotoForRow(row)}
            onField={setFormField}
          />
        ))}

        {rows.length === 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-dark-900/15 px-4 py-6 text-sm text-dark-900/40 dark:border-white/15 dark:text-neutral-500">
            <Package className="h-4 w-4" />
            Paste links above and press Read to build drafts. Nothing is written until you save.
          </div>
        )}
      </div>
    </SidePanel>
  );
}

/* ── One draft row ─────────────────────────────────────────────── */

function DraftCard({
  row,
  categories,
  disabled,
  onToggle,
  onRetry,
  onAiPhoto,
  onField,
}: {
  row: Row;
  categories: CategoryRow[];
  disabled: boolean;
  onToggle: () => void;
  onRetry: () => void;
  onAiPhoto: () => void;
  onField: <K extends keyof ProductFormValues>(key: string, field: K, value: ProductFormValues[K]) => void;
}) {
  const { state, form } = row;
  const banner =
    state.phase === "reading"
      ? { tone: "info" as const, text: "Reading the listing and writing copy…" }
      : state.phase === "queued"
        ? { tone: "muted" as const, text: "Queued." }
        : state.phase === "failed"
          ? { tone: "error" as const, text: state.reason }
          : { tone: "success" as const, text: state.result.message };

  const warnings =
    state.phase === "ready" ? state.result.warnings : state.phase === "failed" ? state.result?.warnings ?? [] : [];
  const cover = form?.images[0] ?? null;
  const missingPrice = form ? !form.price_cny_min.trim() : true;
  const editable = form && (state.phase === "ready" || state.phase === "failed");

  return (
    <div
      className={cn(
        "rounded-2xl border bg-white p-3 dark:bg-dark-900",
        row.selected && form ? "border-brand-500/60" : "border-dark-900/[0.08] dark:border-white/[0.08]"
      )}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={onToggle}
          disabled={disabled || !form}
          className="mt-1 shrink-0 text-dark-900/40 hover:text-brand-500 disabled:opacity-30 dark:text-neutral-500"
          aria-label={row.selected ? "Deselect this draft" : "Select this draft"}
        >
          {row.selected && form ? <CheckSquare className="h-4 w-4 text-brand-500" /> : <Square className="h-4 w-4" />}
        </button>

        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-warm-100 ring-1 ring-dark-900/[0.06] dark:bg-dark-800">
          {cover ? (

            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageOff className="h-5 w-5 text-dark-900/25 dark:text-neutral-600" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-semibold text-dark-900 dark:text-neutral-100">
              {form?.title_english || form?.title_original || row.link.label}
            </p>
            <a
              href={row.link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-dark-900/35 hover:text-brand-500 dark:text-neutral-500"
              title="Open the listing"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-dark-900/45 dark:text-neutral-500">
            <span className="rounded-full border border-dark-900/10 bg-dark-50 px-1.5 py-px font-semibold dark:border-white/10 dark:bg-white/5">
              {row.link.label}
            </span>
            {row.link.itemId && <span className="font-mono">{row.link.itemId}</span>}
            {form && form.images.length > 0 && (
              <span>
                · {form.images.length} photo{form.images.length === 1 ? "" : "s"}
              </span>
            )}
          </p>

          <p
            className={cn(
              "mt-1 text-[11px]",
              banner.tone === "error"
                ? "text-error"
                : banner.tone === "success"
                  ? "text-success"
                  : "text-dark-900/50 dark:text-neutral-400"
            )}
          >
            {banner.text}
          </p>

          {warnings.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {warnings.map((w) => (
                <li key={w} className="flex items-start gap-1 text-[11px] text-warning">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Editable draft */}
      {editable && (
        <div className="mt-3 space-y-3 border-t border-dark-900/[0.05] pt-3 dark:border-white/[0.06]">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title (English)">
              <input
                value={form.title_english}
                onChange={(e) => onField(row.key, "title_english", e.target.value)}
                disabled={disabled}
                className={cn("admin-input", !form.title_english.trim() && "border-warning/50")}
              />
            </Field>
            <Field label="Title (Somali)">
              <input
                value={form.title_somali}
                onChange={(e) => onField(row.key, "title_somali", e.target.value)}
                disabled={disabled}
                className="admin-input"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Price CNY — min" hint={missingPrice ? "Required before publishing" : undefined}>
              <input
                value={form.price_cny_min}
                onChange={(e) => onField(row.key, "price_cny_min", e.target.value)}
                disabled={disabled}
                inputMode="decimal"
                className={cn("admin-input", missingPrice && "border-warning/60")}
              />
            </Field>
            <Field label="Price CNY — max">
              <input
                value={form.price_cny_max}
                onChange={(e) => onField(row.key, "price_cny_max", e.target.value)}
                disabled={disabled}
                inputMode="decimal"
                className="admin-input"
              />
            </Field>
            <Field label="Category">
              <select
                value={form.categoryId ?? ""}
                onChange={(e) => onField(row.key, "categoryId", e.target.value || null)}
                disabled={disabled}
                className="admin-input"
              >
                <option value="">
                  {form.categoryText ? `${form.categoryText} (no matching category)` : "Uncategorised"}
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name_en ?? c.name_so ?? "Unnamed"}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Description (English)">
            <textarea
              value={form.description_english}
              onChange={(e) => onField(row.key, "description_english", e.target.value)}
              disabled={disabled}
              rows={2}
              className="admin-input w-full resize-y text-xs"
            />
          </Field>

          {form.attributes.length > 0 && (
            <p className="flex flex-wrap gap-1.5">
              {form.attributes.map((a) => (
                <span
                  key={a.key}
                  className="rounded-full border border-dark-900/10 bg-dark-50 px-2 py-0.5 text-[10px] text-dark-900/60 dark:border-white/10 dark:bg-white/5 dark:text-neutral-400"
                >
                  {a.key}: {a.value}
                </span>
              ))}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onAiPhoto}
              disabled={disabled || row.aiImageBusy}
              className="admin-btn-outline h-8 px-2.5 text-[11px]"
              title={
                form.images.length
                  ? "Restyle the listing photo into a studio shot"
                  : "Generate a studio photo from the title and specs"
              }
            >
              {row.aiImageBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              {row.aiImageBusy ? "Generating…" : form.images.length ? "Restyle photo" : "Generate photo"}
            </button>
            <button
              onClick={onRetry}
              disabled={disabled || row.state.phase === "reading"}
              className="admin-btn-ghost h-8 px-2.5 text-[11px]"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Read again
            </button>
            {row.aiImageMessage && (
              <span className={cn("text-[11px]", row.aiImageMessage.ok ? "text-success" : "text-error")}>
                {row.aiImageMessage.text}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
