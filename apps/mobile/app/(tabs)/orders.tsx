import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ShoppingBag, Package, ChevronRight, ShoppingCart, CheckCircle2, Truck } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { getOrders, getOrdersByUser } from "@/db/index";
import type { LocalOrder } from "@/db/index";
import { useAuthStore } from "@/store/auth";
import { OrderCard } from "@/components/orders/OrderCard";
import { OrderCardSkeleton } from "@/components/ui/SkeletonLoader";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useCartStore } from "@/store/cart";
import { formatUSD } from "@/lib/utils";
import { FloatingCartButton } from "@/components/cart/FloatingCartButton";
import { ActiveOrderCard } from "@/components/orders/ActiveOrderCard";

const ACTIVE_STATUSES = [
  "pending",
  "confirmed",
  "purchasing",
  "purchased",
  "in_transit_china",
  "warehouse",
  "inspection",
  "consolidated",
  "shipped",
  "in_transit",
  "arrived_somalia",
  "customs",
  "ready_for_pickup",
  "out_for_delivery",
];

const HISTORY_STATUSES = ["delivered", "cancelled"];

export default function OrdersScreen() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Cart state
  const cartItems = useCartStore((s) => s.items);
  const cartGetTotal = useCartStore((s) => s.getTotal);
  const cartTotal = cartGetTotal();

  const authUser = useAuthStore((s) => s.user);

  const loadOrders = useCallback(async () => {
    try {
      // Logged-in users fetch their own orders from Supabase; guests fall back
      // to the local orders list.
      const data = authUser?.id
        ? await getOrdersByUser(authUser.id)
        : await getOrders();
      // Sort by created_at desc (most recent first)
      const sorted = [...data].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setOrders(sorted);
    } catch (e) {
      console.error("Failed to load orders", e);
    } finally {
      setLoading(false);
    }
  }, [authUser?.id]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadOrders();
    setRefreshing(false);
  }, [loadOrders]);

  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const historyOrders = orders.filter((o) => HISTORY_STATUSES.includes(o.status));
  const totalSpent = orders.reduce((sum, o) => sum + (o.total_usd || 0), 0);

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Package size={48} color={COLORS.gray300} />
      </View>
      <Text style={styles.emptyTitle}>{t("orders.empty")}</Text>
      <Text style={styles.emptySubtitle}>
        {locale === "en"
          ? "Place an order to see live tracking here"
          : "Samee dalab si aad u aragto raadinta"}
      </Text>
      <Pressable
        style={({ pressed }) => [styles.startButton, pressed && { opacity: 0.8 }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/(tabs)/markets");
        }}
      >
        <ShoppingBag size={18} color={COLORS.white} />
        <Text style={styles.startButtonText}>
          {locale === "en" ? "Start Shopping" : "Bilow Iibsiga"}
        </Text>
      </Pressable>
    </View>
  );

  const renderHistoryCard = (order: LocalOrder, idx: number) => {
    const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
    const date = new Date(order.created_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const isDelivered = order.status === "delivered";
    return (
      <Pressable
        key={order.id}
        style={({ pressed }) => [styles.historyCard, pressed && { opacity: 0.85 }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/orders/${order.id}`);
        }}
      >
        <View style={styles.historyStatus}>
          {isDelivered ? (
            <CheckCircle2 size={18} color={COLORS.success} />
          ) : (
            <Package size={18} color={COLORS.error} />
          )}
        </View>
        <View style={styles.historyInfo}>
          <Text style={styles.historyRef}>{order.reference}</Text>
          <Text style={styles.historyMeta}>
            {itemCount} item{itemCount === 1 ? "" : "s"} · {date}
          </Text>
        </View>
        <Text style={styles.historyTotal}>${order.total_usd.toFixed(2)}</Text>
        <ChevronRight size={18} color={COLORS.gray400} />
      </Pressable>
    );
  };

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerEyebrow}>
              {locale === "en" ? "YOUR SOURCING HUB" : "XARUNTA DALABAADKA"}
            </Text>
            <Text style={styles.headerTitle}>{t("orders.title")}</Text>
          </View>
          <Pressable style={styles.refreshPill} onPress={onRefresh} accessibilityLabel="Refresh orders">
            <Text style={styles.refreshPillText}>
              {locale === "en" ? "Refresh" : "Cusboonaysii"}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.listContainer}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Cart summary — show when cart has items */}
          {cartItems.length > 0 && (
            <Pressable
              style={({ pressed }) => [styles.cartSummaryCard, pressed && { opacity: 0.85 }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/cart");
              }}
            >
              <View style={styles.cartIconWrap}>
                <ShoppingCart size={20} color={COLORS.white} />
              </View>
              <View style={styles.cartInfo}>
                <Text style={styles.cartTitle}>
                  {locale === "en" ? "Your Cart" : "Gaarigaaga"}
                </Text>
                <Text style={styles.cartSub}>
                  {cartTotal.items} item{cartTotal.items === 1 ? "" : "s"} · {formatUSD(cartTotal.subtotalUSD)}
                </Text>
              </View>
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartTotal.items}</Text>
              </View>
              <ChevronRight size={20} color={COLORS.primary} />
            </Pressable>
          )}

          {/* Stats overview */}
          {orders.length > 0 && (
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{activeOrders.length}</Text>
                <Text style={styles.statLabel}>
                  {locale === "en" ? "Active" : "Socda"}
                </Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{historyOrders.filter((o) => o.status === "delivered").length}</Text>
                <Text style={styles.statLabel}>
                  {locale === "en" ? "Delivered" : "La geeyay"}
                </Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>${totalSpent.toFixed(0)}</Text>
                <Text style={styles.statLabel}>
                  {locale === "en" ? "Spent" : "Wadarta"}
                </Text>
              </View>
            </View>
          )}

          {loading ? (
            <>
              <OrderCardSkeleton />
              <OrderCardSkeleton />
              <OrderCardSkeleton />
            </>
          ) : orders.length === 0 ? (
            renderEmpty()
          ) : (
            <>
              {/* Active orders with smart tracking */}
              {activeOrders.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionIcon}>
                      <Truck size={16} color={COLORS.primary} />
                    </View>
                    <Text style={styles.sectionTitle}>
                      {locale === "en" ? "Active Orders" : "Dalabka Socda"}
                    </Text>
                    <View style={styles.sectionCount}>
                      <Text style={styles.sectionCountText}>{activeOrders.length}</Text>
                    </View>
                  </View>
                  {activeOrders.map((order, i) => (
                    <ActiveOrderCard key={order.id} order={order} index={i} />
                  ))}
                </>
              )}

              {/* Order history */}
              {historyOrders.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <View style={[styles.sectionIcon, styles.sectionIconHistory]}>
                      <CheckCircle2 size={16} color={COLORS.success} />
                    </View>
                    <Text style={styles.sectionTitle}>
                      {locale === "en" ? "Order History" : "Taariikhda Dalabka"}
                    </Text>
                    <View style={[styles.sectionCount, styles.sectionCountHistory]}>
                      <Text style={styles.sectionCountText}>{historyOrders.length}</Text>
                    </View>
                  </View>
                  {historyOrders.map(renderHistoryCard)}
                </>
              )}
            </>
          )}

          <View style={styles.bottomPadding} />
        </ScrollView>
        <FloatingCartButton />
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerEyebrow: {
    fontSize: 10,
    fontFamily: FONTS.semibold,
    color: COLORS.primary,
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  headerTitle: { fontSize: 28, fontFamily: FONTS.bold, color: COLORS.black },
  refreshPill: {
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  refreshPillText: { fontSize: 12, fontFamily: FONTS.semibold, color: COLORS.primary },
  listContainer: { flex: 1 },
  listContent: { paddingTop: SPACING.sm },

  // Cart summary
  cartSummaryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cartIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  cartInfo: { flex: 1 },
  cartTitle: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.black },
  cartSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  cartBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.softOrange,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  cartBadgeText: { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.primary },

  // Stats overview
  statsRow: {
    flexDirection: "row",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    paddingVertical: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 20, fontFamily: FONTS.bold, color: COLORS.black },
  statLabel: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.border,
    alignSelf: "center",
  },

  // Section headers
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    marginTop: SPACING.sm,
  },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: COLORS.softOrange,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.sm,
  },
  sectionIconHistory: {
    backgroundColor: "#ECFDF5",
  },
  sectionTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.black,
  },
  sectionCount: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.softOrange,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  sectionCountHistory: {
    backgroundColor: "#ECFDF5",
  },
  sectionCountText: {
    fontSize: 12,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
  },

  // History card
  historyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  historyStatus: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  historyInfo: { flex: 1 },
  historyRef: {
    fontSize: 14,
    fontFamily: FONTS.bold,
    color: COLORS.black,
  },
  historyMeta: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  historyTotal: {
    fontSize: 14,
    fontFamily: FONTS.bold,
    color: COLORS.black,
  },

  // Empty state
  emptyState: { alignItems: "center", paddingTop: SPACING.xxxl * 2 },
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.gray100,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.lg,
  },
  emptyTitle: { fontSize: 18, fontFamily: FONTS.semibold, color: COLORS.black, marginBottom: SPACING.sm },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
    fontFamily: FONTS.regular,
  },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.pill,
    minHeight: 48,
  },
  startButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontFamily: FONTS.semibold,
    marginLeft: SPACING.sm,
  },
  bottomPadding: { height: 110 },
});
