"use client";

import dynamic from "next/dynamic";

// Above-the-fold sections stay eager to avoid blocking first paint.
import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import Footer from "@/components/landing/Footer";


// Below-the-fold sections are code-split (smaller initial JS chunk) but
// still server-rendered: with ssr:false their copy never reached the
// prerendered HTML, so crawlers and no-JS visitors saw nothing there.
const TrustBar = dynamic(() => import("@/components/landing/TrustBar"));
const HowItWorks = dynamic(() => import("@/components/landing/HowItWorks"));
const AppDownload = dynamic(() => import("@/components/landing/AppDownload"));
const TrendingProducts = dynamic(() => import("@/components/landing/TrendingProducts"));
const WhatsAppFAB = dynamic(() => import("@/components/landing/WhatsAppFAB"));

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-warm-50">
      <Header />
      <main>
        <Hero />
        <TrustBar />
        <TrendingProducts />
        <HowItWorks />
        <AppDownload />
      </main>
      <Footer />
      <WhatsAppFAB />
    </div>
  );
}
