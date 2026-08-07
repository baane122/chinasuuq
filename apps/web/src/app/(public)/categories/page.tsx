"use client";

import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import WhatsAppFAB from "@/components/landing/WhatsAppFAB";
import { useI18n } from "@/lib/i18n";

const CATEGORIES = [
  { emoji: "📱", name: "Electronics", nameSo: "Elektiroonigga", slug: "electronics", count: "1000s of items", bg: "#F0F4FF" },
  { emoji: "👗", name: "Fashion", nameSo: "Fashanka", slug: "fashion", count: "1000s of items", bg: "#FFF0F6" },
  { emoji: "🏠", name: "Home & Kitchen", nameSo: "Guriga & Mashiinka", slug: "home-kitchen", count: "1000s of items", bg: "#FFF8E6" },
  { emoji: "💄", name: "Beauty", nameSo: "Quruxda", slug: "beauty", count: "1000s of items", bg: "#FFF0F0" },
  { emoji: "🧸", name: "Baby & Toys", nameSo: "Carruurta & Ciyaaraha", slug: "baby-toys", count: "1000s of items", bg: "#F0FFF4" },
  { emoji: "🔧", name: "Tools & Hardware", nameSo: "Qalabka", slug: "tools-hardware", count: "1000s of items", bg: "#F5F5F5" },
  { emoji: "👟", name: "Shoes & Bags", nameSo: "Kabo & Boorsooyin", slug: "shoes-bags", count: "1000s of items", bg: "#FFF5F0" },
  { emoji: "🚗", name: "Automotive", nameSo: "Gaadiidka", slug: "automotive", count: "1000s of items", bg: "#F0F8FF" },
  { emoji: "⚙️", name: "Machinery", nameSo: "Mashiinada", slug: "machinery", count: "1000s of items", bg: "#F8F8F8" },
  { emoji: "🏗️", name: "Construction", nameSo: "Dhismaha", slug: "construction", count: "1000s of items", bg: "#FFFAF0" },
  { emoji: "📦", name: "Packaging", nameSo: "Dhaqida", slug: "packaging", count: "1000s of items", bg: "#F5FFFA" },
  { emoji: "💼", name: "Business Supplies", nameSo: "Alaabta Ganacsiga", slug: "business-supplies", count: "1000s of items", bg: "#F8F0FF" },
];

export default function CategoriesPage() {
  const { t } = useI18n();

  return (
    <main className="min-h-screen bg-[#FFFCF8]">
      <Header />
      
      <section className="pt-32 pb-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-3xl md:text-5xl font-bold text-[#111111] mb-4">
              {t("categories.title")}
            </h1>
            <p className="text-lg text-[#667085]">
              {t("categories.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {CATEGORIES.map((cat) => (
              <a key={cat.slug} href={`/categories/${cat.slug}`}
                 className="bg-white rounded-2xl shadow-card border border-[#E9E5E1]/50 p-6 text-center hover:shadow-elevated hover:-translate-y-1 transition-all duration-300 group">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl" style={{ backgroundColor: cat.bg }}>
                  {cat.emoji}
                </div>
                <h3 className="font-bold text-[#111111] mb-1 group-hover:text-[#FF5A0A] transition-colors">{cat.name}</h3>
                <p className="text-xs text-[#667085] mb-2">{cat.nameSo}</p>
                <p className="text-sm font-semibold text-[#FF5A0A]">{cat.count}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      <Footer />
      <WhatsAppFAB />
    </main>
  );
}
