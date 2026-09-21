import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ChinaSuuq for Business",
  description:
    "Wholesale sourcing, consolidation and freight for Somali businesses — buy from 1688, Taobao and Yiwu without a Chinese bank account.",
  alternates: { canonical: "/business/" },
};

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
