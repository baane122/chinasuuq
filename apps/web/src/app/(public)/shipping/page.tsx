"use client";

import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import WhatsAppFAB from "@/components/landing/WhatsAppFAB";
import { useI18n } from "@/lib/i18n";
import { motion } from "framer-motion";
import Image from "next/image";
import { ArrowRight, Clock3, Package, Plane, Ship, Sparkles, Weight, MapPin, ShieldCheck, MessageCircle } from "lucide-react";

const FREIGHT = [
  { key: "air", icon: Plane, color: "from-brand-500 to-brand-600" },
  { key: "sea", icon: Ship, color: "from-sky-500 to-blue-600" },
] as const;

const CHECKPOINTS = ["step1", "step2", "step3", "step4", "step5", "step6", "step7"] as const;

export default function ShippingPage() {
  const { t } = useI18n();

  return (
    <main className="min-h-screen bg-warm-50">
      <Header />
      <section className="relative overflow-hidden pt-28 pb-12 lg:pt-36 lg:pb-16">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 right-[-10%] h-[560px] w-[560px] rounded-full bg-brand-500/[0.07] blur-3xl" />
          <div className="absolute left-[-15%] top-40 h-[460px] w-[460px] rounded-full bg-sky-500/[0.05] blur-3xl" />
        </div>
        <div className="relative mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
          <div>
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-600">
              <Sparkles className="h-3.5 w-3.5" /> {t("shipping.eyebrow")}
            </span>
            <h1 className="max-w-2xl text-4xl font-bold leading-[1.05] text-dark-900 sm:text-5xl lg:text-6xl">
              {t("shipping.title")}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-dark-900/60 sm:text-lg">
              {t("shipping.subtitle")}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#shipping-options" className="inline-flex items-center gap-2 rounded-2xl bg-brand-500 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition hover:bg-brand-600">
                {t("shipping.compare")} <ArrowRight className="h-4 w-4" />
              </a>
              <a href="https://wa.me/8615277074143?text=Hello%20ChinaSuuq%2C%20I%20want%20to%20ask%20about%20shipping" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-2xl border border-dark-900/10 bg-white px-5 py-3.5 text-sm font-semibold text-dark-900 transition hover:border-brand-500/30 hover:text-brand-600">
                <MessageCircle className="h-4 w-4" /> {t("shipping.whatsapp")}
              </a>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-[560px]">
            <div className="absolute inset-6 rounded-[3rem] bg-brand-500/20 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2.5rem] border border-white/60 bg-gradient-to-br from-dark-900 to-dark-800 p-4 shadow-2xl">
              <Image src="/images/pages/shipping-route.png" alt="China to Hargeisa shipping route" width={1024} height={1024} priority className="aspect-square w-full rounded-[2rem] object-cover" />
            </div>
          </div>
        </div>
      </section>

      <section id="shipping-options" className="px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
        <div className="mx-auto max-w-[1100px]">
          <div className="mb-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{t("shipping.compare")}</p>
            <h2 className="mt-2 text-2xl font-bold text-dark-900 sm:text-3xl">{t("shipping.from")} <span className="text-brand-500">→</span> {t("shipping.to")}</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {FREIGHT.map((option, i) => {
              const Icon = option.icon;
              return (
                <motion.article key={option.key} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="group rounded-3xl border border-dark-900/5 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl sm:p-8">
                  <div className="flex items-start justify-between gap-4">
                    <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${option.color} text-white shadow-lg`}><Icon className="h-7 w-7" /></div>
                    <span className="rounded-full bg-warm-100 px-3 py-1 text-xs font-semibold text-dark-900/60">{t(`shipping.${option.key}Time`)}</span>
                  </div>
                  <h3 className="mt-6 text-2xl font-bold text-dark-900">{t(`shipping.${option.key}`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-dark-900/55">{t(`shipping.${option.key}Desc`)}</p>
                  <div className="mt-6 grid gap-3 border-t border-dark-900/5 pt-5 sm:grid-cols-2">
                    <div className="flex gap-2.5"><Clock3 className="mt-0.5 h-4 w-4 text-brand-500" /><div><p className="text-xs font-semibold text-dark-900">{t(`shipping.${option.key}Time`)}</p><p className="text-xs text-dark-900/45">Transit window</p></div></div>
                    <div className="flex gap-2.5"><Weight className="mt-0.5 h-4 w-4 text-brand-500" /><div><p className="text-xs font-semibold text-dark-900">{t(`shipping.${option.key}Best`)}</p><p className="text-xs text-dark-900/45">Recommended for</p></div></div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
        <div className="mx-auto grid max-w-[1100px] gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div className="rounded-3xl bg-dark-900 p-7 text-white sm:p-9">
            <ShieldCheck className="h-8 w-8 text-brand-400" />
            <h2 className="mt-5 text-2xl font-bold">{t("shipping.trackTitle")}</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/60">{t("shipping.trackDesc")}</p>
            <a href="/track/" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-600">{t("shipping.cta")} <ArrowRight className="h-4 w-4" /></a>
          </div>
          <div className="rounded-3xl border border-dark-900/5 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6 flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{t("shipping.trackTitle")}</p><h2 className="mt-1 text-2xl font-bold text-dark-900">China → Hargeisa</h2></div><Package className="h-6 w-6 text-brand-500" /></div>
            <div className="space-y-5">
              {CHECKPOINTS.map((key, i) => <div key={key} className="flex gap-3.5"><div className="flex flex-col items-center"><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i < 3 ? "bg-brand-500 text-white" : "bg-warm-100 text-dark-900/50"}`}>{i + 1}</div>{i < CHECKPOINTS.length - 1 && <div className={`mt-1 h-8 w-px ${i < 2 ? "bg-brand-300" : "bg-dark-900/10"}`} />}</div><div className="pb-2"><p className={`text-sm font-semibold ${i < 3 ? "text-dark-900" : "text-dark-900/50"}`}>{t(`shipping.${key}`)}</p><p className="mt-0.5 text-xs text-dark-900/45">{t(`shipping.${key}Desc`)}</p></div></div>)}
            </div>
          </div>
        </div>
      </section>
      <Footer /><WhatsAppFAB />
    </main>
  );
}
