export const COLORS = {
  primary: "#FF5A0A",
  primaryLight: "#FB923C",
  primaryDark: "#E84400",
  black: "#111111",
  darkSurface: "#191919",
  white: "#FFFFFF",
  warmWhite: "#FFFCF8",
  softOrange: "#FFF3E9",
  border: "#E9E5E1",
  textSecondary: "#667085",
  textMuted: "#A8A29E",
  success: "#12B76A",
  warning: "#F79009",
  error: "#D92D20",
  info: "#2970FF",
  whatsapp: "#25D366",
} as const;

export const WHATSAPP_NUMBER = "8615277074143";
export const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;

export const SITE_URL = "https://chinasuuq.com";
export const ADMIN_SESSION_COOKIE = "chinasuuq-admin-session";

export const CATEGORIES = [
  { slug: "electronics", icon: "📱", en: "Electronics", so: "Elektiroonigga" },
  { slug: "fashion", icon: "👗", en: "Fashion", so: "Fashanka" },
  { slug: "home-kitchen", icon: "🏠", en: "Home & Kitchen", so: "Guriga" },
  { slug: "beauty", icon: "💄", en: "Beauty", so: "Quruxda" },
  { slug: "baby-toys", icon: "🧸", en: "Baby & Toys", so: "Carruurta" },
  { slug: "tools-hardware", icon: "🔧", en: "Tools & Hardware", so: "Qalabka" },
  { slug: "shoes-bags", icon: "👟", en: "Shoes & Bags", so: "Kabo" },
  { slug: "automotive", icon: "🚗", en: "Automotive", so: "Gaadiidka" },
  { slug: "machinery", icon: "⚙️", en: "Machinery", so: "Mashiinada" },
  { slug: "construction", icon: "🏗️", en: "Construction", so: "Dhismaha" },
  { slug: "packaging", icon: "📦", en: "Packaging", so: "Dhaqida" },
  { slug: "business-supplies", icon: "💼", en: "Business Supplies", so: "Alaabta Ganacsiga" },
] as const;

export const MARKETPLACES = [
  { slug: "1688", name: "1688", desc_en: "Wholesale & Factories", desc_so: "Jumlo & Warshadaha", icon: "🏭" },
  { slug: "taobao", name: "Taobao", desc_en: "Retail & Trending", desc_so: "Qiimo Retail", icon: "🛒" },
  { slug: "yiwugo", name: "YiwuGo", desc_en: "Yiwu Small Commodities", desc_so: "Yiwu Yaryar", icon: "📦" },
  { slug: "chinasuuq", name: "ChinaSuuq Deals", desc_en: "Verified Ready-Stock", desc_so: "Alaab Xaqiijisan", icon: "✅" },
] as const;
