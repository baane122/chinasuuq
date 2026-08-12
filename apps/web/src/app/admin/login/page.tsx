"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { setAdminFallbackSession, hasAdminFallbackSession, defaultRecoveryCode } from "@/lib/adminSession";
import { Eye, EyeOff, Loader2, LogIn, Lock, Mail, ShieldCheck, AlertTriangle, ChevronRight, Globe, Package, Truck, CreditCard, TrendingUp, KeyRound } from "lucide-react";

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

  // Already in a fallback session? go straight to admin.
  useEffect(() => {
    if (hasAdminFallbackSession()) {
      router.replace("/admin");
    }
    const saved = localStorage.getItem("chinasuuq-admin-email");
    if (saved) setEmail(saved);
  }, [router]);

  const submitRecovery = (e: React.FormEvent) => {
    e.preventDefault();
    if (recoveryCode.trim() !== defaultRecoveryCode) {
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
    <div className="flex min-h-screen bg-dark-950">
      {/* ── Left brand panel (desktop) ── */}
      <div className="relative hidden lg:flex w-[45%] flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-600 via-brand-500 to-orange-700 p-12">
        {/* Decorative */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-black/10 blur-2xl" />
          <div
            className="absolute inset-0 opacity-10"
            style={{ backgroundImage: `radial-gradient(circle, white 1px, transparent 1px)`, backgroundSize: "28px 28px" }}
          />
        </div>

        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-lg font-bold text-white">ChinaSuuq</p>
            <p className="text-xs text-white/70">Mission Control</p>
          </div>
        </div>

        <div className="relative">
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

          <div className="mt-8 space-y-4">
            {featureItems.map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
                  <f.icon className="h-4.5 w-4.5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{f.label}</p>
                  <p className="text-xs text-white/60">{f.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-white/50">© 2026 ChinaSuuq · Hargeisa → China</p>
      </div>

      {/* ── Right login form ── */}
      <div className="flex flex-1 items-center justify-center bg-dark-950 p-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="mb-10 flex flex-col items-center lg:items-start">
            <div className="mb-4 flex items-center gap-3 lg:hidden">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500">
                <ShieldCheck className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-lg font-bold text-white">ChinaSuuq</p>
                <p className="text-xs text-dark-400">Mission Control</p>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white">Welcome back, Admin</h2>
            <p className="mt-1 text-sm text-dark-400">Sign in to manage your ChinaSuuq platform</p>
          </div>

          {/* Error banner */}
          {error && (
            <div
              className={cn(
                "mb-5 rounded-xl border px-4 py-3 text-sm",
                errorType === "backend"
                  ? "border-amber-400/30 bg-amber-500/10 text-amber-300"
                  : errorType === "network"
                  ? "border-slate-400/30 bg-slate-500/10 text-slate-300"
                  : "border-red-400/30 bg-red-500/10 text-red-300"
              )}
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">
                    {errorType === "backend" ? "Authentication service issue" : errorType === "network" ? "Connection issue" : "Unable to sign in"}
                  </p>
                  <p className="mt-0.5 opacity-80">{error}</p>
                  {errorType === "backend" && (
                    <p className="mt-1.5 text-xs opacity-70">
                      The Supabase auth schema may need repair. Run <code className="rounded bg-black/20 px-1">supabase link</code> + <code className="rounded bg-black/20 px-1">supabase db push</code> or contact Supabase support.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Login card */}
          <div className="rounded-2xl bg-dark-900 p-8 shadow-2xl ring-1 ring-white/5">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-dark-300">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-dark-500" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@chinasuuq.com"
                    autoComplete="username"
                    className="h-11 w-full rounded-xl border border-dark-700 bg-dark-950 pl-11 pr-4 text-sm text-white placeholder:text-dark-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-dark-300">
                    Password
                  </label>
                  <button type="button" className="text-xs text-brand-400 hover:text-brand-300">
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-dark-500" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className="h-11 w-full rounded-xl border border-dark-700 bg-dark-950 pl-11 pr-11 text-sm text-white placeholder:text-dark-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-200"
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
                  "flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white shadow-md transition-all duration-200 active:scale-[0.98]",
                  canSubmit
                    ? "bg-brand-500 hover:bg-brand-600 shadow-brand-500/30"
                    : "cursor-not-allowed bg-dark-700 text-dark-400"
                )}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
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
              <div className="h-px flex-1 bg-dark-700" />
              <span className="text-[11px] font-medium text-dark-500">or</span>
              <div className="h-px flex-1 bg-dark-700" />
            </div>

            {!showRecovery ? (
              <button
                type="button"
                onClick={() => setShowRecovery(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dark-700 px-4 py-2.5 text-sm font-medium text-dark-300 hover:border-brand-500/40 hover:text-white transition-colors"
              >
                <KeyRound className="h-4 w-4 text-brand-400" />
                Use recovery code
              </button>
            ) : (
              <form onSubmit={submitRecovery} className="space-y-3">
                <div>
                  <label htmlFor="recovery" className="mb-1.5 block text-sm font-medium text-dark-300">
                    Recovery code
                  </label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-dark-500" />
                    <input
                      id="recovery"
                      type="password"
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value)}
                      placeholder="Enter recovery code"
                      className="h-11 w-full rounded-xl border border-dark-700 bg-dark-950 pl-11 pr-4 text-sm text-white placeholder:text-dark-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition-all"
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-dark-500">
                    Recovery code is a fallback when the auth service is unavailable. Set/change it in Admin Settings.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={!recoveryCode.trim()}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 text-sm font-semibold text-white shadow-md hover:bg-brand-600 transition-all disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Access Mission Control
                </button>
              </form>
            )}

            {/* Quick access hint */}
            <div className="mt-6 flex items-center gap-2 rounded-xl bg-dark-950/50 px-4 py-3">
              <TrendingUp className="h-4 w-4 text-brand-400" />
              <p className="text-xs text-dark-400">
                Full access to products, orders, marketplaces & payments
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
            <p className="text-center text-xs text-dark-500">
              Need help?{" "}
              <a href="https://wa.me/8615277074143" target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:text-brand-300">
                Contact support
              </a>
            </p>
            <div className="flex items-center gap-1.5 text-xs text-dark-500">
              <Globe className="h-3.5 w-3.5" />
              ChinaSuuq · Secure Admin Access
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
