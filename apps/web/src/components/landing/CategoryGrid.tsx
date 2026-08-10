'use client';

import { useI18n } from "@/lib/i18n";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const categories = [
  { key: "electronics", img: "/images/categories/electronics.jpg", en: "Electronics", so: "Elektiroonigga" },
  { key: "fashion", img: "/images/categories/fashion.jpg", en: "Fashion", so: "Fashanka" },
  { key: "home", img: "/images/categories/home-kitchen.jpg", en: "Home & Kitchen", so: "Guriga" },
  { key: "beauty", img: "/images/categories/beauty.jpg", en: "Beauty", so: "Quruxda" },
  { key: "baby", img: "/images/categories/baby-toys.jpg", en: "Baby & Toys", so: "Carruurta" },
  { key: "tools", img: "/images/categories/tools-hardware.jpg", en: "Tools & Hardware", so: "Qalabka" },
  { key: "shoes", img: "/images/categories/shoes-bags.jpg", en: "Shoes & Bags", so: "Kabo iyo Boorso" },
  { key: "automotive", img: "/images/categories/automotive.jpg", en: "Automotive", so: "Gaadiidka" },
  { key: "machinery", img: "/images/categories/machinery.jpg", en: "Machinery", so: "Mashiinada" },
  { key: "construction", img: "/images/categories/construction.jpg", en: "Construction", so: "Dhismaha" },
  { key: "packaging", img: "/images/categories/packaging.jpg", en: "Packaging", so: "Dhaqida" },
  { key: "business", img: "/images/categories/business-supplies.jpg", en: "Business Supplies", so: "Alaabta Ganacsiga" },
];

export default function CategoryGrid() {
  const { t, locale } = useI18n();

  return (
    <section id="categories" className="px-4 sm:px-6 lg:px-8 py-16 lg:py-24 bg-warm-50">
      <div className="mx-auto max-w-[1280px]">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12">
          <div>
            <span className="text-xs font-semibold text-brand-600 tracking-wider uppercase mb-2 inline-block">Categories</span>
            <h2 className="text-3xl sm:text-4xl font-bold text-dark-900 mb-2">
              {locale === "en" ? "Browse by Category" : "Eeg Qaybaha"}
            </h2>
            <p className="text-base text-dark-900/50 max-w-md">
              {locale === "en" ? "From electronics to machinery — find everything you need from China." : "Laga bilaabo elektiroonigga ilaa mashiinada — ka hel wax kasta oo aad u baahan tahay Shiinaha."}
            </p>
          </div>
          <Link
            href="/categories"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700 px-4 py-2 rounded-xl bg-brand-500/10 hover:bg-brand-500/15 transition-colors self-start sm:self-auto"
          >
            {locale === "en" ? "All categories" : "Dhammaan qaybaha"}
            <ArrowUpRight className="w-4 h-4" />
          </Link>
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
                className="group flex flex-col items-center p-4 rounded-2xl bg-white border border-dark-900/5 hover:border-brand-500/25 hover:shadow-xl hover:shadow-brand-500/10 transition-all duration-300 overflow-hidden relative"
              >
                {/* Image */}
                <div className="w-full aspect-square rounded-xl overflow-hidden mb-4 bg-warm-200">
                  <img
                    src={cat.img}
                    alt={locale === "en" ? cat.en : cat.so}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    loading="lazy"
                  />
                </div>
                <h3 className="text-sm font-semibold text-dark-900 mb-1 text-center">
                  {locale === "en" ? cat.en : cat.so}
                </h3>
                <span className="text-xs text-dark-900/40 font-medium">
                  {locale === "en" ? "Shop now" : "Dali bo Hadda"}
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
