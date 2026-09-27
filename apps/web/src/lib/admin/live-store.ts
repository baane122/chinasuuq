"use client";

import { create } from "zustand";

/** Row events arrive in bursts (one order writes orders + items + notifs). */
const REFETCH_DEBOUNCE_MS = 1500;

interface LiveState {
  version: number;
  dirty: Set<string>;
  /** table -> version of the last burst that touched it. */
  stamps: Record<string, number>;
  connected: boolean;
  bump: (tables: string[]) => void;
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** Tables touched since the last flush; stamped when the burst fires. */
let pending: Set<string> = new Set();

export const useLiveStore = create<LiveState>((set) => ({
  version: 0,
  dirty: new Set<string>(),
  stamps: {},
  connected: false,

  bump: (tables) => {
    for (const table of tables) pending.add(table);
    set((state) => {
      const dirty = new Set(state.dirty);
      for (const table of tables) dirty.add(table);
      return { dirty };
    });

    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const burst = pending;
      pending = new Set();
      set((state) => {
        const version = state.version + 1;
        const stamps = { ...state.stamps };
        for (const table of burst) stamps[table] = version;
        return { version, stamps };
      });
    }, REFETCH_DEBOUNCE_MS);
  },
}));

export function bumpLive(tables: string[]): void {
  useLiveStore.getState().bump(tables);
}

export function setLiveConnected(connected: boolean): void {
  useLiveStore.setState({ connected });
}

/**
 * Increments once per debounced burst — use it as an effect dependency.
 *
 * Pass the tables the effect actually reads and it only moves when one of them
 * changed. With no argument every burst counts, which made each of the admin
 * lists refetch its whole dataset whenever an unrelated order, notification or
 * shipment row moved.
 */
export function useLiveVersion(tables?: readonly string[]): number {
  return useLiveStore((state) => {
    if (!tables || tables.length === 0) return state.version;
    let stamp = 0;
    for (const table of tables) stamp = Math.max(stamp, state.stamps[table] ?? 0);
    return stamp;
  });
}

export function useLiveConnected(): boolean {
  return useLiveStore((state) => state.connected);
}
