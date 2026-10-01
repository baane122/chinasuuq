"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import WhatsAppFAB from "@/components/landing/WhatsAppFAB";
import QuoteForm from "@/components/quote/QuoteForm";
import { useI18n } from "@/lib/i18n";
import { detectMarketplace } from "@/components/quote/QuoteForm";
import { Loader2 } from "lucide-react";

/**
 * /quote — the web's first-party conversion path. A visitor pastes a product
 * link (or describes what they need); the request is written to
 * `sourcing_requests` and lands on the admin Sourcing board.
 *
 * useSearchParams() must sit under <Suspense> in a statically prerendered
 * route, or the prerenderer bails the page to full client rendering.
 */
function QuotePageInner() {
  const { t } = useI18n();
  const params = useSearchParams();
  const url = params.get("url") ?? "";
  const mp = params.get("mp") ?? undefined;

  return (
    <main className="min-h-screen bg-warm-50">
      <Header />
      <section className="relative overflow-hidden pt-28 pb-16 lg:pt-36 lg:pb-24">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-[-10%] h-[520px] w-[520px] rounded-full bg-brand-500/[0.07] blur-3xl" />
          <div className="absolute -bottom-32 right-[-8%] h-[420px] w-[420px] rounded-full bg-brand-500/[0.05] blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-[880px] px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-600">
              {t("quote.free")}
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.05] text-dark-900 sm:text-5xl">
              {t("quote.title")}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-dark-900/60 sm:text-lg">
              {t("quote.subtitle")}
            </p>
          </div>
          <QuotePageForm url={url} mp={mp} />
        </div>
      </section>
      <Footer />
      <WhatsAppFAB />
    </main>
  );
}

function QuotePageForm({ url, mp }: { url: string; mp?: string }) {
  // Normalise the prefill once on the client: detect the marketplace from a
  // pasted link so the select starts in the right place.
  const detected = url ? detectMarketplace(url) : null;
  const initialMp = mp ?? detected ?? undefined;
  const initialUrl = url;
  return (
    <QuoteForm
      key={`${initialUrl}|${initialMp ?? ""}`}
      defaultUrl={initialUrl}
      defaultMarketplace={initialMp}
    />
  );
}

export default function QuotePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-warm-50">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
        </main>
      }
    >
      <QuotePageInner />
    </Suspense>
  );
}
