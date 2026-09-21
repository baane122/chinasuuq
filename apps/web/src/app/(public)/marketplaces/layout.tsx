import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Marketplaces",
  description:
    "Order from 1688, Taobao, Yiwugo, Alibaba, ChinaGoods and JD through ChinaSuuq — one warehouse, USD quotes, WhatsApp ordering.",
  alternates: { canonical: "/marketplaces/" },
};

export default function MarketplacesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
