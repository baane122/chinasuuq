"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Save, RefreshCw, Key, Globe, Cpu, CheckCircle, XCircle, Trash2, MessageSquare, Languages, Eye, PackageSearch, Server } from "lucide-react";
import { supabase, edgeFetch } from "@/lib/supabase";
import {
  useAdminPermissions,
  allowed,
  PERMISSIONS,
} from "@/lib/admin/permissions";
import { PermissionNotice } from "@/components/admin/ui";

// Full AI provider CRUD for Mission Control.
//
// Model: a GLOBAL default provider + optional PER-TASK overrides
// (copilot / translation / vision / extraction). Each override can point at
// a different vendor+model; an unconfigured task falls back to the global
// provider. All traffic goes through the ai-settings / ai-test-connection /
// ai-proxy edge functions, which verify the admin's JWT server-side and keep
// the API key out of the browser bundle.

interface ProviderView {
  ok: boolean;
  base_url?: string;
  model?: string;
  api_key_masked?: string;
  is_configured?: boolean;
  error?: string;
  tasks?: TaskView[];
}

interface TaskView {
  task: string;
  base_url: string;
  model: string;
  api_key_masked: string;
  configured: boolean;
  updated_at?: string;
}

interface AiTestResponse {
  ok: boolean;
  note?: string;
  detail?: string;
  error?: string;
}

const TASK_META: Record<string, { label: string; icon: any; blurb: string }> = {
  copilot: { label: "Copilot", icon: MessageSquare, blurb: "Mission Control chat, summaries, drafts" },
  translation: { label: "Translation", icon: Languages, blurb: "ai-translate: listing & page translation" },
  vision: { label: "Vision", icon: Eye, blurb: "Image understanding (AI Scan fallback)" },
  extraction: { label: "Extraction", icon: PackageSearch, blurb: "Product extraction & enrichment (strict JSON)" },
};

function ProviderCard({
  title,
  subtitle,
  icon: Icon,
  state,
  onSave,
  onTest,
  onReset,
  resettable,
}: {
  title: string;
  subtitle: string;
  icon: any;
  state: {
    baseUrl: string;
    model: string;
    apiKeyMasked: string;
    configured: boolean;
  };
  onSave: (v: { baseUrl: string; model: string; apiKey: string }) => Promise<{ ok: boolean; message: string }>;
  onTest: (v: { baseUrl: string; model: string; apiKey: string }) => Promise<{ ok: boolean; message: string }>;
  onReset?: () => Promise<{ ok: boolean; message: string }>;
  resettable?: boolean;
}) {
  const [baseUrl, setBaseUrl] = useState(state.baseUrl || "https://api.openai.com/v1");
  const [model, setModel] = useState(state.model || "");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<null | "save" | "test" | "reset">(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Re-sync local fields when the parent reloads state.
  useEffect(() => {
    setBaseUrl(state.baseUrl || "https://api.openai.com/v1");
    setModel(state.model || "");
    setApiKey("");
  }, [state.baseUrl, state.model, state.apiKeyMasked]);

  const current = () => ({
    baseUrl: baseUrl.trim().replace(/\/+$/, ""),
    model: model.trim(),
    // ONLY the raw value typed into the box. Blank means "unchanged". We must
    // NOT fall back to state.apiKeyMasked: the ai-settings edge function does
    // not recognise a masked placeholder ("sk-a...xyz") as "keep existing" —
    // on a task save it stores whatever it receives, and on a global save a
    // >=10-char masked string would silently overwrite the real secret.
    // The caller omits the api_key field entirely when this is empty.
    apiKey: apiKey.trim(),
  });

  const run = async (kind: "save" | "test" | "reset") => {
    setBusy(kind);
    setResult(null);
    try {
      const r = kind === "save" ? await onSave(current()) : kind === "test" ? await onTest(current()) : onReset ? await onReset() : { ok: false, message: "n/a" };
      setResult(r);
      if (kind === "save" && r.ok) setApiKey("");
    } catch (e) {
      setResult({ ok: false, message: "Error: " + (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-2xl border border-dark-100/50 bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10">
            <Icon className="h-4.5 w-4.5 text-brand-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-dark-900">{title}</h3>
              {state.configured ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-600 border border-green-200">
                  <CheckCircle className="h-3 w-3" /> Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600 border border-amber-200">
                  <XCircle className="h-3 w-3" /> Fallback
                </span>
              )}
            </div>
            <p className="text-xs text-dark-400 mt-0.5">{subtitle}</p>
          </div>
        </div>
        {state.apiKeyMasked && (
          <span className="rounded-md bg-dark-50 px-2 py-1 font-mono text-[10px] text-dark-400">{state.apiKeyMasked}</span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-dark-700">
            <Globe className="h-3.5 w-3.5 text-dark-400" /> Base URL
          </label>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="w-full rounded-lg border border-dark-200 bg-white px-3 py-2 text-sm text-dark-900 placeholder:text-dark-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
          />
        </div>
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-dark-700">
            <Cpu className="h-3.5 w-3.5 text-dark-400" /> Model
          </label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-4o / deepseek-chat / gemini-…"
            className="w-full rounded-lg border border-dark-200 bg-white px-3 py-2 text-sm text-dark-900 placeholder:text-dark-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-dark-700">
          <Key className="h-3.5 w-3.5 text-dark-400" /> API Key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={state.apiKeyMasked ? `Stored (${state.apiKeyMasked}) — leave blank to keep` : "sk-..."}
          className="w-full rounded-lg border border-dark-200 bg-white px-3 py-2 text-sm text-dark-900 placeholder:text-dark-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
        />
        <p className="mt-1 text-[11px] text-dark-400">
          Stored server-side in a service-role-only table. Never exposed to the browser.
        </p>
      </div>

      {result && (
        <div className={`rounded-lg px-3 py-2 text-xs ${result.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {result.message}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => run("save")}
          disabled={busy !== null}
          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
        >
          {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
        </button>
        <button
          onClick={() => run("test")}
          disabled={busy !== null}
          className="flex items-center gap-1.5 rounded-lg border border-dark-200 bg-white px-3.5 py-2 text-xs font-semibold text-dark-700 transition hover:bg-dark-50 disabled:opacity-50"
        >
          {busy === "test" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Test connection
        </button>
        {resettable && onReset && (
          <button
            onClick={() => run("reset")}
            disabled={busy !== null}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            title="Remove this override — the task falls back to the global provider"
          >
            {busy === "reset" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Use global
          </button>
        )}
      </div>
    </div>
  );
}

type Blocked = "none" | "auth" | "undeployed" | "error";

export function AiSettingsTab() {
  const perms = useAdminPermissions();
  const canEdit = allowed(perms, "aiKeys");
  const [global, setGlobal] = useState({ baseUrl: "", model: "", apiKeyMasked: "", configured: false });
  const [tasks, setTasks] = useState<Record<string, TaskView>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<Blocked>("none");

  const load = useCallback(async () => {
    setIsLoading(true);
    setBlocked("none");
    // Gateway-level rejection of a dead/expired session (verify_jwt) never
    // carries CORS headers, so supabase-js reports it as a fetch failure and
    // every screen shows a misleading "could not reach" message. Catch the
    // common case here: no live session → say exactly that and stop.
    const { data: sess } = await supabase.auth.getSession();
    if (!sess?.session) {
      setBlocked("auth");
      setNotice("Your admin session has expired. Sign in again and reopen this page.");
      return;
    }
    try {
      // Status-aware read: edgeFetch swallows the HTTP code, so use the
      // functions client, which surfaces it on error.context.status.
      const { data, error } = await supabase.functions.invoke<ProviderView>("ai-settings");
      const status = (error as unknown as { context?: { status?: number } } | null)?.context?.status;

      if (status === 404) {
        setBlocked("undeployed");
        setNotice("The ai-settings edge function isn’t deployed in this project yet, so provider keys can’t be read or saved.");
      } else if (status === 401 || status === 403) {
        setBlocked("auth");
        setNotice(
          "The AI provider endpoint rejected your session (401/403). It verifies a staff JWT server-side: make sure you’re signed in as staff — and if you are, the ai-settings function’s staff check still needs fixing on the backend."
        );
      } else if (error) {
        setBlocked("error");
        setNotice("Could not reach the AI settings service. Check your connection and try again.");
      } else if (!data || (data as ProviderView).error) {
        setBlocked("error");
        setNotice((data as ProviderView)?.error ?? "The AI settings service returned no data.");
      } else {
        const view = data as ProviderView;
        setGlobal({
          baseUrl: view.base_url || "",
          model: view.model || "",
          apiKeyMasked: view.api_key_masked || "",
          configured: Boolean(view.is_configured),
        });
        const map: Record<string, TaskView> = {};
        for (const t of view.tasks ?? []) map[t.task] = t;
        setTasks(map);
        setNotice(null);
      }
    } catch {
      setBlocked("error");
      setNotice("Could not load AI settings.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveGlobal = async (v: { baseUrl: string; model: string; apiKey: string }) => {
    const data = await edgeFetch<{ ok: boolean; message?: string; errors?: string[]; error?: string }>("ai-settings", {
      method: "POST",
      // api_key omitted entirely when unchanged: the global path requires a
      // fresh key and does not special-case a masked placeholder, so sending
      // one would corrupt the stored secret. A blank box now correctly fails
      // with "api_key_too_short" instead of silently overwriting.
      body: { base_url: v.baseUrl, model: v.model, ...(v.apiKey ? { api_key: v.apiKey } : {}) },
    });
    if (data.ok) { await load(); return { ok: true, message: "Global provider saved." }; }
    return { ok: false, message: data.errors?.join(", ") || data.error || "Save failed" };
  };

  const saveTask = (task: string) => async (v: { baseUrl: string; model: string; apiKey: string }) => {
    const data = await edgeFetch<{ ok: boolean; message?: string; errors?: string[]; error?: string }>("ai-settings", {
      method: "POST",
      // api_key omitted entirely when unchanged. The task path treats an
      // omitted key as "keep the existing stored secret" server-side.
      body: { task, base_url: v.baseUrl, model: v.model, ...(v.apiKey ? { api_key: v.apiKey } : {}) },
    });
    if (data.ok) { await load(); return { ok: true, message: `${TASK_META[task]?.label ?? task} provider saved.` }; }
    return { ok: false, message: data.errors?.join(", ") || data.error || "Save failed" };
  };

  const resetTask = (task: string) => async () => {
    const data = await edgeFetch<{ ok: boolean; error?: string }>(`ai-settings?task=${task}`, { method: "DELETE" });
    if (data.ok) { await load(); return { ok: true, message: `${TASK_META[task]?.label ?? task} now uses the global provider.` }; }
    return { ok: false, message: data.error || "Reset failed" };
  };

  const testProvider = (task?: string) => async (v: { baseUrl: string; model: string; apiKey: string }) => {
    const data = await edgeFetch<AiTestResponse>("ai-test-connection", {
      method: "POST",
      // Blank fields are OMITTED, not sent as "": the function resolves them
      // from the stored provider for this task (that is what "leave blank to
      // keep" means on screen), and an empty string used to come back as
      // missing_fields — the Test button could never pass without retyping the
      // secret.
      body: {
        ...(v.baseUrl?.trim() ? { base_url: v.baseUrl.trim() } : {}),
        ...(v.model?.trim() ? { model: v.model.trim() } : {}),
        ...(v.apiKey?.trim() ? { api_key: v.apiKey.trim() } : {}),
        ...(task ? { task } : {}),
      },
    });
    return { ok: !!data.ok, message: data.ok ? (data.note || "Connected") : (data.detail || data.error || "Failed") };
  };

  if (isLoading) {
    return (<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-brand-500" /></div>);
  }

  const taskList = Object.keys(TASK_META);
  const showEditor = blocked === "none" && canEdit;

  return (
    <div className="space-y-6">
      {/* RBAC affordance banners — a UI gate only; server RLS stays coarse. */}
      {!perms.loading && !perms.configured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          Permissions not configured — any signed-in staff member can edit AI provider keys until you seed the permission tables.
        </div>
      )}
      {!perms.loading && perms.configured && !canEdit && (
        <PermissionNotice required={`${PERMISSIONS.aiKeys.resource}:${PERMISSIONS.aiKeys.action}`} />
      )}

      {/* Honest status banner when the edge function can’t be reached. */}
      {blocked !== "none" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <p>{notice}</p>
          <button onClick={load} className="admin-btn-outline mt-3 h-8 px-3 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {showEditor && (
        <>
          {/* Global default provider */}
          <ProviderCard
        title="Global Default Provider"
        subtitle="Used by every AI task without its own override below"
        icon={Server}
        state={global}
        onSave={saveGlobal}
        onTest={testProvider()}
      />

      {/* Per-task overrides */}
      <div>
        <h3 className="mb-1 text-sm font-bold text-dark-900">Per-task overrides</h3>
        <p className="mb-3 text-xs text-dark-400">
          Point any task at a different vendor or model. Unconfigured tasks use the global provider.
        </p>
        <div className="grid gap-4 xl:grid-cols-2">
          {taskList.map((task) => {
            const t = tasks[task];
            const meta = TASK_META[task];
            return (
              <ProviderCard
                key={task}
                title={meta.label}
                subtitle={meta.blurb}
                icon={meta.icon}
                state={{
                  baseUrl: t?.base_url || "",
                  model: t?.model || "",
                  apiKeyMasked: t?.api_key_masked || "",
                  configured: Boolean(t?.configured),
                }}
                onSave={saveTask(task)}
                onTest={testProvider(task)}
                onReset={t?.configured ? resetTask(task) : undefined}
                resettable={Boolean(t?.configured)}
              />
            );
          })}
        </div>
      </div>
        </>
      )}
    </div>
  );
}
