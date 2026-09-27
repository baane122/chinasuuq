"use client";

/**
 * The density + column popover shared by every big admin list.
 *
 * Colours are restricted to the tokens already declared in globals.css: the
 * brand, dark and warm numbered scales, plus the flat success, warning, error
 * and info tokens, used as `bg-success/10` and never `bg-success-500` (which
 * compiles to nothing under Tailwind v4 @theme).
 */

import { useEffect, useRef, useState } from "react";
import { Columns3, Rows3, Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Density, TablePreferenceApi } from "@/components/admin/useTablePrefs";

export interface ToggleableColumn {
  key: string;
  label: string;
}

const DENSITIES: { value: Density; label: string }[] = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

export function TableControls({
  columns,
  prefs,
  extra,
}: {
  columns: ToggleableColumn[];
  prefs: TablePreferenceApi;
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const visibleCount = columns.filter((c) => !prefs.isHidden(c.key)).length;
  const hiddenCount = columns.length - visibleCount;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {extra}

      {/* density */}
      <div
        className="flex items-center gap-0.5 rounded-xl border border-dark-900/10 bg-white p-0.5"
        role="group"
        aria-label="Row density"
      >
        <Rows3 className="ml-1.5 h-3.5 w-3.5 shrink-0 text-dark-900/35" aria-hidden />
        {DENSITIES.map((d) => (
          <button
            key={d.value}
            onClick={() => prefs.setDensity(d.value)}
            aria-pressed={prefs.density === d.value}
            className={cn(
              "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors",
              prefs.density === d.value
                ? "bg-brand-500 text-white"
                : "text-dark-900/55 hover:bg-dark-900/5 hover:text-dark-900"
            )}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* columns */}
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors",
            hiddenCount > 0
              ? "border-brand-300 bg-brand-50 text-brand-700"
              : "border-dark-900/10 bg-white text-dark-900/60 hover:text-dark-900"
          )}
          aria-expanded={open}
        >
          <Columns3 className="h-3.5 w-3.5" />
          Columns
          {hiddenCount > 0 && (
            <span className="rounded-full bg-brand-500/10 px-1.5 text-[10px] font-bold text-brand-700">
              {visibleCount}/{columns.length}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-full z-30 mt-1.5 w-60 rounded-xl border border-dark-900/10 bg-white p-1.5 shadow-lg">
            <p className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-dark-900/40">
              Visible columns
            </p>
            <div className="max-h-72 overflow-y-auto">
              {columns.map((col) => {
                const hidden = prefs.isHidden(col.key);
                return (
                  <button
                    key={col.key}
                    onClick={() => prefs.toggleColumn(col.key)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-dark-900/70 transition-colors hover:bg-warm-100"
                    role="checkbox"
                    aria-checked={!hidden}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        hidden
                          ? "border-dark-900/20 bg-white"
                          : "border-brand-500 bg-brand-500 text-white"
                      )}
                    >
                      {!hidden && <Check className="h-3 w-3" />}
                    </span>
                    <span className={cn("truncate", hidden && "text-dark-900/35 line-through")}>
                      {col.label}
                    </span>
                  </button>
                );
              })}
            </div>
            {hiddenCount > 0 && (
              <button
                onClick={prefs.showAllColumns}
                className="mt-1 flex w-full items-center gap-1.5 rounded-lg border-t border-dark-900/[0.06] px-2 py-1.5 text-[11px] font-semibold text-brand-600 hover:bg-warm-100"
              >
                <RotateCcw className="h-3 w-3" />
                Show all columns
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
