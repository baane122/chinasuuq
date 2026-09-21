import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shipping & Freight",
  description:
    "Air and sea freight from Guangzhou to Hargeisa, Mogadishu and beyond — rates, timelines and door-to-door tracking.",
  alternates: { canonical: "/shipping/" },
};

export default function ShippingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
