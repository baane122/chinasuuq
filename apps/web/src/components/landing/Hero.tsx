"use client";

import { useI18n } from "@/lib/i18n";
import { motion, type Variants } from "framer-motion";
import SearchBar from "./SearchBar";
import {
  ShieldCheck,
  ClipboardCheck,
  Plane,
  Headphones,
  ArrowRight,
  MessageCircle,
  Package,
  ShoppingBag,
  Smartphone,
} from "lucide-react";

const trustItems = [
  { icon: ShieldCheck, key: "trust.secure" },
  { icon: ClipboardCheck, key: "trust.inspection" },
  { icon: Plane, key: "trust.airSea" },
  { icon: Headphones, key: "trust.support" },
];



const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" as const },
  }),
};

export default function Hero() {
  const { t } = useI18n();

  return (
    <section className="relative min-h-[92vh] flex items-center overflow-hidden bg-gradient-to-br from-warm-50 via-white to-warm-200/30">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-brand-500/[0.03] blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-[400px] h-[400px] rounded-full bg-brand-400/[0.04] blur-3xl" />
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `radial-gradient(circle, #111 1px, transparent 1px)`,
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 w-full pt-24 pb-12 lg:pt-28 lg:pb-20">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left - Content */}
          <div className="max-w-xl">
            {/* Badge */}
            <motion.div
              custom={0}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="inline-flex items-center gap-2 bg-brand-500/8 border border-brand-500/15 rounded-full px-4 py-1.5 mb-6"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500" />
              </span>
              <span className="text-xs font-semibold text-brand-600 tracking-wide uppercase">
                China → Somalia
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              custom={1}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="text-4xl sm:text-5xl lg:text-[3.4rem] font-bold tracking-tight leading-[1.1] text-dark-900 mb-5 text-balance"
            >
              {t("hero.title")}
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              custom={2}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="text-base sm:text-lg text-dark-900/60 leading-relaxed mb-8 max-w-lg"
            >
              {t("hero.subtitle")}
            </motion.p>

            {/* CTAs */}
            <motion.div
              custom={3}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="flex flex-wrap gap-3 mb-8"
            >
              <a
                href="#categories"
                className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-7 py-3.5 rounded-xl transition-all duration-200 active:scale-[0.97] shadow-md shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-500/25"
              >
                {t("hero.cta1")}
                <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href="https://wa.me/8615277074143"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-dark-900 hover:bg-dark-800 text-white font-semibold px-7 py-3.5 rounded-xl transition-all duration-200 active:scale-[0.97]"
              >
                <MessageCircle className="w-4 h-4" />
                {t("hero.cta2")}
              </a>
            </motion.div>

            {/* Search Bar */}
            <motion.div
              custom={4}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
            >
              <SearchBar />
            </motion.div>

            {/* Trust Badges */}
            <motion.div
              custom={5}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="flex flex-wrap gap-x-5 gap-y-3 mt-7"
            >
              {trustItems.map((item) => (
                <div key={item.key} className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-brand-500/10">
                    <item.icon className="w-3.5 h-3.5 text-brand-500" />
                  </div>
                  <span className="text-xs font-medium text-dark-900/50">
                    {t(item.key)}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right - Visual */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, x: 40 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
            className="relative hidden lg:flex items-center justify-center"
          >
            {/* Phone Mockup */}
            <div className="relative z-10">
              <div className="w-[280px] h-[560px] bg-dark-900 rounded-[3rem] p-3 shadow-2xl shadow-dark-900/20">
                <div className="w-full h-full bg-gradient-to-b from-brand-500/20 to-warm-200 rounded-[2.5rem] overflow-hidden border border-dark-900/10 relative">
                  {/* Status bar */}
                  <div className="flex items-center justify-between px-6 pt-3">
                    <span className="text-[10px] font-semibold text-dark-900/40">
                      9:41
                    </span>
                    <div className="w-16 h-5 bg-dark-900 rounded-full" />
                    <div className="flex gap-1">
                      <div className="w-3 h-2 bg-dark-900/30 rounded-sm" />
                    </div>
                  </div>
                  {/* App content mock */}
                  <div className="px-5 pt-8 space-y-4">
                    <div className="bg-white/70 rounded-2xl p-4 shadow-sm">
                      <div className="w-3/4 h-3 bg-dark-900/10 rounded-full mb-2" />
                      <div className="w-1/2 h-2 bg-brand-500/20 rounded-full mb-3" />
                      <div className="grid grid-cols-2 gap-2">
                        <div className="h-16 bg-brand-500/10 rounded-xl" />
                        <div className="h-16 bg-brand-500/10 rounded-xl" />
                        <div className="h-16 bg-brand-500/10 rounded-xl" />
                        <div className="h-16 bg-brand-500/10 rounded-xl" />
                      </div>
                    </div>
                    <div className="bg-white/70 rounded-2xl p-4 shadow-sm">
                      <div className="w-2/3 h-3 bg-dark-900/10 rounded-full mb-2" />
                      <div className="w-full h-2 bg-dark-900/5 rounded-full mb-1.5" />
                      <div className="w-4/5 h-2 bg-dark-900/5 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating Elements */}
            {/* Package 1 */}
            <motion.div
              animate={{ y: [-8, 8, -8] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-4 -left-12 z-20"
            >
              <div className="w-16 h-16 bg-white rounded-2xl shadow-lg shadow-dark-900/8 flex items-center justify-center border border-dark-900/5">
                <Package className="w-7 h-7 text-brand-500" />
              </div>
            </motion.div>

            {/* Shopping Bag */}
            <motion.div
              animate={{ y: [6, -6, 6] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              className="absolute top-20 -right-16 z-20"
            >
              <div className="w-14 h-14 bg-white rounded-2xl shadow-lg shadow-dark-900/8 flex items-center justify-center border border-dark-900/5">
                <ShoppingBag className="w-6 h-6 text-brand-500" />
              </div>
            </motion.div>

            {/* Airplane */}
            <motion.div
              animate={{ y: [-5, 5, -5], rotate: [0, 5, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              className="absolute -bottom-8 -left-8 z-20"
            >
              <div className="w-16 h-16 bg-white rounded-2xl shadow-lg shadow-dark-900/8 flex items-center justify-center border border-dark-900/5">
                <Plane className="w-7 h-7 text-brand-500 -rotate-12" />
              </div>
            </motion.div>

            {/* Phone device icon */}
            <motion.div
              animate={{ y: [4, -4, 4] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
              className="absolute -bottom-4 right-0 z-20"
            >
              <div className="w-12 h-12 bg-brand-500 rounded-xl shadow-lg shadow-brand-500/20 flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-white" />
              </div>
            </motion.div>

            {/* Decorative rings */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[400px] h-[400px] rounded-full border border-brand-500/5" />
              <div className="absolute w-[520px] h-[520px] rounded-full border border-brand-500/[0.03]" />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
