"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
          <span className="text-3xl">⚠️</span>
        </div>
        <h2 className="text-2xl font-bold text-dark-900 mb-2">
          Dashboard Error
        </h2>
        <p className="text-sm text-dark-400 mb-1">
          {error.message || "An unexpected error occurred."}
        </p>
        {error.digest && (
          <p className="text-xs text-dark-300 mb-6 font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="px-5 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 transition-all"
          >
            Retry
          </button>
          <a
            href="/admin"
            className="px-5 py-2.5 rounded-xl border border-dark-200 text-dark-600 text-sm font-semibold hover:bg-dark-50 transition-all"
          >
            Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
