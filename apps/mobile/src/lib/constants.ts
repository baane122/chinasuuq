// Self-contained brand constants for the mobile app
// (inlined from @chinasuuq/shared/constants for monorepo independence)

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
  // shipping method accents
  air: "#F0780A",
  sea: "#1E6FD9",
  // status backgrounds (soft tinted variants)
  successBg: "#ECFDF5",
  warningBg: "#FFFBEB",
  errorBg: "#FEF2F2",
  infoBg: "#EFF6FF",
  primaryBg: "#FFF3E9",
  gray50: "#F9FAFB",
  gray100: "#F3F4F6",
  gray200: "#E5E7EB",
  gray300: "#D1D5DB",
  gray400: "#9CA3AF",
  gray500: "#6B7280",
  gray600: "#4B5563",
  gray700: "#374151",
  gray800: "#1F2937",
  gray900: "#111827",
} as const;

export type ColorKey = keyof typeof COLORS;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  pill: 999,
} as const;

export const FONTS = {
  regular: "Inter-Regular",
  medium: "Inter-Medium",
  semibold: "Inter-SemiBold",
  bold: "Inter-Bold",
} as const;

export const WHATSAPP_NUMBER = "8615277074143";
export const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;

export const SUPABASE_URL = "https://athkmrvsaijwgsyvwrbp.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0aGttcnZzYWlqd2dzeXZ3cmJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2NjM4NDQsImV4cCI6MjEwMTIzOTg0NH0.QAT0gZBJl-ELFG8221MRZoZoTj0La9_TOXFXx-HiKbY";

export const SITE_URL = "https://chinasuuq.com";
export const DEFAULT_EXCHANGE_RATE = 7.0;
export const MAX_CART_QUANTITY = 999;
export const CART_STORAGE_KEY = "chinasuuq-cart";
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

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

export const MARKETPLACES = [
  { slug: "1688", name: "1688", desc_en: "Wholesale & Factories", desc_so: "Jumlo & Warshadaha", icon: "🏭" },
  { slug: "taobao", name: "Taobao", desc_en: "Retail & Trending", desc_so: "Qiimo Retail", icon: "🛒" },
  { slug: "yiwugo", name: "YiwuGo", desc_en: "Yiwu Small Commodities", desc_so: "Yiwu Yaryar", icon: "📦" },
  { slug: "chinasuuq", name: "ChinaSuuq Deals", desc_en: "Verified Ready-Stock", desc_so: "Alaab Xaqiijisan", icon: "✅" },
] as const;

export type MarketplaceSlug = (typeof MARKETPLACES)[number]["slug"];

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  purchasing: "Purchasing",
  purchased: "Purchased",
  in_transit_china: "In Transit (China)",
  warehouse: "In Warehouse",
  inspection: "Under Inspection",
  consolidated: "Consolidated",
  shipped: "Shipped",
  in_transit: "In Transit",
  arrived_somalia: "Arrived in Somalia",
  customs: "Customs Clearance",
  ready_for_pickup: "Ready for Pickup",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  zaad: "ZAAD",
  edahab: "Edahab",
  premier: "Premier Wallet",
  evc_plus: "EVC Plus",
  sahal: "Sahal",
  bank_transfer: "Bank Transfer",
  manual: "Manual",
};
