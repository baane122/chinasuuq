import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, ShoppingBag, ChevronRight, Truck, Plane } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth";
import { getOrdersByUser, type LocalOrder } from "@/db/index";

const STATUS_COLORS: Record<string, string> = {
  pending: COLORS.warning,
  processing: COLORS.info,
  shipped: COLORS.info,
  "in transit": COLORS.info,
  delivered: COLORS.success,
  cancelled: COLORS.error,
};

export default function OrderHistoryScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    if (!user?.id) { setOrders([]); setLoading(false); setRefreshing(false); return; }
    try {
      const list = await getOrdersByUser(user.id);
      setOrders(list);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  const fmtDate = (iso?: string) => {
    if (!iso) return "";
    try { return new Date(iso).toLocaleDateString(); } catch { return ""; }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()} android_ripple={{ color: COLORS.gray100 }}>
          <ArrowLeft size={22} color={COLORS.black} />
        </Pressable>
        <Text style={styles.headerTitle}>Order History</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centerLoading}><ActivityIndicator color={COLORS.primary} /></View>
      ) : orders.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><ShoppingBag size={40} color={COLORS.primary} /></View>
          <Text style={styles.emptyTitle}>No orders yet</Text>
          <Text style={styles.emptySub}>Your orders from China will appear here with live tracking.</Text>
          <Pressable style={styles.shopBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(tabs)" as any); }}>
            <Text style={styles.shopBtnText}>Start Shopping</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
          data={orders}
          keyExtractor={(o) => o.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLORS.primary} />}
          ListHeaderComponent={
            <Text style={styles.count}>{orders.length} order{orders.length !== 1 ? "s" : ""}</Text>
          }
          renderItem={({ item }) => {
            const statusColor = STATUS_COLORS[item.status?.toLowerCase()] || COLORS.textSecondary;
            const IsSea = item.shipping_method === "sea";
            return (
              <Pressable
                style={styles.orderCard}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push({ pathname: "/orders/[id]", params: { id: item.id } } as any); }}
                android_ripple={{ color: COLORS.gray100 }}
              >
                <View style={styles.orderTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderRef}>{item.reference}</Text>
                    <Text style={styles.orderDate}>{fmtDate(item.created_at)}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor + "1A" }]}>
                    <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
                  </View>
                </View>
                <View style={styles.orderMid}>
                  <View style={styles.shipMethod}>
                    {IsSea ? <Plane size={14} color={COLORS.primary} /> : <Truck size={14} color={COLORS.primary} />}
                    <Text style={styles.shipText}>{IsSea ? "Sea" : "Air"} freight</Text>
                  </View>
                  {item.city ? <Text style={styles.orderCity}>→ {item.city}</Text> : null}
                </View>
                <View style={styles.orderBottom}>
                  <Text style={styles.orderTotal}>${(item.total_usd ?? 0).toFixed(2)}</Text>
                  <Text style={styles.paymentStatus}>{item.payment_status}</Text>
                  <ChevronRight size={18} color={COLORS.gray400} />
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: FONTS.semibold, color: COLORS.black },
  centerLoading: { flex: 1, alignItems: "center", justifyContent: "center" },
  count: { fontSize: 13, fontFamily: FONTS.medium, color: COLORS.textSecondary, marginBottom: SPACING.sm },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xxxl },
  emptyIcon: { width: 84, height: 84, borderRadius: 42, backgroundColor: COLORS.softOrange, alignItems: "center", justifyContent: "center", marginBottom: SPACING.lg },
  emptyTitle: { fontSize: 18, fontFamily: FONTS.bold, color: COLORS.black, marginBottom: 4 },
  emptySub: { fontSize: 14, fontFamily: FONTS.regular, color: COLORS.textSecondary, textAlign: "center" },
  shopBtn: { marginTop: SPACING.lg, backgroundColor: COLORS.primary, paddingHorizontal: SPACING.xxl, paddingVertical: SPACING.md, borderRadius: RADIUS.pill },
  shopBtnText: { color: COLORS.white, fontSize: 15, fontFamily: FONTS.semibold },
  orderCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, marginBottom: SPACING.md },
  orderTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  orderRef: { fontSize: 15, fontFamily: FONTS.semibold, color: COLORS.black },
  orderDate: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.textSecondary, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill },
  statusText: { fontSize: 12, fontFamily: FONTS.semibold, textTransform: "capitalize" },
  orderMid: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginTop: SPACING.md },
  shipMethod: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: COLORS.gray50, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill },
  shipText: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.primary },
  orderCity: { fontSize: 13, fontFamily: FONTS.regular, color: COLORS.textSecondary },
  orderBottom: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.md },
  orderTotal: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.black, flex: 1 },
  paymentStatus: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.textSecondary, textTransform: "capitalize" },
});
