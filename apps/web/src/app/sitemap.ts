import type { MetadataRoute } from "next";

// Required for `output: "export"`: the sitemap route handler must be fully
// static so it can be prerendered into out/sitemap.xml at build time.
export const dynamic = "force-static";

// Generated at build time (replaces the former hardcoded public/sitemap.xml,
// whose lastmod dates were frozen at 2026-09-21). `output: "export"` emits
// this to out/sitemap.xml on every production build.
const BASE_URL = "https://chinasuuq.com";
const LASTMOD = new Date().toISOString().slice(0, 10);

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/marketplaces/`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/marketplaces/1688/`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/marketplaces/taobao/`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/marketplaces/yiwugo/`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/marketplaces/chinagoods/`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/marketplaces/dollarstore/`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/how-it-works/`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/shipping/`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/business/`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/about/`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/help/`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/track/`, changeFrequency: "weekly", priority: 0.6 },
  ];
  return entries.map((entry) => ({ ...entry, lastModified: LASTMOD }));
}
