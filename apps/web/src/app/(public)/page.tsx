"use client";

import dynamic from "next/dynamic";

// Above-the-fold sections stay eager to avoid blocking first paint.
import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import SearchBar from "@/components/landing/SearchBar";
import Footer from "@/components/landing/Footer";

// Below-the-fold heavy sections are code-split so the initial JS bundle
// (framer-motion, lucide icons) is much smaller on first load. Each loads
// on demand and renders a branded skeleton fallback to avoid blank flashes.
const MarketplaceCards = dynamic(
  () => import("@/components/landing/MarketplaceCards"),
  { ssr: false, loading: () => <SectionSkeleton lines={4} /> }
);
const CategoryGrid = dynamic(
  () => import("@/components/landing/CategoryGrid"),
  { ssr: false, loading: () => <SectionSkeleton lines={12} /> }
);
const TrustBar = dynamic(() => import("@/components/landing/TrustBar"), {
  ssr: false,
  loading: () => <SectionSkeleton lines={1} />,
});
const HowItWorks = dynamic(
  () => import("@/components/landing/HowItWorks"),
  { ssr: false, loading: () => <SectionSkeleton lines={3} /> }
);
const AppDownload = dynamic(
  () => import("@/components/landing/AppDownload"),
  { ssr: false, loading: () => <SectionSkeleton lines={2} /> }
);
const WhatsAppFAB = dynamic(
  () => import("@/components/landing/WhatsAppFAB"),
  { ssr: false }
);

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
        <MarketplaceCards />
        <CategoryGrid />
        <TrustBar />
        <HowItWorks />
        <AppDownload />
      </main>
      <Footer />
      <WhatsAppFAB />
    </div>
  );
}
