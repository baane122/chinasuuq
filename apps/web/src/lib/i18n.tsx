"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import en from "@/i18n/en.json";
import so from "@/i18n/so.json";

type Locale = "en" | "so";
type Translations = typeof en;

const translations: Record<Locale, Translations> = { en, so };
const LOCALE_KEY = "chinasuuq-locale";

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

/* ── The stored locale, as an external store ──────────────────────
 * localStorage is external state, so it is read with useSyncExternalStore
 * rather than copied into component state from an effect. The server snapshot
 * is "en", which is what the static export prerenders, so hydration matches and
 * the stored choice lands on the first client render. */
const localeListeners = new Set<() => void>();

function readLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_KEY);
    if (saved === "so" || saved === "en") return saved;
  } catch {
    /* private mode / storage disabled — stay on English */
  }
  return "en";
}

function subscribeLocale(onChange: () => void) {
  localeListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    localeListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribeLocale, readLocale, () => "en" as const);

  // Keep <html lang> in sync so screen readers and translation tools follow.
  useEffect(() => {
    document.documentElement.lang = locale === "so" ? "so" : "en";
  }, [locale]);

  const setLocale = useCallback((newLocale: Locale) => {
    try {
      localStorage.setItem(LOCALE_KEY, newLocale);
    } catch {
      /* ignore */
    }
    // Notify subscribers so every consumer re-renders with the new locale.
    for (const listener of localeListeners) listener();
  }, []);

  const t = useCallback(
    (key: string): string => {
      // Walk the nested dictionary without `any`: each step is either another
      // branch (an object) or a leaf string, and anything else means the key is
      // wrong — in which case the key itself is returned so a missing
      // translation is visible instead of rendering "undefined".
      const keys = key.split(".");
      let value: unknown = translations[locale];
      for (const k of keys) {
        if (typeof value !== "object" || value === null) return key;
        value = (value as Record<string, unknown>)[k];
      }
      return typeof value === "string" ? value : key;
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}
