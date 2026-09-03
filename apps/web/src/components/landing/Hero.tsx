"use client";

import { useI18n } from "@/lib/i18n";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import SearchBar from "./SearchBar";
import {
  ShieldCheck,
  ClipboardCheck,
  Plane,
  Headphones,
  ArrowRight,
  MessageCircle,
  PlayCircle,
  ShoppingBag,
  Star,
  ChevronRight,
  Zap,
  Truck,
  CheckCircle2,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const trustItems = [
  { icon: ShieldCheck, key: "trust.secure", en: "Secure payments", so: "Bixinta ammaan ah" },
  { icon: ClipboardCheck, key: "trust.inspection", en: "Warehouse inspection", so: "Hubinta bakhaarka" },
  { icon: Plane, key: "trust.airSea", en: "Air & sea cargo", so: "Xamuulka & hawada" },
  { icon: Headphones, key: "trust.support", en: "Local support", so: "Taageero deegaan" },
];

const steps = [
  { number: 1, en: "Search or paste a link", so: "Raadi ama geli link", icon: Zap },
  { number: 2, en: "We source & inspect", so: "Waxaan helaa oo hubinaa", icon: ClipboardCheck },
  { number: 3, en: "Ships to Somalia", so: "Waxaa loo diraa Soomaaliya", icon: Truck },
];

const platformChips = [
  { name: "1688", img: "/images/marketplaces/1688.png" },
  { name: "Taobao", img: "/images/marketplaces/taobao.png" },
  { name: "YiwuGo", img: "/images/marketplaces/yiwugo.png" },
  { name: "Alibaba", img: "/images/marketplaces/alibaba.png" },
  { name: "ChinaGoods", img: "/images/marketplaces/chinagoods.png" },
  { name: "JD", img: "/images/marketplaces/jd.png" },
];

const stats = [
  { value: "50M+", label_en: "Products", label_so: "Alaab" },
  { value: "6", label_en: "Platforms", label_so: "Suuqyo" },
  { value: "7-30", label_en: "Days delivery", label_so: "Maalmood" },
  { value: "24/7", label_en: "Support", label_so: "Taageero" },
];

function CountUp({ target, duration = 2 }: { target: string; duration?: number }) {
  const [display, setDisplay] = useState("0");
  const numericPart = target.replace(/[^0-9]/g, "");
  const suffix = target.replace(/[0-9]/g, "");

  useEffect(() => {
    const end = parseInt(numericPart);
    if (isNaN(end)) { setDisplay(target); return; }
    let start = 0;
    const increment = end / (duration * 60);
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setDisplay(target);
        clearInterval(timer);
      } else {
        setDisplay(Math.floor(start) + suffix);
      }
    }, 1000 / 60);
    return () => clearInterval(timer);
  }, [target, numericPart, suffix, duration]);

  return <span>{display}</span>;
}

export default function Hero() {
  const { t, locale } = useI18n();
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);

  return (
    <section className="relative min-h-[100vh] flex items-center overflow-hidden bg-warm-50">
      {/* ── Layered Background ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Warm gradient base */}
        <div className="absolute inset-0 bg-gradient-to-br from-warm-50 via-white to-warm-100/80" />

        {/* Organic gradient blobs */}
        <motion.div
          animate={{ scale: [1, 1.1, 1], rotate: [0, 5, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-brand-400/8 to-brand-500/4 blur-3xl"
        />
        <motion.div
          animate={{ scale: [1, 1.15, 1], rotate: [0, -5, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-gradient-to-tr from-brand-500/6 to-warm-200/40 blur-3xl"
        />

        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `radial-gradient(circle, #111 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        />

        {/* Decorative floating elements */}
        <motion.div
          animate={{ y: [-10, 10, -10], x: [-5, 5, -5] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/4 right-[15%] w-3 h-3 rounded-full bg-brand-400/20"
        />
        <motion.div
          animate={{ y: [8, -8, 8], x: [5, -5, 5] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute top-1/3 left-[10%] w-2 h-2 rounded-full bg-brand-500/15"
        />
        <motion.div
          animate={{ y: [-6, 6, -6] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 3 }}
          className="absolute bottom-1/3 right-[20%] w-4 h-4 rounded-full border border-brand-400/10"
        />
      </div>

      <div className="relative mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 w-full pt-24 pb-12 sm:pt-28 sm:pb-16 lg:pt-32 lg:pb-24">
        {/* ── Stats Bar ── */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex justify-center mb-10"
        >
          <div className="inline-flex items-center gap-6 sm:gap-10 bg-white/80 backdrop-blur-sm rounded-2xl px-6 py-3 shadow-sm border border-dark-900/5">
            {stats.map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-lg sm:text-xl font-bold text-brand-500">
                  <CountUp target={stat.value} />
                </div>
                <div className="text-[10px] sm:text-xs text-dark-900/50 font-medium">
                  {locale === "en" ? stat.label_en : stat.label_so}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* ── Left - Content ── */}
          <div className="max-w-2xl">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
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
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl sm:text-5xl lg:text-[3.6rem] font-bold tracking-tight leading-[1.08] text-dark-900 mb-5 text-balance"
            >
              {locale === "en" ? (
                <>
                  Millions of Products from China,{" "}
                  <span className="relative inline-block">
                    <span className="relative z-10 text-brand-500">Delivered to Somalia.</span>
                    <motion.span
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.8, delay: 0.8, ease: "easeOut" }}
                      className="absolute bottom-1 left-0 right-0 h-3 bg-brand-500/10 -z-0 origin-left rounded"
                    />
                  </span>
                </>
              ) : (
                <>
                  Malaayiin Alaabood oo Shiinaha ah,{" "}
                  <span className="text-brand-500">Laguugu Keeno Soomaaliya.</span>
                </>
              )}
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-base sm:text-lg text-dark-900/55 leading-relaxed mb-8 max-w-xl"
            >
              {locale === "en"
                ? "Browse 1688, Taobao, YiwuGo, Alibaba, ChinaGoods and JD in one place. See translated products and USD prices, pay with familiar Somali payment methods, and let ChinaSuuq handle purchasing, inspection, and delivery."
                : "Eeg 1688, Taobao, YiwuGo, Alibaba, ChinaGoods iyo JD hal meel. Arag alaab la turjumay iyo qiimaha USD, ku bixi hab-yada Soomaaliyeed, oo u daa ChinaSuuq inay maariso iibinta, hubinta, iyo gaarsiinta."}
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-wrap gap-3 mb-8"
            >
              <a
                href="#download"
                className="group inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-7 py-3.5 rounded-xl transition-all duration-200 active:scale-[0.97] shadow-md shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-500/30"
              >
                {locale === "en" ? "Start Shopping" : "Bilow Iibsiga"}
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </a>
              <a
                href="https://wa.me/8615277074143"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-[#25D366] hover:bg-[#1fb857] text-white font-semibold px-7 py-3.5 rounded-xl transition-all duration-200 active:scale-[0.97] shadow-md shadow-[#25D366]/20"
              >
                <MessageCircle className="w-4 h-4" />
                {locale === "en" ? "Order on WhatsApp" : "Ka Dalbo WhatsApp"}
              </a>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 bg-dark-900 hover:bg-dark-800 text-white font-semibold px-7 py-3.5 rounded-xl transition-all duration-200 active:scale-[0.97]"
              >
                <PlayCircle className="w-4 h-4" />
                {locale === "en" ? "How It Works" : "Sidaay U Shaqeyso"}
              </a>
            </motion.div>

            {/* Search Bar */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <SearchBar />
            </motion.div>

            {/* Step pills - modernized */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col sm:flex-row sm:items-center gap-3 mt-6"
            >
              {steps.map((s, i) => {
                const Icon = s.icon;
                return (
                  <div key={s.number} className="flex items-center gap-3">
                    <motion.div
                      onHoverStart={() => setHoveredStep(s.number)}
                      onHoverEnd={() => setHoveredStep(null)}
                      className={`flex items-center gap-2 text-xs font-medium rounded-xl px-3 py-2 transition-all duration-200 ${
                        hoveredStep === s.number
                          ? "bg-brand-500 text-white shadow-md shadow-brand-500/20"
                          : "bg-white border border-dark-900/8 text-dark-900/70"
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                        hoveredStep === s.number ? "bg-white/20" : "bg-brand-500/10"
                      }`}>
                        <Icon className={`w-3.5 h-3.5 ${
                          hoveredStep === s.number ? "text-white" : "text-brand-500"
                        }`} />
                      </div>
                      {locale === "en" ? s.en : s.so}
                    </motion.div>
                    {i < steps.length - 1 && (
                      <ChevronRight className="w-4 h-4 text-brand-500/40 hidden sm:block" />
                    )}
                  </div>
                );
              })}
            </motion.div>

            {/* Trust Badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="flex flex-wrap gap-x-5 gap-y-3 mt-7"
            >
              {trustItems.map((item) => (
                <div key={item.key} className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-brand-500/10">
                    <item.icon className="w-3.5 h-3.5 text-brand-500" />
                  </div>
                  <span className="text-xs font-medium text-dark-900/50">
                    {locale === "en" ? item.en : item.so}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* ── Right - Hero Visual ── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, x: 40 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
            className="relative flex items-center justify-center"
          >
            {/* Main hero image */}
            <div className="relative z-10">
              <div className="relative rounded-[2.5rem] overflow-hidden shadow-2xl shadow-brand-500/20 border border-brand-500/10">
                <Image
                  src="/images/hero/hero-main.png"
                  alt="ChinaSuuq shopping app"
                  width={720}
                  height={720}
                  className="w-full h-auto object-cover"
                  priority
                />
                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-dark-900/20 to-transparent" />
              </div>

              {/* Floating platform chips */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="absolute -top-5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-full p-2 shadow-lg shadow-dark-900/10 border border-dark-900/5 max-w-[92%] overflow-x-auto"
              >
                {platformChips.map((p) => (
                  <motion.div
                    key={p.name}
                    whileHover={{ scale: 1.05 }}
                    className="flex items-center gap-1 pl-1 pr-3 py-1 rounded-full bg-warm-100/80 hover:bg-warm-200/80 shrink-0 transition-colors cursor-default"
                  >
                    <img
                      src={p.img}
                      alt={p.name}
                      width={24}
                      height={24}
                      loading="lazy"
                      decoding="async"
                      className="w-6 h-6 rounded-md object-cover"
                    />
                    <span className="text-[11px] font-semibold text-dark-900">{p.name}</span>
                  </motion.div>
                ))}
              </motion.div>

              {/* Floating stat card - top right */}
              <motion.div
                animate={{ y: [-8, 8, -8] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -right-6 top-16 z-20"
              >
                <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl shadow-dark-900/10 border border-dark-900/5 p-3.5 min-w-[13rem]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center shadow-sm shadow-brand-500/30">
                      <ShoppingBag className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-dark-900">50M+ Products</div>
                      <div className="flex items-center gap-1 text-[11px] text-dark-900/50">
                        <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                        {locale === "en" ? "Across 6 top platforms" : "6 suuq oo koowaad"}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Floating stat card - bottom left */}
              <motion.div
                animate={{ y: [6, -6, 6] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                className="absolute -left-6 bottom-20 z-20"
              >
                <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl shadow-dark-900/10 border border-dark-900/5 p-3.5 min-w-[13rem]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#25D366] flex items-center justify-center shadow-sm shadow-[#25D366]/30">
                      <MessageCircle className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-dark-900">
                        {locale === "en" ? "Order via WhatsApp" : "Dalbo WhatsApp"}
                      </div>
                      <div className="text-[11px] text-dark-900/50">
                        {locale === "en" ? "7-day air · 30-day sea" : "7-mal hawada · 30-mal badda"}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Floating delivery card - bottom right */}
              <motion.div
                animate={{ y: [5, -5, 5], x: [-3, 3, -3] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="absolute -right-4 bottom-40 z-20 hidden lg:block"
              >
                <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl shadow-dark-900/10 border border-dark-900/5 p-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-dark-900">Delivered ✓</div>
                      <div className="text-[10px] text-dark-900/45">Hargeisa, Somalia</div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Decorative rings */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
                className="w-[440px] h-[440px] rounded-full border border-brand-500/5"
              />
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
                className="absolute w-[560px] h-[560px] rounded-full border border-brand-500/[0.03]"
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
