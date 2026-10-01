"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, Trash2, Loader2, Bot, User, FileText, Languages, PackageSearch, MessageSquareText } from "lucide-react";
import { supabase, edgeFetch } from "@/lib/supabase";

// Copilot chat goes through the ai-proxy edge function: staff-gated, and the
// provider (base URL / key / model) is resolved server-side from Mission
// Control's AI Provider settings — per-task `copilot` override, falling back
// to the global provider. The API key never reaches the browser.
async function copilotChat(
  messages: AiMessage[],
  opts?: { temperature?: number; maxTokens?: number }
): Promise<string | null> {
  try {
    const data = await edgeFetch<{ ok: boolean; content?: string; error?: string }>(
      "ai-proxy",
      {
        method: "POST",
        body: {
          messages,
          temperature: opts?.temperature,
          max_tokens: opts?.maxTokens,
        },
      }
    );
    return data.ok && data.content ? data.content : null;
  } catch {
    return null;
  }
}
import { cn } from "@/lib/utils";

// Minimal message shape for the ai-proxy payloads (role/content pairs).
type AiMessage = { role: "system" | "user" | "assistant"; content: string };

interface ChatEntry {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

type TaskKey = "translate" | "reply" | "describe" | null;

const SYSTEM_PROMPT =
  "You are ChinaSuuq Copilot, an assistant for staff of ChinaSuuq, a China-to-Somalia sourcing marketplace. " +
  "Be concise and business-focused. When asked to write Somali (af-Soomaali), use natural Somali, not machine-literal. " +
  "Prices are USD; supplier prices CNY. Reply in plain text, no markdown headers.";

const TASKS: { key: Exclude<TaskKey, null>; label: string; icon: any; placeholder: string; build: (input: string) => string }[] = [
  {
    key: "translate",
    label: "Translate to Somali",
    icon: Languages,
    placeholder: "Text to translate into Somali…",
    build: (input) => `Translate the following into Somali (af-Soomaali). Reply with the translation only.\n\n${input}`,
  },
  {
    key: "reply",
    label: "Draft customer reply",
    icon: MessageSquareText,
    placeholder: "Customer issue or question…",
    build: (input) =>
      `Draft a warm, professional customer support reply for this situation. Provide TWO versions: first in English, then in Somali (label them clearly). Situation: ${input}`,
  },
  {
    key: "describe",
    label: "Write product description",
    icon: PackageSearch,
    placeholder: "Product name + key specs (e.g. Wireless earbuds, BT 5.3, 89 CNY, MOQ 2)…",
    build: (input) =>
      `Write a short e-commerce product description for this China-sourced item: ${input}. Give an English version, then a Somali version (label them). Max 60 words each, customer-facing tone.`,
  },
];

export default function AdminAiPage() {
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<TaskKey>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, busy]);

  const push = (role: ChatEntry["role"], content: string) =>
    setChat((c) => [...c, { role, content, ts: Date.now() }]);

  const ask = async (userText: string) => {
    if (!userText.trim() || busy) return;
    setError(null);
    setBusy(true);
    push("user", userText);
    const history: AiMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...chat.slice(-8).map((c) => ({ role: c.role, content: c.content }) as AiMessage),
      { role: "user", content: userText },
    ];
    const answer = await copilotChat(history, { temperature: 0.4, maxTokens: 1200 });
    if (answer) push("assistant", answer);
    else setError("AI did not respond. Check your connection and try again.");
    setBusy(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input;
    setInput("");
    setActiveTask(null);
    ask(text);
  };

  /* One-click: summarize last 20 orders from live data */
  const summarizeOrders = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    push("user", "Summarize my latest orders.");
    try {
      const { data, error: dbErr } = await supabase
        .from("orders")
        .select("reference,status,total_usd,shipping_method,payment_status,created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (dbErr || !data) throw new Error("db");
      const answer = await copilotChat(
        [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content:
              "Here are the latest orders as JSON. Give a concise business summary: total value, status breakdown, payment risks, and 2 recommended actions.\n\n" +
              JSON.stringify(data),
          },
        ],
        { temperature: 0.3, maxTokens: 900 }
      );
      if (answer) push("assistant", answer);
      else setError("AI did not respond. Try again.");
    } catch {
      setError("Could not load orders for summarization.");
    }
    setBusy(false);
  };

  const startTask = (key: Exclude<TaskKey, null>) => {
    setActiveTask(key);
    setInput("");
  };

  const activeTaskDef = TASKS.find((t) => t.key === activeTask) ?? null;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF6B1A]/10">
            <Sparkles className="h-5 w-5 text-[#FF6B1A]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F1419]">AI Copilot</h1>
            <p className="text-xs text-[#0F1419]/60">
              Powered by Gemini · Summaries, replies, descriptions & Somali translation
            </p>
          </div>
        </div>
        {chat.length > 0 && (
          <button
            onClick={() => { setChat([]); setError(null); }}
            className="flex items-center gap-1.5 rounded-lg border border-[#0F1419]/10 px-3 py-1.5 text-xs font-medium text-[#0F1419]/70 transition hover:bg-[#0F1419]/5"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={summarizeOrders}
          disabled={busy}
          className="flex items-center gap-2 rounded-xl bg-[#FF6B1A] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
        >
          <FileText className="h-4 w-4" /> Summarize orders
        </button>
        {TASKS.map((t) => (
          <button
            key={t.key}
            onClick={() => startTask(t.key)}
            disabled={busy}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition disabled:opacity-50",
              activeTask === t.key
                ? "border-[#FF6B1A] bg-[#FF6B1A]/10 text-[#FF6B1A]"
                : "border-[#0F1419]/10 bg-white text-[#0F1419]/80 hover:border-[#FF6B1A]/50"
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto rounded-2xl border border-[#0F1419]/10 bg-white p-4">
        {chat.length === 0 && !busy && (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 text-center">
            <Bot className="h-10 w-10 text-[#FF6B1A]/40" />
            <p className="text-sm font-medium text-[#0F1419]/70">Your AI assistant for Mission Control</p>
            <p className="max-w-sm text-xs text-[#0F1419]/50">
              Ask anything, or use a quick action above — order summaries, bilingual customer replies, product descriptions, and Somali translation.
            </p>
          </div>
        )}
        <div className="flex flex-col gap-4">
          {chat.map((c, i) => (
            <div key={i} className={cn("flex gap-3", c.role === "user" && "flex-row-reverse")}>
              <div className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                c.role === "assistant" ? "bg-[#FF6B1A]/10" : "bg-[#0F1419]/5"
              )}>
                {c.role === "assistant"
                  ? <Bot className="h-4.5 w-4.5 text-[#FF6B1A]" />
                  : <User className="h-4.5 w-4.5 text-[#0F1419]/60" />}
              </div>
              <div className={cn(
                "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                c.role === "assistant"
                  ? "bg-[#FFF8F3] text-[#0F1419]"
                  : "bg-[#0F1419] text-white"
              )}>
                {c.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FF6B1A]/10">
                <Bot className="h-4.5 w-4.5 text-[#FF6B1A]" />
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-[#FFF8F3] px-4 py-2.5">
                <Loader2 className="h-4 w-4 animate-spin text-[#FF6B1A]" />
                <span className="text-xs text-[#0F1419]/60">Thinking…</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">{error}</div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={activeTaskDef ? activeTaskDef.placeholder : "Ask the copilot anything…"}
          className="h-11 flex-1 rounded-xl border border-[#0F1419]/10 bg-white px-4 text-sm outline-none transition placeholder:text-[#0F1419]/40 focus:border-[#FF6B1A] focus:ring-2 focus:ring-[#FF6B1A]/20"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FF6B1A] text-white shadow-sm transition hover:brightness-110 disabled:opacity-40"
          aria-label="Send"
        >
          <Send className="h-4.5 w-4.5" />
        </button>
      </form>
    </div>
  );
}
