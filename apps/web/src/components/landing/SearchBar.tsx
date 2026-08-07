"use client";

import { useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { Search, Link2, Camera } from "lucide-react";

export default function SearchBar() {
  const { t } = useI18n();
  const router = useRouter();
  const [query, setQuery] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/categories?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-[720px] mx-auto"
    >
      <div className="relative flex items-center bg-white rounded-2xl shadow-lg shadow-dark-900/8 border border-dark-900/5 overflow-hidden transition-shadow focus-within:shadow-xl focus-within:shadow-brand-500/10 focus-within:border-brand-500/30">
        {/* Search icon */}
        <div className="pl-4 sm:pl-5 text-dark-900/30">
          <Search className="w-5 h-5" />
        </div>

        {/* Input */}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("hero.searchPlaceholder")}
          className="flex-1 px-3 py-4 sm:py-[18px] text-sm sm:text-[15px] text-dark-900 placeholder:text-dark-900/35 outline-none bg-transparent"
        />

        {/* Action buttons */}
        <div className="flex items-center gap-1 pr-2">
          <button
            type="button"
            className="p-2 rounded-lg text-dark-900/30 hover:text-dark-900/60 hover:bg-dark-900/5 transition-colors"
            title="Paste link"
          >
            <Link2 className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
          </button>
          <button
            type="button"
            className="p-2 rounded-lg text-dark-900/30 hover:text-dark-900/60 hover:bg-dark-900/5 transition-colors"
            title="Upload image"
          >
            <Camera className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
          </button>
          <button
            type="submit"
            className="ml-1 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-all duration-200 active:scale-[0.97] shadow-sm"
          >
            <span className="hidden sm:inline">Search</span>
            <Search className="w-4 h-4 sm:hidden" />
          </button>
        </div>
      </div>
    </form>
  );
}
