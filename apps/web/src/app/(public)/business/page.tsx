"use client";

import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import WhatsAppFAB from "@/components/landing/WhatsAppFAB";
import { motion } from "framer-motion";
import Image from "next/image";
import {
  ArrowRight, BadgePercent, Boxes, CheckCircle2, ClipboardCheck,
  MessageCircle, Package, Truck, UserCheck,
} from "lucide-react";

const WA_NUMBER = "8615277074143";
const waLink = (text: string) =>
  `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;

const BENEFITS = [
  "Dedicated sourcing agent for your business",
  "Volume discounts on large orders",
  "Priority warehouse processing",
  "Custom manufacturing sourcing",
  "Consolidated multi-supplier orders",
  "Business account management",
  "Flexible payment terms",
  "Detailed cost breakdowns",
];

const STEPS = [
  { icon: UserCheck, title: "Tell us your business", text: "What you sell, your budget and monthly volume — we match a dedicated agent." },
  { icon: ClipboardCheck, title: "Get a sourcing plan", text: "Product options, unit prices and freight costs in one clear USD quote." },
  { icon: Boxes, title: "We buy & consolidate", text: "Orders from any marketplace arrive at our warehouse, inspected and packed." },
  { icon: Truck, title: "Restock on schedule", text: "Standing air or sea shipments so your shelves never go empty." },
];

export default function BusinessPage() {
  return (
    <main className="min-h-screen bg-warm-50">
      <Header />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 right-[-10%] h-[560px] w-[560px] rounded-full bg-brand-500/[0.08] blur-3xl" />
          <div className="absolute -bottom-32 left-[-8%] h-[420px] w-[420px] rounded-full bg-brand-500/[0.05] blur-3xl" />
        </div>
        <div className="relative mx-auto grid max-w-[1280px] items-center gap-12 px-4 pb-16 pt-28 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:pb-24 lg:pt-36">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-600">
              <BadgePercent className="h-3.5 w-3.5" />
              Business &amp; Wholesale
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.08] tracking-tight text-dark-900 sm:text-5xl">
              Source products for your business,{" "}
              <span className="text-brand-500">at wholesale prices.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-dark-900/60 sm:text-lg">
              Whether you run a shop, market stall or online store, ChinaSuuq
              gives you a dedicated agent, volume pricing and consolidated
              shipments from every major Chinese marketplace.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href={waLink("Hello ChinaSuuq, I have a business and want wholesale pricing")} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition-all hover:bg-brand-600 active:scale-[0.97]">
                <MessageCircle className="h-4 w-4" />
                Talk to our business team
              </a>
              <a href="#benefits" className="inline-flex items-center gap-2 rounded-xl border border-dark-900/10 bg-white px-6 py-3.5 text-sm font-semibold text-dark-900/70 transition-all hover:border-brand-500/40 hover:text-brand-600 active:scale-[0.97]">
                See benefits
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96, x: 30 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ duration: 0.65, delay: 0.15, ease: "easeOut" }}
            className="relative mx-auto w-full max-w-[540px]"
          >
            <div className="absolute inset-8 rounded-[3rem] bg-brand-500/20 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2.5rem] border border-brand-500/10 bg-white p-3 shadow-2xl shadow-brand-500/15">
              <Image
                src="/images/pages/business-wholesale.png"
                alt="ChinaSuuq business wholesale sourcing"
                width={1024}
                height={1024}
                priority
                className="aspect-square w-full rounded-[2rem] object-cover"
              />
            </div>
            <motion.div
              animate={{ y: [-8, 8, -8] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -right-3 top-10 rounded-2xl border border-dark-900/5 bg-white/95 p-3.5 shadow-xl shadow-dark-900/10 backdrop-blur-sm"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500">
                  <Package className="h-4.5 w-4.5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-dark-900">Volume discounts</p>
                  <p className="text-[11px] text-dark-900/50">up to 30% on bulk</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Benefits ── */}
      <section id="benefits" className="scroll-mt-20 border-y border-dark-900/[0.04] bg-white px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-[1280px]">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-dark-900 sm:text-3xl">Built for growing businesses</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-dark-900/50">
              Everything a reseller needs to buy from China with confidence.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {BENEFITS.map((b, i) => (
              <motion.div
                key={b}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: (i % 4) * 0.07 }}
                className="flex items-start gap-3 rounded-2xl border border-dark-900/[0.06] bg-warm-50 p-4"
              >
                <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand-500" />
                <p className="text-sm font-medium leading-snug text-dark-900/75">{b}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-[1280px]">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-dark-900 sm:text-3xl">Your supply chain in four steps</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-dark-900/50">
              One agent, one invoice, one consolidated shipment — every time.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="relative rounded-3xl border border-dark-900/[0.06] bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
              >
                <span className="absolute right-5 top-4 text-4xl font-extrabold text-brand-500/10">{i + 1}</span>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/10">
                  <s.icon className="h-5 w-5 text-brand-500" />
                </div>
                <h3 className="mt-4 text-sm font-bold text-dark-900">{s.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-dark-900/50">{s.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="px-4 pb-16 sm:px-6 lg:px-8 lg:pb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative mx-auto max-w-[1100px] overflow-hidden rounded-[2.5rem] bg-dark-900 p-8 text-center sm:p-14"
        >
          <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-brand-500/25 blur-3xl" />
          <div className="absolute -bottom-28 -right-16 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl" />
          <h2 className="relative text-2xl font-bold text-white sm:text-3xl">
            Ready to scale your sourcing?
          </h2>
          <p className="relative mx-auto mt-2 max-w-lg text-sm text-white/60">
            Message our business team — get a wholesale quote for your first container this week.
          </p>
          <a href={waLink("Hello ChinaSuuq, I want a wholesale quote for my business")} target="_blank" rel="noopener noreferrer" className="relative mt-6 inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#25D366]/30 transition-all hover:bg-[#1fb857] active:scale-[0.97]">
            <MessageCircle className="h-4 w-4" />
            Start on WhatsApp
          </a>
        </motion.div>
      </section>

      <Footer />
      <WhatsAppFAB />
    </main>
  );
}
