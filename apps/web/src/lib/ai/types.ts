/**
 * AI type definitions shared between the client library and edge function routes.
 *
 * Having a single source of truth prevents drift between:
 *  - `src/lib/ai/client.ts` (browser caller)
 *  - `functions/api/ai-chat/route.ts` (Next.js API route)
 *  - Edge functions deployed on Supabase (server-side implementation)
 */

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiCallOptions {
  messages: AiMessage[];
  /** Kept for call-site compatibility; the server resolves the model. */
  tier?: "premium" | "fast" | "vision";
  temperature?: number;
  timeoutMs?: number;
  maxTokens?: number;
}

export type AiCallFailure =
  | "not_configured"
  | "offline"
  | "timeout"
  | "unauthorized"
  | "rate_limited"
  | "server"
  | "empty"
  | "unknown";

export interface AiCallResult {
  ok: boolean;
  content?: string;
  failure?: AiCallFailure;
  error?: string;
}
