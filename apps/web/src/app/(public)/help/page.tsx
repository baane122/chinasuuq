"use client";

import { useState } from "react";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import WhatsAppFAB from "@/components/landing/WhatsAppFAB";
import { useI18n } from "@/lib/i18n";
import { ChevronDown, ChevronUp, MessageCircle, Phone, Mail, HelpCircle } from "lucide-react";

const FAQS = [
  { q: "How do I order products from China?", a: "Simply search for products or paste a link from 1688, Taobao, or Yiwugo. Select your variants and quantity, then checkout through the app or WhatsApp. ChinaSuuq handles purchasing, inspection, and delivery." },
  { q: "What payment methods do you accept?", a: "We accept ZAAD, eDahab, Premier Wallet, EVC Plus, Sahal, bank transfer, and card payments where available. All payments are verified before we proceed with purchasing." },
  { q: "How long does shipping take?", a: "Air freight typically takes 7-14 days. Sea freight takes 25-40 days depending on the route. You'll receive tracking updates at every milestone." },
  { q: "Can I return products?", a: "If inspection reveals defects, we'll notify you before shipping. Once delivered, returns depend on the issue. Contact our support team within 7 days of delivery for assistance." },
  { q: "Do I need to pay customs fees?", a: "Customs fees depend on your order value and product type. We provide estimated customs costs during checkout. Final costs are determined at the port of entry." },
  { q: "How does quality inspection work?", a: "Every product is inspected at our China warehouse. We check quantity, color, size, and condition. Photos are taken and shared with you. If issues are found, we notify you before shipping." },
  { q: "Can I track my order?", a: "Yes! Use the Track Order page with your order reference (e.g., CS-2026-00125). You'll see real-time updates from purchase to delivery." },
  { q: "What if my product is restricted?", a: "Some products cannot be shipped internationally. We'll notify you if a product is restricted and help find alternatives or suggest local sourcing." },
];

export default function HelpPage() {
  const { t } = useI18n();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <main className="min-h-screen bg-[#FFFCF8]">
      <Header />
      
      <section className="pt-32 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl md:text-5xl font-bold text-[#111111] text-center mb-4">
            {t("nav.help")}
          </h1>
          <p className="text-lg text-[#667085] text-center mb-12">
            Find answers to common questions or contact our support team
          </p>

          {/* Contact Cards */}
          <div className="grid md:grid-cols-3 gap-4 mb-12">
            {[
              { icon: MessageCircle, title: "WhatsApp", desc: "Chat with us instantly", color: "#25D366", href: "https://wa.me/8615277074143" },
              { icon: Phone, title: "Phone", desc: "+86 152 7707 4143", color: "#FF5A0A", href: "tel:+8615277074143" },
              { icon: Mail, title: "Email", desc: "support@chinasuuq.com", color: "#2970FF", href: "mailto:support@chinasuuq.com" },
            ].map((item, i) => (
              <a key={i} href={item.href} target="_blank" rel="noopener noreferrer"
                className="bg-white rounded-2xl shadow-card border border-[#E9E5E1]/50 p-6 text-center hover:shadow-elevated transition-shadow">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: `${item.color}15` }}>
                  <item.icon className="w-6 h-6" style={{ color: item.color }} />
                </div>
                <h3 className="font-bold text-[#111111] mb-1">{item.title}</h3>
                <p className="text-sm text-[#667085]">{item.desc}</p>
              </a>
            ))}
          </div>

          {/* FAQ */}
          <h2 className="text-2xl font-bold text-[#111111] mb-6">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="bg-white rounded-2xl shadow-card border border-[#E9E5E1]/50 overflow-hidden">
                <button
                  onClick={() => setOpenIndex(openIndex === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left"
                >
                  <span className="font-semibold text-[#111111] pr-4">{faq.q}</span>
                  {openIndex === i ? (
                    <ChevronUp className="w-5 h-5 text-[#FF5A0A] shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-[#667085] shrink-0" />
                  )}
                </button>
                {openIndex === i && (
                  <div className="px-5 pb-5 text-[#667085] leading-relaxed border-t border-[#E9E5E1]/50 pt-4">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
      <WhatsAppFAB />
    </main>
  );
}
