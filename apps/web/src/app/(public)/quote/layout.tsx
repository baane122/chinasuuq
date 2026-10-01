import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get a Free Quote — ChinaSuuq",
  description:
    "Paste a 1688, Taobao, YiwuGo or Chinagoods product link and get a USD quote with inspection and tracked shipping to Somalia. Free, no payment until you approve.",
  alternates: { canonical: "/quote/" },
  openGraph: {
    title: "Get a Free Quote — ChinaSuuq",
    description:
      "Paste a product link from any Chinese marketplace and get a USD quote with inspection and tracked shipping to Somalia.",
    url: "https://chinasuuq.com/quote/",
  },
};

export default function QuoteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
