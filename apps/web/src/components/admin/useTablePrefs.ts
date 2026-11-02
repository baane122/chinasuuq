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
 * (a real React mismatch, not a style flicker). The stored value is read through
 * useSyncExternalStore, whose server snapshot is the default, so hydration is
 * consistent and the stored preference lands on the first client render.
 * `ready` is exposed for anything that must not act before then.
 *
 * Hand-rolled on purpose: @tanstack/table is not installed and nothing can be
 * added to this app (offline build).
 */

import { useCallback, useMemo, useSyncExternalStore } from "react";

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

/** Parse one table's stored preferences, tolerating anything corrupt. */
function readPrefs(tableId: string): TablePrefs {
  try {
    const raw = window.localStorage.getItem(storageKey(tableId));
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<TablePrefs>;
    return {
      density: parsed.density === "compact" ? "compact" : "comfortable",
      hidden: Array.isArray(parsed.hidden)
        ? parsed.hidden.filter((k): k is string => typeof k === "string")
        : [],
    };
  } catch {
    // A corrupt or unreadable preference must not break the list: fall back.
    return DEFAULTS;
  }
}

/** Notifies mounted tables after a write, including writes from another tab. */
const prefListeners = new Set<() => void>();

function subscribePrefs(onChange: () => void) {
  prefListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    prefListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useTablePrefs(tableId: string): TablePreferenceApi {
  /* Preferences live in localStorage, an external store, so they are read
   * through useSyncExternalStore instead of being mirrored into component
   * state. There is deliberately NO local copy: one source of truth means a
   * write can never be applied twice or drift from what is persisted.
   *
   * `ready` distinguishes "this is the stored value" from "this is the
   * server-render default" — some screens use it to hold off column-dependent
   * decisions until the real preferences have landed. */
  const prefs = useSyncExternalStore(
    subscribePrefs,
    () => readPrefs(tableId),
    () => DEFAULTS
  );
  const ready = useSyncExternalStore(
    subscribePrefs,
    () => true, // on the client the read above is already the stored value
    () => false // prerender: only defaults exist
  );

  const persist = useCallback(
    (next: TablePrefs) => {
      try {
        window.localStorage.setItem(storageKey(tableId), JSON.stringify(next));
      } catch {
        // Private mode / quota: the table still works, it just won't remember.
      }
      // Notify this tab's subscribers (the `storage` event only fires for other
      // tabs).
      for (const listener of prefListeners) listener();
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
