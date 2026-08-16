import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
  Dimensions,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Bell,
  Mic,
  Search as SearchIcon,
  Truck,
  BadgePercent,
  Headphones,
  ChevronRight,
  MessageCircle,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useAuthStore } from "@/store/auth";
import { useI18n } from "@/lib/i18n";
import { ProductCard } from "@/components/home/ProductCard";
import { CategoryChips } from "@/components/home/CategoryChips";
import { WhatsAppCard } from "@/components/home/WhatsAppCard";
import { ProductCardSkeleton } from "@/components/ui/SkeletonLoader";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { FloatingCartButton } from "@/components/cart/FloatingCartButton";
import { getProducts } from "@/db";
import { MARKETPLACES } from "@/lib/marketplaces";
import type { Product } from "@/types";

// Brand assets — clean circular app icon (NOT the busy promo image)
const LOGO = require("../../assets/images/icon.png");

const { width: SCREEN_W } = Dimensions.get("window");

// ─── Hero banner data with generated images ───
const HERO_BANNERS = [
  {
    id: "1",
    title_en: "Order from China\nto Somalia",
    title_so: "Ka Dalbo Shiinaha\nilaa Soomaaliya",
    subtitle_en: "1688 · Taobao · YiwuGo",
    subtitle_so: "1688 · Taobao · YiwuGo",
    image: require("../../assets/hero/hero1.png"),
  },
  {
    id: "2",
    title_en: "Shop the Whole App\nBattle, Compare, Order",
    title_so: "Iibso Abka Oo Dhan\nTixgeli, Barbar dhig, Dalbo",
    subtitle_en: "Real browsing, in-app",
    subtitle_so: "Dhabtii ka dalbo, abka gudihiisa",
    image: require("../../assets/hero/hero2.png"),
  },
  {
    id: "3",
    title_en: "Pay with Zaad, EVC & more",
    title_so: "Ku bixi Zaad, EVC & kale",
    subtitle_en: "Across every Somali city",
    subtitle_so: "Magaalo kasta oo Soomaali",
    image: require("../../assets/hero/hero3.png"),
  },
];

const SERVICES = [
  { id: "247", icon: Headphones, label_en: "24/7 Ordering", label_so: "24/7 Dalab" },
  { id: "low", icon: BadgePercent, label_en: "Low Prices", label_so: "Qiimo Jaban" },
  { id: "fast", icon: Truck, label_en: "Fast Delivery", label_so: "Bixi Dhaqso" },
];

// ─── Service Badge Component ─────────────────────────
function ServiceBadge({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <View style={styles.serviceBadge}>
      <View style={styles.serviceIcon}>
        <Icon size={16} color={COLORS.primary} strokeWidth={2} />
      </View>
      <Text style={styles.serviceLabel}>{label}</Text>
    </View>
  );
}

// ─── Hero Banner Component ─────────────────────────
function HeroBannerCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const { locale } = useI18n();

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % HERO_BANNERS.length;
        scrollRef.current?.scrollTo({ x: next * (SCREEN_W - 40), animated: true });
        return next;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.heroWrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / (SCREEN_W - 40));
          setActiveIndex(idx);
        }}
      >
        {HERO_BANNERS.map((b) => (
          <View key={b.id} style={[styles.heroSlide, { width: SCREEN_W - 40 }]}>
            <Image source={b.image} style={styles.heroImg} resizeMode="cover" />
            <View style={styles.heroOverlay}>
              <Text style={styles.heroTitle} numberOfLines={2}>
                {locale === "en" ? b.title_en : b.title_so}
              </Text>
              <Text style={styles.heroSub}>{locale === "en" ? b.subtitle_en : b.subtitle_so}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.heroDots}>
        {HERO_BANNERS.map((_, i) => (
          <View key={i} style={[styles.heroDot, i === activeIndex && styles.heroDotActive]} />
        ))}
      </View>
    </View>
  );
}

// ─── Home Tab ────────────────────────────────────────
export default function HomeTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { t, locale } = useI18n();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [notifCount] = useState(3);
  const [refreshing, setRefreshing] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadProducts = useCallback(async (force = false) => {
    setError(false);
    try {
      const data = await getProducts(force);
      setProducts(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadProducts(true); // skip cache, pull fresh from Supabase
    setRefreshing(false);
  }, [loadProducts]);

  const trending = products
    .filter((p) => selectedCategory === "all" || p.category === selectedCategory)
    .slice()
    .sort((a, b) => b.sales_count - a.sales_count);

  const showAll = trending.length <= 0 && products.length > 0;

  return (
    <ErrorBoundary>
      <View style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingTop: insets.top + SPACING.lg }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* ── Clean App Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image source={LOGO} style={styles.headerLogo} resizeMode="contain" />
            <View>
              <Text style={styles.greeting}>
                {locale === "en" ? "Good day" : "Maalin wanaagsan"} 👋
              </Text>
              <View style={styles.brandRow}>
                <Text style={styles.brandChina}>China</Text>
                <Text style={styles.brandSuuq}>Suuq</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity
            style={styles.notifButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/notifications");
            }}
          >
            <Bell size={22} color={COLORS.black} />
            {notifCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{notifCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Search Bar ── */}
        <TouchableOpacity
          style={styles.searchBar}
          activeOpacity={0.8}
          onPress={() => router.push("/search")}
        >
          <SearchIcon size={18} color={COLORS.gray400} />
          <Text style={styles.searchPlaceholder}>
            {locale === "en" ? "Search products or paste a link" : "Raadi alaab ama Geli link"}
          </Text>
          <View style={styles.micIcon}>
            <Mic size={16} color={COLORS.primary} />
          </View>
        </TouchableOpacity>
        {/* ── Hero Banner Carousel ── */}
        <HeroBannerCarousel />

        {/* ── Marketplace Shortcuts ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {locale === "en" ? "Browse Marketplaces" : "Eeg Suuqyada"}
            </Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/markets")}>
              <Text style={styles.seeAll}>{locale === "en" ? "View all" : "Eeg dhammaan"}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.marketRow}
          >
            {MARKETPLACES.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={styles.marketCard}
                activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({
                    pathname: "/marketplace/[marketplace]",
                    params: { marketplace: m.id },
                  });
                }}
              >
                <Image source={m.icon} style={styles.marketIconImg} resizeMode="contain" />
                <Text style={styles.marketName}>{m.name}</Text>
                <Text style={styles.marketDesc} numberOfLines={1}>
                  {locale === "en" ? m.tagline_en : m.tagline_so}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Service Badges ── */}
        <View style={styles.serviceRow}>
          {SERVICES.map((s) => (
            <ServiceBadge
              key={s.id}
              icon={s.icon}
              label={locale === "en" ? s.label_en : s.label_so}
            />
          ))}
        </View>

        {/* ── Categories ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }]}>
            {t("home.categories")}
          </Text>
          <CategoryChips selected={selectedCategory} onSelect={setSelectedCategory} />
        </View>

        {/* ── Product Grid ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t("home.trending")}</Text>
            <TouchableOpacity onPress={() => router.push("/search")}>
              <Text style={styles.seeAll}>{t("home.seeAll")}</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.productGrid}>
              {[0, 1, 2, 3].map((i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </View>
          ) : error ? (
            <View style={styles.sectionFallback}>
              <Text style={styles.fallbackEmoji}>⚠️</Text>
              <Text style={styles.fallbackTitle}>Something went wrong</Text>
              <Text style={styles.fallbackSubtitle}>
                We couldn't load products right now. Pull to refresh.
              </Text>
            </View>
          ) : trending.length === 0 && showAll ? (
            <View style={styles.sectionFallback}>
              <Text style={styles.fallbackEmoji}>🛍️</Text>
              <Text style={styles.fallbackTitle}>No products yet</Text>
              <Text style={styles.fallbackSubtitle}>
                New products will appear here once the catalog is loaded.
              </Text>
            </View>
          ) : trending.length === 0 ? (
            <View style={styles.productGrid}>
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onPress={() => router.push(`/product/${product.id}`)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.productGrid}>
              {trending.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onPress={() => router.push(`/product/${product.id}`)}
                />
              ))}
            </View>
          )}
        </View>

        {/* ── WhatsApp Card ── */}
        <WhatsAppCard />

        {/* ── Bottom spacer ── */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
      <FloatingCartButton />
      </View>
    </ErrorBoundary>
  );
}

// ─── Styles ──────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.warmWhite,
  },
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  headerLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  greeting: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    marginBottom: 1,
  },
  brandRow: { flexDirection: "row", alignItems: "baseline" },
  brandChina: { fontSize: 22, fontFamily: FONTS.bold, color: COLORS.black, letterSpacing: -0.5 },
  brandSuuq: { fontSize: 22, fontFamily: FONTS.bold, color: COLORS.primary, letterSpacing: -0.5 },
  notifButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  notifBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  notifBadgeText: {
    fontSize: 9,
    fontFamily: FONTS.bold,
    color: COLORS.white,
  },
  // Search
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    height: 48,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  searchPlaceholder: {
    flex: 1,
    marginLeft: SPACING.sm,
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.gray400,
  },
  micIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.softOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  // Hero Banner
  heroWrap: { marginBottom: SPACING.xl },
  heroSlide: {
    height: 180,
    borderRadius: RADIUS.xl,
    overflow: "hidden",
    position: "relative",
  },
  heroImg: { width: "100%", height: "100%", position: "absolute" },
  heroOverlay: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    padding: SPACING.lg,
    backgroundColor: "rgba(13,17,23,0.62)",
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: RADIUS.xl,
    borderBottomRightRadius: RADIUS.xl,
  },
  heroTitle: { fontSize: 17, fontFamily: FONTS.bold, color: "#fff", lineHeight: 22, marginBottom: 4, letterSpacing: -0.2 },
  heroSub: { fontSize: 12, fontFamily: FONTS.semibold, color: "rgba(255,255,255,0.85)" },
  heroDots: { flexDirection: "row", justifyContent: "center", marginTop: 10, gap: 6 },
  heroDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,90,10,0.25)" },
  heroDotActive: { width: 20, backgroundColor: COLORS.primary },
  // Sections
  section: {
    marginBottom: SPACING.xxl,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
  },
  seeAll: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: COLORS.primary,
  },
  // Marketplace shortcuts — real icons
  marketRow: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  marketCard: {
    width: 110,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: "center",
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  marketIconImg: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
  },
  marketName: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
    marginBottom: 2,
  },
  marketDesc: {
    fontSize: 10,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  // Service badges
  serviceRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.xxl,
  },
  serviceBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.softOrange,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
  },
  serviceIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceLabel: {
    fontSize: 11,
    fontFamily: FONTS.medium,
    color: COLORS.black,
  },
  // Product grid
  productGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: SPACING.lg,
    justifyContent: "space-between",
  },
  // Fallback states
  sectionFallback: {
    marginHorizontal: SPACING.lg,
    paddingVertical: SPACING.xxl,
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  fallbackEmoji: { fontSize: 48, marginBottom: SPACING.md },
  fallbackTitle: {
    fontSize: 16,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
    marginBottom: SPACING.xs,
    textAlign: "center",
  },
  fallbackSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingHorizontal: SPACING.lg,
  },
  bottomSpacer: {
    height: 100,
  },
});
