"use client";

/**
 * Mission Control theme toggle.
 *
 * Dark mode is class-based (see globals.css `@custom-variant dark`): we set or
 * clear `.dark` on <html> and remember the choice in localStorage so the whole
 * console (admin-* utility classes + dark: variants) flips together.
 *
 * The public marketing site is intentionally out of scope — only the admin
 * console exposes this control — so a dark preference only ever restyles the
 * `.dark`-aware admin surfaces.
 */

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "cs-admin-theme";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

/* ── The stored theme, as an external store ──────────────────────
 * localStorage IS an external store, so it is read through
 * useSyncExternalStore rather than copied into state from an effect. The effect
 * version painted one frame with the wrong icon on every load and required a
 * `mounted` flag to avoid an SSR mismatch; this has neither problem, and
 * getServerSnapshot returns "light" so the static export hydrates cleanly. */
const themeListeners = new Set<() => void>();

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* private mode / storage disabled — fall back to light */
  }
  return "light";
}

function subscribeTheme(onChange: () => void) {
  themeListeners.add(onChange);
  // `storage` fires for edits made in OTHER tabs, so two open consoles agree.
  window.addEventListener("storage", onChange);
  return () => {
    themeListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function writeTheme(next: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore persistence failures — the class still flips for this session */
  }
  applyTheme(next);
  for (const listener of themeListeners) listener();
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribeTheme,
    readStoredTheme,
    () => "light" as const
  );

  // Keep <html class="dark"> in sync with the chosen theme.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggle() {
    writeTheme(theme === "dark" ? "light" : "dark");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl text-dark-900/55 transition-colors hover:bg-dark-900/5 hover:text-dark-900 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-100"
    >
      {/* Both icons stay in the DOM so the button never changes width; only the
          visible one is rendered, which keeps the a11y name on the button. */}
      <Sun className={`h-[18px] w-[18px] ${theme === "dark" ? "hidden" : "block"}`} />
      <Moon className={`h-[18px] w-[18px] ${theme === "dark" ? "block" : "hidden"}`} />
    </button>
  );
}
