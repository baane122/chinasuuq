"use client";

import { useMemo, useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { waLink } from "@/lib/whatsapp";
import { MARKETPLACE_CATALOG } from "@/lib/marketplaces";
import {
  Link2, PackageSearch, Loader2, CheckCircle2, MessageCircle,
  RotateCcw, ShieldCheck, Truck,
} from "lucide-react";

/**
 * Customer quote request — the web's first-party conversion path.
 *
 * Writes one row to `sourcing_requests` (RLS allows anon inserts), which lands
 * directly on the admin Sourcing board. The live table has no contact column,
 * so the caller's name/WhatsApp number is embedded as a structured header in
 * `product_description`; a ready-to-push migration
 * (`202609290001_web_quote_flow.sql`) adds real columns for when it is applied.
 *
 * Column contract verified against production 2026-09-29 (see
 * plans/live-schema-contract.md): marketplace is an enum that does NOT include
 * `dollarstore`, so that selection is sent as NULL and stated in the text.
 */

const SOMALI_CITIES = [
  "Mogadishu", "Hargeisa", "Bosaso", "Berbera", "Burao", "Borama",
  "Galkayo", "Garowe", "Kismayo", "Baidoa", "Erigavo", "Other",
];

/** Marketplace enum values accepted by `sourcing_requests.marketplace`. */
const ENUM_MARKETPLACES = ["1688", "taobao", "yiwugo", "alibaba", "chinagoods", "jd"];

export function detectMarketplace(url: string): string | null {
  const u = url.toLowerCase();
  if (/1688\.com/.test(u)) return "1688";
  if (/taobao\.com|tmall\.com/.test(u)) return "taobao";
  if (/yiwugo\.com/.test(u)) return "yiwugo";
  if (/alibaba\.com/.test(u)) return "alibaba";
  if (/chinagoods\.com/.test(u)) return "chinagoods";
  if (/jd\.com/.test(u)) return "jd";
  if (/huolangjun666\.com/.test(u)) return "dollarstore";
  return null;
}

interface Props {
  /** Pre-fill from a pasted product link (SearchBar / marketplace pages). */
  defaultUrl?: string;
  /** Pre-select a marketplace id from MARKETPLACE_CATALOG. */
  defaultMarketplace?: string;
  /** Called after a successful submit when embedded in a modal. */
  onSubmitted?: () => void;
}

export default function QuoteForm({ defaultUrl = "", defaultMarketplace, onSubmitted }: Props) {
  const { t, locale } = useI18n();

  const [url, setUrl] = useState(defaultUrl);
  const [marketplace, setMarketplace] = useState<string>(
    defaultMarketplace && defaultMarketplace !== "dollarstore"
      ? defaultMarketplace
      : defaultMarketplace === "dollarstore"
        ? "dollarstore"
        : ""
  );
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [city, setCity] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  // Honeypot — bots fill this; humans never see it.
  const [company, setCompany] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState("");

  const detected = useMemo(() => detectMarketplace(url), [url]);

  const mpLabel = (id: string) =>
    MARKETPLACE_CATALOG.find((m) => m.id === id)?.displayName ?? id;

  const composedDescription = () => {
    const lines = [
      "[Web quote request]",
      `${t("quote.contactLine")}: ${name.trim()} — ${phone.trim()}`,
    ];
    if (marketplace === "dollarstore") lines.push(`${t("quote.marketplace")}: ${mpLabel("dollarstore")}`);
    else if (marketplace) lines.push(`${t("quote.marketplace")}: ${mpLabel(marketplace)}`);
    else if (detected) lines.push(`${t("quote.marketplace")}: ${mpLabel(detected)}`);
    lines.push("", description.trim());
    return lines.join("\n");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (state === "submitting") return;
    if (!description.trim() || description.trim().length < 10) {
      setErrorMsg(t("quote.errDescription"));
      setState("error");
      return;
    }
    if (!name.trim() || !phone.trim()) {
      setErrorMsg(t("quote.errContact"));
      setState("error");
      return;
    }
    if (company) return; // honeypot — pretend success, send nothing

    setState("submitting");
    setErrorMsg(null);
    const chosen = marketplace || detected;
    const summary = `${t("quote.waSummary")} — ${description.trim().slice(0, 120)}${
      url.trim() ? ` (${url.trim()})` : ""
    }`;

    const { error } = await supabase.from("sourcing_requests").insert({
      // `dollarstore` is not in the live enum — send NULL and say it in text.
      marketplace: chosen && ENUM_MARKETPLACES.includes(chosen) ? chosen : null,
      product_url: url.trim(),
      product_description: composedDescription(),
      quantity: Math.max(1, Math.floor(Number(quantity)) || 1),
      destination_city: city.trim(),
      status: "pending",
    });

    if (error) {
      setErrorMsg(error.message);
      setState("error");
      return;
    }
    setLastSummary(summary);
    setState("success");
    onSubmitted?.();
  };

  const reset = () => {
    setUrl(""); setMarketplace(""); setDescription(""); setQuantity("1");
    setCity(""); setPhone(""); setState("idle"); setErrorMsg(null);
  };

  const inputCls =
    "w-full rounded-xl border border-dark-900/10 bg-white px-4 py-3 text-sm text-dark-900 placeholder:text-dark-900/35 outline-none transition-all focus:border-brand-500/40 focus:ring-2 focus:ring-brand-500/25";
  const labelCls = "mb-1.5 block text-xs font-semibold tracking-wide text-dark-700 uppercase";

  if (state === "success") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-dark-900/[0.06] bg-white p-8 text-center shadow-sm sm:p-12"
      >
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <h3 className="text-xl font-bold text-dark-900">{t("quote.successTitle")}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-dark-900/60">
          {t("quote.successBody")}
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={waLink(lastSummary)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-95 active:scale-[0.98]"
          >
            <MessageCircle className="h-4.5 w-4.5" />
            {t("quote.successWhatsApp")}
          </a>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl border border-dark-900/10 bg-white px-5 py-3 text-sm font-semibold text-dark-700 transition-all hover:border-brand-500/30 hover:text-brand-600"
          >
            <RotateCcw className="h-4 w-4" />
            {t("quote.successAnother")}
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-dark-900/[0.06] bg-white p-6 shadow-sm sm:p-8"
    >
      {/* honeypot */}
      <input
        type="text"
        name="company"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="pointer-events-none absolute h-0 w-0 opacity-0"
      />

      <div className="space-y-5">
        {/* Product link + detection */}
        <div>
          <label htmlFor="q-url" className={labelCls}>
            {t("quote.urlLabel")}
          </label>
          <div className="relative">
            <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-dark-900/30" />
            <input
              id="q-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://detail.1688.com/offer/…"
              className={`${inputCls} pl-11`}
            />
          </div>
          <AnimatePresence>
            {detected && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-brand-600"
              >
                <PackageSearch className="h-3.5 w-3.5" />
                {t("quote.detected")} {mpLabel(detected)}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Marketplace + quantity */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="q-mp" className={labelCls}>
              {t("quote.marketplace")}
            </label>
            <select
              id="q-mp"
              value={marketplace}
              onChange={(e) => setMarketplace(e.target.value)}
              className={inputCls}
            >
              <option value="">{detected ? `${t("quote.auto")} — ${mpLabel(detected)}` : t("quote.notSure")}</option>
              {MARKETPLACE_CATALOG.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="q-qty" className={labelCls}>
              {t("quote.quantity")}
            </label>
            <input
              id="q-qty"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="q-desc" className={labelCls}>
            {t("quote.descLabel")} <span className="text-brand-500">*</span>
          </label>
          <textarea
            id="q-desc"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("quote.descPlaceholder")}
            className={`${inputCls} resize-none`}
            required
          />
        </div>

        {/* Destination + contact */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="q-city" className={labelCls}>
              {t("quote.city")} <span className="text-brand-500">*</span>
            </label>
            <input
              id="q-city"
              list="q-cities"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Mogadishu"
              className={inputCls}
              required
            />
            <datalist id="q-cities">
              {SOMALI_CITIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label htmlFor="q-name" className={labelCls}>
              {t("quote.name")} <span className="text-brand-500">*</span>
            </label>
            <input
              id="q-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className={inputCls}
              required
            />
          </div>
          <div>
            <label htmlFor="q-phone" className={labelCls}>
              {t("quote.phone")} <span className="text-brand-500">*</span>
            </label>
            <input
              id="q-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+252 …"
              autoComplete="tel"
              className={inputCls}
              required
            />
          </div>
        </div>

        {state === "error" && errorMsg && (
          <p className="rounded-xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error">
            {errorMsg}
          </p>
        )}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4 text-xs text-dark-900/50">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-brand-500" />
              {t("quote.free")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Truck className="h-4 w-4 text-brand-500" />
              {t("quote.noPayment")}
            </span>
          </div>
          <button
            type="submit"
            disabled={state === "submitting"}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-600 active:scale-[0.98] disabled:opacity-60"
          >
            {state === "submitting" ? (
              <Loader2 className="h-4.5 w-4.5 animate-spin" />
            ) : (
              <PackageSearch className="h-4.5 w-4.5" />
            )}
            {t("quote.submit")}
          </button>
        </div>

        {locale === "so" && (
          <p className="text-xs text-dark-900/40">{t("quote.soNote")}</p>
        )}
      </div>
    </form>
  );
}
