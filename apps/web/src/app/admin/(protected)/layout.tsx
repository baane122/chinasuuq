"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { hasAdminFallbackSession } from "@/lib/adminSession";
import Link from "next/link";
import { Loader2, LayoutDashboard, Users, Package, ShoppingBag, CreditCard, Ship, Boxes, Settings, Globe, ClipboardList, BadgeDollarSign, UserCog, LogOut, Menu, X, TrendingUp, BarChart3, Bell, HelpCircle, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToastProvider } from "@/components/admin/Toast";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, match: ["/admin"], badge: null },
  { href: "/admin/customers", label: "Customers", icon: Users, badge: null },
  { href: "/admin/products", label: "Products", icon: Package, badge: null },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag, badge: null },
  { href: "/admin/marketplaces", label: "Marketplaces", icon: Globe, badge: null },
  { href: "/admin/payments", label: "Payments", icon: CreditCard, badge: null },
  { href: "/admin/rates", label: "Exchange Rates", icon: BarChart3, badge: null },
  { href: "/admin/sourcing", label: "Sourcing", icon: ClipboardList, badge: null },
  { href: "/admin/quotes", label: "Quotes", icon: BadgeDollarSign, badge: null },
  { href: "/admin/shipments", label: "Shipments", icon: Ship, badge: null },
  { href: "/admin/warehouse", label: "Warehouse", icon: Boxes, badge: null },
  { href: "/admin/staff", label: "Staff & Roles", icon: UserCog, badge: null },
  { href: "/admin/settings", label: "Settings", icon: Settings, badge: null },
];

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const handleUnauthorized = () => {
      if (hasAdminFallbackSession()) {
        setIsAuthenticated(true);
        return;
      }
      router.replace("/admin/login");
    };
    const checkAuth = async () => {
      try {
        if (hasAdminFallbackSession()) {
          setIsAuthenticated(true);
          return;
        }
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.replace("/admin/login");
          return;
        }
        setIsAuthenticated(true);
      } catch {
        handleUnauthorized();
      }
    };
    checkAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session && !hasAdminFallbackSession()) router.replace("/admin/login");
    });
    return () => subscription.unsubscribe();
  }, [router]);

  if (isAuthenticated === null) {
    return (
      <div className="flex h-full items-center justify-center bg-dark-50">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <Loader2 className="h-10 w-10 animate-spin text-brand-500" />
            <div className="absolute inset-0 h-10 w-10 rounded-full border-2 border-brand-500/20" />
          </div>
          <p className="text-sm font-medium text-dark-900/50">Loading ChinaSuuq Mission Control…</p>
        </div>
      </div>
    );
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/admin/login");
  };

  const isActive = (item: (typeof NAV_ITEMS)[number]) =>
    item.match ? item.match.includes(pathname) : pathname.startsWith(item.href);

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-dark-50">
        {/* Mobile sidebar toggle */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed left-4 top-4 z-40 rounded-xl bg-dark-900 p-2.5 text-white shadow-lg md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex flex-col bg-dark-900 text-white transition-all duration-300 md:static",
            collapsed ? "w-[72px]" : "w-64",
            sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          )}
        >
          {/* Logo */}
          <div className={cn("flex items-center px-5 py-5", collapsed ? "justify-center" : "justify-between")}>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 shadow-sm shadow-brand-500/30">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              {!collapsed && (
                <div>
                  <p className="text-sm font-bold tracking-tight">ChinaSuuq</p>
                  <p className="text-[10px] text-white/40 font-medium">Mission Control</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="hidden md:flex text-white/40 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
              </button>
              <button onClick={() => setSidebarOpen(false)} className="text-white/40 hover:text-white md:hidden p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Quick Stats */}
          {!collapsed && (
            <div className="mx-3 mb-4 rounded-xl bg-white/5 border border-white/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-semibold text-white/60 uppercase tracking-wider">System Online</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-white/5 p-2">
                  <p className="text-[10px] text-white/40">Uptime</p>
                  <p className="text-xs font-bold text-emerald-400">99.9%</p>
                </div>
                <div className="rounded-lg bg-white/5 p-2">
                  <p className="text-[10px] text-white/40">Latency</p>
                  <p className="text-xs font-bold text-white">42ms</p>
                </div>
              </div>
            </div>
          )}

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                    collapsed && "justify-center px-0",
                    active
                      ? "bg-brand-500 text-white shadow-sm shadow-brand-500/30"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                  {!collapsed && item.badge && (
                    <span className="ml-auto rounded-full bg-brand-500/20 px-2 py-0.5 text-[10px] font-bold text-brand-400">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Bottom */}
          <div className="border-t border-white/5 p-3 space-y-1">
            {!collapsed && (
              <Link
                href="/"
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/40 hover:bg-white/5 hover:text-white transition-all"
              >
                <Globe className="h-[18px] w-[18px]" />
                <span>View Website</span>
              </Link>
            )}
            <button
              onClick={handleSignOut}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/40 hover:bg-white/5 hover:text-white transition-all",
                collapsed && "justify-center px-0"
              )}
            >
              <LogOut className="h-[18px] w-[18px]" />
              {!collapsed && <span>Sign Out</span>}
            </button>
          </div>
        </aside>

        {/* Backdrop for mobile */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Main */}
        <main className="flex-1 overflow-auto">
          <div className="p-6 md:p-8 md:pt-16 lg:pt-8">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
