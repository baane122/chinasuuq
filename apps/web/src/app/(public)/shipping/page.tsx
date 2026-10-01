"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import WhatsAppFAB from "@/components/landing/WhatsAppFAB";
import { useI18n } from "@/lib/i18n";
import { motion } from "framer-motion";
import Image from "next/image";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  MapPin,
  MessageCircle,
  Package,
  Plane,
  Search,
  Ship,
  ShieldCheck,
  Sparkles,
  Truck,
  Weight,
} from "lucide-react";
import { waLink } from "@/lib/whatsapp";

const FREIGHT = [
  { key: "air", icon: Plane, color: "from-brand-500 to-brand-600" },
  { key: "sea", icon: Ship, color: "from-sky-500 to-blue-600" },
] as const;

export default function ShippingPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [trackingId, setTrackingId] = useState("");

  // Real tracking: hand the reference to the live /track page (Supabase
  // lookup) instead of the fake inline panel that used to live here.
  const handleTrack = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ref = trackingId.trim();
    if (ref) router.push(`/track?ref=${encodeURIComponent(ref)}`);
  };

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
              <a href="#tracking" className="inline-flex items-center gap-2 rounded-2xl border border-dark-900/10 bg-white px-5 py-3.5 text-sm font-semibold text-dark-900 transition hover:border-brand-500/30 hover:text-brand-600">
                <Search className="h-4 w-4" /> {t("track.button")}
              </a>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-[560px]">
            <div className="absolute inset-6 rounded-[3rem] bg-brand-500/20 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2.5rem] border border-white/60 bg-gradient-to-br from-dark-900 to-dark-800 p-4 shadow-2xl">
              <Image src="/images/pages/shipping-route.webp" alt="China to Hargeisa shipping route" width={1024} height={1024} priority className="aspect-square w-full rounded-[2rem] object-cover" />
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
                    <div className="flex gap-2.5"><Clock3 className="mt-0.5 h-4 w-4 text-brand-500" /><div><p className="text-xs font-semibold text-dark-900">{t(`shipping.${option.key}Time`)}</p><p className="text-xs text-dark-900/45">{t("shipping.transitWindow")}</p></div></div>
                    <div className="flex gap-2.5"><Weight className="mt-0.5 h-4 w-4 text-brand-500" /><div><p className="text-xs font-semibold text-dark-900">{t(`shipping.${option.key}Best`)}</p><p className="text-xs text-dark-900/45">{t("shipping.recommendedFor")}</p></div></div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="tracking" className="scroll-mt-24 px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
        <div className="mx-auto max-w-[1100px]">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div className="rounded-3xl bg-dark-900 p-7 text-white sm:p-9">
              <ShieldCheck className="h-8 w-8 text-brand-400" />
              <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-brand-300">{t("track.eyebrow")}</p>
              <h2 className="mt-2 text-2xl font-bold">{t("track.title")}</h2>
              <p className="mt-3 text-sm leading-relaxed text-white/60">{t("track.subtitle")}</p>
              <form onSubmit={handleTrack} className="mt-6 space-y-3">
                <label htmlFor="tracking-id" className="sr-only">{t("track.placeholder")}</label>
                <input id="tracking-id" value={trackingId} onChange={(event) => setTrackingId(event.target.value)} placeholder={t("track.placeholder")} className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10" />
                <button type="submit" className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600">{t("track.button")} <ArrowRight className="h-4 w-4" /></button>
              </form>
            </div>
            <div className="rounded-3xl border border-dark-900/5 bg-white p-6 shadow-sm sm:p-8">
              <div className="mb-6 flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{t("shipping.trackTitle")}</p><h2 className="mt-1 text-2xl font-bold text-dark-900">{t("track.title")}</h2></div><Package className="h-6 w-6 text-brand-500" /></div>
              <p className="text-sm leading-relaxed text-dark-900/60">{t("track.subtitle")}</p>
              <ul className="mt-5 space-y-3">
                {[
                  { icon: CheckCircle2, en: "13 checkpoints from purchase to doorstep", so: "13 bartan oo laga bilaabo iibsiga ilaa albaabka" },
                  { icon: MapPin, en: "Live status: Guangzhou → Hargeisa / Mogadishu", so: "Xaaladaha nool: Guangzhou → Hargeisa / Muqdisho" },
                  { icon: Clock3, en: "Air 7–14 days · Sea 25–35 days", so: "Hawada 7–14 maalmood · Badda 25–35" },
                ].map(({ icon: Icon, en, so }, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-2xl bg-warm-50 p-3.5">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-500/10"><Icon className="h-4 w-4 text-brand-500" /></span>
                    <span className="text-sm font-medium text-dark-900/75">{locale === "so" ? so : en}</span>
                  </li>
                ))}
              </ul>
              <a href="/track" className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600">
                {t("track.button")} <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-12 sm:px-6 lg:px-8"><div className="mx-auto flex max-w-[1100px] flex-col items-center justify-between gap-4 rounded-3xl bg-brand-500 px-6 py-6 text-center text-white sm:flex-row sm:text-left"><div><p className="text-lg font-bold">{t("shipping.trackTitle")}</p><p className="mt-1 text-sm text-white/75">{t("shipping.trackDesc")}</p></div><a href={waLink("Hello ChinaSuuq, I want to ask about shipping")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-brand-600"><MessageCircle className="h-4 w-4" />{t("shipping.whatsapp")}</a></div></section>
      <Footer /><WhatsAppFAB />
    </main>
  );
}
