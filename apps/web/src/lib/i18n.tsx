"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
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

export function I18nProvider({ children }: { children: ReactNode }) {
  // First render is always "en" so SSR and hydration match; the saved choice
  // is restored right after mount (it used to be written but never read).
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LOCALE_KEY);
      if (saved === "so" || saved === "en") {
        setLocaleState(saved);
        document.documentElement.lang = saved === "so" ? "so" : "en";
      }
    } catch {
      /* private mode / storage disabled — stay on English */
    }
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(LOCALE_KEY, newLocale);
    } catch {
      /* ignore */
    }
    // Keep <html lang> in sync so screen readers and translation tools follow.
    document.documentElement.lang = newLocale === "so" ? "so" : "en";
  }, []);

  const t = useCallback(
    (key: string): string => {
      const keys = key.split(".");
      let value: any = translations[locale];
      for (const k of keys) {
        value = value?.[k];
      }
      return (typeof value === "string" ? value : key) as string;
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
