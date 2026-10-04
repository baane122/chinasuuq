"use client";

import { AlertTriangle } from "lucide-react";

/**
 * Shown when an admin list fetch hits the explicit 1000-row read cap, so the
 * operator knows older records are hidden by the cap rather than genuinely
 * absent. This is a static-export client app (no server pagination without
 * restructuring these screens), so the cap is made visible instead of silent.
 */
export function RowCapNotice({ noun = "records" }: { noun?: string }) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-700"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      Showing the first 1000 {noun} (most recent first) — older {noun} are hidden
      by this read cap.
    </div>
  );
}
