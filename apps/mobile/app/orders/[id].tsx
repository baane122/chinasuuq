import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import {
  ArrowLeft,
  Package,
  Truck,
  MessageCircle,
  FileText,
  ExternalLink,
  CreditCard,
  Calendar,
  MapPin,
  User,
  Phone,
  RefreshCw,
  XCircle,
  Lock,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { Linking } from "react-native";
import { COLORS, SPACING, RADIUS, FONTS, WHATSAPP_LINK, whatsappOrderLink } from "@/lib/theme";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { useI18n } from "@/lib/i18n";
import { getOrderById, updateOrderStatus } from "@/db/index";
import type { LocalOrder } from "@/db/index";
import { useAuthStore } from "@/store/auth";
import { supabase } from "@/lib/supabase";
import { Timeline, TimelineEvent } from "@/components/orders/Timeline";
import { StatusBadge } from "@/components/orders/StatusBadge";

/** Queued (never-synced) orders carry a synthetic `local-…` id with no
 *  production row to check ownership against; anything that looks like a
 *  uuid must be verified against orders.user_id before it is rendered. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The fulfillment ladder in the same order as the live order_status enum.
 *  A stage counts as done only when the order's real status has reached it. */
const STAGE_ORDER = [
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
  "delivered",
];

/** Build timeline events from the order's status field. Completed steps derive
 *  ONLY from the real status; every future step stays pending. (The old version
 *  hardcoded "Purchase Confirmed" and "Purchased" as done, so a brand-new
 *  pending order claimed to be already purchased.) */
function buildTimeline(order: LocalOrder): TimelineEvent[] {
  const status = order.status.toLowerCase();
  const statusIdx = STAGE_ORDER.indexOf(status);
  const reached = (min: string) =>
    statusIdx >= 0 && statusIdx >= STAGE_ORDER.indexOf(min);

  const stages: { status: string; location: string; done: boolean }[] = [
    // The order row itself is the receipt for this event — always real.
    { status: "Purchase Confirmed", location: "Online", done: true },
    { status: "Purchased", location: "1688 Platform", done: reached("purchased") },
    { status: "Arrived at Warehouse", location: "Guangzhou Warehouse", done: reached("in_transit_china") },
    { status: "Quality Inspection", location: "Guangzhou Warehouse", done: reached("warehouse") },
    { status: "Consolidated", location: "Guangzhou, China", done: reached("consolidated") },
    { status: "Shipped", location: "Guangzhou, China", done: reached("shipped") },
    { status: "In Transit", location: "Hong Kong", done: reached("in_transit") },
    { status: "Arrived at Destination", location: "Mogadishu Airport", done: reached("arrived_somalia") },
    { status: "Customs Clearance", location: "Mogadishu Port", done: reached("customs") },
    { status: "Ready for Pickup", location: "Mogadishu Warehouse", done: reached("ready_for_pickup") },
    { status: "Out for Delivery", location: "Your Address", done: reached("out_for_delivery") },
    { status: "Delivered", location: "Your Address", done: reached("delivered") },
  ];

  // Completed steps carry the order's last-update time; the first step that
  // has not happened yet (and everything after it) stays pending.
  let foundActive = false;
  return stages.map((s) => {
    if (s.done && !foundActive) return { ...s, timestamp: order.updated_at || order.created_at, done: true };
    if (!foundActive) {
      foundActive = true;
      return { ...s, timestamp: "Pending", done: false };
    }
    return { ...s, timestamp: "Pending", done: false };
  });
}

/** Map LocalOrder status string to StatusBadge status type */
function toBadgeStatus(s: string): "pending" | "processing" | "warehouse" | "shipping" | "delivered" | "cancelled" {
  const lower = s.toLowerCase();
  if (lower === "delivered") return "delivered";
  if (lower === "cancelled") return "cancelled";
  if (lower === "shipped" || lower === "shipping" || lower === "in_transit" || lower === "arrived_somalia" || lower === "customs" || lower === "ready_for_pickup" || lower === "out_for_delivery") return "shipping";
  if (lower === "warehouse" || lower === "inspection" || lower === "consolidated" || lower === "in_transit_china") return "warehouse";
  if (lower === "pending" || lower === "confirmed" || lower === "purchasing" || lower === "purchased") return "processing";
  return "pending";
}

export default function OrderDetailScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const authReady = useAuthStore((s) => s.initialized);
  const [order, setOrder] = useState<LocalOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  // Ownership gate: this route loads by RAW id (getOrderById does not scope),
  // so a stranger reading an order UUID must not see the buyer's PII.
  const [roleChecked, setRoleChecked] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [locked, setLocked] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const orderRef = useRef<LocalOrder | null>(null);

  // Role resolution mirrors app/staff/marketplaces.tsx: the auth-store role is
  // the fast path, the profiles table is the authority.
  useEffect(() => {
    if (!authReady) return;
    let alive = true;
    (async () => {
      if (!user?.id) {
        if (alive) { setIsStaff(false); setRoleChecked(true); }
        return;
      }
      const storeRole = String(user.role ?? "");
      if (storeRole === "staff" || storeRole === "super_admin") {
        if (alive) { setIsStaff(true); setRoleChecked(true); }
        return;
      }
      try {
        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        const role = String((data as any)?.role ?? "");
        if (alive) setIsStaff(role === "staff" || role === "super_admin");
      } catch {
        if (alive) setIsStaff(false);
      } finally {
        if (alive) setRoleChecked(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [authReady, user?.id, user?.role]);

  const loadOrder = useCallback(async () => {
    if (!id || !authReady || !roleChecked) return;
    // Only show the full-screen spinner on a cold load; refocus refreshes are
    // silent so the visible order never flashes away. (A ref, not state,
    // keeps this callback stable — a new identity would re-run focus effects.)
    setLoading(orderRef.current === null);
    setLoadError(false);
    try {
      // Guests cannot open order details at all — the only data they could
      // reach is this device's own cache, which the orders list already shows.
      if (!user?.id) {
        orderRef.current = null;
        setOrder(null);
        setLocked(true);
        return;
      }
      const data = await getOrderById(id);
      if (!data) {
        orderRef.current = null;
        setOrder(null);
        setLocked(false);
        return;
      }
      let allowed = isStaff;
      if (!allowed) {
        if (!UUID_RE.test(data.id)) {
          // Queued on this device, no production row yet — local provenance.
          allowed = true;
        } else {
          // Ask the server who owns it. RLS hides other users' rows, so a
          // visible row with a foreign user_id means this account may not
          // see this order.
          try {
            const { data: owner, error } = await supabase
              .from("orders")
              .select("user_id")
              .eq("id", data.id)
              .maybeSingle();
            if (error) throw error;
            allowed = !!owner && (owner as any).user_id === user.id;
          } catch {
            // Could not verify — surface a retry state, never the PII.
            if (orderRef.current === null) setLoadError(true);
            return;
          }
        }
      }
      orderRef.current = allowed ? data : null;
      setOrder(allowed ? data : null);
      setLocked(!allowed);
    } catch (e) {
      console.error("Failed to load order", e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [id, authReady, roleChecked, user?.id, isStaff]);

  // Re-fetch every time the screen gains focus (status may have moved) and
  // whenever the auth/role gate resolves. useFocusEffect also runs on mount.
  useFocusEffect(
    useCallback(() => {
      void loadOrder();
    }, [loadOrder])
  );

  const handleTrack = () => {
    router.push(`/orders/tracking?id=${order?.id || id}`);
  };

  const handleContactSupport = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!order) return;
    const url = whatsappOrderLink(
      `Question about order ${order.reference}`
    );
    Linking.openURL(url).catch(() => {
      Alert.alert("Error", "Could not open WhatsApp.");
    });
  };

  const handleCancelOrder = () => {
    if (!order) return;
    if (order.status === "delivered" || order.status === "cancelled") {
      Alert.alert("Cannot cancel", "This order can no longer be cancelled.");
      return;
    }
    Alert.alert(
      "Cancel order?",
      "This will mark the order as cancelled. Our team will reach out to confirm.",
      [
        { text: "Keep order", style: "cancel" },
        {
          text: "Cancel order",
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            setUpdating(true);
            try {
              const res = await updateOrderStatus(order.id, "cancelled");
              if (!res.ok) {
                Alert.alert("Could not cancel", res.error || "Please try again.");
              } else if (!res.remote) {
                Alert.alert(
                  "Saved on this device",
                  "The backend could not be reached, so this cancellation is local only — our team will still see the order as active until it syncs."
                );
              }
              await loadOrder();
            } catch (e) {
              console.error("Cancel failed", e);
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Go back">
            <ArrowLeft size={24} color={COLORS.black} />
          </Pressable>
          <Text style={styles.headerTitle}>Loading...</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError && !order) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Go back">
            <ArrowLeft size={24} color={COLORS.black} />
          </Pressable>
          <Text style={styles.headerTitle}>Order</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.notFoundText}>
            We couldn't reach the server to load this order. Check your connection and try again.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.primaryButtonSM, pressed && styles.primaryButtonPressed]}
            onPress={() => loadOrder()}
          >
            <Text style={styles.primaryButtonTextSmall}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (locked) {
    // Owner check failed (or guest) — deliberately vague so the screen never
    // confirms whether the UUID exists.
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Go back">
            <ArrowLeft size={24} color={COLORS.black} />
          </Pressable>
          <Text style={styles.headerTitle}>Not available</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Lock size={36} color={COLORS.textMuted} style={{ marginBottom: SPACING.md }} />
          <Text style={styles.notFoundText}>
            This order isn't available on your account.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.primaryButtonSM, pressed && styles.primaryButtonPressed]}
            onPress={() => router.back()}
          >
            <Text style={styles.primaryButtonTextSmall}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Go back">
            <ArrowLeft size={24} color={COLORS.black} />
          </Pressable>
          <Text style={styles.headerTitle}>Order Not Found</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.notFoundText}>This order could not be found.</Text>
          <View style={{ flexDirection: "row", gap: SPACING.md }}>
            <Pressable
              style={({ pressed }) => [styles.primaryButtonSM, pressed && styles.primaryButtonPressed]}
              onPress={() => loadOrder()}
            >
              <Text style={styles.primaryButtonTextSmall}>Try again</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
              onPress={() => router.back()}
            >
              <Text style={styles.secondaryButtonText}>Go Back</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
  const timeline = buildTimeline(order);
  const statusLabel = ORDER_STATUS_LABELS[order.status.toLowerCase()] || order.status;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={24} color={COLORS.black} />
        </Pressable>
        <Text style={styles.headerTitle}>{order.reference}</Text>
        <View style={styles.headerRight}>
          <StatusBadge status={toBadgeStatus(order.status)} label={statusLabel} />
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Status Timeline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Status</Text>
          <Timeline events={timeline} currentStatus={statusLabel} />
        </View>

        {/* Order Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items ({itemCount})</Text>
          {order.items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <View style={styles.itemImagePlaceholder}>
                <Package size={24} color={COLORS.primary} />
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {item.product_name}
                </Text>
                <Text style={styles.itemQty}>Qty: {item.quantity}</Text>
              </View>
              <Text style={styles.itemPrice}>${(item.price_usd * item.quantity).toFixed(2)}</Text>
            </View>
          ))}
        </View>

        {/* Payment Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Summary</Text>
          <View style={styles.summaryCard}>
            {order.items.map((item) => (
              <View key={item.id} style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  {item.product_name} × {item.quantity}
                </Text>
                <Text style={styles.summaryValue}>
                  ${(item.price_usd * item.quantity).toFixed(2)}
                </Text>
              </View>
            ))}
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryTotalLabel}>Total</Text>
              <Text style={styles.summaryTotalValue}>
                ${order.total_usd.toFixed(2)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Payment</Text>
              <Text style={styles.paidValue}>
                {PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method}
                {order.payment_status === "paid" ? " — Paid" : ` — ${order.payment_status}`}
              </Text>
            </View>
          </View>
        </View>

        {/* Shipping Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shipping Information</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Truck size={18} color={COLORS.primary} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Method</Text>
                <Text style={styles.infoValue}>
                  {order.shipping_method === "air" ? "Air Freight" : "Sea Freight"}
                </Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <User size={18} color={COLORS.primary} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Recipient</Text>
                <Text style={styles.infoValue}>{order.recipient_name}</Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <Phone size={18} color={COLORS.primary} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Phone</Text>
                <Text style={styles.infoValue}>{order.phone}</Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <MapPin size={18} color={COLORS.primary} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Address</Text>
                <Text style={styles.infoValue}>{order.city}, {order.address}</Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <Calendar size={18} color={COLORS.primary} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Order Date</Text>
                <Text style={styles.infoValue}>
                  {new Date(order.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
            onPress={handleTrack}
          >
            <Truck size={18} color={COLORS.white} />
            <Text style={styles.primaryButtonText}>Track Shipment</Text>
          </Pressable>

          {/* Owner-or-staff only: reaching this render already passed the
              ownership gate above, `!locked` keeps that explicit. */}
          {!locked && order && order.status !== "delivered" && order.status !== "cancelled" ? (
            <Pressable
              style={({ pressed }) => [
                styles.updateButton,
                pressed && styles.updateButtonPressed,
                updating && styles.buttonDisabled,
              ]}
              onPress={handleCancelOrder}
              disabled={updating}
            >
              {updating ? (
                <ActivityIndicator size="small" color={COLORS.error} />
              ) : (
                <XCircle size={18} color={COLORS.error} />
              )}
              <Text style={[styles.updateButtonText, { color: COLORS.error }]}>
                {updating ? "Cancelling..." : "Cancel order"}
              </Text>
            </Pressable>
          ) : null}

          <View style={styles.secondaryButtons}>
            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.secondaryButtonPressed,
              ]}
              onPress={handleContactSupport}
            >
              <MessageCircle size={18} color={COLORS.success} />
              <Text style={[styles.secondaryButtonText, { color: COLORS.success }]}>Contact Support</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  notFoundText: { fontSize: 16, color: COLORS.textSecondary, marginBottom: SPACING.lg, textAlign: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "600", color: COLORS.black, fontFamily: FONTS.semibold, marginLeft: SPACING.sm },
  headerRight: { marginLeft: SPACING.md },
  content: { flex: 1 },
  section: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: COLORS.black, marginBottom: SPACING.md, fontFamily: FONTS.semibold },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  itemImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.softOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  itemInfo: { flex: 1, marginLeft: SPACING.md },
  itemName: { fontSize: 14, fontWeight: "500", color: COLORS.black, fontFamily: FONTS.medium },
  itemQty: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4, fontFamily: FONTS.regular },
  itemPrice: { fontSize: 15, fontWeight: "600", color: COLORS.black, fontFamily: FONTS.semibold },
  summaryCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: SPACING.sm },
  summaryLabel: { fontSize: 14, color: COLORS.textSecondary, fontFamily: FONTS.regular, flex: 1, marginRight: SPACING.sm },
  summaryValue: { fontSize: 14, color: COLORS.black, fontFamily: FONTS.medium },
  summaryDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.md },
  summaryTotalLabel: { fontSize: 15, fontWeight: "600", color: COLORS.black, fontFamily: FONTS.semibold },
  summaryTotalValue: { fontSize: 16, fontWeight: "700", color: COLORS.primary, fontFamily: FONTS.bold },
  paidValue: { fontSize: 14, fontWeight: "600", color: COLORS.success, fontFamily: FONTS.semibold },
  infoCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: SPACING.sm },
  infoContent: { flex: 1, marginLeft: SPACING.md },
  infoLabel: { fontSize: 12, color: COLORS.textMuted, fontFamily: FONTS.regular },
  infoValue: { fontSize: 14, color: COLORS.black, fontWeight: "500", marginTop: 2, fontFamily: FONTS.medium },
  actions: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
    minHeight: 52,
  },
  primaryButtonPressed: { opacity: 0.8 },
  primaryButtonText: { color: COLORS.white, fontSize: 16, fontWeight: "600", marginLeft: SPACING.sm, fontFamily: FONTS.semibold },
  primaryButtonSM: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    minHeight: 48,
    justifyContent: "center",
  },
  primaryButtonTextSmall: { color: COLORS.white, fontSize: 15, fontWeight: "600", textAlign: "center", fontFamily: FONTS.semibold },
  updateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.softOrange,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
    minHeight: 52,
    marginTop: SPACING.md,
  },
  updateButtonPressed: { opacity: 0.8 },
  updateButtonText: { color: COLORS.primary, fontSize: 16, fontWeight: "600", marginLeft: SPACING.sm, fontFamily: FONTS.semibold },
  buttonDisabled: { opacity: 0.5 },
  secondaryButtons: { flexDirection: "row", marginTop: SPACING.md, gap: SPACING.md },
  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    minHeight: 48,
  },
  secondaryButtonPressed: { opacity: 0.7 },
  secondaryButtonText: { color: COLORS.primary, fontSize: 14, fontWeight: "600", marginLeft: SPACING.sm, fontFamily: FONTS.semibold },
  bottomPadding: { height: 100 },
});