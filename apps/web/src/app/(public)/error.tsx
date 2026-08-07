"use client";

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
          <span className="text-3xl">⚠️</span>
        </div>
        <h2 className="text-2xl font-bold text-dark-900 mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-dark-400 mb-6">
          An unexpected error occurred. Please try again or contact support.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="px-5 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 transition-all"
          >
            Try Again
          </button>
          <a
            href="/"
            className="px-5 py-2.5 rounded-xl border border-dark-200 text-dark-600 text-sm font-semibold hover:bg-dark-50 transition-all"
          >
            Go Home
          </a>
        </div>
      </div>
    </div>
  );
}
