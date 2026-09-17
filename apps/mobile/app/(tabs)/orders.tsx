import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  TouchableOpacity,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import {
  ShoppingCart,
  Package,
  ChevronRight,
  CheckCircle2,
  Truck,
  Trash2,
  Minus,
  Plus,
  MessageCircle,
  ArrowUpRight,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS, whatsappOrderLink } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { getOrders, getOrdersByUser } from "@/db/index";
import type { LocalOrder } from "@/db/index";
import { useAuthStore } from "@/store/auth";
import { OrderCardSkeleton } from "@/components/ui/SkeletonLoader";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useCartStore } from "@/store/cart";
import { formatUSD } from "@/lib/utils";
import { FloatingCartButton } from "@/components/cart/FloatingCartButton";
import { ActiveOrderCard } from "@/components/orders/ActiveOrderCard";
import { MARKETPLACES } from "@/lib/marketplaces";

type TabId = "cart" | "orders" | "tracking";

const ACTIVE_STATUSES = [
  "pending", "confirmed", "purchasing", "purchased",
  "in_transit_china", "warehouse", "inspection", "consolidated",
  "shipped", "in_transit", "arrived_somalia", "customs",
  "ready_for_pickup", "out_for_delivery",
];
const HISTORY_STATUSES = ["delivered", "cancelled"];

// Marketplace lookup for icons
const MARKET_ICON: Record<string, any> = {};
MARKETPLACES.forEach((m) => { MARKET_ICON[m.id] = m.icon; });

export default function OrdersScreen() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("orders");

  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const cartItems = useCartStore((s) => s.items);
  const cartGetTotal = useCartStore((s) => s.getTotal);
  const cartTotal = cartGetTotal();
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  const authUser = useAuthStore((s) => s.user);

  const loadOrders = useCallback(async () => {
    try {
      const data = authUser?.id
        ? await getOrdersByUser(authUser.id)
        : await getOrders();
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

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadOrders();
    setRefreshing(false);
  }, [loadOrders]);

  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const historyOrders = orders.filter((o) => HISTORY_STATUSES.includes(o.status));

  // Group cart items by marketplace
  const cartGrouped = useMemo(() => {
    const map = new Map<string, typeof cartItems>();
    for (const it of cartItems) {
      const m = it.product.marketplace;
      if (!map.has(m)) map.set(m, []);
      map.get(m)!.push(it);
    }
    return Array.from(map.entries());
  }, [cartItems]);

  const l = (en: string, so: string) => (locale === "en" ? en : so);

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "cart", label: l("Cart", "Gaariga"), count: cartItems.length || undefined },
    { id: "orders", label: l("Orders", "Dalabka"), count: orders.length || undefined },
    { id: "tracking", label: l("Tracking", "Raadinta"), count: activeOrders.length || undefined },
  ];

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container} edges={["top"]}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{l("My Orders", "Dalabkayga")}</Text>
        </View>

        {/* ── Tab Bar ── */}
        <View style={styles.tabBar}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tab, isActive && styles.tabActive]}
                activeOpacity={0.7}
                onPress={() => {
                  Haptics.selectionAsync();
                  setActiveTab(tab.id);
                }}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {tab.label}
                </Text>
                {tab.count != null && (
                  <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                    <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>
                      {tab.count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Content ── */}
        {activeTab === "cart" && (
          <ScrollView
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {cartItems.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <ShoppingCart size={32} color={COLORS.gray300} />
                </View>
                <Text style={styles.emptyTitle}>{l("Cart is empty", "Gaariga waa madhan yahay")}</Text>
                <Text style={styles.emptySub}>
                  {l("Browse products and add them to your cart", "Eeg alaabta ku dar gaarigaaga")}
                </Text>
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => router.push("/(tabs)/markets")}
                  activeOpacity={0.8}
                >
                  <Text style={styles.emptyBtnText}>{l("Start Shopping", "Bilow Iibsiga")}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Total */}
                <View style={styles.totalBar}>
                  <Text style={styles.totalLabel}>{l("Total", "Wadarta")}</Text>
                  <Text style={styles.totalValue}>{formatUSD(cartTotal.subtotalUSD)}</Text>
                </View>

                {/* Cart items — same card style as markets */}
                {cartItems.map((item) => {
                  const img = item.product.images?.[0];
                  const mName = item.product.marketplace;
                  return (
                    <View key={item.id} style={styles.card}>
                      {/* Product image */}
                      <View style={styles.cardIconWrap}>
                        {img ? (
                          <Image source={{ uri: img }} style={styles.cardIcon} contentFit="cover" transition={120} />
                        ) : (
                          <View style={[styles.cardIcon, styles.cardIconFallback]}>
                            <Package size={20} color={COLORS.gray300} />
                          </View>
                        )}
                      </View>

                      {/* Info */}
                      <View style={styles.cardInfo}>
                        <Text style={styles.cardName} numberOfLines={1}>
                          {item.product.title_english || item.product.title_original}
                        </Text>
                        <View style={styles.cardMetaRow}>
                          <Text style={styles.cardMeta}>{mName}</Text>
                          <Text style={styles.cardPrice}>{formatUSD(item.price_usd_estimated * item.quantity)}</Text>
                        </View>
                        {/* Qty controls */}
                        <View style={styles.qtyRow}>
                          <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}>
                            <Minus size={12} color={COLORS.gray500} />
                          </TouchableOpacity>
                          <Text style={styles.qtyVal}>{item.quantity}</Text>
                          <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQuantity(item.id, item.quantity + 1)}>
                            <Plus size={12} color={COLORS.gray500} />
                          </TouchableOpacity>
                          <View style={{ flex: 1 }} />
                          <TouchableOpacity style={styles.qtyBtnDanger} onPress={() => removeItem(item.id)}>
                            <Trash2 size={12} color={COLORS.error} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}

                {/* Bottom actions */}
                <View style={styles.bottomActions}>
                  <TouchableOpacity
                    style={styles.checkoutBtn}
                    activeOpacity={0.8}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      router.push("/cart/checkout");
                    }}
                  >
                    <Text style={styles.checkoutBtnText}>{l("Buy Now · Bixi Hadda", "Buy Now · Bixi Hadda")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.whatsappBtn}
                    activeOpacity={0.8}
                    onPress={() => {
                      const items = cartItems.map((i) =>
                        `• ${i.product.title_english || i.product.title_original} x${i.quantity} — ${formatUSD(i.price_usd_estimated * i.quantity)}`
                      ).join("\n");
                      const msg = `🛒 *ChinaSuuq Order*\n\n${items}\n\n💰 Total: ${formatUSD(cartTotal.subtotalUSD)}`;
                      Linking.openURL(whatsappOrderLink(msg));
                    }}
                  >
                    <MessageCircle size={16} color={COLORS.white} />
                    <Text style={styles.whatsappBtnText}>{l("WhatsApp Order", "Dalab WhatsApp")}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            <View style={{ height: 120 }} />
          </ScrollView>
        )}

        {activeTab === "orders" && (
          <ScrollView
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />
            }
          >
            {loading ? (
              <>
                <OrderCardSkeleton />
                <OrderCardSkeleton />
              </>
            ) : orders.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <Package size={32} color={COLORS.gray300} />
                </View>
                <Text style={styles.emptyTitle}>{l("No orders yet", "Weli dalab ma jiro")}</Text>
                <Text style={styles.emptySub}>
                  {l("Place an order to see it here", "Samee dalab si aad u aragto")}
                </Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push("/(tabs)/markets")} activeOpacity={0.8}>
                  <Text style={styles.emptyBtnText}>{l("Start Shopping", "Bilow Iibsiga")}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {historyOrders.length > 0 && historyOrders.map((order) => {
                  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
                  const date = new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  const isDelivered = order.status === "delivered";
                  return (
                    <Pressable
                      key={order.id}
                      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                      onPress={() => router.push(`/orders/${order.id}`)}
                    >
                      {/* Status icon */}
                      <View style={[styles.cardIconWrap, { backgroundColor: isDelivered ? COLORS.successBg : COLORS.errorBg }]}>
                        {isDelivered ? (
                          <CheckCircle2 size={22} color={COLORS.success} />
                        ) : (
                          <Package size={22} color={COLORS.error} />
                        )}
                      </View>

                      {/* Info */}
                      <View style={styles.cardInfo}>
                        <View style={styles.cardMetaRow}>
                          <Text style={styles.cardName}>{order.reference}</Text>
                          <Text style={styles.cardPrice}>${order.total_usd.toFixed(2)}</Text>
                        </View>
                        <Text style={styles.cardMeta}>
                          {itemCount} item{itemCount === 1 ? "" : "s"} · {date}
                        </Text>
                      </View>

                      {/* Arrow */}
                      <View style={styles.cardArrow}>
                        <ArrowUpRight size={16} color={COLORS.gray400} strokeWidth={2} />
                      </View>
                    </Pressable>
                  );
                })}
              </>
            )}
            <View style={{ height: 120 }} />
          </ScrollView>
        )}

        {activeTab === "tracking" && (
          <ScrollView
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />
            }
          >
            {loading ? (
              <>
                <OrderCardSkeleton />
                <OrderCardSkeleton />
              </>
            ) : activeOrders.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <Truck size={32} color={COLORS.gray300} />
                </View>
                <Text style={styles.emptyTitle}>{l("Nothing in transit", "Wax socda ma jiro")}</Text>
                <Text style={styles.emptySub}>
                  {l("Active orders will appear here with live tracking", "Dalabka socda waxay halkan u soo muuqan doonaan")}
                </Text>
              </View>
            ) : (
              activeOrders.map((order, i) => (
                <ActiveOrderCard key={order.id} order={order} index={i} />
              ))
            )}
            <View style={{ height: 120 }} />
          </ScrollView>
        )}

        <FloatingCartButton />
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },

  /* ── Header ── */
  header: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    letterSpacing: -0.6,
  },

  /* ── Tab Bar ── */
  tabBar: {
    flexDirection: "row",
    marginHorizontal: SPACING.xl,
    backgroundColor: COLORS.gray100,
    borderRadius: RADIUS.lg,
    padding: 3,
    marginBottom: SPACING.lg,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
  },
  tabActive: {
    backgroundColor: COLORS.white,
    shadowColor: COLORS.black,
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabText: { fontSize: 13, fontFamily: FONTS.semibold, color: COLORS.gray500 },
  tabTextActive: { color: COLORS.black, fontFamily: FONTS.bold },
  tabBadge: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: COLORS.gray200,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 5,
  },
  tabBadgeActive: { backgroundColor: COLORS.primaryBg },
  tabBadgeText: { fontSize: 10, fontFamily: FONTS.bold, color: COLORS.gray500 },
  tabBadgeTextActive: { color: COLORS.primary },

  /* ── Scroll ── */
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.xl },

  /* ── Empty State ── */
  emptyState: { alignItems: "center", paddingTop: SPACING.xxxl * 2.5 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: COLORS.gray100,
    alignItems: "center", justifyContent: "center", marginBottom: SPACING.lg,
  },
  emptyTitle: { fontSize: 17, fontFamily: FONTS.bold, color: COLORS.black, marginBottom: 4 },
  emptySub: { fontSize: 13, color: COLORS.textSecondary, textAlign: "center", marginBottom: SPACING.xl, lineHeight: 18 },
  emptyBtn: { backgroundColor: COLORS.primary, paddingHorizontal: SPACING.xl, paddingVertical: 12, borderRadius: RADIUS.pill },
  emptyBtnText: { color: COLORS.white, fontSize: 14, fontFamily: FONTS.semibold },

  /* ═══ CARD (same as markets) ═══ */
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  cardPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  cardIconWrap: {
    width: 56, height: 56, borderRadius: RADIUS.lg,
    alignItems: "center", justifyContent: "center",
    overflow: "hidden", flexShrink: 0,
    backgroundColor: COLORS.gray100,
  },
  cardIcon: { width: 56, height: 56, borderRadius: RADIUS.lg },
  cardIconFallback: { alignItems: "center", justifyContent: "center" },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.black, marginBottom: 2 },
  cardMetaRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4,
  },
  cardMeta: { fontSize: 11, color: COLORS.textMuted },
  cardPrice: { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.primary },
  cardArrow: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.gray100,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },

  /* ── Total ── */
  totalBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: COLORS.white, borderRadius: RADIUS.xl,
    padding: SPACING.lg, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  totalLabel: { fontSize: 13, color: COLORS.textMuted },
  totalValue: { fontSize: 22, fontFamily: FONTS.bold, color: COLORS.black },

  /* ── Qty controls ── */
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  qtyBtn: {
    width: 28, height: 28, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white,
    alignItems: "center", justifyContent: "center",
  },
  qtyBtnDanger: {
    width: 28, height: 28, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.errorBg, backgroundColor: COLORS.white,
    alignItems: "center", justifyContent: "center",
  },
  qtyVal: { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.black, minWidth: 20, textAlign: "center" },

  /* ── Bottom Actions ── */
  bottomActions: { marginTop: SPACING.md, gap: 8 },
  checkoutBtn: {
    height: 50, borderRadius: RADIUS.lg, backgroundColor: COLORS.primary,
    justifyContent: "center", alignItems: "center",
  },
  checkoutBtnText: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.white },
  whatsappBtn: {
    height: 48, borderRadius: RADIUS.lg, backgroundColor: COLORS.darkSurface,
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: SPACING.sm,
  },
  whatsappBtnText: { fontSize: 15, fontFamily: FONTS.semibold, color: COLORS.white },
});
