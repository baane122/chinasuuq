import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { WwwRedirect } from "@/components/WwwRedirect";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#FF5A0A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

// Strict Content Security Policy — applied via <meta http-equiv> so it works
// in a static export (Vercel serves these HTML files directly without edge
// header injection). Allows:
//   - Self (app code, data island payloads)
//   - Supabase REST + GoTrue + WebSocket
//   - All 6 marketplace origins (in-app WebView browser)
//   - WhatsApp click-to-chat
//   - Vercel analytics scripts
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in https://athkmrvsaijwgsyvwrbp.supabase.co https://*.whatsapp.com https://wa.me",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://*.supabase.in https://athkmrvsaijwgsyvwrbp.supabase.co wss://*.supabase.co https://*.vercel-scripts.com https://*.vercel-insights.com",
  "frame-src 'self' https://m.1688.com https://www.1688.com https://m.taobao.com https://www.taobao.com https://m.yiwugo.com https://www.yiwugo.com https://m.alibaba.com https://www.alibaba.com https://m.chinagoods.com https://www.chinagoods.com https://m.jd.com https://www.jd.com",
  "form-action 'self' https://wa.me https://*.whatsapp.com",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

export const metadata: Metadata = {
  metadataBase: new URL("https://chinasuuq.com"),
  title: {
    default: "ChinaSuuq - China to Somalia Marketplace",
    template: "%s | ChinaSuuq",
  },
  description: "Browse millions of products from 1688, Taobao, Yiwugo, Alibaba, ChinaGoods and JD. Shop Chinese products with Somali prices and local delivery.",
  keywords: ["China", "Somalia", "marketplace", "1688", "Taobao", "Yiwugo", "Alibaba", "ChinaGoods", "JD", "sourcing", "import", "delivery", "Mogadishu"],
  authors: [{ name: "ChinaSuuq" }],
  creator: "ChinaSuuq",
  publisher: "ChinaSuuq",
  formatDetection: { email: false, address: false, telephone: false },
  alternates: {
    canonical: "/",
    languages: {
      en: "/",
      so: "/",
    },
  },
  openGraph: {
    title: "ChinaSuuq - China to Somalia Marketplace",
    description: "Browse millions of products from 1688, Taobao, Yiwugo, Alibaba, ChinaGoods and JD. Shop Chinese products with Somali prices and local delivery.",
    siteName: "ChinaSuuq",
    locale: "en_US",
    type: "website",
    url: "https://chinasuuq.com",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
  // Security meta tags — emitted as <meta http-equiv> in the HTML head.
  // For static export, this is the reliable way to ship CSP, X-Frame-Options,
  // X-Content-Type-Options, Referrer-Policy and Permissions-Policy to every
  // page (Vercel's edge headers don't apply to output: "export").
  other: {
    "http-equiv Content-Security-Policy": CSP,
    "http-equiv X-Content-Type-Options": "nosniff",
    "http-equiv X-Frame-Options": "DENY",
    "http-equiv Referrer-Policy": "strict-origin-when-cross-origin",
    "X-DNS-Prefetch-Control": "off",
    "Permissions-Policy": "accelerometer=(), autoplay=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=(), interest-cohort=()",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="antialiased">
        <WwwRedirect />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
