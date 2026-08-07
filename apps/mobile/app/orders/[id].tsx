import React, { useEffect, useState } from "react";
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
import { useRouter, useLocalSearchParams } from "expo-router";
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
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS, WHATSAPP_LINK } from "@/lib/theme";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { useI18n } from "@/lib/i18n";
import { getOrderById, updateOrderStatus } from "@/db/index";
import type { LocalOrder } from "@/db/index";
import { Timeline, TimelineEvent } from "@/components/orders/Timeline";
import { StatusBadge } from "@/components/orders/StatusBadge";

/** Build timeline events from the order's status field */
function buildTimeline(order: LocalOrder): TimelineEvent[] {
  const status = order.status.toLowerCase();
  const stages: { status: string; location: string; done: boolean }[] = [
    { status: "Purchase Confirmed", location: "Online", done: true },
    { status: "Purchased", location: "1688 Platform", done: true },
  ];

  if (status === "purchasing" || status === "purchased" || status === "in_transit_china" || status === "warehouse" || status === "inspection" || status === "consolidated" || status === "shipped" || status === "in_transit" || status === "arrived_somalia" || status === "customs" || status === "ready_for_pickup" || status === "out_for_delivery" || status === "delivered") {
    stages.push({ status: "Arrived at Warehouse", location: "Guangzhou Warehouse", done: true });
  }

  if (status === "warehouse" || status === "inspection" || status === "consolidated" || status === "shipped" || status === "in_transit" || status === "arrived_somalia" || status === "customs" || status === "ready_for_pickup" || status === "out_for_delivery" || status === "delivered") {
    stages.push({ status: "Quality Inspection", location: "Guangzhou Warehouse", done: true });
  }

  if (status === "consolidated" || status === "shipped" || status === "in_transit" || status === "arrived_somalia" || status === "customs" || status === "ready_for_pickup" || status === "out_for_delivery" || status === "delivered") {
    stages.push({ status: "Shipped", location: "Guangzhou, China", done: true });
  }

  if (status === "in_transit" || status === "arrived_somalia" || status === "customs" || status === "ready_for_pickup" || status === "out_for_delivery" || status === "delivered") {
    stages.push({ status: "In Transit", location: "Hong Kong", done: true });
  }

  if (status === "arrived_somalia" || status === "customs" || status === "ready_for_pickup" || status === "out_for_delivery" || status === "delivered") {
    stages.push({ status: "Arrived at Destination", location: "Mogadishu Airport", done: true });
  }

  if (status === "customs" || status === "ready_for_pickup" || status === "out_for_delivery" || status === "delivered") {
    stages.push({ status: "Customs Clearance", location: "Mogadishu Port", done: true });
  }

  if (status === "ready_for_pickup" || status === "out_for_delivery" || status === "delivered") {
    stages.push({ status: "Ready for Pickup", location: "Mogadishu Warehouse", done: true });
  }

  if (status === "out_for_delivery" || status === "delivered") {
    stages.push({ status: "Out for Delivery", location: "Your Address", done: true });
  }

  if (status === "delivered") {
    stages.push({ status: "Delivered", location: "Your Address", done: true });
  }

  // Mark the current stage as done=false (the last true stage is past)
  let foundActive = false;
  return stages.map((s) => {
    if (!foundActive && s.done) return { ...s, timestamp: order.updated_at || order.created_at, done: true };
    if (!foundActive) {
      foundActive = true;
      return { ...s, timestamp: order.updated_at || "Pending", done: false };
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
  const [order, setOrder] = useState<LocalOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const loadOrder = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getOrderById(id);
      setOrder(data);
    } catch (e) {
      console.error("Failed to load order", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrder();
  }, [id]);

  const handleTrack = () => {
    router.push(`/orders/tracking?id=${order?.id || id}`);
  };

  const handleContactSupport = () => {
    // Placeholder — opens WhatsApp link
  };

  const handleUpdateStatus = () => {
    if (!order) return;
    const currentStatus = order.status.toLowerCase();
    // Define possible next statuses
    const statusFlow = [
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
    const idx = statusFlow.indexOf(currentStatus);
    if (idx === -1 || idx >= statusFlow.length - 1) {
      Alert.alert("No Update", "This order is already in its final state.");
      return;
    }
    const nextStatus = statusFlow[idx + 1];
    const nextLabel = ORDER_STATUS_LABELS[nextStatus] || nextStatus;

    Alert.alert(
      "Update Status",
      `Advance order to "${nextLabel}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Advance",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setUpdating(true);
            try {
              await updateOrderStatus(order.id, nextStatus);
              await loadOrder();
            } catch (e) {
              console.error("Failed to update status", e);
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
              updating && styles.buttonDisabled,
            ]}
            onPress={handleTrack}
          >
            <Truck size={18} color={COLORS.white} />
            <Text style={styles.primaryButtonText}>Track Shipment</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.updateButton,
              pressed && styles.updateButtonPressed,
              updating && styles.buttonDisabled,
            ]}
            onPress={handleUpdateStatus}
            disabled={updating}
          >
            {updating ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <RefreshCw size={18} color={COLORS.primary} />
            )}
            <Text style={styles.updateButtonText}>
              {updating ? "Updating..." : "Advance Status"}
            </Text>
          </Pressable>

          <View style={styles.secondaryButtons}>
            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.secondaryButtonPressed,
              ]}
              onPress={handleContactSupport}
            >
              <MessageCircle size={18} color={COLORS.primary} />
              <Text style={styles.secondaryButtonText}>Contact Support</Text>
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