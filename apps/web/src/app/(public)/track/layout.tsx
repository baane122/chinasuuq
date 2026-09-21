import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Track Your Order",
  description:
    "Follow your ChinaSuuq order from purchase in China to delivery in Somalia.",
  alternates: { canonical: "/track/" },
};

export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
