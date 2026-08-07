import type { Metadata } from "next";

export const siteMetadata: Metadata = {
  title: {
    default: "ChinaSuuq - China to Somalia Marketplace | Shop Chinese Products",
    template: "%s | ChinaSuuq",
  },
  description:
    "Browse millions of products from 1688, Taobao, and Yiwugo. Shop Chinese products with Somali prices, local payment methods, and door delivery. ChinaSuuq handles purchasing, inspection, and shipping.",
  keywords: [
    "China to Somalia",
    "Chinese marketplace",
    "1688",
    "Taobao",
    "Yiwu",
    "sourcing agent",
    "import from China",
    "Somalia delivery",
    "wholesale China",
    "ChinaSuuq",
  ],
  authors: [{ name: "ChinaSuuq" }],
  creator: "ChinaSuuq",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://chinasuuq.com",
    siteName: "ChinaSuuq",
    title: "ChinaSuuq - China to Somalia Marketplace",
    description:
      "Browse millions of products from 1688, Taobao, and Yiwugo. Shop Chinese products with Somali prices and local delivery.",
    images: [
      {
        url: "https://chinasuuq.com/images/og-image.png",
        width: 1200,
        height: 630,
        alt: "ChinaSuuq - China to Somalia Marketplace",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ChinaSuuq - China to Somalia Marketplace",
    description:
      "Browse millions of products from 1688, Taobao, and Yiwugo.",
    images: ["https://chinasuuq.com/images/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "https://chinasuuq.com",
  },
};
