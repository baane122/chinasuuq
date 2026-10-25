"use client";

/**
 * Product editor drawer — every live `source_products` column, one shape.
 *
 * The old modal edited a dozen columns and left `domestic_shipping_cny`,
 * `moq_source`, `moq_confidence`, `moq_raw_text`, `weight_kg`, `data_confidence`,
 * `acquisition_method`, `is_verified`, `is_restricted`, the Somali/original
 * descriptions, `video_url` and the seller columns un-editable; the three
 * payload-shape retries are replaced by `buildProductPayload` (see
 * lib/admin/productWrites.ts): updates send ONLY the columns that changed, so a
 * field the operator never touched is never written — and never nulled.
 *
 * Validation is field-level (errors render under the input, never as a generic
 * toast). The AI "extract from listing" flow is unchanged: same
 * `edgeFetch("ai-extraction")` call, same schema, same honest blocked/not-found
 * messages — its category output is now matched to a real category row instead
 * of dropped into a free-text box.
 */

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { edgeFetch } from "@/lib/supabase";
import { formatUSD, cn } from "@/lib/utils";
import { useFx, roundCents, usdFromCny } from "@/lib/fx";
import { useToast } from "@/components/admin/Toast";
import { Field, PermissionNotice, SidePanel } from "@/components/admin/ui";
import type { CatalogProduct, CategoryRow } from "@/lib/catalog";
import {
  MARKETPLACE_CODES,
  PRODUCT_STATUSES,
  STOCK_STATUSES,
  EMPTY_PRODUCT_FORM,
  productFormFromCatalog,
  validateProductForm,
  buildProductPayload,
  updateProduct,
  createProduct,
  deriveSourceId,
  type ProductFormValues,
} from "@/lib/admin/productWrites";
import ImageManager from "@/components/admin/products/ImageManager";
import CategoryPicker from "@/components/admin/products/CategoryPicker";
import AttributeEditor from "@/components/admin/products/AttributeEditor";

/* ── Small field shells (house pattern: Field + admin-input + inline error) ── */

function TextField({
  label,
  name,
  value,
  onChange,
  error,
  hint,
  type = "text",
  placeholder,
  disabled,
  required,
  textarea,
  rows = 3,
  min,
  max,
  step,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  textarea?: boolean;
  rows?: number;
  min?: number;
  max?: number;
  step?: number | string;
}) {
  return (
    <Field label={label} required={required} hint={hint}>
      {textarea ? (
        <textarea
          id={name}
          value={value}
          rows={rows}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn("admin-input resize-none", error && "border-error/60 focus:ring-error/30")}
          aria-invalid={!!error}
        />
      ) : (
        <input
          id={name}
          type={type}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(e.target.value)}
          className={cn("admin-input", error && "border-error/60 focus:ring-error/30")}
          aria-invalid={!!error}
        />
      )}
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </Field>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="admin-input"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/* ── Panel ─────────────────────────────────────────────────────────────── */

export default function ProductFormPanel({
  product,
  categories,
  categoryCounts,
  categoriesError,
  canEdit,
  restrictedNotice,
  onClose,
  onSaved,
}: {
  /** null → create. The page remounts the panel (key=) per product. */
  product: CatalogProduct | null;
  categories: CategoryRow[];
  categoryCounts: Record<string, number | null>;
  categoriesError: string | null;
  /** false while the RBAC check is still loading or the role is not staff. */
  canEdit: boolean;
  /** Set when the signed-in staff member may view but not write the catalog. */
  restrictedNotice: string | null;
  onClose: () => void;
  onSaved: (saved: CatalogProduct, isNew: boolean) => void;
}) {
  const { success, error: toastError } = useToast();
  const fx = useFx();
  const readOnly = !canEdit || !!restrictedNotice;

  const [form, setForm] = useState<ProductFormValues>(
    product ? productFormFromCatalog(product) : EMPTY_PRODUCT_FORM
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState<string | null>(null);

  const [aiUrl, setAiUrl] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key as string]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key as string];
        return next;
      });
    }
  };

  /* AI extract — identical contract to the old screen (staff-gated edge fn). */
  const handleAiExtract = async () => {
    const content = aiUrl.trim();
    if (!content) {
      setAiMsg({ ok: false, text: "Paste a marketplace URL or listing text first." });
      return;
    }
    setAiBusy(true);
    setAiMsg(null);
    try {
      const res = await edgeFetch<{
        ok: boolean;
        data?: Record<string, string | number | null>;
        missing?: string[];
        error?: string;
        blocked?: boolean;
        reason?: string;
      }>("ai-extraction", {
        method: "POST",
        body: {
          content,
          schema: {
            title_english: "string",
            title_original: "string",
            category: "string",
            price_cny_min: "number",
            price_cny_max: "number",
            moq: "number",
            description_english: "string",
          },
        },
      });
      if (!res.ok || !res.data) {
        const why = res.reason
          ? `Blocked: ${res.reason}`
          : res.error === "ai_provider_not_configured"
            ? "AI provider not configured — set it up in Settings → AI Provider."
            : res.error || "Extraction failed";
        setAiMsg({ ok: false, text: why });
        return;
      }
      const d = res.data;
      const url = content.startsWith("http") ? content : "";
      const domain = url.toLowerCase();
      const marketplace = domain.includes("1688")
        ? "1688"
        : domain.includes("taobao")
          ? "taobao"
          : domain.includes("yiwugo")
            ? "yiwugo"
            : domain.includes("chinagoods")
              ? "chinagoods"
              : null;

      // Match the extracted name to a REAL category instead of writing free
      // text: same fold as syncProductCategoryIds (lowercase, punctuation→space).
      const keyOf = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const wantedKey = keyOf(String(d.category ?? ""));
      const matched = wantedKey
        ? categories.find(
            (c) => keyOf(c.name_en) === wantedKey || keyOf(c.name_so) === wantedKey || keyOf(c.slug?.replace(/-/g, " ")) === wantedKey
          ) ?? null
        : null;

      setForm((prev) => ({
        ...prev,
        title_english: (d.title_english as string) || prev.title_english,
        title_original: (d.title_original as string) || prev.title_original,
        price_cny_min: d.price_cny_min != null ? String(d.price_cny_min) : prev.price_cny_min,
        price_cny_max: d.price_cny_max != null ? String(d.price_cny_max) : prev.price_cny_max,
        moq: d.moq != null ? String(d.moq) : prev.moq,
        description_english: (d.description_english as string) || prev.description_english,
        source_url: url || prev.source_url,
        source_product_id: (url && deriveSourceId(url)) || prev.source_product_id,
        marketplace: marketplace ?? prev.marketplace,
        categoryId: matched ? matched.id : prev.categoryId,
        categoryText: matched ? null : String(d.category ?? "") || prev.categoryText,
      }));
      const categoryNote = String(d.category ?? "")
        ? matched
          ? ` Category “${d.category}” matched ${matched.name_en}.`
          : ` Category “${d.category}” matches NO category row — kept as legacy text; pick a real one above or wire it in Categories.`
        : "";
      const missing = res.missing?.length ? ` (not found: ${res.missing.join(", ")})` : "";
      setAiMsg({ ok: true, text: `Extracted into the form${missing}.${categoryNote} Review and save.` });
    } catch (e) {
      setAiMsg({ ok: false, text: `Extraction failed: ${(e as Error).message}` });
    } finally {
      setAiBusy(false);
    }
  };

  const handleSave = async () => {
    const errs = validateProductForm(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      setSaveFailed(null);
      return; // field-level errors are the message; no generic toast
    }
    setSaving(true);
    setSaveFailed(null);
    try {
      const { payload, attributesVisible } = buildProductPayload(form, product, categories);
      const res = product
        ? await updateProduct(product.id, payload, attributesVisible)
        : await createProduct(payload);
      if (!res.ok) {
        setSaveFailed(res.reason);
        toastError(res.reason);
        return;
      }
      success(product ? "Product updated" : "Product created");
      onSaved(res.data, !product);
    } catch (e) {
      const reason = e instanceof Error ? e.message : "Failed to save product";
      setSaveFailed(reason);
      toastError(reason);
    } finally {
      setSaving(false);
    }
  };

  const errorCount = Object.keys(errors).length;
  const cnyMin = Number(form.price_cny_min);
  const derivedUsd =
    Number.isFinite(cnyMin) && cnyMin > 0 && fx.cnyPerUsd > 0
      ? formatUSD(roundCents(usdFromCny(cnyMin, fx.cnyPerUsd)))
      : null;

  return (
    <SidePanel
      open
      onClose={readOnly ? onClose : saving ? () => undefined : onClose}
      title={product ? "Edit Product" : "Add Product"}
      subtitle={
        product
          ? `${product.title || product.id} — every stored column is editable below`
          : "One shape: the live source_products columns, verified 2026-10-16"
      }
      width="max-w-2xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-xs">
            {restrictedNotice ? (
              <span className="text-warning">{restrictedNotice}</span>
            ) : errorCount > 0 ? (
              <span className="text-error">
                {errorCount} field{errorCount === 1 ? "" : "s"} need attention before saving.
              </span>
            ) : saveFailed ? (
              <span className="text-error">{saveFailed}</span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button onClick={onClose} className="admin-btn-ghost">
              {readOnly ? "Close" : "Cancel"}
            </button>
            {!readOnly && (
              <button onClick={handleSave} disabled={saving} className="admin-btn-primary">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {product ? "Save changes" : "Create product"}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {restrictedNotice && <PermissionNotice required={restrictedNotice} className="mb-2" />}

        {/* AI Extract (new products only) */}
        {!product && !readOnly && (
          <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-500/30 dark:bg-brand-500/10">
            <div className="flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
              <Sparkles className="h-4 w-4" />
              AI Extract from listing
            </div>
            <p className="mt-1 text-xs text-dark-500 dark:text-neutral-400">
              Paste a marketplace product URL (or the listing text) — AI fills the fields below for review.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                value={aiUrl}
                onChange={(e) => setAiUrl(e.target.value)}
                placeholder="https://detail.1688.com/offer/..."
                className="admin-input flex-1"
                disabled={aiBusy}
                aria-label="Marketplace URL or listing text"
              />
              <button onClick={handleAiExtract} disabled={aiBusy || !aiUrl.trim() || saving} className="admin-btn-primary whitespace-nowrap">
                {aiBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                Extract
              </button>
            </div>
            {aiMsg && (
              <p className={cn("mt-2 text-xs", aiMsg.ok ? "text-success" : "text-error")}>{aiMsg.text}</p>
            )}
          </div>
        )}

        {/* Titles */}
        <div className="rounded-xl bg-dark-50/60 p-4 dark:bg-white/[0.03]">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-dark-400">Titles (one language required)</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField label="Title (English)" name="title_english" value={form.title_english} onChange={(v) => set("title_english", v)} error={errors.title_english} placeholder="English name" disabled={readOnly} />
            <TextField label="Title (Somali)" name="title_somali" value={form.title_somali} onChange={(v) => set("title_somali", v)} error={errors.title_somali} placeholder="Magaca Soomaaliga" disabled={readOnly} />
            <TextField label="Title (Original)" name="title_original" value={form.title_original} onChange={(v) => set("title_original", v)} error={errors.title_original} placeholder="中文/原語 title" hint="NOT NULL in the live table — falls back to English." disabled={readOnly} />
          </div>
        </div>

        {/* Descriptions */}
        <div className="rounded-xl bg-dark-50/60 p-4 dark:bg-white/[0.03]">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-dark-400">Descriptions</p>
          <div className="space-y-4">
            <TextField label="Description (English)" name="description_english" value={form.description_english} onChange={(v) => set("description_english", v)} textarea rows={3} placeholder="What the customer reads…" disabled={readOnly} />
            <TextField label="Description (Somali)" name="description_somali" value={form.description_somali} onChange={(v) => set("description_somali", v)} textarea rows={3} placeholder="Sharafka macaamiisha…" disabled={readOnly} />
            <TextField label="Description (Original)" name="description_original" value={form.description_original} onChange={(v) => set("description_original", v)} textarea rows={2} placeholder="原文 description (supplier text)" disabled={readOnly} />
          </div>
        </div>

        {/* Classification */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" hint={categoriesError ? undefined : "Writes category_id AND keeps the legacy text column in sync."}>
            <CategoryPicker
              categories={categories}
              counts={categoryCounts}
              categoryId={form.categoryId}
              orphanText={form.categoryText}
              disabled={readOnly}
              onChange={(id, nameEn) => setForm((prev) => ({ ...prev, categoryId: id, categoryText: id ? null : nameEn }))}
            />
            {categoriesError && <p className="mt-1 text-xs text-warning">Categories could not be loaded: {categoriesError}. Saving keeps the current category untouched.</p>}
          </Field>
          <SelectField
            label="Marketplace"
            value={form.marketplace}
            onChange={(v) => set("marketplace", v)}
            disabled={readOnly}
            options={MARKETPLACE_CODES.map((m) => ({ value: m, label: m }))}
          />
        </div>

        {/* Status */}
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Listing status"
            value={form.status}
            onChange={(v) => set("status", v)}
            disabled={readOnly}
            options={PRODUCT_STATUSES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1) }))}
          />
          <SelectField
            label="Stock status"
            value={form.stock_status}
            onChange={(v) => set("stock_status", v)}
            disabled={readOnly}
            options={STOCK_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))}
          />
        </div>

        {/* Pricing */}
        <div className="rounded-xl bg-dark-50/60 p-4 dark:bg-white/[0.03]">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-dark-400">Pricing (supplier side)</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Price CNY — min" name="price_cny_min" type="number" value={form.price_cny_min} onChange={(v) => set("price_cny_min", v)} error={errors.price_cny_min} min={0} step="0.01" placeholder="0.00" disabled={readOnly} hint="Blank writes 0 — 'no price captured'." />
            <TextField label="Price CNY — max" name="price_cny_max" type="number" value={form.price_cny_max} onChange={(v) => set("price_cny_max", v)} error={errors.price_cny_max} min={0} step="0.01" placeholder="0.00" disabled={readOnly} />
            <TextField
              label="Price USD (STORED ESTIMATE)"
              name="price_usd_estimated"
              type="number"
              value={form.price_usd_estimated}
              onChange={(v) => set("price_usd_estimated", v)}
              error={errors.price_usd_estimated}
              min={0}
              step="0.01"
              disabled={readOnly}
              hint={
                derivedUsd
                  ? `Saved exactly as typed — this screen never recomputes it. (At 1 USD = ${fx.cnyPerUsd} CNY the min CNY price converts to ~${derivedUsd} — reference only.)`
                  : "Saved exactly as typed — this screen never recomputes it."
              }
            />
            <TextField label="Domestic shipping CNY" name="domestic_shipping_cny" type="number" value={form.domestic_shipping_cny} onChange={(v) => set("domestic_shipping_cny", v)} error={errors.domestic_shipping_cny} min={0} step="0.01" placeholder="China-side freight" disabled={readOnly} />
          </div>
        </div>

        {/* MOQ + provenance */}
        <div className="rounded-xl bg-dark-50/60 p-4 dark:bg-white/[0.03]">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-dark-400">
            MOQ and where it came from
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="MOQ (units)" name="moq" type="number" value={form.moq} onChange={(v) => set("moq", v)} error={errors.moq} min={0} placeholder="1" disabled={readOnly} />
            <TextField label="MOQ source" name="moq_source" value={form.moq_source} onChange={(v) => set("moq_source", v)} placeholder="e.g. listing page, supplier chat" disabled={readOnly} />
            <TextField label="MOQ confidence" name="moq_confidence" value={form.moq_confidence} onChange={(v) => set("moq_confidence", v)} placeholder="e.g. high / medium / low" disabled={readOnly} />
            <TextField label="MOQ raw text" name="moq_raw_text" value={form.moq_raw_text} onChange={(v) => set("moq_raw_text", v)} placeholder="起批量 2件 — exactly what the supplier wrote" disabled={readOnly} hint="Kept so a number can always be traced to the listing." />
          </div>
        </div>

        {/* Metrics + provenance */}
        <div className="rounded-xl bg-dark-50/60 p-4 dark:bg-white/[0.03]">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-dark-400">Marketplace metrics & data provenance</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Supplier rating" name="supplier_rating" type="number" value={form.supplier_rating} onChange={(v) => set("supplier_rating", v)} error={errors.supplier_rating} min={0} max={5} step="0.1" placeholder="4.8" disabled={readOnly} hint="0–5, as shown on the marketplace." />
            <TextField label="Sales count" name="sales_count" type="number" value={form.sales_count} onChange={(v) => set("sales_count", v)} error={errors.sales_count} min={0} placeholder="Sold on the SOURCE marketplace, not at ChinaSuuq" disabled={readOnly} />
            <TextField label="Weight kg" name="weight_kg" type="number" value={form.weight_kg} onChange={(v) => set("weight_kg", v)} error={errors.weight_kg} min={0} step="0.001" placeholder="0.5" disabled={readOnly} hint="Per-unit estimate used for shipping quotes." />
            <TextField label="Data confidence" name="data_confidence" type="number" value={form.data_confidence} onChange={(v) => set("data_confidence", v)} error={errors.data_confidence} min={0} max={1} step="0.05" placeholder="0.0–1.0" disabled={readOnly} hint="How much the enricher trusted the captured data." />
            <TextField label="Acquisition method" name="acquisition_method" value={form.acquisition_method} onChange={(v) => set("acquisition_method", v)} placeholder="e.g. bulk import, manual, AI extract" disabled={readOnly} />
            <div className="flex items-end gap-6 pb-1">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-dark-700 dark:text-neutral-300">
                <input type="checkbox" checked={form.is_verified} disabled={readOnly} onChange={(e) => set("is_verified", e.target.checked)} className="h-4 w-4 accent-brand-500" />
                Supplier verified
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-dark-700 dark:text-neutral-300">
                <input type="checkbox" checked={form.is_restricted} disabled={readOnly} onChange={(e) => set("is_restricted", e.target.checked)} className="h-4 w-4 accent-brand-500" />
                Restricted item
              </label>
            </div>
          </div>
        </div>

        {/* Source links */}
        <div className="rounded-xl bg-dark-50/60 p-4 dark:bg-white/[0.03]">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-dark-400">Source & supplier links</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Source URL" name="source_url" value={form.source_url} onChange={(v) => set("source_url", v)} error={errors.source_url} placeholder="https://detail.1688.com/offer/…" disabled={readOnly} />
            <TextField label="Video URL" name="video_url" value={form.video_url} onChange={(v) => set("video_url", v)} error={errors.video_url} placeholder="https://… (optional)" disabled={readOnly} />
            <TextField
              label="Source product id"
              name="source_product_id"
              value={form.source_product_id}
              onChange={(v) => set("source_product_id", v)}
              placeholder="supplier offer id"
              disabled={readOnly}
              hint={
                form.source_product_id.trim()
                  ? "NOT NULL live. Copies carry a -copy- suffix so they are never mistaken for an import."
                  : deriveSourceId(form.source_url)
                    ? `Blank falls back to ${deriveSourceId(form.source_url)} from the URL.`
                    : "Blank for a hand-added product writes manual-<timestamp> — no invented marketplace id."
              }
            />
            <TextField label="Source seller id" name="source_seller_id" value={form.source_seller_id} onChange={(v) => set("source_seller_id", v)} disabled={readOnly} />
            <TextField label="Seller name" name="seller_name" value={form.seller_name} onChange={(v) => set("seller_name", v)} placeholder="e.g. Yiwu Harmony Textiles" disabled={readOnly} />
          </div>
        </div>

        {/* Images */}
        <ImageManager
          images={form.images}
          onChange={(imgs) => set("images", imgs)}
          productId={product?.id ?? null}
          disabled={readOnly}
        />

        {/* Attributes */}
        <AttributeEditor
          rows={form.attributes}
          onChange={(rows) => set("attributes", rows)}
          disabled={readOnly}
          errorFor={(i) => errors[`attr_${i}`]}
        />
      </div>
    </SidePanel>
  );
}
