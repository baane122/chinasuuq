import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Bell,
  Mic,
  Search as SearchIcon,
  Truck,
  BadgePercent,
  Headphones,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useAuthStore } from "@/store/auth";
import { useI18n } from "@/lib/i18n";
import { HeroBanner } from "@/components/home/HeroBanner";
import { ProductCard } from "@/components/home/ProductCard";
import { CategoryChips } from "@/components/home/CategoryChips";
import { WhatsAppCard } from "@/components/home/WhatsAppCard";
import { ProductCardSkeleton } from "@/components/ui/SkeletonLoader";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { FloatingCartButton } from "@/components/cart/FloatingCartButton";
import { getProducts } from "@/db";
import type { Product } from "@/types";

// ─── Marketing / merchandising data ────────────────
const MARKETPLACES = [
  { id: "1688", name: "1688", desc: "Wholesale prices", color: COLORS.primaryDark },
  { id: "taobao", name: "Taobao", desc: "Millions of products", color: COLORS.primary },
  { id: "yiwugo", name: "YiwuGo", desc: "Direct trade access", color: COLORS.info },
  { id: "deals", name: "Deals", desc: "Verified products", color: COLORS.success },
];

const SERVICES = [
  { id: "247", icon: Headphones, label: "24/7 Ordering" },
  { id: "low", icon: BadgePercent, label: "Low Prices" },
  { id: "fast", icon: Truck, label: "Fast Delivery" },
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

// ─── Home Tab ────────────────────────────────────────
export default function HomeTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { t } = useI18n();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [notifCount] = useState(3);
  const [refreshing, setRefreshing] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadProducts = useCallback(async () => {
    setError(false);
    try {
      const data = await getProducts();
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
    await loadProducts();
    setRefreshing(false);
  }, [loadProducts]);

  // "Trending" = top sellers from real catalog, fall back to everything.
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
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              {t("home.greeting")}, {user?.full_name || "there"} 👋
            </Text>
            <Text style={styles.title}>{t("home.title")}</Text>
          </View>
          <TouchableOpacity
            style={styles.notifButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
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
            {t("home.searchPlaceholder")}
          </Text>
          <View style={styles.micIcon}>
            <Mic size={16} color={COLORS.primary} />
          </View>
        </TouchableOpacity>

        {/* ── Hero Banner ── */}
        <HeroBanner />

        {/* ── Marketplace Shortcuts ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t("home.subtitle")}</Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/markets")}>
              <Text style={styles.seeAll}>{t("home.seeAll")}</Text>
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
                  if (m.id === "deals") {
                    router.push("/search");
                  } else {
                    // 1688 / Taobao / YiwuGo open the real marketplace browser
                    router.push({
                      pathname: "/marketplace/[marketplace]",
                      params: { marketplace: m.id },
                    });
                  }
                }}
              >
                <View style={[styles.marketIcon, { backgroundColor: m.color }]}>
                  <Text style={styles.marketIconText}>
                    {m.name.charAt(0)}
                  </Text>
                </View>
                <Text style={styles.marketName}>{m.name}</Text>
                <Text style={styles.marketDesc} numberOfLines={1}>
                  {m.desc}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Service Badges ── */}
        <View style={styles.serviceRow}>
          {SERVICES.map((s) => (
            <ServiceBadge key={s.id} icon={s.icon} label={s.label} />
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
    alignItems: "flex-start",
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  greeting: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  title: {
    fontSize: 22,
    fontFamily: FONTS.bold,
    color: COLORS.black,
  },
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
  // Marketplace shortcuts
  marketRow: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  marketCard: {
    width: 100,
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
  marketIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.sm,
  },
  marketIconText: {
    fontSize: 18,
    fontFamily: FONTS.bold,
    color: COLORS.white,
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
