"use client";

import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import WhatsAppFAB from "@/components/landing/WhatsAppFAB";
import { useI18n } from "@/lib/i18n";
import { Search, MousePointerClick, ShoppingCart, Eye, Truck, PackageCheck } from "lucide-react";

const STEPS = [
  { icon: Search, num: "01", title: "Search or Paste Link", desc: "Find products on 1688, Taobao, or Yiwugo by searching keywords or pasting product URLs directly into ChinaSuuq.", color: "#FF5A0A" },
  { icon: MousePointerClick, num: "02", title: "Select & Customize", desc: "Choose your preferred variants (color, size, model), set quantity, and select air or sea shipping.", color: "#FB923C" },
  { icon: ShoppingCart, num: "03", title: "Pay & Confirm", desc: "Complete payment using ZAAD, eDahab, bank transfer, or other local methods. Confirm your order via WhatsApp.", color: "#FF5A0A" },
  { icon: Eye, num: "04", title: "We Inspect", desc: "Your products arrive at our China warehouse where our team inspects quantity, quality, and condition with photos.", color: "#FB923C" },
  { icon: Truck, num: "05", title: "We Ship", desc: "Consolidated packages are shipped via air freight (7-14 days) or sea freight (25-40 days) to Somalia.", color: "#FF5A0A" },
  { icon: PackageCheck, num: "06", title: "You Receive", desc: "Collect your order from our Somalia branch or opt for door delivery to your address.", color: "#FB923C" },
];

export default function HowItWorksPage() {
  const { t } = useI18n();

  return (
    <main className="min-h-screen bg-[#FFFCF8]">
      <Header />
      
      <section className="pt-32 pb-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-3xl md:text-5xl font-bold text-[#111111] mb-4">
              How ChinaSuuq Works
            </h1>
            <p className="text-lg text-[#667085] max-w-2xl mx-auto">
              From search to delivery — a simple 6-step process
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={i} className="relative">
                  <div className="bg-white rounded-2xl shadow-card border border-[#E9E5E1]/50 p-8 h-full">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${step.color}15` }}>
                        <Icon className="w-7 h-7" style={{ color: step.color }} />
                      </div>
                      <span className="text-3xl font-bold text-[#E9E5E1]">{step.num}</span>
                    </div>
                    <h3 className="text-lg font-bold text-[#111111] mb-2">{step.title}</h3>
                    <p className="text-sm text-[#667085] leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-center mt-12">
            <a href="https://wa.me/8615277074143?text=Hello%20ChinaSuuq%2C%20I%20want%20to%20start%20ordering" 
               target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-2 px-8 py-4 bg-[#FF5A0A] hover:bg-[#E84400] text-white font-semibold rounded-2xl transition-all shadow-md">
              Start Your First Order
            </a>
          </div>
        </div>
      </section>

      <Footer />
      <WhatsAppFAB />
    </main>
  );
}
