"use client";

import { useState, useEffect } from "react";
import { Loader2, Save, RefreshCw, Key, Globe, Cpu, CheckCircle, XCircle } from "lucide-react";
import { edgeFetch } from "@/lib/supabase";

// Calls go through edgeFetch (attaches apikey + the signed-in admin's JWT).
// The ai-settings / ai-test-connection Edge Functions verify the caller's
// admin role server-side; hardcoded keys and anon bearers are not allowed.

interface AiSettingsResponse {
  ok: boolean;
  base_url?: string;
  model?: string;
  api_key_masked?: string;
  is_configured?: boolean;
}

interface AiTestResponse {
  ok: boolean;
  note?: string;
  detail?: string;
  error?: string;
}

interface AiSaveResponse {
  ok: boolean;
  message?: string;
  errors?: string[];
  error?: string;
}

export function AiSettingsTab() {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("gpt-4o");
  const [maskedKey, setMaskedKey] = useState("");
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setIsLoading(true);
    try {
      const data = await edgeFetch<AiSettingsResponse>("ai-settings");
      if (data.ok) {
        setBaseUrl(data.base_url || "https://api.openai.com/v1");
        setModel(data.model || "gpt-4o");
        setMaskedKey(data.api_key_masked || "");
        setIsConfigured(Boolean(data.is_configured));
      }
    } catch { /* not configured */ }
    finally { setIsLoading(false); }
  };

  const testConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const data = await edgeFetch<AiTestResponse>("ai-test-connection", {
        method: "POST",
        body: { base_url: baseUrl, api_key: apiKey, model },
      });
      setTestResult({ ok: data.ok, message: data.ok ? (data.note || "Connected") : (data.detail || data.error || "Failed") });
    } catch (e) {
      setTestResult({ ok: false, message: "Error: " + (e as Error).message });
    } finally { setIsTesting(false); }
  };

  const save = async () => {
    setIsSaving(true);
    setSaveResult(null);
    try {
      const keyToSend = apiKey.length >= 10 ? apiKey : maskedKey || "";
      const data = await edgeFetch<AiSaveResponse>("ai-settings", {
        method: "POST",
        body: { api_key: keyToSend, base_url: baseUrl, model },
      });
      if (data.ok) {
        setSaveResult({ ok: true, message: "Saved" });
        setIsConfigured(true);
        load();
      } else {
        setSaveResult({ ok: false, message: data.errors?.join(", ") || data.error || "Failed" });
      }
    } catch (e) {
      setSaveResult({ ok: false, message: "Error: " + (e as Error).message });
    } finally { setIsSaving(false); }
  };

  if (isLoading) return (<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-brand-500" /></div>);

  return (<div className="rounded-2xl bg-white border border-dark-100/50 p-6 shadow-sm space-y-6"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold text-dark-900">AI Provider Configuration</h2><p className="text-sm text-dark-400 mt-1">Configure AI service for extraction, translation, and support drafts.</p></div>{isConfigured && <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-600 border border-green-200"><CheckCircle className="h-3.5 w-3.5" /> Configured</span>}</div><div className="space-y-5"><div><label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-dark-700"><Globe className="h-4 w-4 text-dark-400" /> Base URL</label><input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" className="w-full rounded-lg border border-dark-200 bg-white px-4 py-2.5 text-sm text-dark-900 placeholder:text-dark-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all" /><p className="mt-1 text-xs text-dark-400">OpenAI-compatible endpoint (OpenAI, DeepSeek, Moonshot, Groq, etc.)</p></div><div><label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-dark-700"><Cpu className="h-4 w-4 text-dark-400" /> Model</label><input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o" className="w-full rounded-lg border border-dark-200 bg-white px-4 py-2.5 text-sm text-dark-900 placeholder:text-dark-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all" /><p className="mt-1 text-xs text-dark-400">e.g. gpt-4o, deepseek-chat, claude-3-sonnet-20240229</p></div><div><label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-dark-700"><Key className="h-4 w-4 text-dark-400" /> API Key</label>{maskedKey && <p className="mb-2 text-xs text-dark-400">Current: <span className="font-mono text-dark-600 bg-dark-50 px-1.5 py-0.5 rounded">{maskedKey}</span></p>}<input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={maskedKey ? "Type new key to replace" : "sk-..."} className="w-full rounded-lg border border-dark-200 bg-white px-4 py-2.5 text-sm text-dark-900 placeholder:text-dark-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all" /><p className="mt-1 text-xs text-dark-400">Stored encrypted server-side. Never exposed to the browser.</p></div></div><div className="flex items-center gap-3"><button onClick={testConnection} disabled={isTesting || !apiKey || !baseUrl || !model} className="inline-flex items-center gap-2 rounded-lg border border-dark-200 bg-white px-4 py-2 text-sm font-medium text-dark-700 hover:bg-dark-50 transition-all disabled:opacity-40">{isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Test Connection</button>{testResult && <span className={testResult.ok ? "inline-flex items-center gap-1.5 text-sm font-medium text-green-600" : "inline-flex items-center gap-1.5 text-sm font-medium text-red-500"}>{testResult.ok ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {testResult.message}</span>}</div><div className="flex items-center gap-3 pt-4 border-t border-dark-100"><button onClick={save} disabled={isSaving || !baseUrl || !model} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 transition-all disabled:opacity-40">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save AI Settings</button>{saveResult && <span className={saveResult.ok ? "text-sm font-medium text-green-600" : "text-sm font-medium text-red-500"}>{saveResult.message}</span>}</div></div>);
}
