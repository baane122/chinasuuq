import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help Center",
  description:
    "Answers about ordering, quotes, payments, shipping and tracking with ChinaSuuq.",
  alternates: { canonical: "/help/" },
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
