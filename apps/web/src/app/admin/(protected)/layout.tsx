"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { hasAdminFallbackSession, isDevBuild } from "@/lib/adminSession";
import Link from "next/link";
import {
  Loader2,
  LayoutDashboard,
  Users,
  Package,
  ShoppingBag,
  CreditCard,
  Ship,
  Boxes,
  Settings,
  Globe,
  ClipboardList,
  BadgeDollarSign,
  UserCog,
  BarChart3,
  LogOut,
  Menu,
  X,
  Bell,
  ChevronLeft,
  Search,
  ChevronRight,
  Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ToastProvider } from "@/components/admin/Toast";

/* ─── Navigation items with badge counts ────────────────────────── */
interface NavItem {
  href: string;
  label: string;
  icon: any;
  match?: string[];
  badge: number | null;
}

const NAV_ITEMS_BASE: Omit<NavItem, "badge">[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, match: ["/admin"] },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/marketplaces", label: "Marketplaces", icon: Globe },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/rates", label: "Exchange Rates", icon: BarChart3 },
  { href: "/admin/sourcing", label: "Sourcing", icon: ClipboardList },
  { href: "/admin/quotes", label: "Quotes", icon: BadgeDollarSign },
  { href: "/admin/shipments", label: "Shipments", icon: Ship },
  { href: "/admin/warehouse", label: "Warehouse", icon: Boxes },
  { href: "/admin/staff", label: "Staff & Roles", icon: UserCog },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

/* ─── Sidebar sections (grouped by href mapping into NAV_ITEMS_BASE) ── */
const NAV_SECTIONS: { title: string; hrefs: string[] }[] = [
  { title: "Overview", hrefs: ["/admin"] },
  { title: "Commerce", hrefs: ["/admin/orders", "/admin/customers", "/admin/payments"] },
  { title: "Operations", hrefs: ["/admin/sourcing", "/admin/shipments", "/admin/warehouse"] },
  { title: "Catalog", hrefs: ["/admin/products", "/admin/marketplaces", "/admin/rates"] },
  { title: "Office", hrefs: ["/admin/quotes", "/admin/staff", "/admin/settings"] },
];

/* ─── Search results dropdown ───────────────────────────────────── */
interface SearchResult {
  href: string;
  label: string;
  section: string;
  icon: any;
}

const ALL_ROUTES: SearchResult[] = NAV_ITEMS_BASE.map((item) => ({
  href: item.href,
  label: item.label,
  section: "Navigation",
  icon: item.icon,
}));

/* ─── Sidebar layout ────────────────────────────────────────────── */
export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [navItems, setNavItems] = useState<NavItem[]>([]);
  const [notifCount, setNotifCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [adminName, setAdminName] = useState("Admin");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminRole, setAdminRole] = useState("admin");
  const searchRef = useRef<HTMLDivElement>(null);

  /* ─── Auth check ─────────────────────────────────────────── */
  useEffect(() => {
    const handleUnauthorized = () => {
      if (isDevBuild && hasAdminFallbackSession()) {
        setIsAuthenticated(true);
        return;
      }
      router.replace("/admin/login");
    };
    const checkAuth = async () => {
      try {
        if (isDevBuild && hasAdminFallbackSession()) {
          setIsAuthenticated(true);
          return;
        }
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          router.replace("/admin/login");
          return;
        }
        // Role gate: a valid customer/supplier session must NOT reach the
        // admin shell. RLS still protects the data; this keeps non-staff out
        // of the UI entirely.
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .maybeSingle();
        const role = (profile?.role as string | undefined) ?? "";
        // The live user_role enum is (customer, staff, super_admin).
        if (!["staff", "super_admin"].includes(role)) {
          await supabase.auth.signOut();
          handleUnauthorized();
          return;
        }
        setIsAuthenticated(true);
        setAdminName(
          session.user?.user_metadata?.full_name ||
            session.user?.email?.split("@")[0] ||
            "Admin"
        );
        setAdminEmail(session.user?.email || "");
      } catch {
        handleUnauthorized();
      }
    };
    checkAuth();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session && !(isDevBuild && hasAdminFallbackSession()))
        router.replace("/admin/login");
    });
    return () => subscription.unsubscribe();
  }, [router]);

  /* ─── Fetch badge counts & notifications ─────────────────── */
  useEffect(() => {
    if (!isAuthenticated) return;

    (async () => {
      try {
        // Fetch notification count
        const { data: notifs } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .is("read_at", null);
        setNotifCount(notifs?.length ?? 0);

        // Fetch badge counts for nav items
        const [ordersRes, paymentsRes, sourcingRes, shipmentsRes] =
          await Promise.all([
            supabase
              .from("admin_orders_view")
              .select("id", { count: "exact", head: true })
              .in("status", [
                "pending",
                "awaiting_payment",
                "purchasing",
              ]),
            supabase
              .from("payments")
              .select("id", { count: "exact", head: true })
              .eq("status", "pending"),
            supabase
              .from("admin_sourcing_view")
              .select("id", { count: "exact", head: true })
              .eq("status", "open"),
            supabase
              .from("admin_shipments_view")
              .select("id", { count: "exact", head: true })
              .in("status", ["pending", "in_transit"]),
          ]);

        const badgeMap: Record<string, number> = {};
        if (ordersRes.count && ordersRes.count > 0)
          badgeMap["/admin/orders"] = ordersRes.count;
        if (paymentsRes.count && paymentsRes.count > 0)
          badgeMap["/admin/payments"] = paymentsRes.count;
        if (sourcingRes.count && sourcingRes.count > 0)
          badgeMap["/admin/sourcing"] = sourcingRes.count;
        if (shipmentsRes.count && shipmentsRes.count > 0)
          badgeMap["/admin/shipments"] = shipmentsRes.count;

        setNavItems(
          NAV_ITEMS_BASE.map((item) => ({
            ...item,
            badge: badgeMap[item.href] || null,
          }))
        );
      } catch {
        setNavItems(
          NAV_ITEMS_BASE.map((item) => ({ ...item, badge: null }))
        );
      }
    })();
  }, [isAuthenticated]);

  /* ─── Live polling for notification count ─────────────────── */
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      setNotifCount(count ?? 0);
    }, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  /* ─── Search logic ───────────────────────────────────────── */
  useEffect(() => {
    if (searchQuery.length < 1) {
      setSearchResults([]);
      return;
    }
    const q = searchQuery.toLowerCase();
    const results = ALL_ROUTES.filter((r) =>
      r.label.toLowerCase().includes(q)
    ).slice(0, 6);
    setSearchResults(results);
  }, [searchQuery]);

  // Close search on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(e.target as Node)
      ) {
        setSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (isAuthenticated === null) {
    return (
      <div className="flex h-full items-center justify-center bg-dark-50">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <Loader2 className="h-10 w-10 animate-spin text-brand-500" />
            <div className="absolute inset-0 h-10 w-10 rounded-full border-2 border-brand-500/20" />
          </div>
          <p className="text-sm font-medium text-dark-900/50">
            Loading ChinaSuuq Mission Control…
          </p>
        </div>
      </div>
    );
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/admin/login");
  };

  const isActive = (item: NavItem) =>
    item.match
      ? item.match.includes(pathname)
      : pathname.startsWith(item.href);

  const currentPageTitle = (() => {
    const exact = NAV_ITEMS_BASE.find((item) =>
      (item.match ?? [item.href]).includes(pathname)
    );
    if (exact) return exact.label;
    const prefixed = [...NAV_ITEMS_BASE]
      .sort((a, b) => b.href.length - a.href.length)
      .find((item) => pathname.startsWith(item.href));
    return prefixed?.label ?? "Dashboard";
  })();

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-dark-50">
        {/* ─── Sidebar ──────────────────────────────────────── */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex flex-col bg-dark-950 text-white transition-all duration-300 md:static",
            collapsed ? "w-[76px]" : "w-[264px]",
            sidebarOpen
              ? "translate-x-0"
              : "-translate-x-full md:translate-x-0"
          )}
        >
          {/* Logo */}
          <div
            className={cn(
              "relative flex items-center gap-3 px-4 py-5",
              collapsed && "justify-center px-0"
            )}
          >
            <div className="flex h-10 shrink-0 items-center justify-center rounded-xl bg-white/10 px-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/admin/logo.jpg"
                alt="ChinaSuuq"
                className="h-8 w-auto object-contain"
              />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">
                  ChinaSuuq
                </p>
                <p className="text-[10px] font-medium text-white/50">
                  Mission Control
                </p>
              </div>
            )}
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute right-3 top-3 rounded-lg p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white md:hidden"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Nav sections */}
          <nav className="scrollbar-slim flex-1 overflow-y-auto px-3 py-4">
            {NAV_SECTIONS.map((section) => {
              const sectionItems = section.hrefs
                .map((href) => navItems.find((n) => n.href === href))
                .filter((n): n is NavItem => Boolean(n));
              if (sectionItems.length === 0) return null;
              return (
                <div key={section.title} className="mb-5 last:mb-0">
                  {!collapsed && (
                    <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-white/25">
                      {section.title}
                    </p>
                  )}
                  <div className="space-y-1">
                    {sectionItems.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setSidebarOpen(false)}
                          title={collapsed ? item.label : undefined}
                          className={cn(
                            "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                            collapsed && "justify-center px-0",
                            active
                              ? "bg-white/[0.06] text-white"
                              : "text-white/45 hover:bg-white/5 hover:text-white/80"
                          )}
                        >
                          {active && (
                            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-brand-500" />
                          )}
                          <span className="relative shrink-0">
                            <Icon
                              className={cn(
                                "h-[18px] w-[18px]",
                                active ? "text-brand-400" : undefined
                              )}
                            />
                          </span>
                          {!collapsed && (
                            <span className="flex-1 truncate">
                              {item.label}
                            </span>
                          )}
                          {!collapsed && item.badge && item.badge > 0 && (
                            <span className="min-w-[22px] rounded-full bg-brand-500/20 px-2 py-0.5 text-center text-[10px] font-bold text-brand-400">
                              {item.badge > 99 ? "99+" : item.badge}
                            </span>
                          )}
                          {collapsed && item.badge && item.badge > 0 && (
                            <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-brand-500" />
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>

          {/* ─── Bottom: collapse toggle + sign out ─────────── */}
          <div className="space-y-1 border-t border-white/10 p-3">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className={cn(
                "hidden w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/45 transition-all hover:bg-white/5 hover:text-white/80 md:flex",
                collapsed && "justify-center px-0"
              )}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <ChevronLeft
                className={cn(
                  "h-[18px] w-[18px] transition-transform",
                  collapsed && "rotate-180"
                )}
              />
              {!collapsed && <span>Collapse</span>}
            </button>

            <button
              onClick={handleSignOut}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-300/80 transition-all hover:bg-rose-400/10 hover:text-rose-200",
                collapsed && "justify-center px-0"
              )}
            >
              <LogOut className="h-[18px] w-[18px]" />
              {!collapsed && <span>Sign Out</span>}
            </button>
          </div>
        </aside>

        {/* ─── Backdrop for mobile ──────────────────────────── */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ─── Main content ─────────────────────────────────── */}
        <main className="flex-1 overflow-auto">
          {/* Topbar */}
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-dark-900/[0.06] bg-warm-50/80 px-5 backdrop-blur-md md:gap-4 md:px-8">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-dark-900/60 transition-colors hover:bg-dark-900/5 hover:text-dark-900 md:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Breadcrumb */}
            <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
              <span className="hidden font-medium text-dark-900/35 sm:inline">
                Mission Control
              </span>
              <span className="hidden text-dark-900/20 sm:inline">/</span>
              <span className="truncate font-bold text-dark-900">
                {currentPageTitle}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-4">
              {/* Global search */}
              <div className="relative" ref={searchRef}>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-900/30" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  placeholder="Search pages…"
                  className="admin-input h-9 w-28 pl-9 transition-all focus:w-56 sm:w-64 sm:focus:w-80"
                />
                {/* Search dropdown */}
                {searchFocused && searchResults.length > 0 && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-dark-900/10 bg-white shadow-xl shadow-dark-900/10">
                    {searchResults.map((r) => {
                      const Icon = r.icon;
                      return (
                        <Link
                          key={r.href}
                          href={r.href}
                          onClick={() => {
                            setSearchQuery("");
                            setSearchFocused(false);
                            setSidebarOpen(false);
                          }}
                          className="flex items-center gap-3 px-3 py-2.5 text-sm text-dark-900/70 transition-colors hover:bg-warm-100 hover:text-dark-900"
                        >
                          <Icon className="h-4 w-4 shrink-0 text-brand-500" />
                          <span className="flex-1 truncate">{r.label}</span>
                          <span className="text-[10px] font-medium uppercase tracking-wide text-dark-900/30">
                            {r.section}
                          </span>
                          <ChevronRight className="h-3 w-3 opacity-30" />
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Notification bell */}
              <Link
                href="/admin/orders"
                aria-label="Notifications"
                className="relative flex h-10 w-10 items-center justify-center rounded-xl text-dark-900/50 transition-colors hover:bg-dark-900/5 hover:text-dark-900"
              >
                <Bell className="h-[18px] w-[18px]" />
                {notifCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-500 px-1 text-[9px] font-bold text-white ring-2 ring-warm-50">
                    {notifCount > 99 ? "99+" : notifCount}
                  </span>
                )}
              </Link>

              {/* Admin chip */}
              <div
                className="hidden items-center gap-3 sm:flex"
                title={adminEmail || "admin@chinasuuq.com"}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white shadow-sm shadow-brand-500/30">
                  {adminName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-sm font-semibold text-dark-900">
                    {adminName}
                  </p>
                  <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-dark-900/40">
                    <Circle className="h-1.5 w-1.5 fill-current text-emerald-500" />
                    {adminRole.replace("_", " ")}
                  </p>
                </div>
              </div>
            </div>
          </header>

          {/* Page content */}
          <div className="px-5 py-6 md:px-8 md:py-8">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
