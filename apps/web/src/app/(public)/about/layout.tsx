import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About ChinaSuuq",
  description:
    "Who we are — the China-to-Somalia sourcing team: Guangzhou warehouse, quality inspection and tracked delivery to Hargeisa and Mogadishu.",
  alternates: { canonical: "/about/" },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
