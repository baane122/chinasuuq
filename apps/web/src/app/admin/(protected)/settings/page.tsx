"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Loader2, Save, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { z } from "zod";
import { AiSettingsTab } from "@/components/admin/AiSettingsTab";
import { PageHeader, SectionCard, Field } from "@/components/admin/ui";
import { saveExchangeRate } from "@/lib/admin/supabase-data";
import {
  DEFAULT_CNY_PER_USD,
  DEFAULT_SOS_PER_USD,
  derivedReadout,
  getFxRates,
  invalidateFx,
  normalizeCnyPerUsd,
} from "@/lib/fx";

const tabs = ["General", "Currency", "Shipping", "Staff", "System Health", "AI Provider"] as const;

// ONE number to manage: how many yuan make one dollar. The shilling rate is not
// an owner setting — the checkout display keeps using the fixed 530 SOS per $1
// row in `exchange_rates` — so this form neither edits nor writes it. The bound
// is fx.ts's plausibility band (identical to fx_rates() in the database), so a
// rate this form refuses to save is also a rate no screen will read.
const exchangeRateSchema = z.object({
  cny_per_usd: z
    .number()
    .positive("Enter how many CNY make 1 USD")
    .refine((v) => normalizeCnyPerUsd(v) !== null, "Must be between 2 and 20 CNY per 1 USD (today 6.66)"),
});

type ExchangeRateData = z.infer<typeof exchangeRateSchema>;

const shippingMethods = [
  { id: "air", label: "Air Freight", baseRate: 8.5, unit: "per kg", estimatedDays: "5-7 days" },
  { id: "sea", label: "Sea Freight", baseRate: 2.5, unit: "per kg", estimatedDays: "25-35 days" },
  { id: "land", label: "Land Transport", baseRate: 4.0, unit: "per kg", estimatedDays: "10-15 days" },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<string>("General");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // General settings
  const [storeName, setStoreName] = useState("ChinaSuuq");
  const [supportEmail, setSupportEmail] = useState("support@chinasuuq.com");
  const [whatsappNumber, setWhatsappNumber] = useState("+86 152 7707 4143");
  const [defaultLanguage, setDefaultLanguage] = useState("en");

  // The one editable rate (CNY per 1 USD) plus the SOS row read for display.
  // Only `exchangeRates` is ever written back.
  const [exchangeRates, setExchangeRates] = useState<ExchangeRateData>({
    cny_per_usd: DEFAULT_CNY_PER_USD,
  });
  const [sosPerUsd, setSosPerUsd] = useState(DEFAULT_SOS_PER_USD);
  const [rateErrors, setRateErrors] = useState<Partial<Record<keyof ExchangeRateData, string>>>({});
  const [isLoadingRates, setIsLoadingRates] = useState(false);

  // Shipping settings
  const [methods, setMethods] = useState(shippingMethods);

  // Staff — there is no `staff` table: staff is staff_profiles joined to
  // profiles. profiles has no email column, so this list cannot show one.
  const [staffList, setStaffList] = useState<
    {
      id: string;
      user_id: string | null;
      role: string;
      department: string | null;
      profiles: { full_name: string | null } | null;
    }[]
  >([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);

  // AI Provider settings are managed by <AiSettingsTab /> (edge functions).

  // System Health
  const [health, setHealth] = useState<{
    latencyMs: number | null;
    sessionEmail: string | null;
    lastSignIn: string | null;
    counts: Record<string, number | "err">;
  }>({ latencyMs: null, sessionEmail: null, lastSignIn: null, counts: {} });
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const runHealthCheck = async () => {
    setIsCheckingHealth(true);
    const t0 = performance.now();
    try {
      const countsRes = await Promise.all(
        (
          [
            ["Orders", "admin_orders_view"],
            ["Products", "source_products"],
            ["Sourcing", "sourcing_requests"],
            ["Shipments", "shipments"],
            ["Payments", "payments"],
            ["Customers", "admin_customers_view"],
            ["Notifications", "notifications"],
            ["Marketplaces", "marketplaces"],
          ] as const
        ).map(async ([label, table]) => {
          const { count, error } = await supabase
            .from(table)
            .select("id", { count: "exact", head: true });
          return [label, error ? ("err" as const) : (count ?? 0)] as const;
        })
      );
      const session = await supabase.auth.getSession();
      setHealth({
        latencyMs: Math.round(performance.now() - t0),
        sessionEmail: session.data.session?.user?.email ?? null,
        lastSignIn: session.data.session?.user?.last_sign_in_at ?? null,
        counts: Object.fromEntries(countsRes),
      });
    } finally {
      setIsCheckingHealth(false);
    }
  };

  useEffect(() => {
    if (activeTab === "System Health") runHealthCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handlePasswordChange = async () => {
    if (newPassword.length < 8) {
      setSaveMessage({ type: "error", text: "Password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setSaveMessage({ type: "error", text: "Passwords do not match." });
      return;
    }
    setIsUpdatingPassword(true);
    setSaveMessage(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setIsUpdatingPassword(false);
    if (error) {
      setSaveMessage({ type: "error", text: `Password update failed: ${error.message}` });
    } else {
      setNewPassword("");
      setConfirmPassword("");
      setSaveMessage({ type: "success", text: "Admin password updated successfully." });
    }
  };

  useEffect(() => {
    if (activeTab === "Currency") {
      fetchExchangeRate();
    }
    if (activeTab === "Staff") {
      fetchStaff();
    }
    if (activeTab === "Shipping") {
      fetchShipping();
    }
  }, [activeTab]);

  // Deep link from /admin/rates ("?tab=currency"). location.search is read on the
  // client instead of useSearchParams so the static prerender of this route does
  // not have to be wrapped in Suspense.
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    const match = tabs.find((t) => t.toLowerCase() === (tab ?? "").toLowerCase());
    if (match) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one honour of ?tab= on mount
      setActiveTab(match);
    }
  }, []);

  const fetchExchangeRate = async () => {
    setIsLoadingRates(true);
    try {
      // fx.ts is the app's only rate reader: it already resolves the newest
      // active row per pair, flips an upside-down entry and rejects an
      // implausible one, so this form opens showing the number every other
      // admin screen is actually using.
      const fx = await getFxRates();
      setExchangeRates({ cny_per_usd: fx.cnyPerUsd });
      setSosPerUsd(fx.sosPerUsd);
    } finally {
      setIsLoadingRates(false);
    }
  };

  const fetchStaff = async () => {
    setIsLoadingStaff(true);
    setStaffError(null);
    try {
      const { data, error } = await supabase
        .from("staff_profiles")
        .select("id, user_id, role, department, profiles(full_name)")
        .order("created_at", { ascending: false });

      if (error) {
        // Surface the failure instead of leaving a stale (or silently empty) list.
        setStaffError(error.message || "Failed to load staff members.");
        setStaffList([]);
      } else {
        // to-one embed: supabase-js types it as an array, runtime gives one object.
        setStaffList((data as unknown as typeof staffList) || []);
      }
    } catch (err) {
      setStaffError(err instanceof Error ? err.message : "Failed to load staff members.");
      setStaffList([]);
    } finally {
      setIsLoadingStaff(false);
    }
  };

  const handleSaveGeneral = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const settings = [
        { key: "store_name", value: storeName },
        { key: "support_email", value: supportEmail },
        { key: "whatsapp_number", value: whatsappNumber },
        { key: "default_language", value: defaultLanguage },
      ];

      // Independent settings keys — parallelised for speed. These are NOT atomic:
      // if one upsert fails the others may already have committed. Each key is
      // idempotent (upsert on `key`), so re-saving after an error converges safely.
      await Promise.all(
        settings.map(({ key, value }) =>
          supabase
            .from("settings")
            .upsert({ key, value }, { onConflict: "key" })
            .then(({ error }) => {
              if (error) throw error;
            })
        )
      );

      setSaveMessage({ type: "success", text: "General settings saved successfully" });
    } catch (err) {
      setSaveMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const handleSaveCurrency = async () => {
    const result = exchangeRateSchema.safeParse(exchangeRates);
    if (!result.success) {
      const errors: Partial<Record<keyof ExchangeRateData, string>> = {};
      result.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof ExchangeRateData;
        errors[field] = issue.message;
      });
      setRateErrors(errors);
      return;
    }
    setRateErrors({});

    setIsSaving(true);
    setSaveMessage(null);
    try {
      // Writing the single live pair (CNY → USD) to exchange_rates. The insert
      // trigger retires the previous active row, so history accumulates on
      // /admin/rates while exactly one rate stays live. The SOS pair is not
      // touched here: it is a fixed checkout display constant, not a setting.
      const saved = await saveExchangeRate({
        from_currency: "CNY",
        to_currency: "USD",
        rate: result.data.cny_per_usd,
        reason: "Set in Admin → Settings",
        is_active: true,
        effective_from: new Date().toISOString(),
      });
      if (!saved.ok) throw new Error(saved.error || "Failed to save exchange rate");

      invalidateFx();
      setSaveMessage({ type: "success", text: "Rate updated — every screen now uses it" });
    } catch (err) {
      setSaveMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  // Shipping settings are persisted to the same `settings` KV table as the
  // General & Currency tabs (key "shipping_methods"), so a save survives a
  // reload instead of resetting to the defaults baked into the file.
  const fetchShipping = async () => {
    try {
      const { data, error } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "shipping_methods")
        .maybeSingle();
      if (error || !data?.value) return; // first run: no row yet, keep defaults
      const parsed = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
      if (Array.isArray(parsed)) {
        setMethods((prev) =>
          prev.map((m) => {
            const saved = parsed.find((s: any) => s?.id === m.id);
            return saved
              ? {
                  ...m,
                  baseRate: Number(saved.baseRate) || m.baseRate,
                  estimatedDays: saved.estimatedDays ?? m.estimatedDays,
                }
              : m;
          })
        );
      }
    } catch {
      // Malformed stored value — leave the defaults untouched.
    }
  };

  const handleSaveShipping = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const { error } = await supabase
        .from("settings")
        .upsert(
          { key: "shipping_methods", value: JSON.stringify(methods) },
          { onConflict: "key" }
        );
      if (error) throw error;
      setSaveMessage({ type: "success", text: "Shipping methods saved" });
    } catch (err) {
      setSaveMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const handleRefreshRate = async () => {
    setIsLoadingRates(true);
    try {
      // Keyless, quoted from USD, so rates.CNY is CNY-per-USD — the same
      // direction exchange_rates stores. This fills the ONE box; the shilling
      // figure is a fixed checkout constant and is deliberately not fetched
      // (the market rate and the app's 530 are different numbers on purpose).
      const res = await fetch("https://open.er-api.com/v6/latest/USD");
      if (!res.ok) throw new Error(`Rate API returned ${res.status}`);
      const data = await res.json();

      const cnyPerUsd = normalizeCnyPerUsd(Number(data?.rates?.CNY));
      if (cnyPerUsd === null) {
        throw new Error("Live rate failed the plausibility check — nothing was loaded");
      }

      setExchangeRates({ cny_per_usd: Math.round(cnyPerUsd * 10000) / 10000 });
      setRateErrors({});
      setSaveMessage({ type: "success", text: "Live rate loaded — Save Rate to apply it" });
    } catch (err) {
      setSaveMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to fetch live rates",
      });
    } finally {
      setIsLoadingRates(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Platform configuration and preferences" />

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 rounded-full bg-dark-50 p-1.5">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition-all",
              activeTab === tab
                ? "bg-dark-900 text-white shadow-sm"
                : "text-dark-900/50 hover:bg-dark-900/5 hover:text-dark-900"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Save message */}
      {saveMessage && (
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium",
            saveMessage.type === "success"
              ? "border-success/20 bg-success/5 text-success"
              : "border-error/20 bg-error/5 text-error"
          )}
        >
          {saveMessage.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{saveMessage.text}</span>
        </div>
      )}

      {/* General Settings */}
      {activeTab === "General" && (
        <SectionCard
          title="General Settings"
          subtitle="Store identity and contact details"
          bodyClassName="space-y-6"
        >
          <div className="grid gap-x-5 gap-y-1 sm:grid-cols-2">
            <Field label="Store Name">
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="admin-input"
              />
            </Field>
            <Field label="Support Email">
              <input
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                className="admin-input"
              />
            </Field>
            <Field label="WhatsApp Number">
              <input
                type="text"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                className="admin-input"
              />
            </Field>
            <Field label="Default Language">
              <select
                value={defaultLanguage}
                onChange={(e) => setDefaultLanguage(e.target.value)}
                className="admin-input"
              >
                <option value="en">English</option>
                <option value="so">Somali</option>
                <option value="zh">Chinese</option>
              </select>
            </Field>
          </div>

          <div className="flex justify-end border-t border-dark-900/[0.06] pt-4">
            <button
              onClick={handleSaveGeneral}
              disabled={isSaving}
              className="admin-btn-primary"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Changes
            </button>
          </div>
        </SectionCard>
      )}

      {/* Currency Settings */}
      {activeTab === "Currency" && (
        <SectionCard
          title="Exchange Rate"
          subtitle="One number controls every price in the admin and the app"
          bodyClassName="space-y-6"
          actions={
            <button
              onClick={handleRefreshRate}
              disabled={isLoadingRates}
              className="admin-btn-outline h-9"
            >
              <RefreshCw className={cn("h-4 w-4", isLoadingRates && "animate-spin")} />
              Fetch Live Rate
            </button>
          }
        >
          <div className="max-w-sm">
            <Field
              label="CNY per 1 USD — how many ¥ make $1"
              hint={`USD = CNY ÷ ${exchangeRates.cny_per_usd || "—"} · 1 CNY = $${
                exchangeRates.cny_per_usd > 0 ? (1 / exchangeRates.cny_per_usd).toFixed(4) : "—"
              }`}
            >
              <input
                type="number"
                step="0.0001"
                value={exchangeRates.cny_per_usd}
                onChange={(e) => setExchangeRates((prev) => ({ ...prev, cny_per_usd: parseFloat(e.target.value) || 0 }))}
                className={cn(
                  "admin-input",
                  rateErrors.cny_per_usd && "border-error/60 focus:border-error/60 focus:ring-error/15"
                )}
              />
              {rateErrors.cny_per_usd && (
                <p className="mt-1 text-xs font-medium text-error">{rateErrors.cny_per_usd}</p>
              )}
            </Field>
          </div>

          {/* Derived from whatever is in the box, so an entry that reads wrong to
              the eye ($0.15 per dollar typed as 0.15) is obvious before it is
              saved — the database trigger would flip it, and better that the
              owner sees it here first. */}
          <div className="rounded-xl border border-brand-500/20 bg-brand-50/60 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-dark-900/45">
              What this number does in the app
            </p>
            <p className="mt-1 text-sm font-bold tabular-nums text-dark-900">
              {derivedReadout(exchangeRates.cny_per_usd, sosPerUsd)}
            </p>
            <p className="mt-2 text-xs text-dark-900/55">
              Shilling is not an editable rate: checkout shows Somali prices at the fixed{" "}
              {sosPerUsd} SOS per $1 the database already holds.
            </p>
          </div>

          <div className="rounded-xl border border-warning/20 bg-warning/5 p-4">
            <p className="text-sm text-dark-900/60">
              <strong className="font-semibold text-dark-900">Note:</strong> the box means{" "}
              <strong className="font-semibold text-dark-900">how many yuan equal one US dollar</strong>{" "}
              — today 6.66. Saving replaces the live rate for sourcing, quotes, orders, the customer
              app and the AI price reader at once. Always verify the readout above before saving.
            </p>
          </div>

          <div className="flex justify-end border-t border-dark-900/[0.06] pt-4">
            <button
              onClick={handleSaveCurrency}
              disabled={isSaving}
              className="admin-btn-primary"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Rate
            </button>
          </div>
        </SectionCard>
      )}

      {/* Shipping Settings */}
      {activeTab === "Shipping" && (
        <SectionCard
          title="Shipping Methods"
          subtitle="Base rates applied to orders at checkout"
          bodyClassName="space-y-4"
        >
          {methods.map((method) => (
            <div
              key={method.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dark-900/[0.06] p-4 transition-colors hover:border-dark-900/15"
            >
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-sm font-bold uppercase text-brand-600">
                  {method.id.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-dark-900">{method.label}</p>
                  <p className="text-xs text-dark-900/40">
                    {method.unit} · Est. {method.estimatedDays}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-28">
                  <label className="admin-label">Rate ($/kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={method.baseRate}
                    onChange={(e) => {
                      setMethods((prev) =>
                        prev.map((m) =>
                          m.id === method.id ? { ...m, baseRate: parseFloat(e.target.value) || 0 } : m
                        )
                      );
                    }}
                    className="admin-input h-9 px-3 text-right"
                  />
                </div>
                <div className="w-32">
                  <label className="admin-label">Est. Days</label>
                  <input
                    type="text"
                    value={method.estimatedDays}
                    onChange={(e) => {
                      setMethods((prev) =>
                        prev.map((m) =>
                          m.id === method.id ? { ...m, estimatedDays: e.target.value } : m
                        )
                      );
                    }}
                    className="admin-input h-9 px-3 text-right"
                  />
                </div>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between gap-3 border-t border-dark-900/[0.06] pt-4">
            <p className="text-[11px] leading-relaxed text-dark-900/45">
              Saved to the settings table (key <span className="font-mono">shipping_methods</span>) —
              the same store as General &amp; Currency — so rates survive a reload. Checkout and the
              quote flow read these base rates.
            </p>
            <button
              onClick={handleSaveShipping}
              disabled={isSaving}
              className="admin-btn-primary h-9 shrink-0"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Rates
            </button>
          </div>
        </SectionCard>
      )}

      {/* Staff Settings */}
      {activeTab === "Staff" && (
        <SectionCard
          title="Staff Members"
          subtitle="Team members with dashboard access"
          bodyClassName="space-y-4"
        >
          {isLoadingStaff ? (
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-12 w-full" />
              ))}
            </div>
          ) : staffError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-8 text-center">
              <p className="text-sm font-medium text-rose-600">Couldn't load staff members.</p>
              <p className="mt-1 text-xs text-rose-500/80">{staffError}</p>
              <button onClick={fetchStaff} className="admin-btn-outline mt-3 h-9">
                Retry
              </button>
            </div>
          ) : staffList.length === 0 ? (
            <div className="rounded-xl bg-dark-50 p-8 text-center">
              <p className="text-sm text-dark-900/45">
                No staff members found. Staff can be added through the Supabase dashboard or a future UI.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-dark-900/[0.06]">
              <table className="admin-table w-full">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Department</th>
                    <th>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {staffList.map((staff) => (
                    <tr key={staff.id}>
                      <td className="font-medium">{staff.profiles?.full_name || "—"}</td>
                      <td className="text-dark-900/60">{staff.department || "—"}</td>
                      <td>
                        <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-600 capitalize">
                          {staff.role.replace(/_/g, " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-dark-900/40">
                Sign-in emails are not stored on profiles, so they cannot be listed here.
              </p>
            </div>
          )}
        </SectionCard>
      )}

      {/* System Health */}
      {activeTab === "System Health" && (
        <>
          <SectionCard
            title="System Health"
            subtitle="Live database diagnostics and session status"
            bodyClassName="space-y-5"
            actions={
              <button
                onClick={runHealthCheck}
                disabled={isCheckingHealth}
                className="admin-btn-outline h-8 px-3 text-xs"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isCheckingHealth && "animate-spin")} />
                Re-run check
              </button>
            }
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-dark-900/[0.06] bg-warm-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-dark-900/40">DB Latency</p>
                <p className="mt-1 text-xl font-bold text-dark-900">
                  {health.latencyMs === null ? "—" : `${health.latencyMs} ms`}
                </p>
                <p className="mt-0.5 text-[11px] text-dark-900/40">
                  {health.latencyMs !== null && health.latencyMs < 800 ? "Healthy" : health.latencyMs !== null ? "Slow — check network" : "Run a check"}
                </p>
              </div>
              <div className="rounded-2xl border border-dark-900/[0.06] bg-warm-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-dark-900/40">Signed in as</p>
                <p className="mt-1 truncate text-sm font-bold text-dark-900">{health.sessionEmail ?? "—"}</p>
                <p className="mt-0.5 text-[11px] text-dark-900/40">
                  {health.lastSignIn ? `Last sign-in ${new Date(health.lastSignIn).toLocaleString()}` : ""}
                </p>
              </div>
              <div className="rounded-2xl border border-dark-900/[0.06] bg-warm-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-dark-900/40">Connection</p>
                <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  Supabase reachable
                </p>
                <p className="mt-0.5 text-[11px] text-dark-900/40">8 tables head-counted</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-dark-900/[0.06]">
              <table className="admin-table w-full">
                <thead>
                  <tr>
                    <th>Table</th>
                    <th>Rows</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-900/[0.04]">
                  {Object.entries(health.counts).length === 0 ? (
                    <tr>
                      <td colSpan={2} className="text-center text-sm text-dark-900/40">
                        {isCheckingHealth ? "Counting rows…" : "No data — run a check."}
                      </td>
                    </tr>
                  ) : (
                    Object.entries(health.counts).map(([label, count]) => (
                      <tr key={label}>
                        <td className="font-medium text-dark-900">{label}</td>
                        <td className={cn("font-bold", count === "err" ? "text-error" : "text-dark-900")}>
                          {count === "err" ? "unavailable" : (count as number).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard
            title="Security — Admin Password"
            subtitle="Change the password for your admin account (Supabase Auth)"
            bodyClassName="space-y-5"
          >
            <div className="grid gap-x-5 gap-y-1 sm:grid-cols-2">
              <Field label="New Password">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="admin-input"
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Confirm New Password">
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat the new password"
                  className="admin-input"
                  autoComplete="new-password"
                />
              </Field>
            </div>
            <div className="flex justify-end">
              <button
                onClick={handlePasswordChange}
                disabled={isUpdatingPassword || !newPassword || !confirmPassword}
                className="admin-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUpdatingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Update password
              </button>
            </div>
          </SectionCard>
        </>
      )}

      {/* AI Provider Settings */}
      {activeTab === "AI Provider" && <AiSettingsTab />}
    </div>
  );
}
