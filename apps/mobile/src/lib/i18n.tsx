import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import en from "@/i18n/en.json";
import so from "@/i18n/so.json";

type Locale = "en" | "so";
type Translations = typeof en;

const translations: Record<Locale, Translations> = { en, so };
const LOCALE_KEY = "chinasuuq-locale";

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
  t: (key: string) => string;
  loaded: boolean;
}

const I18nContext = createContext<I18nContextType>({
  locale: "en",
  setLocale: async () => {},
  t: (key: string) => key,
  loaded: false,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [loaded, setLoaded] = useState(false);

  // Load saved locale on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LOCALE_KEY);
        if (stored && (stored === "en" || stored === "so")) {
          setLocaleState(stored);
        }
      } catch {}
      setLoaded(true);
    })();
  }, []);

  const setLocale = useCallback(async (newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      await AsyncStorage.setItem(LOCALE_KEY, newLocale);
    } catch {}
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
    <I18nContext.Provider value={{ locale, setLocale, t, loaded }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
