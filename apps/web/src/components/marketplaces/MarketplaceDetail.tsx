"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, BadgeCheck, CheckCircle2, MessageCircle,
  Package, ShieldCheck, Truck, Wallet,
} from "lucide-react";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import WhatsAppFAB from "@/components/landing/WhatsAppFAB";
import { MARKETPLACE_CATALOG, getMarketplace } from "@/lib/marketplaces";

const WA_NUMBER = "8615277074143";
const waLink = (text: string) =>
  `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;

const STEPS = [
  { icon: MessageCircle, title: "Send the product link", text: `Find any item on ${"{name}"} and send us the link or a screenshot on WhatsApp.` },
  { icon: Wallet, title: "Approve your quote", text: "We reply with the item price, service fee and shipping — all in USD. You approve before anything is bought." },
  { icon: Package, title: "We purchase & inspect", text: "Our Guangzhou team buys the item, checks quality and photographs it for you." },
  { icon: Truck, title: "Consolidate & ship", text: "Combine items from any marketplace into one shipment — air or sea to Somalia." },
];

const FAQS = [
  {
    q: "Do I need an account on {name}?",
    a: "No. ChinaSuuq buys on your behalf — you never need a Chinese phone number, payment card or login.",
  },
  {
    q: "How much does the service cost?",
    a: "A transparent service fee on top of the item price, plus freight. You see the full USD quote before approving — no surprises.",
  },
  {
    q: "Can I combine orders from other marketplaces?",
    a: "Yes — that's the point. Anything you buy through ChinaSuuq arrives at our Guangzhou warehouse and ships together.",
  },
  {
    q: "What if the item is wrong or damaged?",
    a: "Every item is inspected on arrival and photographed. If something is wrong we pursue the supplier or negotiate a return before shipping.",
  },
];

export default function MarketplaceDetail({ id }: { id: string }) {
  const m = getMarketplace(id);

  if (!m) {
    return (
      <div className="min-h-screen bg-warm-50">
        <Header />
        <main className="mx-auto flex max-w-[1280px] flex-col items-center px-4 py-24 text-center">
          <Package className="h-10 w-10 text-brand-500" />
          <h1 className="mt-4 text-2xl font-bold text-dark-900">Marketplace not found</h1>
          <p className="mt-2 text-sm text-dark-900/50">
            This marketplace isn&apos;t part of the catalog yet — ask us on WhatsApp and we&apos;ll
            source from it anyway.
          </p>
          <Link href="/marketplaces" className="admin-btn-primary mt-6">
            <ArrowLeft className="h-4 w-4" />
            All marketplaces
          </Link>
        </main>
        <Footer />
        <WhatsAppFAB />
      </div>
    );
  }

  const others = MARKETPLACE_CATALOG.filter((x) => x.id !== m.id).slice(0, 3);
  const fill = (s: string) => s.replace("{name}", m.displayName);

  return (
    <div className="min-h-screen bg-warm-50">
      <Header />
      <main>
        {/* ── Hero ── */}
        <section className="relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.08]"
            style={{ background: `linear-gradient(135deg, ${m.brandColor} 0%, transparent 60%)` }}
          />
          <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full blur-3xl" style={{ backgroundColor: `${m.brandColor}22` }} />
          <div className="relative mx-auto max-w-[1280px] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            <Link href="/marketplaces" className="inline-flex items-center gap-1.5 text-xs font-semibold text-dark-900/50 transition-colors hover:text-brand-500">
              <ArrowLeft className="h-3.5 w-3.5" />
              All marketplaces
            </Link>
            <div className="mt-6 flex flex-col items-start gap-6 sm:flex-row sm:items-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-dark-900/[0.06]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.icon} alt={m.name} className="h-16 w-16 object-contain" />
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.4 }}>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-3xl font-extrabold text-dark-900 sm:text-4xl">{m.displayName}</h1>
                  <span className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide" style={{ backgroundColor: `${m.brandColor}14`, color: m.brandColor }}>
                    {m.stat}
                  </span>
                </div>
                <p className="mt-1 text-lg font-semibold" style={{ color: m.brandColor }}>{m.tagline}</p>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-dark-900/60 sm:text-base">
                  {m.description}
                </p>
              </motion.div>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href={waLink(`Hello ChinaSuuq, I want to order from ${m.name}. Here is my product: `)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#25D366]/25 transition-all hover:bg-[#1fb857] active:scale-[0.97]">
                <MessageCircle className="h-4 w-4" />
                Order from {m.name}
              </a>
              <a href={m.homeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-dark-900/10 bg-white px-5 py-3 text-sm font-semibold text-dark-900/70 transition-all hover:border-brand-500/40 hover:text-brand-600 active:scale-[0.97]">
                Browse {m.name}
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </section>

        {/* ── Highlights ── */}
        <section className="mx-auto max-w-[1280px] px-4 pb-4 sm:px-6 lg:px-8">
          <div className="grid gap-4 sm:grid-cols-3">
            {m.highlights.map((h, i) => (
              <motion.div
                key={h}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className="flex items-center gap-3 rounded-2xl border border-dark-900/[0.06] bg-white p-4 shadow-sm"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${m.brandColor}14` }}>
                  <CheckCircle2 className="h-4.5 w-4.5" style={{ color: m.brandColor }} />
                </div>
                <p className="text-sm font-semibold text-dark-900">{h}</p>
              </motion.div>
            ))}
          </div>
          <p className="mt-4 text-center text-xs font-medium text-dark-900/40">
            Best for: <span className="font-bold" style={{ color: m.brandColor }}>{m.bestFor}</span>
          </p>
        </section>

        {/* ── How to order ── */}
        <section className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-dark-900 sm:text-3xl">How to order from {m.name}</h2>
          <p className="mt-1 text-sm text-dark-900/50">Four steps — we handle everything in between.</p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="relative rounded-2xl border border-dark-900/[0.06] bg-white p-5 shadow-sm"
              >
                <span className="absolute right-4 top-3 text-3xl font-extrabold" style={{ color: `${m.brandColor}18` }}>
                  {i + 1}
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${m.brandColor}12` }}>
                  <s.icon className="h-5 w-5" style={{ color: m.brandColor }} />
                </div>
                <h3 className="mt-3 text-sm font-bold text-dark-900">{fill(s.title)}</h3>
                <p className="mt-1 text-xs leading-relaxed text-dark-900/50">{fill(s.text)}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="border-y border-dark-900/[0.04] bg-white py-12">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="text-2xl font-bold text-dark-900">Common questions</h2>
            <div className="mt-6 space-y-3">
              {FAQS.map((f, i) => (
                <details key={i} className="group rounded-2xl border border-dark-900/[0.06] bg-warm-50 p-4 open:bg-white open:shadow-sm">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-dark-900">
                    {fill(f.q)}
                    <ArrowRight className="h-4 w-4 shrink-0 text-brand-500 transition-transform group-open:rotate-90" />
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-dark-900/55">{fill(f.a)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Trust + CTA ── */}
        <section className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid items-center gap-6 rounded-3xl border border-dark-900/[0.06] bg-white p-6 shadow-sm sm:grid-cols-[1fr_auto] sm:p-8">
            <div>
              <h2 className="text-xl font-bold text-dark-900 sm:text-2xl">
                Order anything from {m.name} today
              </h2>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-dark-900/50">
                <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-brand-500" /> Inspection photos before shipping</span>
                <span className="inline-flex items-center gap-1.5"><BadgeCheck className="h-4 w-4 text-brand-500" /> Fixed USD quotes</span>
              </div>
            </div>
            <a href={waLink(`Hello ChinaSuuq, I want to order from ${m.name}`)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#25D366]/25 transition-all hover:bg-[#1fb857] active:scale-[0.97]">
              <MessageCircle className="h-4 w-4" />
              Chat to order
            </a>
          </div>

          {/* Other marketplaces */}
          <div className="mt-10">
            <h3 className="text-sm font-bold uppercase tracking-wider text-dark-900/40">
              Other marketplaces
            </h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {others.map((o) => (
                <Link
                  key={o.id}
                  href={`/marketplaces/${o.id}`}
                  className="group flex items-center gap-3 rounded-2xl border border-dark-900/[0.06] bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-warm-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={o.icon} alt={o.name} className="h-8 w-8 object-contain" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-dark-900">{o.name}</p>
                    <p className="truncate text-xs text-dark-900/45">{o.tagline}</p>
                  </div>
                  <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-dark-900/30 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500" />
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppFAB />
    </div>
  );
}
