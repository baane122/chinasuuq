"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { setAdminFallbackSession, hasAdminFallbackSession, defaultRecoveryCode, isDevBuild, showRecoveryEntry } from "@/lib/adminSession";
import { Eye, EyeOff, Loader2, LogIn, Lock, Mail, ShieldCheck, AlertTriangle, Globe, Package, Truck, CreditCard, TrendingUp, KeyRound } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<"credentials" | "backend" | "network" | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");

  const isEmailValid = email.includes("@") && email.includes(".");
  const isPasswordValid = password.length >= 6;
  const canSubmit = isEmailValid && isPasswordValid && !isLoading;

  // Already in a fallback session? go straight to admin. (Dev builds only.)
  useEffect(() => {
    if (isDevBuild && hasAdminFallbackSession()) {
      router.replace("/admin");
    }
    const saved = localStorage.getItem("chinasuuq-admin-email");
    if (saved) setEmail(saved);
  }, [router]);

  const submitRecovery = (e: React.FormEvent) => {
    e.preventDefault();
    // Hard gate: the recovery path does not exist in production builds.
    if (!isDevBuild) {
      setError("Recovery codes are disabled in production.");
      setErrorType("credentials");
      return;
    }
    // Also refuse an empty code explicitly (belt & braces — defaultRecoveryCode
    // is only non-empty in dev, but an empty-string comparison must never pass).
    if (!recoveryCode.trim() || recoveryCode.trim() !== defaultRecoveryCode) {
      setError("Incorrect recovery code.");
      setErrorType("credentials");
      return;
    }
    setAdminFallbackSession(true);
    try { localStorage.setItem("chinasuuq-admin-email", email || "admin@chinasuuq.com"); } catch {}
    router.replace("/admin");
    router.refresh();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrorType(null);
    if (!canSubmit) return;

    setIsLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        const msg = (authError.message || "").toLowerCase();
        if (msg.includes("database") || msg.includes("schema") || msg.includes("unexpected") || msg.includes("network")) {
          setErrorType("backend");
          setError("The authentication service is having issues (backend error). You can use the recovery code to access Mission Control.");
        } else if (msg.includes("invalid login credentials") || msg.includes("invalid email")) {
          setErrorType("credentials");
          setError("Invalid email or password. Please try again.");
        } else if (msg.includes("email not confirmed")) {
          setErrorType("credentials");
          setError("This email hasn't been confirmed yet. Check your inbox or contact support.");
        } else {
          setErrorType("credentials");
          setError(authError.message);
        }
        return;
      }

      if (data?.session) {
        try { localStorage.setItem("chinasuuq-admin-email", email); } catch {}
        router.push("/admin");
        router.refresh();
      }
    } catch (err: any) {
      setErrorType("network");
      setError("Could not reach the authentication service. Use the recovery code to access Mission Control.");
    } finally {
      setIsLoading(false);
    }
  };

  const featureItems = [
    { icon: Package, label: "Products", sub: "Full CRUD + marketplace sync" },
    { icon: Truck, label: "Orders & Shipments", sub: "Track from China to Somalia" },
    { icon: CreditCard, label: "Payments", sub: "Zaad · EVC · Bank transfers" },
  ];

  return (
    <div className="flex min-h-screen bg-warm-50">
      {/* ── Left brand panel (desktop) ── */}
      <div className="relative hidden w-[45%] flex-col overflow-hidden bg-gradient-to-br from-brand-600 via-brand-500 to-orange-700 p-12 lg:flex">
        {/* Decorative */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-black/10 blur-2xl" />
          <div
            className="absolute inset-0 opacity-10"
            style={{ backgroundImage: `radial-gradient(circle, white 1px, transparent 1px)`, backgroundSize: "28px 28px" }}
          />
        </div>

        {/* Logo row */}
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 items-center justify-center rounded-xl bg-white/15 p-1.5 backdrop-blur">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/admin/logo.jpg" alt="ChinaSuuq" className="h-full w-auto object-contain" />
          </div>
          <div>
            <p className="text-lg font-bold text-white">ChinaSuuq</p>
            <p className="text-xs text-white/70">Mission Control</p>
          </div>
        </div>

        {/* Headline + features */}
        <div className="relative mt-14">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium text-white/90 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Advanced Admin Platform
          </div>
          <h1 className="text-4xl font-bold leading-tight text-white">
            Complete Control of
            <span className="block text-white/90">Your Sourcing Empire</span>
          </h1>
          <p className="mt-4 max-w-sm text-sm text-white/70">
            Manage products, marketplaces, orders, payments, and logistics — all from one mission-critical dashboard.
          </p>

          <div className="mt-8 space-y-3">
            {featureItems.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-4 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <f.icon className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{f.label}</p>
                  <p className="text-xs text-white/60">{f.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Hero + footer */}
        <div className="relative mt-auto pt-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/admin/login_hero.png"
            alt="ChinaSuuq Mission Control"
            className="mx-auto w-full max-w-md drop-shadow-2xl"
          />
          <p className="mt-6 text-center text-xs text-white/50">© 2026 ChinaSuuq · Hargeisa → China</p>
        </div>
      </div>

      {/* ── Right login panel ── */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Mobile brand strip */}
          <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 p-1.5 shadow-sm ring-1 ring-dark-900/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/admin/logo.jpg" alt="ChinaSuuq" className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="text-base font-bold text-dark-900">ChinaSuuq</p>
              <p className="text-xs text-dark-900/50">Mission Control</p>
            </div>
          </div>

          {/* Login card */}
          <div className="rounded-3xl bg-white p-8 shadow-xl shadow-dark-900/[0.04] ring-1 ring-dark-900/[0.06] sm:p-10">
            {/* Logo + heading */}
            <div className="mb-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-warm-50 p-2 shadow ring-1 ring-dark-900/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/admin/logo.jpg" alt="ChinaSuuq" className="h-full w-full object-contain" />
              </div>
              <h1 className="mt-5 text-2xl font-bold tracking-tight text-dark-900">Mission Control</h1>
              <p className="mt-1.5 text-sm text-dark-900/50">Sign in to manage ChinaSuuq</p>
            </div>

            {/* Error banner */}
            {error && (
              <div className="mb-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold">
                    {errorType === "backend" ? "Authentication service issue" : errorType === "network" ? "Connection issue" : "Unable to sign in"}
                  </p>
                  <p className="mt-0.5 opacity-80">{error}</p>
                  {errorType === "backend" && (
                    <p className="mt-1.5 opacity-70">
                      The Supabase auth schema may need repair. Run <code className="rounded bg-rose-100 px-1">supabase link</code> + <code className="rounded bg-rose-100 px-1">supabase db push</code> or contact Supabase support.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Login form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div>
                <label htmlFor="email" className="admin-label">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-900/30" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@chinasuuq.com"
                    autoComplete="username"
                    className="admin-input h-11 pl-10"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="admin-label">
                    Password
                  </label>
                  <button type="button" className="text-xs font-medium text-dark-900/40 transition-colors hover:text-brand-500">
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-900/30" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className="admin-input h-11 pl-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-900/35 transition-colors hover:text-dark-900"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={!canSubmit}
                className={cn(
                  "admin-btn-primary h-11 w-full",
                  !canSubmit && "cursor-not-allowed opacity-50"
                )}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    Sign in to Mission Control
                  </>
                )}
              </button>
            </form>

            {/* Recovery access divider */}
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-dark-900/[0.08]" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-dark-900/30">or</span>
              <div className="h-px flex-1 bg-dark-900/[0.08]" />
            </div>

            {showRecoveryEntry && !showRecovery ? (
              <button
                type="button"
                onClick={() => setShowRecovery(true)}
                className="flex w-full items-center justify-center gap-2 text-xs font-medium text-dark-900/40 transition-colors hover:text-brand-500"
              >
                <KeyRound className="h-3.5 w-3.5" />
                Use recovery code
              </button>
            ) : (
              <form onSubmit={submitRecovery} className="space-y-3">
                <div>
                  <label htmlFor="recovery" className="admin-label">
                    Recovery code
                  </label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-900/30" />
                    <input
                      id="recovery"
                      type="password"
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value)}
                      placeholder="Enter recovery code"
                      className="admin-input h-11 pl-10"
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-dark-900/40">
                    Recovery code is a fallback when the auth service is unavailable. Set/change it in Admin Settings.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={!recoveryCode.trim()}
                  className="admin-btn-primary h-11 w-full"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Access Mission Control
                </button>
              </form>
            )}

            {/* Quick access hint */}
            <div className="mt-6 flex items-center gap-2 rounded-xl bg-warm-50 px-4 py-3">
              <TrendingUp className="h-4 w-4 shrink-0 text-brand-500" />
              <p className="text-xs text-dark-900/50">
                Full access to products, orders, marketplaces & payments
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
            <p className="text-center text-xs text-dark-900/40">
              Need help?{" "}
              <a href="https://wa.me/8615277074143" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-500 hover:text-brand-600">
                Contact support
              </a>
            </p>
            <div className="flex items-center gap-1.5 text-xs text-dark-900/40">
              <Globe className="h-3.5 w-3.5" />
              ChinaSuuq · Secure Admin Access
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
