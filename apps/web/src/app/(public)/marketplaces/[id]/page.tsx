import type { Metadata } from "next";
import MarketplaceDetail from "@/components/marketplaces/MarketplaceDetail";
import { MARKETPLACE_IDS, getMarketplace } from "@/lib/marketplaces";

// Static export: pre-render one page per marketplace id. The client
// component enriches with live rows from the admin-managed `marketplaces`
// table at runtime.
export function generateStaticParams() {
  return MARKETPLACE_IDS.map((id) => ({ id }));
}

// Per-marketplace metadata (title/description/canonical) instead of one
// static title templated identically onto all six pages.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const market = getMarketplace(id);

  if (!market) {
    return {
      title: "Marketplace",
      description: "Order from China's biggest marketplaces with ChinaSuuq.",
      alternates: { canonical: `/marketplaces/${id}/` },
    };
  }

  const base = market.description
    ? `${market.description}`
    : `Order from ${market.displayName} with ChinaSuuq`;
  const description = `${base} — USD quotes, quality inspection in Guangzhou and tracked shipping to Somalia.`;

  return {
    title: `${market.displayName} — Order via ChinaSuuq`,
    description,
    alternates: { canonical: `/marketplaces/${market.id}/` },
    openGraph: {
      title: `${market.displayName} — Order via ChinaSuuq`,
      description,
      url: `https://chinasuuq.com/marketplaces/${market.id}/`,
    },
  };
}

export default async function MarketplaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MarketplaceDetail id={id} />;
}
