"use client";

import { useState } from "react";
import { Sparkles, Loader2, AlertTriangle, WandSparkles } from "lucide-react";
import { aiChat, extractJson } from "@/lib/ai/client";
import { useI18n } from "@/lib/i18n";

interface ExtractedItem {
  name: string;
  quantity: number;
}

/**
 * AI Quote Assistant — user describes what they want in plain language;
 * AI extracts a structured product list that pre-fills the quote description.
 */
export default function AiQuoteAssistant({
  onExtracted,
}: {
  onExtracted: (items: ExtractedItem[]) => void;
}) {
  const { locale } = useI18n();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);

  const run = async () => {
    if (!text.trim() || text.trim().length < 8 || loading) return;
    setLoading(true);
    setFailed(false);
    setDone(false);
    const result = await aiChat({
      messages: [
        {
          role: "user",
          content:
            'Extract the product list as a JSON array [{"name": string, "quantity": number}] from this buying request. Quantities default to 1 when unstated. Reply with JSON only, no extra text.\n\nRequest: ' +
            text.trim(),
        },
      ],
      tier: "fast",
      temperature: 0.1,
      timeoutMs: 30_000,
    });
    const parsed = result ? extractJson<ExtractedItem[]>(result) : null;
    if (parsed && Array.isArray(parsed) && parsed.length > 0) {
      onExtracted(parsed.slice(0, 15));
      setDone(true);
    } else {
      setFailed(true);
    }
    setLoading(false);
  };

  return (
    <div className="mb-6 rounded-2xl border border-brand-500/25 bg-gradient-to-br from-brand-500/[0.06] to-transparent p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
          <Sparkles className="h-3 w-3" /> AI
        </span>
        <h3 className="text-sm font-bold text-dark-900">
          {locale === "so" ? "Waxaad rabto? Si banaan u qor" : "Describe what you want to buy"}
        </h3>
      </div>
      <p className="mt-1 text-xs text-dark-900/50">
        {locale === "so"
          ? "Tusaale: “Waxaan rabaa 50 cusbo telefoon iyo 10 charger ah.”"
          : "Example: “I want 50 phone cases and 10 chargers from 1688.”"}
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <textarea
          rows={2}
          value={text}
          onChange={(e) => { setText(e.target.value); setDone(false); setFailed(false); }}
          placeholder={locale === "so" ? "Qor waxaad rabto…" : "Type freely — the AI builds your product list…"}
          className="flex-1 resize-none rounded-xl border border-dark-900/10 bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-dark-900/35 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
        <button
          onClick={run}
          disabled={loading || text.trim().length < 8}
          className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
          {loading ? "Thinking…" : locale === "so" ? "Samee liiska" : "Build my list"}
        </button>
      </div>
      {done && (
        <p className="mt-2 text-xs font-medium text-emerald-600">
          ✓ Product list added to your quote below — review and edit anything.
        </p>
      )}
      {failed && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-dark-900/60">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          AI couldn&apos;t read that — just type the products manually below.
        </p>
      )}
    </div>
  );
}
