import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
