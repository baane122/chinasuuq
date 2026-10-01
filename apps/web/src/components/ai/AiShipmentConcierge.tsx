"use client";

import { useState } from "react";
import { Sparkles, Loader2, Languages, AlertTriangle } from "lucide-react";
import { aiChat } from "@/lib/ai/client";
import { useI18n } from "@/lib/i18n";

interface Props {
  /** Order reference the user just tracked, e.g. CS-2026-0001 */
  orderReference: string;
}

/**
 * AI Shipment Concierge — explains the tracked shipment in plain EN or SO.
 * Fetches nothing itself: the parent passes the reference, we pull the
 * tracking timeline client-side and let the AI narrate it.
 */
export default function AiShipmentConcierge({ orderReference }: Props) {
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [lang, setLang] = useState<"en" | "so">(locale === "so" ? "so" : "en");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const ask = async (language: "en" | "so") => {
    setLoading(true);
    setFailed(false);
    setAnswer(null);
    try {
      // Resolve the order by reference first (tracking_events FK needs the UUID)
      const orders = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/orders?reference=eq.${orderReference}&select=id,status,shipping_method,total_usd,payment_status`,
        { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" } }
      ).then((r) => r.json()).catch(() => null);
      const orderRow = Array.isArray(orders) ? orders[0] : null;
      let events: unknown = null;
      if (orderRow?.id) {
        events = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tracking_events?order_id=eq.${orderRow.id}&select=status,location,message,created_at&order=created_at.desc&limit=5`,
          { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" } }
        ).then((r) => r.json()).catch(() => null);
      }
      const prompt =
        `You are ChinaSuuq support. Shipment data JSON:\n${JSON.stringify({ order: orderRow, events })}\n` +
        `Explain the current shipment status simply in ${language === "so" ? "Somali (af-Soomaali)" : "English"}, ` +
        `max 3 sentences, then one line 'Next step: ...'.`;
      const result = await aiChat({ messages: [{ role: "user", content: prompt }], tier: "fast", timeoutMs: 30_000 });
      if (result) setAnswer(result);
      else setFailed(true);
    } catch {
      setFailed(true);
    }
    setLoading(false);
  };

  const handleOpen = () => {
    setOpen(true);
    ask(lang);
  };

  const switchLang = (l: "en" | "so") => {
    setLang(l);
    ask(l);
  };

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-500/40 bg-brand-500/[0.04] px-4 py-3 text-sm font-semibold text-brand-600 transition hover:bg-brand-500/10"
      >
        <Sparkles className="h-4 w-4" />
        Ask AI about this shipment
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-brand-500/20 bg-brand-500/[0.04] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-dark-900">
          <Sparkles className="h-4 w-4 text-brand-500" /> AI explanation
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-dark-900/10 bg-white p-0.5">
          {(["en", "so"] as const).map((l) => (
            <button
              key={l}
              onClick={() => switchLang(l)}
              disabled={loading}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                lang === l ? "bg-brand-500 text-white" : "text-dark-900/60 hover:text-brand-600"
              }`}
            >
              {l === "en" ? "EN" : "SO"}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-dark-900/50">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-500" /> Reading your shipment…
        </div>
      )}

      {failed && (
        <div className="mt-3 flex items-start gap-2 text-xs text-dark-900/60">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-amber-500" />
          AI is unavailable right now — for urgent questions, contact support below.
        </div>
      )}

      {answer && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-dark-900/80">{answer}</p>}

      <p className="mt-3 text-[10px] text-dark-900/40">AI-generated — verify with support for anything critical.</p>
    </div>
  );
}
