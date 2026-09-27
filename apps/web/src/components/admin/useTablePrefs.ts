"use client";

/**
 * Table density + column visibility, persisted per table.
 *
 * WHY: the orders/products/customers tables are the screens staff stare at all
 * day. On a laptop the comfortable spacing shows six rows; hiding the three
 * columns a given operator never reads is what makes the list scannable.
 *
 * SSR / HYDRATION: apps/web prerenders these pages, so localStorage cannot be
 * read during the first render — that would ship one markup and hydrate another
 * (a real React mismatch, not a style flicker). State therefore starts at the
 * default and is replaced in an effect. `ready` is exposed for anything that
 * must not act before the stored preference has landed.
 *
 * Hand-rolled on purpose: @tanstack/table is not installed and nothing can be
 * added to this app (offline build).
 */

import { useCallback, useEffect, useMemo, useState } from "react";

export type Density = "comfortable" | "compact";

export interface TablePrefs {
  density: Density;
  hidden: string[];
}

const DEFAULTS: TablePrefs = { density: "comfortable", hidden: [] };

function storageKey(tableId: string) {
  return `chinasuuq.admin.table.${tableId}`;
}

export interface TablePreferenceApi {
  density: Density;
  setDensity: (d: Density) => void;
  /** Column keys the operator turned off. */
  hidden: Set<string>;
  isHidden: (key: string) => boolean;
  toggleColumn: (key: string) => void;
  showAllColumns: () => void;
  /** false until the stored preference has been read (first paint). */
  ready: boolean;
  className: string;
  /** Applied to a hand-rolled table that uses the shared `.admin-table` rules.
   *  Those rules live outside any cascade layer in globals.css, so they win over
   *  plain utilities and need the important modifier to be overridden. */
  tableClassName: string;
  /** padding classes for tables this module renders directly (DataTable) */
  cellClassName: string;
  headClassName: string;
}

export function useTablePrefs(tableId: string): TablePreferenceApi {
  const [prefs, setPrefs] = useState<TablePrefs>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stored: TablePrefs = DEFAULTS;
    try {
      const raw = window.localStorage.getItem(storageKey(tableId));
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<TablePrefs>;
        stored = {
          density: parsed.density === "compact" ? "compact" : "comfortable",
          hidden: Array.isArray(parsed.hidden)
            ? parsed.hidden.filter((k): k is string => typeof k === "string")
            : [],
        };
      }
    } catch {
      // A corrupt or unreadable preference must not break the list: fall back.
      stored = DEFAULTS;
    }
    setPrefs(stored);
    setReady(true);
  }, [tableId]);

  const persist = useCallback(
    (next: TablePrefs) => {
      setPrefs(next);
      try {
        window.localStorage.setItem(storageKey(tableId), JSON.stringify(next));
      } catch {
        // Private mode / quota: the table still works, it just won't remember.
      }
    },
    [tableId]
  );

  const setDensity = useCallback(
    (density: Density) => persist({ ...prefs, density }),
    [prefs, persist]
  );

  const toggleColumn = useCallback(
    (key: string) => {
      const hidden = prefs.hidden.includes(key)
        ? prefs.hidden.filter((k) => k !== key)
        : [...prefs.hidden, key];
      persist({ ...prefs, hidden });
    },
    [prefs, persist]
  );

  const showAllColumns = useCallback(
    () => persist({ ...prefs, hidden: [] }),
    [prefs, persist]
  );

  const hidden = useMemo(() => new Set(prefs.hidden), [prefs.hidden]);
  const isHidden = useCallback((key: string) => hidden.has(key), [hidden]);

  const compact = prefs.density === "compact";

  return {
    density: prefs.density,
    setDensity,
    hidden,
    isHidden,
    toggleColumn,
    showAllColumns,
    ready,
    className: compact ? "text-[13px]" : "",
    tableClassName: compact
      ? "[&_tbody_td]:!py-1.5 [&_thead_th]:!py-1.5 [&_tbody_td]:!px-3 [&_thead_th]:!px-3"
      : "",
    cellClassName: compact ? "px-3 py-1.5" : "px-4 py-3",
    headClassName: compact ? "px-3 py-1.5" : "px-4 py-3",
  };
}
