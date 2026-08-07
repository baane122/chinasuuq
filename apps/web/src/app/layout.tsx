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
  title: "ChinaSuuq - China to Somalia Marketplace",
  description: "Browse millions of products from 1688, Taobao, and Yiwugo. Shop Chinese products with Somali prices and local delivery.",
  keywords: ["China", "Somalia", "marketplace", "1688", "Taobao", "sourcing", "import", "delivery"],
  openGraph: {
    title: "ChinaSuuq - China to Somalia Marketplace",
    description: "Browse millions of products from 1688, Taobao, and Yiwugo. Shop Chinese products with Somali prices and local delivery.",
    siteName: "ChinaSuuq",
    locale: "en_US",
    type: "website",
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
