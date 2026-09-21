import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "Pick a marketplace, send us the link, we buy and consolidate in Guangzhou, and ship to your door in Somalia — air or sea.",
  alternates: { canonical: "/how-it-works/" },
};

export default function HowItWorksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
