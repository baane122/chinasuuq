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
import { ShoppingBag, Package } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { getOrders } from "@/db/index";
import type { LocalOrder } from "@/db/index";
import { OrderCard } from "@/components/orders/OrderCard";
import { OrderCardSkeleton } from "@/components/ui/SkeletonLoader";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

const TABS = ["All", "Processing", "Warehouse", "Shipping", "Delivered"] as const;
type TabType = (typeof TABS)[number];

/** Map LocalOrder status to the filter tab slug */
function orderMatchesTab(order: LocalOrder, tab: TabType): boolean {
  if (tab === "All") return true;
  const s = order.status.toLowerCase();
  if (tab === "Processing") return s === "pending" || s === "processing" || s === "purchasing" || s === "purchased" || s === "confirmed";
  if (tab === "Warehouse") return s === "warehouse" || s === "inspection" || s === "consolidated" || s === "in_transit_china";
  if (tab === "Shipping") return s === "shipping" || s === "shipped" || s === "in_transit" || s === "arrived_somalia" || s === "customs" || s === "ready_for_pickup" || s === "out_for_delivery";
  if (tab === "Delivered") return s === "delivered";
  return false;
}

/** Build a display-friendly status from LocalOrder.status */
function mapStatus(s: string): "pending" | "processing" | "warehouse" | "shipping" | "delivered" {
  const lower = s.toLowerCase();
  if (lower === "delivered") return "delivered";
  if (lower === "shipped" || lower === "shipping" || lower === "in_transit" || lower === "arrived_somalia" || lower === "customs" || lower === "ready_for_pickup" || lower === "out_for_delivery") return "shipping";
  if (lower === "warehouse" || lower === "inspection" || lower === "consolidated" || lower === "in_transit_china") return "warehouse";
  if (lower === "pending" || lower === "confirmed" || lower === "purchasing" || lower === "purchased") return "processing";
  return "pending";
}

export default function OrdersScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>("All");
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      const data = await getOrders();
      setOrders(data);
    } catch (e) {
      console.error("Failed to load orders", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadOrders();
    setRefreshing(false);
  }, [loadOrders]);

  const filteredOrders = orders.filter((order) => orderMatchesTab(order, activeTab));

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Package size={48} color={COLORS.gray300} />
      </View>
      <Text style={styles.emptyTitle}>{t("orders.empty")}</Text>
      <Text style={styles.emptySubtitle}>Start exploring products from China</Text>
      <Pressable
        style={({ pressed }) => [
          styles.startButton,
          pressed && styles.startButtonPressed,
        ]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/(tabs)/home");
        }}
        accessibilityLabel="Start shopping"
      >
        <ShoppingBag size={18} color={COLORS.white} />
        <Text style={styles.startButtonText}>Start Shopping</Text>
      </Pressable>
    </View>
  );

  const renderOrderCard = (order: LocalOrder) => {
    const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
    return (
      <OrderCard
        key={order.id}
        order={{
          id: order.id,
          reference: order.reference,
          itemCount,
          totalUsd: order.total_usd,
          status: mapStatus(order.status),
          date: new Date(order.created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
        }}
      />
    );
  };

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t("orders.title")}</Text>
        </View>

        {/* Tab Bar */}
        <View style={styles.tabBarContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabBar}
          >
            {TABS.map((tab) => (
              <Pressable
                key={tab}
                style={[
                  styles.tab,
                  activeTab === tab && styles.tabActive,
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setActiveTab(tab);
                }}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === tab && styles.tabTextActive,
                  ]}
                >
                  {tab}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Orders List */}
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
          {loading ? (
            <>
              <OrderCardSkeleton />
              <OrderCardSkeleton />
              <OrderCardSkeleton />
            </>
          ) : filteredOrders.length === 0 ? (
            renderEmptyState()
          ) : (
            filteredOrders.map(renderOrderCard)
          )}

          <View style={styles.bottomPadding} />
        </ScrollView>
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  header: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  headerTitle: { fontSize: 28, fontFamily: FONTS.bold, color: COLORS.black },
  tabBarContainer: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tabBar: { paddingHorizontal: SPACING.lg },
  tab: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, marginRight: SPACING.xs, minHeight: 44, justifyContent: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabText: { fontSize: 14, fontFamily: FONTS.medium, color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.primary, fontFamily: FONTS.semibold },
  listContainer: { flex: 1 },
  listContent: { paddingTop: SPACING.md },
  emptyState: { alignItems: "center", paddingTop: SPACING.xxxl * 2 },
  emptyIconContainer: { width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.gray100, alignItems: "center", justifyContent: "center", marginBottom: SPACING.lg },
  emptyTitle: { fontSize: 18, fontFamily: FONTS.semibold, color: COLORS.black, marginBottom: SPACING.sm },
  emptySubtitle: { fontSize: 14, color: COLORS.textSecondary, marginBottom: SPACING.xl, fontFamily: FONTS.regular },
  startButton: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.primary, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: RADIUS.pill, minHeight: 48 },
  startButtonPressed: { opacity: 0.8 },
  startButtonText: { color: COLORS.white, fontSize: 15, fontWeight: "600", marginLeft: SPACING.sm, fontFamily: FONTS.semibold },
  bottomPadding: { height: 100 },
});