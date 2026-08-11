"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { Loader2, LayoutDashboard, Users, Package, ShoppingBag, CreditCard, Ship, Boxes, Settings, Globe, ClipboardList, BadgeDollarSign, UserCog, LogOut, Menu, X, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToastProvider } from "@/components/admin/Toast";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, match: ["/admin"] },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/marketplaces", label: "Marketplaces", icon: Globe },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/rates", label: "Exchange Rates", icon: Globe },
  { href: "/admin/sourcing", label: "Sourcing", icon: ClipboardList },
  { href: "/admin/quotes", label: "Quotes", icon: BadgeDollarSign },
  { href: "/admin/shipments", label: "Shipments", icon: Ship },
  { href: "/admin/warehouse", label: "Warehouse", icon: Boxes },
  { href: "/admin/staff", label: "Staff & Roles", icon: UserCog },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.replace("/admin/login");
          return;
        }
        setIsAuthenticated(true);
      } catch {
        router.replace("/admin/login");
      }
    };
    checkAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace("/admin/login");
    });
    return () => subscription.unsubscribe();
  }, [router]);

  if (isAuthenticated === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-sm text-dark-400">Loading...</p>
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
          className="fixed left-4 top-4 z-40 rounded-lg bg-dark-900 p-2 text-white shadow-lg md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-dark-900 text-white transition-transform duration-300 md:static md:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {/* Logo */}
          <div className="flex items-center justify-between px-6 py-5">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold">ChinaSuuq</p>
                <p className="text-[10px] text-dark-400">Mission Control</p>
              </div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="text-dark-400 hover:text-white md:hidden">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
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
                    active ? "bg-brand-500 text-white" : "text-dark-300 hover:bg-dark-800 hover:text-white"
                  )}
                >
                  <Icon className="h-4.5 w-4.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Sign out */}
          <div className="border-t border-dark-800 p-3">
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-dark-300 hover:bg-dark-800 hover:text-white transition-all"
            >
              <LogOut className="h-4.5 w-4.5" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Backdrop for mobile */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Main */}
        <main className="flex-1 overflow-auto">
          <div className="p-6 md:p-8 md:pt-16 lg:pt-8">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
