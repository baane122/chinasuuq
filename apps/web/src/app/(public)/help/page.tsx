"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import WhatsAppFAB from "@/components/landing/WhatsAppFAB";
import { useI18n } from "@/lib/i18n";
import { ChevronDown, MessageCircle, Phone, Mail, LifeBuoy } from "lucide-react";

const WA_NUMBER = "8615277074143";

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

const CONTACTS = [
  { icon: MessageCircle, title: "WhatsApp", desc: "Chat with us instantly", color: "#25D366", href: `https://wa.me/${WA_NUMBER}` },
  { icon: Phone, title: "Phone", desc: "+86 152 7707 4143", color: "#FF5A0A", href: `tel:+${WA_NUMBER}` },
  { icon: Mail, title: "Email", desc: "support@chinasuuq.com", color: "#2970FF", href: "mailto:support@chinasuuq.com" },
];

export default function HelpPage() {
  const { t } = useI18n();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <main className="min-h-screen bg-warm-50">
      <Header />

      <section className="relative overflow-hidden px-4 pb-16 pt-28 sm:px-6 lg:px-8 lg:pb-24 lg:pt-36">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 right-[-10%] h-[520px] w-[520px] rounded-full bg-brand-500/[0.07] blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-4xl">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-600">
              <LifeBuoy className="h-3.5 w-3.5" />
              {t("nav.help")}
            </span>
            <h1 className="mt-5 text-3xl font-bold tracking-tight text-dark-900 sm:text-5xl">
              How can we help?
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-base text-dark-900/55">
              Find answers to common questions or reach our support team directly.
            </p>
          </motion.div>

          {/* Contact cards */}
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {CONTACTS.map((item, i) => (
              <motion.a
                key={item.title}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.08, duration: 0.45 }}
                whileHover={{ y: -4 }}
                className="rounded-3xl border border-dark-900/[0.06] bg-white p-6 text-center shadow-sm transition-shadow hover:shadow-lg"
              >
                <div
                  className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: `${item.color}15` }}
                >
                  <item.icon className="h-6 w-6" style={{ color: item.color }} />
                </div>
                <h3 className="mt-3 font-bold text-dark-900">{item.title}</h3>
                <p className="mt-0.5 text-sm text-dark-900/50">{item.desc}</p>
              </motion.a>
            ))}
          </div>

          {/* FAQ */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.5 }}
            className="mt-14"
          >
            <h2 className="text-center text-2xl font-bold text-dark-900">
              Frequently asked questions
            </h2>
            <div className="mt-8 space-y-3">
              {FAQS.map((faq, i) => {
                const open = openIndex === i;
                return (
                  <div
                    key={i}
                    className={`overflow-hidden rounded-2xl border bg-white transition-colors ${
                      open ? "border-brand-500/25 shadow-md" : "border-dark-900/[0.06] shadow-sm"
                    }`}
                  >
                    <button
                      onClick={() => setOpenIndex(open ? null : i)}
                      className="flex w-full items-center justify-between p-5 text-left"
                      aria-expanded={open}
                    >
                      <span className="pr-4 font-semibold text-dark-900">{faq.q}</span>
                      <motion.span
                        animate={{ rotate: open ? 180 : 0 }}
                        transition={{ duration: 0.25 }}
                        className="shrink-0"
                      >
                        <ChevronDown className={`h-5 w-5 ${open ? "text-brand-500" : "text-dark-900/40"}`} />
                      </motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: "easeInOut" }}
                        >
                          <p className="border-t border-dark-900/[0.05] px-5 pb-5 pt-4 text-sm leading-relaxed text-dark-900/60">
                            {faq.a}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
      <WhatsAppFAB />
    </main>
  );
}
