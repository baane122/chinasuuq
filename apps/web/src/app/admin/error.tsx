"use client";

import { AlertTriangle, RotateCcw, LayoutDashboard } from "lucide-react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-dark-900/[0.06] bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h2 className="mt-5 text-xl font-bold tracking-tight text-dark-900">
          Something went wrong
        </h2>
        <p className="mt-1.5 text-sm text-dark-900/50">
          {error.message || "An unexpected error occurred while loading Mission Control."}
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-[11px] text-dark-900/35">Error ID: {error.digest}</p>
        )}
        <div className="mt-7 flex items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="admin-btn-primary px-5"
          >
            <RotateCcw className="h-4 w-4" /> Retry
          </button>
          <a href="/admin" className="admin-btn-outline px-5">
            <LayoutDashboard className="h-4 w-4" /> Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
