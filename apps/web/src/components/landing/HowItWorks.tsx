'use client';

import { useI18n } from "@/lib/i18n";
import { motion } from "framer-motion";
import {
  Search,
  Store,
  ClipboardCheck,
  PackageCheck,
  Truck,
  Home,
} from "lucide-react";

const steps = [
  { icon: Search, key: "step1", en: "Search or paste a link", so: "Raadi ama geli link", desc: "Keyword, link, Somali/English or Chinese", img: "/images/marketing/sourcing.png" },
  { icon: Store, key: "step2", en: "We source from China", so: "Waxaan ka helaa Shiinaha", desc: "1688, Taobao, YiwuGo — factory-direct", img: "/images/marketing/sourcing.png" },
  { icon: ClipboardCheck, key: "step3", en: "Inspect & verify", so: "Hubi & xaqiiji", desc: "Quality check + photos at our warehouse", img: "/images/marketing/inspection.png" },
  { icon: PackageCheck, key: "step4", en: "Consolidate & ship", so: "Isku dar & dir", desc: "Air or sea, packed and billed transparently", img: "/images/marketing/sourcing.png" },
  { icon: Truck, key: "step5", en: "Arrive in Somalia", so: "Imaad Soomaaliya", desc: "Customs clearance + branch processing", img: "/images/marketing/delivery-somalia.png" },
  { icon: Home, key: "step6", en: "Delivered to your door", so: "Geey albaabkaaga", desc: "Collect or doorstep delivery nationwide", img: "/images/marketing/delivery-somalia.png" },
];

export default function HowItWorks() {
  const { t, locale } = useI18n();

  return (
    <section id="how-it-works" className="px-4 sm:px-6 lg:px-8 py-16 lg:py-24 bg-white">
      <div className="mx-auto max-w-[1280px]">
        <div className="text-center mb-14">
          <span className="text-xs font-semibold text-brand-600 tracking-wider uppercase mb-2 inline-block">How it works</span>
          <h2 className="text-3xl sm:text-4xl font-bold text-dark-900 mb-3">
            {locale === "en" ? "From China to Your Door in 6 Steps" : "Shiinaha ilaa Albaabkaaga 6 Tallaabo"}
          </h2>
          <p className="text-base text-dark-900/50 max-w-xl mx-auto">
            {locale === "en" ? "We handle the sourcing, inspection, and logistics — you just shop." : "Waxaan maamulnaa raadinta, hubinta, iyo gaarsiinta — adiga waa aad iibsataa."}
          </p>
        </div>

        <div className="relative">
          {/* Connector line - desktop */}
          <div className="hidden lg:block absolute top-8 left-[10%] right-[10%] h-0.5 bg-gradient-to-r from-brand-500/30 via-brand-500/50 to-brand-500/30" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {steps.map((step, i) => (
              <motion.div
                key={step.key}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{ delay: i * 0.08, duration: 0.45 }}
                whileHover={{ y: -5 }}
                className="group relative flex flex-col items-center text-center bg-warm-50 rounded-3xl p-7 border border-dark-900/5 hover:border-brand-500/20 hover:shadow-xl hover:shadow-brand-500/10 transition-all duration-300"
              >
                {/* Step number + icon */}
                <div className="relative mb-5">
                  <div className="w-16 h-16 rounded-2xl bg-white border border-dark-900/5 flex items-center justify-center shadow-sm group-hover:bg-brand-500 group-hover:border-brand-500 group-hover:shadow-lg group-hover:shadow-brand-500/20 transition-all duration-300">
                    <step.icon className="w-7 h-7 text-brand-500 group-hover:text-white transition-colors" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center text-white text-[11px] font-bold shadow-md shadow-brand-500/30">
                    {i + 1}
                  </div>
                </div>

                {/* Image thumb */}
                <img
                  src={step.img}
                  alt={locale === "en" ? step.en : step.so}
                  className="w-full h-28 object-cover rounded-2xl mb-4 group-hover:scale-[1.02] transition-transform duration-500"
                  loading="lazy"
                />

                <h3 className="text-base font-bold text-dark-900 mb-1">
                  {locale === "en" ? step.en : step.so}
                </h3>
                <p className="text-xs text-dark-900/50">
                  {step.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
