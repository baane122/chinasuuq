// Phase 4 — AI gateway guardrails (contract layer; the server owns keys).
// Marketplace pages and uploaded documents are UNTRUSTED data. Extraction
// prompts never carry operational tools; page content is data, never
// instructions. This module encodes the typed schemas + budgets the gateway
// will enforce server-side. No API keys or secrets live here.

export type AiRole = "extraction" | "translation" | "support_draft" | "summary";

export interface AiGatewayPolicy {
  role: AiRole;
  maxTokens: number;
  maxRequestsPerMinute: number;
  toolsEnabled: boolean; // extraction MUST be false
  schemaRequired: boolean;
  redactFields: string[]; // e.g. names, payment details, OTPs
  actionAuthorization: "none" | "read_only" | "draft" | "controlled" | "high_impact";
}

export const AI_POLICIES: Record<AiRole, AiGatewayPolicy> = {
  extraction: {
    role: "extraction",
    maxTokens: 1500,
    maxRequestsPerMinute: 10,
    toolsEnabled: false, // never: page text must not trigger operations
    schemaRequired: true,
    redactFields: ["password", "otp", "token", "card"],
    actionAuthorization: "none",
  },
  translation: {
    role: "translation",
    maxTokens: 800,
    maxRequestsPerMinute: 30,
    toolsEnabled: false,
    schemaRequired: false,
    redactFields: ["password", "otp"],
    actionAuthorization: "none",
  },
  support_draft: {
    role: "support_draft",
    maxTokens: 1200,
    maxRequestsPerMinute: 10,
    toolsEnabled: false,
    schemaRequired: false,
    redactFields: ["card", "phone"],
    actionAuthorization: "draft", // staff review required before send
  },
  summary: {
    role: "summary",
    maxTokens: 900,
    maxRequestsPerMinute: 15,
    toolsEnabled: false,
    schemaRequired: false,
    redactFields: [],
    actionAuthorization: "read_only",
  },
};

// Grounding rule: every AI answer about an order cites authorized records.
export interface GroundedAnswer {
  answer: string;
  citations: string[]; // record ids the answer is based on
  sourcesFresh: boolean;
}

// Injection guard: content is validated as data through strict output
// schemas, and the prompt container is separated from untrusted content.
export function validateContentIsData(content: string): boolean {
  // Reject obvious instruction payloads before they reach any template.
  const dangerous = [
    "ignore previous",
    "ignore all previous",
    "you are now",
    "system prompt",
    "<system>",
    "reveal your",
  ];
  const lower = content.toLowerCase();
  return !dangerous.some((d) => lower.includes(d));
}
