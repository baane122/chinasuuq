"use client";

import { usePathname } from "next/navigation";

// Outer admin layout. Kept intentionally minimal:
// - The /admin/login page provides its own full-screen design.
// - The (protected) route group owns the Mission Control chrome (sidebar,
//   topbar, auth guard) via its own layout.
// This prevents the "two sidebars" bug where this legacy layout rendered
// alongside the protected layout.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Login has its own full-screen layout — render it untouched.
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  // Every other admin route is handled by the (protected) layout, which wraps
  // children in its full Mission Control shell. This outer layout must NOT add
  // its own chrome, or we end up with duplicate menus.
  return <>{children}</>;
}
