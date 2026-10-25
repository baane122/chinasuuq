"use client";

/**
 * Searchable category picker for the Products editor.
 *
 * The live relationship is `source_products.category_id -> categories.id`, but
 * that FK is 0 % populated in production while the legacy `category` TEXT column
 * carries the English NAME (plus one orphan, "Sports", that matches no row). The
 * old screen asked for free text — which is how three spellings of "category"
 * were born. This picker writes the FK and keeps the text column in sync (the
 * chosen `name_en`), so both old readers (mobile, the shop's text fallback) and
 * new readers (FK joins) stay correct on every save.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import type { CategoryRow } from "@/lib/catalog";
import { cn } from "@/lib/utils";

export default function CategoryPicker({
  categories,
  counts,
  categoryId,
  orphanText,
  onChange,
  disabled = false,
  error,
}: {
  categories: CategoryRow[];
  /** Live product counts per category id (null = the count read failed). */
  counts?: Record<string, number | null>;
  categoryId: string | null;
  /** The legacy text this row carries when it matches NO category ("Sports"). */
  orphanText?: string | null;
  onChange: (categoryId: string | null, nameEn: string | null) => void;
  disabled?: boolean;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    const t = setTimeout(() => searchRef.current?.focus(), 30);
    return () => {
      document.removeEventListener("mousedown", onDown);
      clearTimeout(t);
    };
  }, [open]);

  const selected = useMemo(() => categories.find((c) => c.id === categoryId) ?? null, [categories, categoryId]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) =>
      [c.name_en, c.name_so, c.slug].some((v) => (v ?? "").toLowerCase().includes(q))
    );
  }, [categories, query]);

  const label = selected
    ? `${selected.name_en ?? selected.name_so ?? "Category"}${selected.name_so && selected.name_en ? ` · ${selected.name_so}` : ""}`
    : orphanText
      ? `Legacy text: “${orphanText}” (matches no category)`
      : "No category";

  return (
    <div className="relative" ref={rootRef}>
      <div className="flex items-stretch gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            "flex min-h-11 flex-1 items-center justify-between gap-2 rounded-xl border bg-white px-3.5 py-2 text-left text-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-dark-950",
            error
              ? "border-error/60"
              : "border-dark-900/10 hover:border-brand-400 dark:border-white/10"
          )}
        >
          <span className={cn("truncate", selected ? "font-medium text-dark-900 dark:text-neutral-100" : "text-dark-900/45 dark:text-neutral-500", !selected && orphanText && "text-warning")}>
            {label}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-dark-900/35" />
        </button>
        {(categoryId || orphanText) && !disabled && (
          <button
            type="button"
            onClick={() => {
              onChange(null, null);
              setOpen(false);
            }}
            className="admin-btn-ghost h-11 px-3 text-xs"
            title="Clear the category (writes a NULL FK and no text)"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-error">{error}</p>}

      {open && (
        <div className="absolute z-30 mt-1.5 w-full min-w-64 overflow-hidden rounded-xl border border-dark-900/10 bg-white shadow-xl dark:border-white/10 dark:bg-dark-900">
          <div className="border-b border-dark-900/[0.06] p-2 dark:border-white/[0.06]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dark-900/30" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search categories…"
                className="admin-input h-9 pl-8 text-xs"
                aria-label="Search categories"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1" role="listbox">
            {categories.length === 0 && (
              <p className="px-3 py-4 text-xs text-dark-900/40">
                The categories table could not be loaded — saving keeps the current value.
              </p>
            )}
            {visible.map((c) => {
              const active = c.id === categoryId;
              const count = counts?.[c.id];
              const inactive = c.is_active === false;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(c.id, c.name_en ?? c.name_so ?? null);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-warm-100 dark:hover:bg-white/5",
                    active && "bg-brand-50 dark:bg-brand-500/10"
                  )}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-dark-900/5 text-xs font-bold text-dark-900/60 dark:bg-white/10 dark:text-neutral-300">
                    {c.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.icon} alt="" className="h-5 w-5 object-contain" />
                    ) : (
                      (c.name_en ?? c.name_so ?? "?").slice(0, 1)
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-dark-900 dark:text-neutral-100", active && "font-semibold")}>
                      {c.name_en ?? c.name_so ?? "—"}
                    </span>
                    <span className="block truncate text-[11px] text-dark-900/45 dark:text-neutral-500">
                      {c.name_so ?? ""}
                      {c.slug ? ` · ${c.slug}` : ""}
                      {inactive ? " · inactive" : ""}
                    </span>
                  </span>
                  {count !== undefined && (
                    <span
                      className="shrink-0 rounded-full bg-dark-900/[0.06] px-2 py-0.5 text-[10px] font-bold text-dark-900/55 dark:bg-white/10 dark:text-neutral-400"
                      title={count === null ? "The count read failed — this is not a real zero" : `${count} product${count === 1 ? "" : "s"} in this category (FK or legacy text)`}
                    >
                      {count === null ? "?" : count}
                    </span>
                  )}
                </button>
              );
            })}
            {query.trim() && visible.length === 0 && categories.length > 0 && (
              <p className="px-3 py-4 text-xs text-dark-900/40">No category matches “{query.trim()}”.</p>
            )}
            <button
              type="button"
              onClick={() => {
                onChange(null, null);
                setOpen(false);
              }}
              className="mt-1 flex w-full items-center gap-2 border-t border-dark-900/[0.06] px-3 py-2 text-left text-xs font-medium text-dark-900/50 hover:bg-warm-100 dark:border-white/[0.06] dark:hover:bg-white/5"
            >
              <X className="h-3.5 w-3.5" /> No category (leave it uncategorised)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
