"use client";

import { create } from "zustand";

interface UIStore {
  mobileMenuOpen: boolean;
  searchOpen: boolean;
  language: "en" | "so";
  setMobileMenuOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setLanguage: (lang: "en" | "so") => void;
}

export const useUIStore = create<UIStore>((set) => ({
  mobileMenuOpen: false,
  searchOpen: false,
  language: "en",
  setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setLanguage: (lang) => set({ language: lang }),
}));
