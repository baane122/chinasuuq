"use client";

import dynamic from "next/dynamic";

// Above-the-fold sections stay eager to avoid blocking first paint.
import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import SearchBar from "@/components/landing/SearchBar";
import Footer from "@/components/landing/Footer";

// Below-the-fold sections are code-split (smaller initial JS chunk) but
// still server-rendered: with ssr:false their copy never reached the
// prerendered HTML, so crawlers and no-JS visitors saw nothing there.
const TrustBar = dynamic(() => import("@/components/landing/TrustBar"));
const HowItWorks = dynamic(() => import("@/components/landing/HowItWorks"));
const AppDownload = dynamic(() => import("@/components/landing/AppDownload"));
const WhatsAppFAB = dynamic(() => import("@/components/landing/WhatsAppFAB"));

/** Lightweight skeleton that matches the warm background so lazy sections
 *  never cause a jarring white flash while they hydrate. */
function SectionSkeleton({ lines }: { lines: number }) {
  return (
    <div className="w-full py-16 sm:px-6 lg:px-8 bg-warm-50">
      <div className="mx-auto max-w-[1280px] px-4 space-y-6">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-8 rounded-xl bg-brand-500/5 animate-pulse"
            style={{
              width: i === 0 ? "28%" : `${70 - (i % 3) * 12}%`,
              margin: "0 auto",
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-warm-50">
      <Header />
      <main>
        <Hero />
        <TrustBar />
        <HowItWorks />
        <AppDownload />
      </main>
      <Footer />
      <WhatsAppFAB />
    </div>
  );
}
