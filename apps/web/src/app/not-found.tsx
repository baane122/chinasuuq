import Link from "next/link";
import { PackageSearch, Home, Truck } from "lucide-react";

/** Branded 404 — previously every dead link landed on the unstyled Next default. */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-warm-50 px-4 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-500/10">
        <PackageSearch className="h-10 w-10 text-brand-500" />
      </div>
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">404</p>
      <h1 className="mt-2 text-3xl font-bold text-dark-900 sm:text-4xl">
        This page went missing in transit
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-dark-900/55">
        The page you are looking for does not exist or was moved. Let&apos;s get
        you back on the route from China to Somalia.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 active:scale-[0.98]"
        >
          <Home className="h-4 w-4" />
          Back to Home
        </Link>
        <Link
          href="/track"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-dark-900/10 bg-white px-6 py-3 text-sm font-semibold text-dark-700 transition hover:border-brand-500/30 hover:text-brand-600"
        >
          <Truck className="h-4 w-4" />
          Track an Order
        </Link>
      </div>
    </main>
  );
}
