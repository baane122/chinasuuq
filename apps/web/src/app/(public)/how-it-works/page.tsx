"use client";

import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import WhatsAppFAB from "@/components/landing/WhatsAppFAB";
import { useI18n } from "@/lib/i18n";
import { motion } from "framer-motion";
import Image from "next/image";
import {
  ArrowRight,
  Smartphone,
  Globe,
  Sparkles,
  CheckCircle2,
  MapPin,
  Plane,
  Truck,
  Home as HomeIcon,
  Search,
} from "lucide-react";

const STEPS = [
  { key: "step1", img: "/images/how-v2/01-browse.png", glow: "from-brand-500/30 to-brand-400/0", accent: "from-brand-500 to-brand-600" },
  { key: "step2", img: "/images/how-v2/02-capture.png", glow: "from-brand-400/30 to-amber-400/0", accent: "from-brand-400 to-brand-500" },
  { key: "step3", img: "/images/how-v2/03-customize.png", glow: "from-purple-500/25 to-brand-400/0", accent: "from-dark-900 to-dark-800" },
  { key: "step4", img: "/images/how-v2/04-pay.png", glow: "from-emerald-500/30 to-emerald-400/0", accent: "from-emerald-500 to-emerald-600" },
  { key: "step5", img: "/images/how-v2/05-track.png", glow: "from-sky-500/25 to-brand-400/0", accent: "from-brand-500 to-brand-600" },
  { key: "step6", img: "/images/how-v2/06-receive.png", glow: "from-warm-200/40 to-brand-200/0", accent: "from-warm-200 to-warm-100" },
] as const;

const PLATFORMS = [
  { name: "1688", img: "/images/marketplaces/1688.png" },
  { name: "Taobao", img: "/images/marketplaces/taobao.png" },
  { name: "YiwuGo", img: "/images/marketplaces/yiwugo.png" },
  { name: "Alibaba", img: "/images/marketplaces/alibaba.png" },
  { name: "ChinaGoods", img: "/images/marketplaces/chinagoods.png" },
  { name: "JD", img: "/images/marketplaces/jd.png" },
];

// Step mini-icons shown in the side rail (lucide — fallback for visual rhythm)
const MINI_ICONS = [Search, Sparkles, Globe, CheckCircle2, Plane, HomeIcon];

export default function HowItWorksPage() {
  const { t, locale } = useI18n();

  return (
    <main className="min-h-screen bg-warm-50">
      <Header />

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative pt-28 pb-12 lg:pt-36 lg:pb-16 overflow-hidden">
        {/* Background blobs */}
        <div className="pointer-events-none absolute inset-0 opacity-50">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-brand-500/[0.06] blur-3xl" />
          <div className="absolute top-40 right-0 w-[500px] h-[500px] rounded-full bg-warm-200/50 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 text-center">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 rounded-full bg-brand-500/10 border border-brand-500/20 px-4 py-1.5 mb-5 text-xs font-semibold text-brand-600 tracking-wider uppercase"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {t("howItWorks.eyebrow")}
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.5 }}
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-dark-900 mb-5 text-balance leading-[1.05]"
          >
            {t("howItWorks.title")}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="text-base sm:text-lg text-dark-900/60 max-w-2xl mx-auto leading-relaxed mb-8"
          >
            {t("howItWorks.subtitle")}
          </motion.p>

          {/* 6 marketplace chips */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5 }}
            className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 max-w-3xl mx-auto"
          >
            {PLATFORMS.map((p) => (
              <div
                key={p.name}
                className="flex items-center gap-1.5 sm:gap-2 rounded-full bg-white border border-dark-900/8 px-3 py-1.5 shadow-sm"
              >
                <Image
                  src={p.img}
                  alt={p.name}
                  width={20}
                  height={20}
                  loading="lazy"
                  decoding="async"
                  className="w-5 h-5 rounded"
                />
                <span className="text-xs sm:text-sm font-semibold text-dark-900">
                  {p.name}
                </span>
              </div>
            ))}
            <span className="text-xs sm:text-sm text-dark-900/50 italic px-2">
              {t("howItWorks.platforms")}
            </span>
          </motion.div>
        </div>
      </section>

      {/* ── Big Featured Timeline ──────────────────────────────── */}
      <section className="relative px-4 sm:px-6 lg:px-8 py-8 lg:py-16">
        <div className="mx-auto max-w-[1280px]">
          {STEPS.map((step, i) => {
            const MiniIcon = MINI_ICONS[i];
            const isEven = i % 2 === 0;
            return (
              <motion.div
                key={step.key}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.55, delay: 0.05 }}
                className={`relative grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-center py-10 lg:py-16 ${
                  i !== STEPS.length - 1 ? "border-b border-dark-900/5" : ""
                }`}
              >
                {/* Big number ribbon */}
                <div className="absolute -top-4 left-0 lg:left-1/2 lg:-translate-x-1/2 inline-flex items-center gap-2 rounded-full bg-warm-100 border border-dark-900/5 px-4 py-1.5 z-10">
                  <span className="text-xs font-bold text-brand-500 tracking-wider">
                    STEP
                  </span>
                  <span className="text-base font-bold text-dark-900 tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-xs text-dark-900/40">/ 06</span>
                </div>

                {/* 3D icon block */}
                <div
                  className={`lg:col-span-6 ${
                    isEven ? "lg:order-1" : "lg:order-2"
                  } order-1`}
                >
                  <div className="relative group">
                    {/* Glow behind image */}
                    <div
                      className={`absolute inset-0 rounded-[3rem] bg-gradient-to-br ${step.glow} blur-2xl opacity-60 group-hover:opacity-90 transition-opacity duration-500`}
                    />
                    <div
                      className={`relative rounded-[2.5rem] bg-gradient-to-br ${step.accent} p-6 sm:p-8 shadow-2xl overflow-hidden`}
                    >
                      <Image
                        src={step.img}
                        alt={t(`howItWorks.${step.key}Title`)}
                        width={720}
                        height={720}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-auto object-contain aspect-square transition-transform duration-500 group-hover:scale-105"
                      />
                      {/* Soft gloss overlay */}
                      <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/8 to-white/0 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Content block */}
                <div
                  className={`lg:col-span-6 ${
                    isEven ? "lg:order-2" : "lg:order-1"
                  } order-2`}
                >
                  <div className="flex items-center gap-2.5 mb-3">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${step.accent} text-white shadow-md`}
                    >
                      <MiniIcon className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-brand-500">
                      {t("howItWorks.eyebrow")} · {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>

                  <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-dark-900 mb-4 leading-tight text-balance">
                    {t(`howItWorks.${step.key}Title`)}
                  </h2>

                  <p className="text-base sm:text-lg text-dark-900/60 leading-relaxed">
                    {t(`howItWorks.${step.key}Desc`)}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ── Delivery Route (visual summary) ─────────────────────── */}
      <section className="px-4 sm:px-6 lg:px-8 py-12 lg:py-20">
        <div className="mx-auto max-w-[1100px]">
          <div className="text-center mb-10">
            <span className="inline-flex items-center gap-2 rounded-full bg-dark-900/5 border border-dark-900/8 px-4 py-1.5 mb-3 text-xs font-semibold text-dark-900/70 tracking-wider uppercase">
              <Truck className="w-3.5 h-3.5" />
              {locale === "en" ? "The Route" : "Jadwalka"}
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-dark-900">
              {locale === "en"
                ? "From our China warehouse to your door"
                : "Bakhaarkayaga Shiinaha ilaa albaabkaaga"}
            </h2>
          </div>

          <div className="relative rounded-3xl bg-white border border-dark-900/5 p-6 sm:p-8 shadow-sm">
            {/* Connector line */}
            <div className="absolute top-1/2 left-0 right-0 h-1 bg-gradient-to-r from-brand-500/0 via-brand-500/30 to-brand-500/0 -translate-y-1/2 hidden sm:block" />

            <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-4">
              {[
                { icon: MapPin, label: locale === "en" ? "Yiwu, China" : "Yiwu, Shiinaha", sub: locale === "en" ? "Warehouse" : "Bakhaar" },
                { icon: Plane, label: locale === "en" ? "Air Freight" : "Diyaarad", sub: locale === "en" ? "7–14 days" : "7–14 maalmood" },
                { icon: Truck, label: locale === "en" ? "Hargeisa Branch" : "Bakhaarka Hargeisa", sub: locale === "en" ? "Customs + pickup" : "Canshuur + qaadasho" },
                { icon: HomeIcon, label: locale === "en" ? "Your Door" : "Albaabkaaga", sub: locale === "en" ? "Delivery" : "Keenid" },
              ].map((node, i) => (
                <div key={i} className="flex flex-col items-center text-center">
                  <div className="relative h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/30 mb-3">
                    <node.icon className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
                  </div>
                  <p className="text-sm font-bold text-dark-900">{node.label}</p>
                  <p className="text-xs text-dark-900/50">{node.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA strip ─────────────────────────────────────── */}
      <section className="px-4 sm:px-6 lg:px-8 py-12 lg:py-20">
        <div className="mx-auto max-w-[1100px]">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900 p-8 sm:p-10 lg:p-14">
            {/* Glow */}
            <div className="pointer-events-none absolute inset-0 opacity-40">
              <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-brand-500/40 blur-3xl" />
              <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-brand-400/30 blur-2xl" />
            </div>

            <div className="relative flex flex-col md:flex-row items-center gap-8">
              <div className="flex-1 text-center md:text-left">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-3 py-1 mb-3 text-[11px] font-semibold text-white/80 tracking-wider uppercase">
                  <Smartphone className="w-3 h-3" />
                  {locale === "en" ? "Get Started" : "Bilow"}
                </span>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3 leading-tight">
                  {locale === "en"
                    ? "Ready to shop China the smart way?"
                    : "Ma jeceshahay inaad Shiinaha ka iibsato si xirfad leh?"}
                </h2>
                <p className="text-sm sm:text-base text-white/60 max-w-xl">
                  {locale === "en"
                    ? "Download the app and start browsing 6 Chinese marketplaces today. We handle the buying, inspection, and delivery to Hargeisa."
                    : "Degso abka oo bilow inaad ka eegto 6 suuq oo Shiinaha ah. Annaga ayaa qabanaa iibinta, hubinta, iyo keenista."}
                </p>
              </div>
              <a
                href="#download"
                className="flex items-center gap-2 rounded-2xl bg-brand-500 hover:bg-brand-600 text-white font-semibold px-7 py-4 shadow-lg shadow-brand-500/30 hover:shadow-xl hover:shadow-brand-500/40 transition-all active:scale-[0.98] shrink-0"
              >
                <Smartphone className="w-4 h-4" />
                {t("howItWorks.cta")}
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <Footer />
      <WhatsAppFAB />
    </main>
  );
}
