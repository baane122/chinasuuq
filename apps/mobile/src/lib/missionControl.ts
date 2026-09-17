// Phase 3 — Mission Control contracts (operations-first, no chatbot-first).
// These typed models define the actionable queue the admin UI will render.
// The Next.js admin build is a later phase; this is the contract layer only.

export type QueueKind =
  | "order_confirmation"
  | "payment_verification"
  | "purchase_blocked"
  | "inspection"
  | "shipment_risk"
  | "sla_breach";

export type Priority = "urgent" | "high" | "normal" | "low";

export type QueueStatus = "open" | "assigned" | "in_progress" | "resolved";

export interface OperationalItem {
  id: string;
  kind: QueueKind;
  priority: Priority;
  status: QueueStatus;
  problem: string; // What needs attention
  why: string; // Why it needs attention
  evidence: string[]; // Supporting evidence references
  recommendedAction: string; // What should happen next
  approvalRequired: "none" | "single" | "second";
  owner?: string; // Who owns it
  dueAt?: string; // SLA time
  orderId?: string;
  customerImpact?: string;
  createdAt: string;
  updatedAt: string;
}

// Payment rule: a screenshot is evidence of a claim, not proof of settlement.
export type PaymentProofState = "submitted" | "matched" | "provider_confirmed";

// Approval levels (Phase 4 mirror on the client): read-only vs high-impact.
export type ApprovalLevel = "none" | "read_only" | "draft" | "controlled" | "high_impact";

export const HIGH_IMPACT_ACTIONS = [
  "verify_payment",
  "refund",
  "change_charges",
  "authorize_purchase",
  "dispatch_shipment",
  "cancel_order",
] as const;

export function requiresSecondApprover(action: string): boolean {
  return HIGH_IMPACT_ACTIONS.includes(action as (typeof HIGH_IMPACT_ACTIONS)[number]);
}
