"use client";

import { useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n";
import { Search, Link2 } from "lucide-react";
import { openWhatsApp } from "@/lib/whatsapp";
import QuoteRequestModal from "@/components/quote/QuoteRequestModal";

/** Is this mostly likely a product URL rather than a search phrase? */
function looksLikeUrl(v: string) {
  return /https?:\/\/|\b1688\.com\b|\btaobao\.com\b|\byiwugo\.com\b|\bchinagoods\.com\b/i.test(
    v
  );
}

export default function SearchBar() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [quoteOpen, setQuoteOpen] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (looksLikeUrl(q)) {
      // A pasted product link → the quote request flow (writes a sourcing
      // request the admin team works from), with WhatsApp as backup.
      setQuoteOpen(true);
      return;
    }
    // Route product searches to our WhatsApp ordering flow so a real
    // ChinaSuuq sourcing agent can find and quote the product.
    openWhatsApp(`Hello ChinaSuuq, I am looking for: ${q}`);
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="w-full max-w-[720px] mx-auto">
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
              onClick={() => setQuoteOpen(true)}
              className="p-2 rounded-lg text-dark-900/30 hover:text-brand-600 hover:bg-brand-500/5 transition-colors"
              title={t("quote.urlLabel")}
              aria-label={t("quote.urlLabel")}
            >
              <Link2 className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
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
        <p className="mt-3 text-center text-xs text-dark-900/45">
          {t("quote.subtitleShort")}
        </p>
      </form>

      <QuoteRequestModal
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        defaultUrl={looksLikeUrl(query) ? query.trim() : undefined}
      />
    </>
  );
}
