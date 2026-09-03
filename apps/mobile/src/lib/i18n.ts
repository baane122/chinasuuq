import { useState, useCallback, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import en from "@/i18n/en.json";
import so from "@/i18n/so.json";

type Locale = "en" | "so";
type Translations = typeof en;

const translations: Record<Locale, Translations> = { en, so };
const LOCALE_KEY = "chinasuuq-locale";

// Default locale
let savedLocale: Locale = "en";

export function useI18n() {
  const [locale, setLocaleState] = useState<Locale>(savedLocale);
  const [loaded, setLoaded] = useState(false);

  // Load saved locale on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LOCALE_KEY);
        if (stored && (stored === "en" || stored === "so")) {
          savedLocale = stored;
          setLocaleState(stored);
        }
      } catch {}
      setLoaded(true);
    })();
  }, []);

  const setLocale = useCallback(async (newLocale: Locale) => {
    savedLocale = newLocale;
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

  return { locale, setLocale, t, loaded };
}
