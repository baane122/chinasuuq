'use client';

import { useI18n } from "@/lib/i18n";
import { motion } from "framer-motion";
import Link from "next/link";
import { ChevronRight, Link as LinkIcon } from "lucide-react";

const marketplaces = [
  {
    key: "1688",
    img: "/images/marketplaces/1688.png",
    en: "China's #1 wholesale & factory marketplace",
    so: "Suuqa jumlada & warshadaha ee Shiinaha",
    desc: "Factory-direct pricing on millions of products. Bulk friendly.",
    highlight: "Wholesale",
  },
  {
    key: "taobao",
    img: "/images/marketplaces/taobao.png",
    en: "Retail giant — widest product selection",
    so: "Ganacsiga ugu weyn — alaabta ugu badan",
    desc: "Trending consumer goods from the world's largest marketplace.",
    highlight: "Retail",
  },
  {
    key: "yiwugo",
    img: "/images/marketplaces/yiwugo.png",
    en: "Gateway to Yiwu International Trade City",
    so: "Iridda Yiwu Caalamiga",
    desc: "World's largest small-commodities market. Best for retail & wholesale.",
    highlight: "Yiwu",
  },
];

export default function MarketplaceCards() {
  const { t, locale } = useI18n();

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-16 lg:py-24 bg-white">
      <div className="mx-auto max-w-[1280px]">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12">
          <div>
            <span className="text-xs font-semibold text-brand-600 tracking-wider uppercase mb-2 inline-block">Marketplaces</span>
            <h2 className="text-3xl sm:text-4xl font-bold text-dark-900 mb-2">
              {locale === "en" ? "Shop the Top Chinese Platforms" : "Suuqyada Ugu Fiican Shiinaha"}
            </h2>
            <p className="text-base text-dark-900/50 max-w-lg">
              {locale === "en" ? "One ChinaSuuq cart. Multiple marketplaces. Stress-free sourcing." : "Hal gaari ChinaSuuq ah. Suuqyo badan. Raadinta caajis la'aan ah."}
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {marketplaces.map((m, i) => (
            <motion.div
              key={m.key}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              whileHover={{ y: -6 }}
              className="group relative bg-gradient-to-b from-warm-50 to-white rounded-3xl border border-dark-900/5 hover:border-brand-500/25 p-6 overflow-hidden shadow-sm hover:shadow-xl hover:shadow-brand-500/10 transition-all duration-300"
            >
              {/* Highlight pill */}
              <div className="absolute top-5 left-5 bg-brand-500/10 text-brand-600 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                {m.highlight}
              </div>

              {/* Icon */}
              <div className="flex items-center justify-center w-full mb-6">
                <motion.div
                  whileHover={{ scale: 1.08, rotate: 2 }}
                  transition={{ type: "spring", stiffness: 300 }}
                  className="relative"
                >
                  <img src={m.img} alt={m.key} className="w-24 h-24 rounded-3xl object-cover shadow-lg shadow-dark-900/10" />
                  {/* Glow */}
                  <div className="absolute inset-0 rounded-3xl bg-brand-500/20 blur-2xl -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </motion.div>
              </div>

              {/* Text */}
              <h3 className="text-center text-xl font-bold text-dark-900 mb-2">{m.key}</h3>
              <p className="text-center text-sm text-dark-900/50 mb-4 leading-relaxed">
                {locale === "en" ? m.en : m.so}
              </p>
              <p className="text-center text-xs text-dark-900/40 mb-6">
                {m.desc}
              </p>

              {/* CTA */}
              <Link
                href="/categories"
                className="flex items-center justify-center gap-2 w-full bg-dark-900 hover:bg-dark-800 text-white text-sm font-semibold px-5 py-3 rounded-xl transition-colors"
              >
                {locale === "en" ? "Browse products" : "Eeg alaabta"}
                <ChevronRight className="w-4 h-4" />
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Disclaimer */}
        <p className="text-center text-xs text-dark-900/30 mt-8 max-w-xl mx-auto">
          ChinaSuuq is an independent sourcing service. Marketplace names are used for reference; we are not official partners unless formal agreements exist.
        </p>
      </div>
    </section>
  );
}
