import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "cod.lk888.ai",
      },
    ],
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://athkmrvsaijwgsyvwrbp.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0aGttcnZzYWlqd2dzeXZ3cmJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2NjM4NDQsImV4cCI6MjEwMTIzOTg0NH0.QAT0gZBJl-ELFG8221MRZoZoTj0La9_TOXFXx-HiKbY",
    NEXT_PUBLIC_WHATSAPP_NUMBER: "8615277074143",
  },
  // Static export with full type-safety gate — the project passes `tsc --noEmit`,
  // so the build now enforces real types (no more silent type-error bypass).
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    // Defer framer-motion-heavy below-the-fold sections to split bundles
    // (consumed via next/dynamic in page.tsx).
    optimizePackageImports: ["framer-motion", "lucide-react", "recharts"],
  },
};

export default nextConfig;
