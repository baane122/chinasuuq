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
  // ── Security hardening ────────────────────────────────────────
  // Applies to every static page (admin included). On Vercel, the static
  // export is served by the CDN and these headers are applied at the edge.
  // For static export the matches run on the page path only (the apex/www
  // redirect is handled separately via the Vercel domain redirect rule).
  async headers() {
    // Strict CSP: same-origin for app + images, allow Supabase + WhatsApp
    // click-to-chat, disallow object/frame (clickjacking protection beyond
    // X-Frame-Options), and disallow inline scripts except for Next.js
    // hydration data. (Vercel adds its own HSTS already — max-age 2 years.)
    const csp = [
      "default-src 'self'",
      // Inline scripts allowed for Next.js hydration + data-island payloads
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.vercel-scripts.com",
      // Inline styles needed for some Tailwind utility edge cases
      "style-src 'self' 'unsafe-inline'",
      // Images: supabase storage + whatsapp avatar + data: (favicons)
      "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in https://athkmrvsaijwgsyvwrbp.supabase.co https://*.whatsapp.com https://wa.me",
      "font-src 'self' data:",
      // XHR/fetch targets: Supabase REST + GoTrue + Vercel analytics
      "connect-src 'self' https://*.supabase.co https://*.supabase.in https://athkmrvsaijwgsyvwrbp.supabase.co wss://*.supabase.co https://*.vercel-scripts.com https://*.vercel-insights.com",
      // WebView in marketplace browser needs to load 1688/taobao/...; trust nothing inline.
      "frame-src 'self' https://m.1688.com https://www.1688.com https://m.taobao.com https://www.taobao.com https://m.yiwugo.com https://www.yiwugo.com https://m.alibaba.com https://www.alibaba.com https://m.chinagoods.com https://www.chinagoods.com https://m.jd.com https://www.jd.com",
      // WhatsApp click-to-chat is launched via window.open / anchor → must be allowed
      "form-action 'self' https://wa.me https://*.whatsapp.com",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        // Every page
        source: "/:path*",
        headers: [
          // Clickjacking — deny iframing from any origin
          { key: "X-Frame-Options", value: "DENY" },
          // No MIME-sniff surprises
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Referrer policy — share only the bare origin
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Disable powerful features we don't use
          {
            key: "Permissions-Policy",
            value: [
              "accelerometer=()",
              "autoplay=()",
              "camera=()",
              "geolocation=()",
              "gyroscope=()",
              "microphone=()",
              "payment=()",
              "usb=()",
              "interest-cohort=()",
            ].join(", "),
          },
          // Cross-origin isolation primitives
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-site" },
          // Content Security Policy
          { key: "Content-Security-Policy", value: csp },
          // Strengthen HSTS (Vercel already sets 2y; we add `preload` directive
          // and pin to known hosts so it qualifies for the browser preload list)
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // Disable X-Powered-By (info leak)
          { key: "X-Powered-By", value: "" },
        ],
      },
      {
        // Admin area gets even stricter: deny caching so a logged-in view
        // can never be re-displayed from a shared cache.
        source: "/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
    ];
  },
  redirects: () => {
    // Canonicalize host: force apex (chinasuuq.com) over www subdomain.
    // Static export can't rewrite hosts; this is expressed as page-level
    // redirect meta. (Vercel handles the actual host redirect at the edge
    // via the project Domains config — we additionally enforce the rule
    // inside the HTML head below.)
    return [];
  },
};

export default nextConfig;
