"use client";

import { useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import en from "@/i18n/en.json";
import so from "@/i18n/so.json";

type Locale = "en" | "so";
type Translations = typeof en;

const translations: Record<Locale, Translations> = { en, so };

export function useI18n() {
  const [locale, setLocaleState] = useState<Locale>("en");

  const setLocale = useCallback(async (newLocale: Locale) => {
    setLocaleState(newLocale);
    await AsyncStorage.setItem("chinasuuq-locale", newLocale);
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

  return { locale, setLocale, t };
}
