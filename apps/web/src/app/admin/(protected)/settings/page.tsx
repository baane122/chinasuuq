"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Loader2, Save, RefreshCw } from "lucide-react";
import { z } from "zod";

const tabs = ["General", "Currency", "Shipping", "Staff"] as const;

const exchangeRateSchema = z.object({
  cny_to_usd: z.number().min(0.0001, "Rate must be positive"),
  cny_to_sos: z.number().min(0.0001, "Rate must be positive"),
  updated_by: z.string().min(1, "Updated by is required"),
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

  // Currency settings
  const [exchangeRates, setExchangeRates] = useState<ExchangeRateData>({
    cny_to_usd: 0.138,
    cny_to_sos: 79.5,
    updated_by: "admin",
  });
  const [rateErrors, setRateErrors] = useState<Partial<Record<keyof ExchangeRateData, string>>>({});
  const [isLoadingRates, setIsLoadingRates] = useState(false);

  // Shipping settings
  const [methods, setMethods] = useState(shippingMethods);

  // Staff
  const [staffList, setStaffList] = useState<{ id: string; email: string; full_name: string; role: string }[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);

  useEffect(() => {
    if (activeTab === "Currency") {
      fetchExchangeRate();
    }
    if (activeTab === "Staff") {
      fetchStaff();
    }
  }, [activeTab]);

  const fetchExchangeRate = async () => {
    setIsLoadingRates(true);
    try {
      const { data, error } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "exchange_rate")
        .single();

      if (!error && data?.value) {
        const parsed = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
        setExchangeRates((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Use default values if table doesn't exist yet
    } finally {
      setIsLoadingRates(false);
    }
  };

  const fetchStaff = async () => {
    setIsLoadingStaff(true);
    try {
      const { data, error } = await supabase
        .from("staff")
        .select("id, email, full_name, role")
        .order("created_at", { ascending: false });

      if (!error) {
        setStaffList(data || []);
      }
    } catch {
      // Table may not exist yet
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

      for (const setting of settings) {
        const { error } = await supabase
          .from("settings")
          .upsert({ key: setting.key, value: setting.value }, { onConflict: "key" });

        if (error) throw error;
      }

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
      const { error } = await supabase
        .from("settings")
        .upsert(
          { key: "exchange_rate", value: JSON.stringify(exchangeRates) },
          { onConflict: "key" }
        );

      if (error) throw error;
      setSaveMessage({ type: "success", text: "Exchange rates updated successfully" });
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
      const res = await fetch("https://api.exchangerate-api.com/v4/latest/CNY");
      const data = await res.json();
      if (data.rates?.USD) {
        setExchangeRates((prev) => ({
          ...prev,
          cny_to_usd: Number(data.rates.USD.toFixed(4)),
        }));
      }
      if (data.rates?.SOS) {
        setExchangeRates((prev) => ({
          ...prev,
          cny_to_sos: Number(data.rates.SOS.toFixed(2)),
        }));
      }
      setSaveMessage({ type: "success", text: "Exchange rates refreshed from API" });
    } catch {
      setSaveMessage({ type: "error", text: "Failed to fetch live rates" });
    } finally {
      setIsLoadingRates(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-dark-900">Settings</h1>
        <p className="text-sm text-dark-400">Configure your Mission Control panel</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-xl bg-dark-50 p-1">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-all",
              activeTab === tab
                ? "bg-white text-dark-900 shadow-sm"
                : "text-dark-400 hover:text-dark-600"
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
            "rounded-xl px-4 py-3 text-sm font-medium",
            saveMessage.type === "success"
              ? "bg-green-50 text-green-600 border border-green-200"
              : "bg-red-50 text-red-600 border border-red-200"
          )}
        >
          {saveMessage.text}
        </div>
      )}

      {/* General Settings */}
      {activeTab === "General" && (
        <div className="rounded-2xl bg-white border border-dark-100/50 p-6 shadow-sm space-y-6">
          <h2 className="text-lg font-bold text-dark-900">General Settings</h2>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-dark-700">Store Name</label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="h-11 w-full rounded-xl border border-dark-200 bg-white px-4 text-sm text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-dark-700">Support Email</label>
              <input
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                className="h-11 w-full rounded-xl border border-dark-200 bg-white px-4 text-sm text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-dark-700">WhatsApp Number</label>
              <input
                type="text"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                className="h-11 w-full rounded-xl border border-dark-200 bg-white px-4 text-sm text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-dark-700">Default Language</label>
              <select
                value={defaultLanguage}
                onChange={(e) => setDefaultLanguage(e.target.value)}
                className="h-11 w-full rounded-xl border border-dark-200 bg-white px-4 text-sm text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
              >
                <option value="en">English</option>
                <option value="so">Somali</option>
                <option value="zh">Chinese</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSaveGeneral}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-brand-600 transition-all disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* Currency Settings */}
      {activeTab === "Currency" && (
        <div className="rounded-2xl bg-white border border-dark-100/50 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-dark-900">Exchange Rates</h2>
            <button
              onClick={handleRefreshRate}
              disabled={isLoadingRates}
              className="inline-flex items-center gap-1.5 rounded-xl border border-dark-200 px-3 py-1.5 text-sm font-medium text-dark-600 hover:bg-dark-50 transition-all disabled:opacity-50"
            >
              <RefreshCw className={cn("h-4 w-4", isLoadingRates && "animate-spin")} />
              Fetch Live Rate
            </button>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-dark-700">CNY → USD Rate</label>
              <input
                type="number"
                step="0.0001"
                value={exchangeRates.cny_to_usd}
                onChange={(e) => setExchangeRates((prev) => ({ ...prev, cny_to_usd: parseFloat(e.target.value) || 0 }))}
                className={cn(
                  "h-11 w-full rounded-xl border bg-white px-4 text-sm text-dark-900 focus:outline-none focus:ring-2 transition-all",
                  rateErrors.cny_to_usd ? "border-red-300 focus:ring-red-500/30" : "border-dark-200 focus:ring-brand-500/30 focus:border-brand-500"
                )}
              />
              {rateErrors.cny_to_usd && <p className="mt-1 text-xs text-red-500">{rateErrors.cny_to_usd}</p>}
              <p className="mt-1 text-xs text-dark-400">1 CNY = {exchangeRates.cny_to_usd} USD</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-dark-700">CNY → SOS Rate</label>
              <input
                type="number"
                step="0.01"
                value={exchangeRates.cny_to_sos}
                onChange={(e) => setExchangeRates((prev) => ({ ...prev, cny_to_sos: parseFloat(e.target.value) || 0 }))}
                className={cn(
                  "h-11 w-full rounded-xl border bg-white px-4 text-sm text-dark-900 focus:outline-none focus:ring-2 transition-all",
                  rateErrors.cny_to_sos ? "border-red-300 focus:ring-red-500/30" : "border-dark-200 focus:ring-brand-500/30 focus:border-brand-500"
                )}
              />
              {rateErrors.cny_to_sos && <p className="mt-1 text-xs text-red-500">{rateErrors.cny_to_sos}</p>}
              <p className="mt-1 text-xs text-dark-400">1 CNY = {exchangeRates.cny_to_sos} SOS</p>
            </div>
          </div>

          <div className="rounded-xl bg-dark-50 p-4">
            <p className="text-sm text-dark-500">
              <strong className="text-dark-700">Note:</strong> Exchange rates are used to calculate product prices and order totals.
              Manual rates override the API rate. Always verify rates before saving.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSaveCurrency}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-brand-600 transition-all disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Rates
            </button>
          </div>
        </div>
      )}

      {/* Shipping Settings */}
      {activeTab === "Shipping" && (
        <div className="rounded-2xl bg-white border border-dark-100/50 p-6 shadow-sm space-y-6">
          <h2 className="text-lg font-bold text-dark-900">Shipping Methods</h2>

          <div className="space-y-4">
            {methods.map((method) => (
              <div
                key={method.id}
                className="flex items-center justify-between rounded-xl border border-dark-100 p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
                    <span className="text-lg font-bold">{method.id.charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-dark-900">{method.label}</p>
                    <p className="text-xs text-dark-400">Est. {method.estimatedDays}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <label className="mb-1 block text-xs text-dark-400">Rate ($/kg)</label>
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
                      className="h-9 w-24 rounded-lg border border-dark-200 bg-white px-3 text-sm text-right text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
                    />
                  </div>
                  <div className="text-right">
                    <label className="mb-1 block text-xs text-dark-400">Est. Days</label>
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
                      className="h-9 w-28 rounded-lg border border-dark-200 bg-white px-3 text-sm text-right text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Staff Settings */}
      {activeTab === "Staff" && (
        <div className="rounded-2xl bg-white border border-dark-100/50 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-dark-900">Staff Members</h2>
          </div>

          {isLoadingStaff ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
            </div>
          ) : staffList.length === 0 ? (
            <div className="rounded-xl bg-dark-50 p-8 text-center">
              <p className="text-sm text-dark-400">No staff members found. Staff can be added through the Supabase dashboard or a future UI.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-50">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-50">
                  {staffList.map((staff) => (
                    <tr key={staff.id}>
                      <td className="px-4 py-3 text-sm font-medium text-dark-900">{staff.full_name}</td>
                      <td className="px-4 py-3 text-sm text-dark-500">{staff.email}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-500 capitalize">
                          {staff.role.replace(/_/g, " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
