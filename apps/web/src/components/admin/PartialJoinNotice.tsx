"use client";

import { AlertTriangle } from "lucide-react";

/**
 * Shown when a list loaded but one of its decorative joins (customer names,
 * source marketplaces, order links) only resolved partly or not at all.
 *
 * Those lookups used to swallow their own failures, so a blank cell looked
 * identical to "this order has no customer recorded" — the same class of bug
 * this console kept hitting. The data layer now returns plain-language notices
 * and every one of them is rendered here instead of dropped.
 *
 * Deliberately the same visual shape as RowCapNotice (amber, `role="status"`,
 * above the table) so operators learn one signal, not two.
 */
export function PartialJoinNotice({ messages }: { messages: string[] }) {
  if (!messages || messages.length === 0) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-700"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1">
        {messages.map((message, i) => (
          <p key={i}>{message}</p>
        ))}
      </div>
    </div>
  );
}
