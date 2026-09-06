"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { hasAdminFallbackSession } from "@/lib/adminSession";
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
  LogOut,
  Menu,
  X,
  TrendingUp,
  BarChart3,
  Bell,
  HelpCircle,
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
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          router.replace("/admin/login");
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
      if (!session && !hasAdminFallbackSession())
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

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-dark-50">
        {/* ─── Mobile sidebar toggle ────────────────────────── */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed left-4 top-4 z-40 rounded-xl bg-dark-900 p-2.5 text-white shadow-lg md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* ─── Sidebar ──────────────────────────────────────── */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex flex-col bg-dark-900 text-white transition-all duration-300 md:static",
            collapsed ? "w-[72px]" : "w-64",
            sidebarOpen
              ? "translate-x-0"
              : "-translate-x-full md:translate-x-0"
          )}
        >
          {/* Logo */}
          <div
            className={cn(
              "flex items-center px-5 py-5",
              collapsed ? "justify-center" : "justify-between"
            )}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 shadow-sm shadow-brand-500/30">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              {!collapsed && (
                <div>
                  <p className="text-sm font-bold tracking-tight">
                    ChinaSuuq
                  </p>
                  <p className="text-[10px] text-white/40 font-medium">
                    Mission Control
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="hidden md:flex text-white/40 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <ChevronLeft
                  className={cn(
                    "h-4 w-4 transition-transform",
                    collapsed && "rotate-180"
                  )}
                />
              </button>
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-white/40 hover:text-white md:hidden p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* System Status indicator */}
          {!collapsed && (
            <div className="mx-3 mb-3 rounded-xl bg-white/5 border border-white/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-semibold text-white/60 uppercase tracking-wider">
                  System Online
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-white/5 p-2">
                  <p className="text-[10px] text-white/40">Uptime</p>
                  <p className="text-xs font-bold text-emerald-400">
                    99.9%
                  </p>
                </div>
                <div className="rounded-lg bg-white/5 p-2">
                  <p className="text-[10px] text-white/40">Latency</p>
                  <p className="text-xs font-bold text-white">42ms</p>
                </div>
              </div>
            </div>
          )}

          {/* Collapsed system dot */}
          {collapsed && (
            <div className="flex justify-center mb-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="System Online" />
            </div>
          )}

          {/* Search */}
          {!collapsed && (
            <div className="px-3 mb-3" ref={searchRef}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  placeholder="Search pages…"
                  className="h-9 w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
                />
              </div>
              {/* Search dropdown */}
              {searchFocused && searchResults.length > 0 && (
                <div className="mt-2 rounded-xl border border-white/10 bg-dark-800 shadow-xl overflow-hidden">
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
                        className="flex items-center gap-3 px-3 py-2.5 text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors"
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{r.label}</span>
                        <ChevronRight className="h-3 w-3 ml-auto opacity-30" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Notification bell (inline) */}
          {!collapsed && (
            <div className="px-3 mb-2">
              <Link
                href="/admin/orders"
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                  notifCount > 0
                    ? "bg-brand-500/10 text-brand-400 border border-brand-500/20"
                    : "text-white/50 hover:bg-white/5 hover:text-white"
                )}
              >
                <div className="relative">
                  <Bell className="h-[18px] w-[18px]" />
                  {notifCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-500 px-1 text-[9px] font-bold text-white">
                      {notifCount > 99 ? "99+" : notifCount}
                    </span>
                  )}
                </div>
                <span>Notifications</span>
                {notifCount > 0 && (
                  <span className="ml-auto rounded-full bg-brand-500/20 px-2 py-0.5 text-[10px] font-bold text-brand-400">
                    {notifCount}
                  </span>
                )}
              </Link>
            </div>
          )}

          {/* Collapsed notification bell */}
          {collapsed && notifCount > 0 && (
            <div className="flex justify-center mb-2">
              <div className="relative">
                <Bell className="h-4 w-4 text-white/50" />
                <span className="absolute -top-1 -right-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-brand-500 px-0.5 text-[8px] font-bold text-white">
                  {notifCount > 99 ? "99+" : notifCount}
                </span>
              </div>
            </div>
          )}

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all group",
                    collapsed && "justify-center px-0",
                    active
                      ? "bg-brand-500 text-white shadow-sm shadow-brand-500/30"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <div className="relative shrink-0">
                    <Icon className="h-[18px] w-[18px]" />
                    {/* Badge dot for collapsed sidebar */}
                    {!collapsed && item.badge && item.badge > 0 && (
                      <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-brand-500" />
                    )}
                  </div>
                  {!collapsed && <span className="flex-1">{item.label}</span>}
                  {!collapsed && item.badge && item.badge > 0 && (
                    <span className="rounded-full bg-brand-500/20 px-2 py-0.5 text-[10px] font-bold text-brand-400 min-w-[22px] text-center">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* ─── Bottom: User profile + actions ─────────────── */}
          <div className="border-t border-white/5 p-3 space-y-1">
            {/* View website */}
            {!collapsed && (
              <Link
                href="/"
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/40 hover:bg-white/5 hover:text-white transition-all"
              >
                <Globe className="h-[18px] w-[18px]" />
                <span>View Website</span>
              </Link>
            )}

            {/* User profile section */}
            <div
              className={cn(
                "rounded-xl transition-all",
                collapsed ? "p-0" : "bg-white/5 border border-white/5 p-3"
              )}
            >
              {collapsed ? (
                <div className="flex justify-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/20 text-brand-400 text-xs font-bold">
                    {adminName.charAt(0).toUpperCase()}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500/20 text-brand-400 text-sm font-bold shrink-0">
                    {adminName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">
                      {adminName}
                    </p>
                    <p className="text-[10px] text-white/40 truncate">
                      {adminEmail || "admin@chinasuuq.com"}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 px-1.5 py-0.5 text-[9px] font-bold text-brand-400 uppercase">
                      <Circle className="h-1.5 w-1.5 fill-current" />
                      {adminRole.replace("_", " ")}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Sign out */}
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

        {/* ─── Backdrop for mobile ──────────────────────────── */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ─── Main content ─────────────────────────────────── */}
        <main className="flex-1 overflow-auto">
          <div className="p-6 md:p-8 md:pt-16 lg:pt-8">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
