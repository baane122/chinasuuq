"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight, ShieldCheck, Truck, MessageCircle, Package, Globe2,
  Sparkles, BadgeCheck, Clock3,
} from "lucide-react";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import WhatsAppFAB from "@/components/landing/WhatsAppFAB";
import { supabase } from "@/lib/supabase";
import { mergeMarketplaces, type LiveMarketplace } from "@/lib/marketplaces";

const WA_NUMBER = "8615277074143";
const waLink = (text: string) =>
  `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;

const STEPS = [
  { icon: Globe2, title: "Pick a marketplace", text: "Browse 1688, Taobao, YiwuGo and more below — each has its strengths." },
  { icon: MessageCircle, title: "Send us the link", text: "Paste the product link or screenshot on WhatsApp. We translate and quote in CNY + USD." },
  { icon: Package, title: "We buy & consolidate", text: "Our Guangzhou warehouse receives, inspects and consolidates everything." },
  { icon: Truck, title: "Shipped to Somalia", text: "Air or sea freight to Mogadishu, Hargeisa and beyond — tracked door to door." },
];

export default function MarketplacesPage() {
  const [markets, setMarkets] = useState(mergeMarketplaces(null));
  const [loaded, setLoaded] = useState(false);

  // Live rows from the admin-managed `marketplaces` table — the same data the
  // dashboard curates and the mobile app consumes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("marketplaces")
          .select("id,name,display_name,marketplace_type,base_url,logo_url,is_active,features,metadata")
          .eq("is_active", true);
        if (!cancelled && data) {
          setMarkets(mergeMarketplaces(data as unknown as LiveMarketplace[]));
        }
      } catch {
        /* offline → catalog fallback already set */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-warm-50">
      <Header />
      <main>
        {/* ── Hero ── */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-warm-50 to-warm-100" />
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-500/10 blur-3xl" />
          <div className="absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-brand-500/[0.07] blur-3xl" />
          <div className="relative mx-auto max-w-[1280px] px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="max-w-2xl"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-500/20 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-600 shadow-sm">
                <Sparkles className="h-3 w-3" />
                Shop all of China — one warehouse
              </span>
              <h1 className="mt-4 text-3xl font-extrabold leading-tight text-dark-900 sm:text-5xl">
                Every major Chinese marketplace,{" "}
                <span className="text-brand-500">made simple</span>
              </h1>
              <p className="mt-4 text-base leading-relaxed text-dark-900/60 sm:text-lg">
                You don&apos;t need a Chinese bank account, agent or translator.
                Pick any market below, send us what you like, and ChinaSuuq
                buys, inspects and ships it to Somalia.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <a href="#markets" className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition-all hover:bg-brand-600 active:scale-[0.97]">
                  Browse marketplaces
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a href={waLink("Hello ChinaSuuq, I want to order from a Chinese marketplace")} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#25D366]/25 transition-all hover:bg-[#1fb857] active:scale-[0.97]">
                  <MessageCircle className="h-4 w-4" />
                  Ask on WhatsApp
                </a>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-medium text-dark-900/50">
                <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-brand-500" /> Quality inspection included</span>
                <span className="inline-flex items-center gap-1.5"><BadgeCheck className="h-4 w-4 text-brand-500" /> Quotes in USD before you pay</span>
                <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-brand-500" /> Air freight 7–14 days</span>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── Marketplace grid ── */}
        <section id="markets" className="mx-auto max-w-[1280px] scroll-mt-20 px-4 py-14 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-dark-900 sm:text-3xl">The marketplaces</h2>
              <p className="mt-1 text-sm text-dark-900/50">
                {loaded ? "Live catalog — curated by our ChinaSuuq team." : "Loading the live catalog…"}
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-dark-900/50 ring-1 ring-dark-900/[0.06]">
              {markets.length} marketplaces
            </span>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {markets.map((m, i) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: (i % 3) * 0.08, duration: 0.4 }}
                className="group relative overflow-hidden rounded-3xl border border-dark-900/[0.06] bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl"
              >
                {/* brand edge */}
                <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: m.brandColor }} />
                <div className="flex items-start justify-between">
                  <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-warm-100 ring-1 ring-dark-900/[0.04]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.icon} alt={m.name} className="h-12 w-12 object-contain" />
                  </div>
                  <span
                    className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
                    style={{ backgroundColor: `${m.brandColor}14`, color: m.brandColor }}
                  >
                    {m.stat}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-bold text-dark-900">{m.displayName}</h3>
                <p className="mt-0.5 text-sm font-medium" style={{ color: m.brandColor }}>{m.tagline}</p>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-dark-900/55">{m.description}</p>
                {m.highlights.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {m.highlights.slice(0, 3).map((h) => (
                      <span key={h} className="rounded-full bg-warm-100 px-2.5 py-1 text-[11px] font-medium text-dark-900/60">
                        {h}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-5 flex items-center gap-2">
                  <Link
                    href={`/marketplaces/${m.id}`}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-dark-900 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-dark-800 active:scale-[0.97]"
                  >
                    Explore
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <a
                    href={waLink(`Hello ChinaSuuq, I want to order from ${m.name}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-xl bg-[#25D366]/10 p-2.5 text-[#25D366] transition-all hover:bg-[#25D366]/20"
                    aria-label={`Order from ${m.name} via WhatsApp`}
                  >
                    <MessageCircle className="h-4 w-4" />
                  </a>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="border-y border-dark-900/[0.04] bg-white py-14">
          <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
            <h2 className="text-center text-2xl font-bold text-dark-900 sm:text-3xl">
              How ordering works
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-center text-sm text-dark-900/50">
              The same simple flow for every marketplace — you never touch Chinese payment methods.
            </p>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <motion.div
                  key={s.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="relative rounded-2xl border border-dark-900/[0.06] bg-warm-50 p-5"
                >
                  <span className="absolute right-4 top-3 text-3xl font-extrabold text-brand-500/10">
                    {i + 1}
                  </span>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10">
                    <s.icon className="h-5 w-5 text-brand-500" />
                  </div>
                  <h3 className="mt-3 text-sm font-bold text-dark-900">{s.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-dark-900/50">{s.text}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA band ── */}
        <section className="mx-auto max-w-[1280px] px-4 py-14 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-dark-900 px-6 py-10 text-center sm:px-12">
            <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-brand-500/20 blur-3xl" />
            <div className="absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl" />
            <h2 className="relative text-2xl font-bold text-white sm:text-3xl">
              Ready to order from any market?
            </h2>
            <p className="relative mx-auto mt-2 max-w-lg text-sm text-white/60">
              Send your first product link today — quotes come back within hours, in USD, with shipping included.
            </p>
            <div className="relative mt-6 flex flex-wrap items-center justify-center gap-3">
              <a href={waLink("Hello ChinaSuuq, I want to place my first order")} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#25D366]/30 transition-all hover:bg-[#1fb857] active:scale-[0.97]">
                <MessageCircle className="h-4 w-4" />
                Start on WhatsApp
              </a>
              <Link href="/track" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-white/10 active:scale-[0.97]">
                <Package className="h-4 w-4" />
                Track an order
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppFAB />
    </div>
  );
}
