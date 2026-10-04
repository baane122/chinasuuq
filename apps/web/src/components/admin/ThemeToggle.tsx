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

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "cs-admin-theme";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function ThemeToggle() {
  // Start in a neutral state and reconcile with storage after mount to avoid a
  // server/client markup mismatch during static export.
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let initial: Theme = "light";
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "dark" || stored === "light") initial = stored;
    } catch {
      /* private mode / SSR — fall back to light */
    }
    applyTheme(initial);
    setTheme(initial);
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore persistence failures */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl text-dark-900/55 transition-colors hover:bg-dark-900/5 hover:text-dark-900 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-100"
    >
      {/* Both icons render; opacity swap avoids a layout jump while `mounted` is false. */}
      <Sun className={`h-[18px] w-[18px] ${theme === "dark" ? "hidden" : "block"}`} />
      <Moon className={`h-[18px] w-[18px] ${theme === "dark" ? "block" : "hidden"}`} />
      {!mounted && <span className="sr-only">Loading theme…</span>}
    </button>
  );
}
