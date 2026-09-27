"use client";

/**
 * URL-backed filter state for the admin lists.
 *
 * WHY: every list's filters (status, marketplace, date range, search) lived in
 * component state. Reloading the page dropped them, a filter could not be pasted
 * into a chat for a colleague, and the browser back button did nothing useful.
 *
 * STATIC EXPORT CONSTRAINT (apps/web is `output: export`): this is client-only.
 * There is no middleware, no `next/headers`, and no server component reading
 * `searchParams` — the query string is read by the browser after hydration.
 * Pages that consume it must render inside a <Suspense> boundary so the
 * prerenderer never bails out on `useSearchParams`.
 *
 * A filter that equals its default is REMOVED from the URL rather than written,
 * so `/admin/orders/` stays the clean "everything" view and `?status=paid` is
 * always a deliberate difference.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** key -> default value. Pass a module-scope constant, or at least a stable one. */
export type FilterDefaults = Record<string, string>;

export interface UrlFilters {
  /** Every declared key resolved: URL value when present, else the default. */
  values: Record<string, string>;
  /** Write one key. `null`/"" /the default value removes it from the URL. */
  set: (key: string, value: string | null | undefined) => void;
  /** Write several keys in one history entry. */
  setMany: (patch: Record<string, string | null | undefined>) => void;
  /** Drop every declared key this page owns; unknown params are preserved. */
  reset: () => void;
  /** True when the URL carries at least one non-default filter. */
  isFiltered: boolean;
  /** Serialized query string, for export filenames and share links. */
  query: string;
}

export function useUrlFilters(defaults: FilterDefaults): UrlFilters {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Compared by value: a page that inlines the defaults object must not make
  // `values` a new object on every render, or every effect keyed on it loops.
  const defaultKey = useMemo(() => JSON.stringify(defaults), [defaults]);

  // Parsed ONCE per distinct key. `set`, `setMany`, `reset` and the `isFiltered`
  // test all used to call JSON.parse on `defaultKey` themselves — up to seven
  // parses per render on every list page that uses this hook.
  const declared = useMemo(() => JSON.parse(defaultKey) as FilterDefaults, [defaultKey]);

  const values = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [key, fallback] of Object.entries(declared)) {
      const fromUrl = searchParams.get(key);
      out[key] = fromUrl === null || fromUrl === "" ? fallback : fromUrl;
    }
    return out;
  }, [searchParams, declared]);

  const apply = useCallback(
    (mutate: (qs: URLSearchParams) => void) => {
      const qs = new URLSearchParams(searchParams.toString());
      mutate(qs);
      const next = qs.toString();
      // scroll:false — a filter change must not jump the table out of view.
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const set = useCallback(
    (key: string, value: string | null | undefined) => {
      apply((qs) => {
        const fallback = declared[key] ?? "";
        const v = (value ?? "").trim();
        if (!v || v === fallback) qs.delete(key);
        else qs.set(key, v);
      });
    },
    [apply, declared]
  );

  const setMany = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      apply((qs) => {
        for (const [key, raw] of Object.entries(patch)) {
          const v = (raw ?? "").trim();
          if (!v || v === (declared[key] ?? "")) qs.delete(key);
          else qs.set(key, v);
        }
      });
    },
    [apply, declared]
  );

  const reset = useCallback(() => {
    apply((qs) => {
      for (const key of Object.keys(declared)) {
        qs.delete(key);
      }
    });
  }, [apply, declared]);

  const isFiltered = useMemo(
    () => Object.entries(values).some(([key, value]) => value !== declared[key]),
    [values, declared]
  );

  return { values, set, setMany, reset, isFiltered, query: searchParams.toString() };
}

/**
 * Two-way glue for a text input: typing updates local state immediately, and the
 * URL is written once the operator stops typing. Without this every keystroke
 * would push a history entry and refetch.
 *
 * The URL is authoritative: if it changes underneath (back button, reset,
 * a pasted link), the input follows it.
 */
export function useDebouncedFilterValue(
  urlValue: string,
  commit: (value: string) => void,
  delay = 350
): [string, (value: string) => void] {
  const [draft, setDraft] = useState(urlValue);

  useEffect(() => {
    setDraft(urlValue);
  }, [urlValue]);

  useEffect(() => {
    if (draft === urlValue) return;
    const timer = setTimeout(() => commit(draft), delay);
    return () => clearTimeout(timer);
    // commit is intentionally excluded: pages pass a useCallback-writer and
    // re-arming the timer on an unrelated re-render would delay the write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, urlValue, delay]);

  return [draft, setDraft];
}
