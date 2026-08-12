'use client';

import { useI18n } from "@/lib/i18n";
import { motion } from "framer-motion";
import { ArrowRight, Smartphone } from "lucide-react";
import Image from "next/image";

const STEPS = [
  {
    key: "step1",
    img: "/images/how-v2/01-browse.png",
    iconBg: "from-brand-500 to-brand-600",
    accent: "bg-brand-500",
  },
  {
    key: "step2",
    img: "/images/how-v2/02-capture.png",
    iconBg: "from-brand-400 to-brand-500",
    accent: "bg-brand-400",
  },
  {
    key: "step3",
    img: "/images/how-v2/03-customize.png",
    iconBg: "from-dark-900 to-dark-800",
    accent: "bg-dark-900",
  },
  {
    key: "step4",
    img: "/images/how-v2/04-pay.png",
    iconBg: "from-emerald-500 to-emerald-600",
    accent: "bg-emerald-500",
  },
  {
    key: "step5",
    img: "/images/how-v2/05-track.png",
    iconBg: "from-brand-500 to-brand-600",
    accent: "bg-brand-500",
  },
  {
    key: "step6",
    img: "/images/how-v2/06-receive.png",
    iconBg: "from-warm-200 to-warm-100",
    accent: "bg-warm-200",
  },
] as const;

// 6 Chinese marketplace platforms we integrate — used in the subtitle chip row
const PLATFORMS = [
  { name: "1688", img: "/images/marketplaces/1688.png" },
  { name: "Taobao", img: "/images/marketplaces/taobao.png" },
  { name: "YiwuGo", img: "/images/marketplaces/yiwugo.png" },
  { name: "Alibaba", img: "/images/marketplaces/alibaba.png" },
  { name: "ChinaGoods", img: "/images/marketplaces/chinagoods.png" },
  { name: "JD", img: "/images/marketplaces/jd.png" },
];

export default function HowItWorks() {
  const { t, locale } = useI18n();

  return (
    <section id="how-it-works" className="relative px-4 sm:px-6 lg:px-8 py-16 lg:py-24 bg-warm-50 overflow-hidden">
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.4]">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-brand-500/[0.05] blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-warm-200/[0.4] blur-2xl" />
      </div>

      <div className="relative mx-auto max-w-[1280px]">
        {/* Header */}
        <div className="text-center mb-12 lg:mb-16">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-500/10 border border-brand-500/20 px-4 py-1.5 mb-4 text-xs font-semibold text-brand-600 tracking-wider uppercase">
            <Smartphone className="w-3.5 h-3.5" />
            {t("howItWorks.eyebrow")}
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-dark-900 mb-4 text-balance leading-[1.1]">
            {t("howItWorks.title")}
          </h2>
          <p className="text-base sm:text-lg text-dark-900/60 max-w-2xl mx-auto leading-relaxed mb-6">
            {t("howItWorks.subtitle")}
          </p>

          {/* Platform chips row — visually shows the 6 marketplaces */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 max-w-3xl mx-auto">
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
            <span className="text-xs sm:text-sm text-dark-900/50 italic">
              {t("howItWorks.platforms")}
            </span>
          </div>
        </div>

        {/* Steps grid */}
        <div className="relative">
          {/* Vertical connector line on mobile, horizontal on desktop */}
          <div className="hidden lg:block absolute top-[88px] left-[8%] right-[8%] h-0.5 bg-gradient-to-r from-brand-500/0 via-brand-500/30 to-brand-500/0" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 lg:gap-8">
            {STEPS.map((step, i) => (
              <motion.article
                key={step.key}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ delay: (i % 3) * 0.1 + Math.floor(i / 3) * 0.05, duration: 0.5 }}
                whileHover={{ y: -6 }}
                className="group relative flex flex-col items-start bg-white rounded-3xl p-6 border border-dark-900/5 hover:border-brand-500/30 hover:shadow-2xl hover:shadow-brand-500/10 transition-all duration-300"
              >
                {/* Top row: 3D icon + step number */}
                <div className="relative w-full mb-5">
                  <div
                    className={`w-20 h-20 rounded-3xl bg-gradient-to-br ${step.iconBg} p-3.5 shadow-lg group-hover:scale-105 transition-transform duration-300`}
                  >
                    <Image
                      src={step.img}
                      alt={t(`howItWorks.${step.key}Title`)}
                      width={80}
                      height={80}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  {/* Step number badge */}
                  <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-dark-900 flex items-center justify-center text-white text-[12px] font-bold ring-4 ring-white">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                </div>

                {/* Title + description */}
                <h3 className="text-lg font-bold text-dark-900 mb-2 leading-snug">
                  {t(`howItWorks.${step.key}Title`)}
                </h3>
                <p className="text-sm text-dark-900/60 leading-relaxed">
                  {t(`howItWorks.${step.key}Desc`)}
                </p>

                {/* Hover indicator */}
                <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <span>{t("howItWorks.cta")}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </motion.article>
            ))}
          </div>
        </div>

        {/* Bottom CTA strip */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mt-12 lg:mt-16 relative overflow-hidden rounded-3xl bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900 p-8 sm:p-10 lg:p-12"
        >
          {/* Glow */}
          <div className="pointer-events-none absolute inset-0 opacity-30">
            <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-brand-500/40 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full bg-brand-400/20 blur-2xl" />
          </div>

          <div className="relative flex flex-col sm:flex-row items-center gap-6">
            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-2 leading-tight">
                {locale === "en"
                  ? "Ready to shop from China — the smart way?"
                  : "Ma jeceshahay inaad Shiinaha ka iibsato si xirfad leh?"}
              </h3>
              <p className="text-sm text-white/60 max-w-xl">
                {locale === "en"
                  ? "Download the app, browse 6 Chinese marketplaces, and we handle the buying, inspection, and delivery to your door in Hargeisa."
                  : "Degso abka, eeg 6 suuq oo Shiinaha ah, oo annaga ayaa qabanaa iibinta, hubinta, iyo keenista albaabka Hargeisa."}
              </p>
            </div>
            <a
              href="#download"
              className="flex items-center gap-2 rounded-2xl bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-3.5 shadow-lg shadow-brand-500/30 hover:shadow-xl hover:shadow-brand-500/40 transition-all active:scale-[0.98] shrink-0"
            >
              <Smartphone className="w-4 h-4" />
              {t("howItWorks.cta")}
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
