'use client';

import { useI18n } from "@/lib/i18n";
import { motion } from "framer-motion";
import { ExternalLink, TrendingUp, Store, Sparkles, Tag } from "lucide-react";

const marketplaces = [
  {
    key: "1688",
    icon: Store,
    gradient: "from-orange-500 to-red-500",
    description: "Direct from factories. Bulk pricing, MOQ from 2 units.",
    items: "50M+ products",
  },
  {
    key: "taobao",
    icon: TrendingUp,
    gradient: "from-pink-500 to-rose-500",
    description: "Trending consumer goods. Single items welcome.",
    items: "100M+ products",
  },
  {
    key: "yiwugo",
    icon: Sparkles,
    gradient: "from-amber-500 to-orange-500",
    description: "Yiwu small commodities. Best for retail & wholesale.",
    items: "5M+ products",
  },
  {
    key: "deals",
    icon: Tag,
    gradient: "from-emerald-500 to-teal-500",
    description: "Verified ready-stock items. Fastest delivery to Somalia.",
    items: "New items weekly",
  },
];

export default function MarketplaceCards() {
  const { t } = useI18n();

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-16 lg:py-24 bg-warm-50">
      <div className="mx-auto max-w-[1280px]">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-dark-900 mb-3">
            {t("markets.title")}
          </h2>
          <p className="text-base text-dark-900/50 max-w-lg mx-auto">
            {t("markets.subtitle")}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {marketplaces.map((mp, i) => (
            <motion.div
              key={mp.key}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.08, duration: 0.45 }}
              className="group relative bg-white rounded-2xl border border-dark-900/5 overflow-hidden hover:shadow-xl hover:shadow-dark-900/5 hover:border-dark-900/10 transition-all duration-300"
            >
              <div className={`h-1.5 w-full bg-gradient-to-r ${mp.gradient}`} />
              <div className="p-6">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${mp.gradient} flex items-center justify-center mb-4 shadow-sm`}>
                  <mp.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-bold text-dark-900 mb-1.5">
                  {t(`markets.${mp.key}`)}
                </h3>
                <p className="text-sm text-dark-900/50 leading-relaxed mb-4">
                  {mp.description}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-brand-500 bg-brand-500/8 px-2.5 py-1 rounded-full">
                    {mp.items}
                  </span>
                  <a href="#categories" className="flex items-center gap-1 text-xs font-semibold text-dark-900/40 group-hover:text-brand-500 transition-colors">
                    Browse
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
