'use client';

import { useI18n } from "@/lib/i18n";
import { motion } from "framer-motion";
import Link from "next/link";

const categories = [
  { key: "electronics", emoji: "📱", color: "bg-blue-50", count: "1000s of items" },
  { key: "fashion", emoji: "👗", color: "bg-pink-50", count: "1000s of items" },
  { key: "home", emoji: "🏠", color: "bg-amber-50", count: "1000s of items" },
  { key: "beauty", emoji: "💄", color: "bg-rose-50", count: "1000s of items" },
  { key: "baby", emoji: "🧸", color: "bg-purple-50", count: "1000s of items" },
  { key: "tools", emoji: "🔧", color: "bg-slate-100", count: "1000s of items" },
  { key: "shoes", emoji: "👟", color: "bg-orange-50", count: "1000s of items" },
  { key: "automotive", emoji: "🚗", color: "bg-sky-50", count: "1000s of items" },
  { key: "machinery", emoji: "⚙️", color: "bg-stone-100", count: "1000s of items" },
  { key: "construction", emoji: "🏗️", color: "bg-yellow-50", count: "1000s of items" },
  { key: "packaging", emoji: "📦", color: "bg-emerald-50", count: "1000s of items" },
  { key: "business", emoji: "💼", color: "bg-indigo-50", count: "1000s of items" },
];

export default function CategoryGrid() {
  const { t } = useI18n();

  return (
    <section id="categories" className="px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
      <div className="mx-auto max-w-[1280px]">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-dark-900 mb-3">
            {t("categories.title")}
          </h2>
          <p className="text-base text-dark-900/50 max-w-lg mx-auto">
            {t("categories.subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {categories.map((cat, i) => (
            <motion.div
              key={cat.key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.05, duration: 0.4 }}
            >
              <Link
                href="/categories"
                className="group flex flex-col items-center p-6 rounded-2xl bg-white border border-dark-900/5 hover:border-brand-500/20 hover:shadow-lg hover:shadow-brand-500/5 transition-all duration-300"
              >
                <div className={`w-16 h-16 rounded-2xl ${cat.color} flex items-center justify-center text-3xl mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  {cat.emoji}
                </div>
                <h3 className="text-sm font-semibold text-dark-900 mb-1 text-center">
                  {t(`categories.${cat.key}`)}
                </h3>
                <span className="text-xs text-dark-900/40 font-medium">
                  {cat.count}
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
