import type { Metadata } from "next";
import MarketplaceDetail from "@/components/marketplaces/MarketplaceDetail";
import { MARKETPLACE_IDS } from "@/lib/marketplaces";

// Static export: pre-render one page per marketplace id. The client
// component enriches with live rows from the admin-managed `marketplaces`
// table at runtime.
export function generateStaticParams() {
  return MARKETPLACE_IDS.map((id) => ({ id }));
}

export const metadata: Metadata = {
  title: "Marketplace — ChinaSuuq",
  description: "Order from China's biggest marketplaces with ChinaSuuq.",
};

export default async function MarketplaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MarketplaceDetail id={id} />;
}
