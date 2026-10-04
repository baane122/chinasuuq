import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Bell,
  Mic,
  Search as SearchIcon,
  ChevronRight,
  MessageCircle,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useAuthStore } from "@/store/auth";
import { useStaffStore } from "@/store/staff";
import { useI18n } from "@/lib/i18n";
import { ProductCard } from "@/components/home/ProductCard";
import { StaffEntryBanner } from "@/components/staff/StaffEntryBanner";
import { CategoryChips } from "@/components/home/CategoryChips";
import { WhatsAppCard } from "@/components/home/WhatsAppCard";
import { TrendingRow, TrendingRowSkeleton } from "@/components/home/TrendingRow";
import { ProductCardSkeleton } from "@/components/ui/SkeletonLoader";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { FloatingCartButton } from "@/components/cart/FloatingCartButton";
import { EmptyState } from "@/components/EmptyState";
import { getProducts, getUnreadNotificationCount } from "@/db";
import { getTrendingFeed, type TrendingItem, type TrendingStatus } from "@/api/trending";
import { MARKETPLACES } from "@/lib/marketplaces";
import type { Product } from "@/types";

// Brand assets — clean circular app icon (NOT the busy promo image)
const LOGO = require("../../assets/images/logo.jpg");

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

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

// ─── Hero Banner Component ─────────────────────────
function HeroBannerCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const { locale } = useI18n();
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % HERO_BANNERS.length;
        scrollRef.current?.scrollTo({ x: next * (SCREEN_W - 32), animated: true });
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
          const idx = Math.round(e.nativeEvent.contentOffset.x / (SCREEN_W - 32));
          setActiveIndex(idx);
        }}
      >
        {HERO_BANNERS.map((b) => (
          <TouchableOpacity
            key={b.id}
            activeOpacity={0.9}
            style={[styles.heroSlide, { width: SCREEN_W - 32 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(tabs)/markets");
            }}
          >
            <Image source={b.image} style={styles.heroImg} resizeMode="cover" />
            <LinearGradient
              colors={["transparent", "rgba(17,17,17,0.7)"]}
              style={styles.heroGradient}
            />
            <View style={styles.heroOverlay}>
              <Text style={styles.heroTitle} numberOfLines={2}>
                {locale === "en" ? b.title_en : b.title_so}
              </Text>
              <Text style={styles.heroSub}>{locale === "en" ? b.subtitle_en : b.subtitle_so}</Text>
            </View>
          </TouchableOpacity>
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
  const { role, initFromProfile } = useStaffStore();

  // Initialize staff mode when user loads
  React.useEffect(() => {
    // Role will be set by auth store when profile loads
    const staffRole = user?.role || null;
    initFromProfile(staffRole);
  }, [user?.role]);
  const { t, locale } = useI18n();
  const [selectedCategory, setSelectedCategory] = useState("all");
  // Real unread count — same source the tab badge polls in (tabs)/_layout.
  // Guests have no notifications, so they see nothing.
  const [notifCount, setNotifCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user?.id) { setNotifCount(0); return; }
    let cancelled = false;
    getUnreadNotificationCount(user.id)
      .then((n) => { if (!cancelled) setNotifCount(n); })
      .catch(() => { if (!cancelled) setNotifCount(0); });
    return () => { cancelled = true; };
  }, [user?.id]);

  // ── Trending this week — event-ranked, read through the offline-first layer ──
  const [trendingItems, setTrendingItems] = useState<TrendingItem[]>([]);
  const [trendingStatus, setTrendingStatus] = useState<TrendingStatus>("unavailable");
  const [trendingLoading, setTrendingLoading] = useState(true);
  // Engagement only counts once the row is on screen (see TrendingRow).
  const [trendingOnScreen, setTrendingOnScreen] = useState(false);
  const trendingBox = useRef({ top: 0, height: 0 });
  const hasScrolledRef = useRef(false);

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

  const loadTrending = useCallback(async (force = false) => {
    try {
      const feed = await getTrendingFeed({ force });
      setTrendingItems(feed.items);
      setTrendingStatus(feed.status);
    } catch {
      // A trending feed must never be why home failed to render.
      setTrendingStatus("unavailable");
    } finally {
      setTrendingLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
    loadTrending();
  }, [loadProducts, loadTrending]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // skip cache, pull fresh from Supabase
    await Promise.all([loadProducts(true), loadTrending(true)]);
    setRefreshing(false);
  }, [loadProducts, loadTrending]);

  /**
   * Marks the trending section as seen so the cards may report real views.
   * Once set it stays set — the dedupe that prevents repeats lives in
   * TrendingRow and the 60s throttle lives in record_product_event.
   */
  const onHomeScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Math.abs(e.nativeEvent.contentOffset.y) > 4) hasScrolledRef.current = true;
    if (trendingOnScreen) return;
    const { top, height } = trendingBox.current;
    if (!top || !height) return;
    const y = e.nativeEvent.contentOffset.y;
    const overlap = Math.min(top + height, y + SCREEN_H) - Math.max(top, y);
    if (overlap > Math.min(height * 0.5, 120)) setTrendingOnScreen(true);
  }, [trendingOnScreen]);

  /**
   * Home opens at scroll offset 0, so a section already inside the viewport is
   * genuinely seen — and nothing would ever say so, because a customer who
   * never scrolls produces no scroll event. Without this the trending feed
   * could never gather its first views.
   */
  const onTrendingLayout = useCallback((y: number, height: number) => {
    trendingBox.current = { top: y, height };
    if (!trendingOnScreen && !hasScrolledRef.current && y < SCREEN_H - 120) {
      setTrendingOnScreen(true);
    }
  }, [trendingOnScreen]);

  // Memoized: the 200-item filter+sort must not re-run on every render
  // (refresh spinners, notif polling, trending state…) — only when the
  // inputs actually change.
  const catalogBySales = useMemo(
    () =>
      products
        .filter((p) => selectedCategory === "all" || p.category === selectedCategory)
        .slice()
        .sort((a, b) => b.sales_count - a.sales_count),
    [products, selectedCategory]
  );

  // "showAll" means: the category filter emptied the slice but the catalog
  // itself has products — so fall back to showing the whole catalog. The old
  // render consumed this flag inverted: it showed "No products yet" when
  // products existed and a blank grid when the catalog was truly empty.
  const showAll = catalogBySales.length <= 0 && products.length > 0;

  // Nothing to show and nothing honest to say → the section disappears rather
  // than leaving a broken spinner or an empty card.
  const showTrendingSection =
    trendingLoading || trendingItems.length > 0 || trendingStatus === "empty";

  return (
    <ErrorBoundary>
      <View style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingTop: insets.top + SPACING.lg }}
        showsVerticalScrollIndicator={false}
        onScroll={onHomeScroll}
        scrollEventThrottle={64}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* Staff Entry Banner */}
        <StaffEntryBanner />
        
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

        {/* ── Trending this week — real photos, one-tap add ── */}
        {showTrendingSection && (
          <View
            style={styles.section}
            onLayout={(e) =>
              onTrendingLayout(e.nativeEvent.layout.y, e.nativeEvent.layout.height)
            }
          >
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {locale === "en" ? "Trending this week" : "Alaabta Trending ee toddobaadkan"}
              </Text>
              <TouchableOpacity onPress={() => router.push("/search")}>
                <Text style={styles.seeAll}>{t("home.seeAll")}</Text>
              </TouchableOpacity>
            </View>

            {trendingLoading ? (
              <TrendingRowSkeleton />
            ) : trendingItems.length > 0 ? (
              <TrendingRow
                items={trendingItems}
                active={trendingOnScreen}
                stale={trendingStatus === "cache"}
              />
            ) : (
              <EmptyState
                compact
                title={
                  locale === "en"
                    ? "Nothing is trending yet"
                    : "Wali ma jiro alaab Trending ah"
                }
                subtitle={
                  locale === "en"
                    ? "Once customers start looking at products, the most-wanted items this week appear here."
                    : "Marka macmiilku bilaabo in uu alaab eego, alaabta ugu caansan toddobaadkan ayaa halkan ka muuqan doonta."
                }
              />
            )}
          </View>
        )}

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

        {/* ── Category filter chips ── */}
        <View style={styles.section}>
          <CategoryChips selected={selectedCategory} onSelect={setSelectedCategory} />
        </View>

        {/* ── Product Grid ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            {/* "Trending" belongs to the event-ranked row above; this grid is
                the catalog itself, ordered by the sales the marketplace shows. */}
            <View style={styles.gridHeaderLeft}>
              <Text style={styles.sectionTitle}>
                {locale === "en" ? "Browse products" : "Eeg Alaabta"}
              </Text>
              <View style={styles.countPill}>
                <Text style={styles.countPillText}>
                  {showAll ? products.length : catalogBySales.length} items
                </Text>
              </View>
            </View>
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
          ) : showAll ? (
            // Category filter matched nothing — show the whole catalog rather
            // than a dead end.
            <View style={styles.productGrid}>
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onPress={() => router.push(`/product/${product.id}`)}
                />
              ))}
            </View>
          ) : catalogBySales.length === 0 ? (
            // The live catalog is genuinely empty — say so with a friendly
            // empty state and a retry, never a blank grid.
            <View style={styles.sectionFallback}>
              <Text style={styles.fallbackEmoji}>🛍️</Text>
              <Text style={styles.fallbackTitle}>
                {locale === "en" ? "No products yet" : "Weli alaab lama helin"}
              </Text>
              <Text style={styles.fallbackSubtitle}>
                {locale === "en"
                  ? "New products will appear here once the catalog is loaded."
                  : "Alaabta cusub ayaa halkan ka muuqan doonta marka katalooggu shubo."}
              </Text>
              <TouchableOpacity
                style={styles.retryButton}
                activeOpacity={0.8}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  loadProducts(true);
                }}
              >
                <Text style={styles.retryButtonText}>
                  {locale === "en" ? "Try again" : "Isku day mar kale"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.productGrid}>
              {catalogBySales.map((product) => (
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
  heroWrap: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  heroSlide: {
    height: 210,
    borderRadius: 20,
    overflow: "hidden",
    position: "relative",
  },
  heroImg: { width: "100%", height: "100%", position: "absolute" },
  heroGradient: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    height: 70,
  },
  heroOverlay: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    padding: SPACING.lg,
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: RADIUS.xl,
    borderBottomRightRadius: RADIUS.xl,
  },
  heroTitle: { fontSize: 20, fontFamily: FONTS.bold, color: "#fff", lineHeight: 25, marginBottom: 4, letterSpacing: -0.3 },
  heroSub: { fontSize: 13, fontFamily: FONTS.semibold, color: "rgba(255,255,255,0.9)" },
  heroDots: { flexDirection: "row", justifyContent: "center", marginTop: 10, gap: 6 },
  heroDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,90,10,0.25)" },
  heroDotActive: { width: 20, backgroundColor: COLORS.primary },
  // Sections
  section: {
    marginBottom: SPACING.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  gridHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  countPill: {
    backgroundColor: COLORS.softOrange,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  countPillText: {
    fontSize: 11,
    fontFamily: FONTS.semibold,
    color: COLORS.primaryDark,
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
  retryButton: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm + 2,
  },
  retryButtonText: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.white,
  },
  bottomSpacer: {
    height: 100,
  },
});
