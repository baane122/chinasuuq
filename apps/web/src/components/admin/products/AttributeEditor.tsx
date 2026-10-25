"use client";

/**
 * Product spec editor for `source_products.attributes` (jsonb).
 *
 * The column is documented (202408010004) as customer-facing specs —
 * `{ color: "red", size: "xl" }` — and BOTH apps render it to shoppers. Since no
 * new columns are possible, staff placement metadata lives in the same object
 * under the reserved `_curation` key. Two rules follow, and both live here:
 *   1. `_`-prefixed keys are never listed, edited or created as specs;
 *   2. they are preserved on save (the write does a read-modify-merge against
 *      the row's CURRENT raw value — see lib/admin/productWrites.ts), so
 *      editing "colour" cannot wipe someone's trending pin.
 */

import { Plus, Trash2 } from "lucide-react";
import type { AttrRow } from "@/lib/admin/productWrites";
import { cn } from "@/lib/utils";

export default function AttributeEditor({
  rows,
  onChange,
  disabled = false,
  errorFor,
}: {
  rows: AttrRow[];
  onChange: (next: AttrRow[]) => void;
  disabled?: boolean;
  /** Field-level errors keyed `attr_<index>` (duplicate/reserved/missing name). */
  errorFor?: (index: number) => string | undefined;
}) {
  const set = (i: number, patch: Partial<AttrRow>) =>
    onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  return (
    <div className="rounded-xl border border-dark-900/[0.06] bg-white p-4 dark:border-white/[0.08] dark:bg-dark-900">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-dark-400">
          Product specs {rows.length > 0 && <span className="text-dark-900/30">({rows.length})</span>}
        </p>
        <button
          type="button"
          onClick={() => onChange([...rows, { key: "", value: "" }])}
          disabled={disabled}
          className="admin-btn-ghost h-8 text-xs"
        >
          <Plus className="h-3.5 w-3.5" /> Add spec
        </button>
      </div>
      <p className="mb-3 text-[11px] leading-snug text-dark-900/45 dark:text-neutral-400">
        Shown to customers on the product page (size, colour, material…). Internal metadata keys starting with{" "}
        <span className="font-mono">_</span> — like the trending pin — are deliberately hidden here and are preserved
        automatically when you save.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-lg bg-warm-100 px-3 py-2.5 text-xs italic text-dark-900/40 dark:bg-white/5 dark:text-neutral-500">
          No specs recorded on this product.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row, i) => {
            const error = errorFor?.(i);
            return (
              <li key={i}>
                <div className="flex items-center gap-2">
                  <input
                    value={row.key}
                    onChange={(e) => set(i, { key: e.target.value })}
                    disabled={disabled}
                    placeholder="Name (e.g. Size)"
                    aria-label={`Spec ${i + 1} name`}
                    className={cn(
                      "admin-input flex-1 font-medium",
                      error && "border-error/60 focus:ring-error/30"
                    )}
                  />
                  <input
                    value={row.value}
                    onChange={(e) => set(i, { value: e.target.value })}
                    disabled={disabled}
                    placeholder="Value (e.g. XL)"
                    aria-label={`Spec ${i + 1} value`}
                    className="admin-input flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => onChange(rows.filter((_, k) => k !== i))}
                    disabled={disabled}
                    className="admin-btn-ghost h-10 w-10 shrink-0 px-0 hover:text-error"
                    aria-label={`Remove spec ${i + 1}`}
                    title="Remove this spec"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {error && <p className="mt-1 text-xs text-error">{error}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
