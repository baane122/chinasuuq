// Single source of truth for marketplace data.
// Both `app/(tabs)/markets.tsx` and `app/(tabs)/home.tsx` import from here.

import { ImageSourcePropType } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type MarketplaceId =
  | "1688"
  | "taobao"
  | "yiwugo"
  | "alibaba"
  | "chinagoods"
  | "jd";

export interface Marketplace {
  id: MarketplaceId;
  name: string;
  tagline_en: string;
  tagline_so: string;
  desc_en: string;
  desc_so: string;
  stat_en: string;
  stat_so: string;
  icon: ImageSourcePropType;
  brandColor: string;
  shortMark: string;
  homeUrl: string;
  loginWalled: boolean;
}

export const MARKETPLACES: Marketplace[] = [
  {
    id: "1688",
    name: "1688",
    tagline_en: "China's #1 wholesale & factories",
    tagline_so: "Jumlada & warshadaha Shiinaha",
    desc_en: "Factory-direct, bulk-friendly pricing",
    desc_so: "Qiimo jumlo oo toos u ah",
    stat_en: "50M+ items",
    stat_so: "50M+ alaab",
    icon: require("../../assets/marketplaces/1688.png"),
    brandColor: "#FF5000",
    shortMark: "1688",
    homeUrl: "https://m.1688.com",
    loginWalled: false,
  },
  {
    id: "taobao",
    name: "Taobao",
    tagline_en: "Retail giant — widest selection",
    tagline_so: "Ganacsiga ugu weyn",
    desc_en: "Trending consumer goods, single items",
    desc_so: "Alaab caan ah, hal shay",
    stat_en: "100M+ items",
    stat_so: "100M+ alaab",
    icon: require("../../assets/marketplaces/taobao.png"),
    brandColor: "#FF6A00",
    shortMark: "淘",
    homeUrl: "https://m.taobao.com",
    loginWalled: true,
  },
  {
    id: "yiwugo",
    name: "YiwuGo",
    tagline_en: "Gateway to Yiwu Trade City",
    tagline_so: "Iridda Suuqa Yiwu",
    desc_en: "World's largest small-commodities market",
    desc_so: "Suuqa yaryar ee ugu weyn",
    stat_en: "5M+ items",
    stat_so: "5M+ alaab",
    icon: require("../../assets/marketplaces/yiwugo.png"),
    brandColor: "#1A8CFF",
    shortMark: "YWG",
    homeUrl: "https://www.yiwugo.com",
    loginWalled: true,
  },
  {
    id: "alibaba",
    name: "Alibaba",
    tagline_en: "Global B2B trade platform",
    tagline_so: "Suuqa ganacsiga B2B",
    desc_en: "Factories & suppliers for wholesale orders",
    desc_so: "Warshado & iibiyeyaal jumlada",
    stat_en: "200M+ items",
    stat_so: "200M+ alaab",
    icon: require("../../assets/marketplaces/alibaba.png"),
    brandColor: "#FF6A00",
    shortMark: "A",
    homeUrl: "https://m.alibaba.com",
    loginWalled: false,
  },
  {
    id: "chinagoods",
    name: "ChinaGoods",
    tagline_en: "Yiwu market online",
    tagline_so: "Suuqa Yiwu online",
    desc_en: "Yiwu small commodities at factory prices",
    desc_so: "Alaab yaryar oo qiimo warshadeed ah",
    stat_en: "2M+ items",
    stat_so: "2M+ alaab",
    icon: require("../../assets/marketplaces/chinagoods.png"),
    brandColor: "#E60012",
    shortMark: "CG",
    homeUrl: "https://www.chinagoods.com",
    loginWalled: false,
  },
  {
    id: "jd",
    name: "JD.com",
    tagline_en: "Quality electronics & tech",
    tagline_so: "Elektiroonigga & teknooloji",
    desc_en: "Genuine branded goods with fast delivery",
    desc_so: "Alaab dhab ah oo si degdeg ah loo geeyo",
    stat_en: "400M+ items",
    stat_so: "400M+ alaab",
    icon: require("../../assets/marketplaces/jd.png"),
    brandColor: "#E1251B",
    shortMark: "JD",
    homeUrl: "https://m.jd.com",
    loginWalled: false,
  },
];

export const MARKETPLACE_BY_ID: Record<string, Marketplace> = MARKETPLACES.reduce(
  (acc, m) => {
    acc[m.id] = m;
    return acc;
  },
  {} as Record<string, Marketplace>
);

// Detect a marketplace from a pasted URL. Returns the slug or null.
export function detectMarketplaceFromUrl(input: string): MarketplaceId | null {
  const lower = (input || "").toLowerCase();
  if (lower.includes("1688.com")) return "1688";
  if (lower.includes("taobao.com")) return "taobao";
  if (lower.includes("yiwugo.com")) return "yiwugo";
  if (lower.includes("alibaba.com")) return "alibaba";
  if (lower.includes("chinagoods.com")) return "chinagoods";
  if (lower.includes("jd.com")) return "jd";
  return null;
}

export function getMarketplace(id: string): Marketplace {
  return MARKETPLACE_BY_ID[id] ?? MARKETPLACE_BY_ID["1688"];
}

// ---- Recently visited marketplaces (max 3, most-recent first, deduped) ----
const RECENT_KEY = "chinasuuq-recent-marketplaces";
const RECENT_MAX = 3;

export async function getRecentlyVisited(): Promise<Marketplace[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const ids: string[] = JSON.parse(raw);
    if (!Array.isArray(ids)) return [];
    return ids
      .filter((id) => MARKETPLACE_BY_ID[id])
      .map((id) => MARKETPLACE_BY_ID[id]);
  } catch {
    return [];
  }
}

export async function addRecentlyVisited(id: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    const prev: string[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) prev.push(...parsed);
      } catch {}
    }
    // Most recent first, dedup, cap at RECENT_MAX
    const next = [id, ...prev.filter((x) => x !== id)].slice(0, RECENT_MAX);
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}
