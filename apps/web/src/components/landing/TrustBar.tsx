'use client';

import { useI18n } from "@/lib/i18n";
import { motion, useInView } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import {
  Globe,
  Wallet,
  ShieldCheck,
  Plane,
  Truck,
  BadgePercent,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

const features = [
  {
    icon: Globe,
    key: "Direct Access",
    desc_en: "Direct access to 1688, Taobao, YiwuGo & more",
    desc_so: "Hel toos ah 1688, Taobao, YiwuGo iyo kuwo kale",
    bgColor: "bg-blue-500/10",
    iconColor: "text-blue-400",
  },
  {
    icon: Wallet,
    key: "Local Payments",
    desc_en: "EVC Plus, Zaad, Sahal & bank transfer",
    desc_so: "EVC Plus, Zaad, Sahal & transfer bank",
    bgColor: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
  },
  {
    icon: ShieldCheck,
    key: "Quality Check",
    desc_en: "Inspection at our China warehouse",
    desc_so: "Hubinta bakhaarka Shiinaha",
    bgColor: "bg-brand-500/10",
    iconColor: "text-brand-500",
  },
  {
    icon: Plane,
    key: "Air & Sea Cargo",
    desc_en: "Air in 7–14 days or sea in 25–35",
    desc_so: "Hawada 7–14 mal ama badda 25–35",
    bgColor: "bg-violet-500/10",
    iconColor: "text-violet-400",
  },
  {
    icon: Truck,
    key: "Door Delivery",
    desc_en: "Home & office delivery across Somalia",
    desc_so: "Gaarsiinta guriga & xafiiska Soomaaliya",
    bgColor: "bg-amber-500/10",
    iconColor: "text-amber-400",
  },
  {
    icon: BadgePercent,
    key: "Best Prices",
    desc_en: "Factory-direct with transparent fees",
    desc_so: "Warshad toos ah oo leh kharashar cad",
    bgColor: "bg-rose-500/10",
    iconColor: "text-rose-400",
  },
];

/* Product facts, not social-proof claims: 7 storefronts, 100% warehouse
   inspection, 24/7 WhatsApp support and the published freight windows. */
const stats = [
  { value: 7, suffix: "+", label_en: "Marketplaces", label_so: "Suuqyo" },
  { value: 100, suffix: "%", label_en: "Inspection", label_so: "Hubin" },
  { value: 24, suffix: "/7", label_en: "WhatsApp support", label_so: "Taageero WhatsApp" },
  { value: 35, suffix: "", label_en: "Days max — sea", label_so: "Maalmood ugu badan" },
];

function AnimatedCounter({ end, duration = 2 }: { end: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const increment = end / (duration * 60);
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 1000 / 60);
    return () => clearInterval(timer);
  }, [inView, end, duration]);

  return <span ref={ref}>{count}</span>;
}

export default function TrustBar() {
  const { locale } = useI18n();
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" });

  return (
    <section ref={sectionRef} className="relative bg-dark-900 px-4 sm:px-6 lg:px-8 py-16 lg:py-24 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-brand-500/5 blur-3xl rounded-full" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-brand-500/3 blur-3xl rounded-full" />
      </div>

      <div className="relative mx-auto max-w-[1280px]">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-500/15 border border-brand-500/20 px-4 py-1.5 text-xs font-semibold text-brand-400 uppercase tracking-wider mb-4">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {locale === "en" ? "Your sourcing agent in China" : "Wakiilka iibsiga Shiinaha"}
          </span>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3">
            {locale === "en"
              ? "Why Somali Shoppers Choose ChinaSuuq"
              : "Maxay Soomaaligu u doorbidaan ChinaSuuq"}
          </h2>
          <p className="text-sm text-white/55 max-w-lg mx-auto">
            {locale === "en"
              ? "End-to-end sourcing, inspection, and delivery — all in one platform"
              : "Iibsiga, hubinta iyo gaarsiinta — dhammaan hal goos"}
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 lg:gap-5">
          {features.map((feat, i) => (
            <motion.div
              key={feat.key}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              whileHover={{ y: -8, scale: 1.02 }}
              className="group relative flex flex-col items-center text-center p-5 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-brand-500/20 hover:bg-white/[0.06] transition-all duration-300 cursor-default"
            >
              {/* Icon */}
              <div className={`w-14 h-14 rounded-2xl ${feat.bgColor} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                <feat.icon className={`w-6 h-6 ${feat.iconColor}`} />
              </div>

              {/* Title */}
              <h3 className="text-sm font-semibold text-white mb-1.5">
                {feat.key}
              </h3>

              {/* Description */}
              <p className="text-xs text-white/55 leading-relaxed">
                {locale === "en" ? feat.desc_en : feat.desc_so}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Bottom Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="mt-14 grid grid-cols-2 sm:grid-cols-4 gap-4"
        >
          {stats.map((stat, i) => (
            <div key={i} className="text-center p-4 rounded-xl bg-white/[0.03] border border-white/5">
              <div className="text-2xl sm:text-3xl font-bold text-brand-400">
                <AnimatedCounter end={stat.value} />
                {stat.suffix}
              </div>
              <div className="text-xs text-white/50 mt-1">
                {locale === "en" ? stat.label_en : stat.label_so}
              </div>
            </div>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="mt-12 text-center"
        >
          <Link
            href="/quote"
            className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-8 py-4 rounded-xl transition-all duration-200 shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30"
          >
            {locale === "en" ? "Get a Free Quote" : "Codso Cabaaresho Bilaash ah"}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
