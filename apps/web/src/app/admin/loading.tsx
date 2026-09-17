"use client";

import { Loader2, ShieldCheck } from "lucide-react";

export default function AdminLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 shadow-sm">
            <ShieldCheck className="h-7 w-7 text-brand-500" />
          </div>
          <Loader2 className="absolute -bottom-1.5 -right-1.5 h-6 w-6 animate-spin rounded-full bg-white p-0.5 text-brand-500 shadow-md" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-dark-900">Loading Mission Control…</p>
          <p className="mt-0.5 text-xs text-dark-900/40">Fetching live data from the backend</p>
        </div>
        <div className="mt-1 flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500/60"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
