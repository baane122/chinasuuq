import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Search,
  Package,
  Truck,
  MessageCircle,
  MapPin,
  Calendar,
} from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS, whatsappOrderLink } from "@/lib/theme";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { useI18n } from "@/lib/i18n";
import { getOrders, getOrderById } from "@/db/index";
import type { LocalOrder } from "@/db/index";
import { Timeline, TimelineEvent } from "@/components/orders/Timeline";

/** Build a full tracking timeline from an order's status */
function buildTrackingTimeline(order: LocalOrder): TimelineEvent[] {
  const status = order.status.toLowerCase();
  const stages: { status: string; location: string; done: boolean }[] = [
    { status: "Order Placed", location: "Online", done: true },
    { status: "Payment Confirmed", location: "Online", done: true },
  ];

  const addStage = (s: string, loc: string, minStatus: string) => {
    const orderIdx = ["pending", "confirmed", "purchasing", "purchased", "in_transit_china", "warehouse", "inspection", "consolidated", "shipped", "in_transit", "arrived_somalia", "customs", "ready_for_pickup", "out_for_delivery", "delivered"].indexOf(status);
    const minIdx = ["pending", "confirmed", "purchasing", "purchased", "in_transit_china", "warehouse", "inspection", "consolidated", "shipped", "in_transit", "arrived_somalia", "customs", "ready_for_pickup", "out_for_delivery", "delivered"].indexOf(minStatus);
    stages.push({ status: s, location: loc, done: orderIdx >= minIdx });
  };

  addStage("Purchased", "1688 Platform", "purchasing");
  addStage("Arrived at Warehouse", "Guangzhou Warehouse", "in_transit_china");
  addStage("Quality Inspection", "Guangzhou Warehouse", "warehouse");
  addStage("Consolidated", "Guangzhou, China", "consolidated");
  addStage("Shipped", "Guangzhou, China", "shipped");
  addStage("In Transit", "Hong Kong", "in_transit");
  addStage("Arrived at Destination", "Mogadishu Airport", "arrived_somalia");
  addStage("Customs Clearance", "Mogadishu Port", "customs");
  addStage("Ready for Pickup", "Mogadishu Warehouse", "ready_for_pickup");
  addStage("Out for Delivery", "Your Address", "out_for_delivery");
  addStage("Delivered", "Your Address", "delivered");

  // Add timestamps: past events get the order's updated_at, current/pending get "Pending"
  let foundActive = false;
  return stages.map((s) => {
    if (s.done && !foundActive) {
      return { ...s, timestamp: order.updated_at || order.created_at };
    }
    if (!foundActive) {
      foundActive = true;
      return { ...s, timestamp: "Pending", done: false };
    }
    return { ...s, timestamp: "Pending", done: false };
  });
}

export default function TrackingScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [searchQuery, setSearchQuery] = useState("");
  const [order, setOrder] = useState<LocalOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // If an id was passed from the detail screen, load it directly
  useEffect(() => {
    if (id) {
      loadById(id);
    }
  }, [id]);

  const loadById = async (orderId: string) => {
    setLoading(true);
    setNotFound(false);
    try {
      const data = await getOrderById(orderId);
      if (data) {
        setOrder(data);
      } else {
        setNotFound(true);
      }
    } catch (e) {
      console.error("Failed to load tracking order", e);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (!query) return;
    setSearching(true);
    setNotFound(false);
    try {
      // Try by id first, then by reference
      let data = await getOrderById(query);
      if (!data) {
        const all = await getOrders();
        data = all.find((o) => o.reference.toLowerCase() === query.toLowerCase()) || null;
      }
      if (data) {
        setOrder(data);
      } else {
        setOrder(null);
        setNotFound(true);
      }
    } catch (e) {
      console.error("Tracking search failed", e);
      setNotFound(true);
    } finally {
      setSearching(false);
    }
  };

  const timeline = order ? buildTrackingTimeline(order) : [];

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
        <Text style={styles.headerTitle}>{t("orders.track")}</Text>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Search Input */}
        <View style={styles.searchContainer}>
          <View style={styles.searchInputContainer}>
            <Search size={18} color={COLORS.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Enter order reference (e.g., CS-2026-00125)"
              placeholderTextColor={COLORS.textMuted}
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                setNotFound(false);
              }}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.searchButton,
              pressed && styles.searchButtonPressed,
              searching && styles.buttonDisabled,
            ]}
            onPress={handleSearch}
            disabled={searching}
          >
            {searching ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Text style={styles.searchButtonText}>Track</Text>
            )}
          </Pressable>
        </View>

        {/* Loading */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        )}

        {/* Not Found */}
        {notFound && !loading && (
          <View style={styles.notFoundContainer}>
            <Package size={48} color={COLORS.gray300} />
            <Text style={styles.notFoundTitle}>Order Not Found</Text>
            <Text style={styles.notFoundText}>
              No order matches that reference. Try again or contact support.
            </Text>
          </View>
        )}

        {/* Order Summary Card */}
        {order && !loading && (
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <Package size={24} color={COLORS.primary} />
                <View style={styles.summaryInfo}>
                  <Text style={styles.summaryReference}>
                    {order.reference}
                  </Text>
                  <Text style={styles.summaryMethod}>
                    {order.shipping_method === "air" ? "Air Freight" : "Sea Freight"}
                  </Text>
                </View>
              </View>
              <View style={styles.summaryDetails}>
                <View style={styles.summaryDetailItem}>
                  <Text style={styles.summaryDetailLabel}>Items</Text>
                  <Text style={styles.summaryDetailValue}>
                    {order.items.reduce((s, i) => s + i.quantity, 0)}
                  </Text>
                </View>
                <View style={styles.summaryDividerV} />
                <View style={styles.summaryDetailItem}>
                  <Text style={styles.summaryDetailLabel}>Total</Text>
                  <Text style={styles.summaryDetailValue}>
                    ${order.total_usd.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.summaryDividerV} />
                <View style={styles.summaryDetailItem}>
                  <Text style={styles.summaryDetailLabel}>Status</Text>
                  <Text style={[styles.summaryDetailValue, { color: COLORS.primary }]}>
                    {ORDER_STATUS_LABELS[order.status.toLowerCase()] || order.status}
                  </Text>
                </View>
              </View>
            </View>

            {/* Timeline */}
            <View style={styles.timelineSection}>
              <Text style={styles.sectionTitle}>Tracking Timeline</Text>
              <Timeline
                events={timeline}
                currentStatus={ORDER_STATUS_LABELS[order.status.toLowerCase()] || order.status}
              />
            </View>

            {/* Contact Support */}
            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [
                  styles.supportButton,
                  pressed && styles.supportButtonPressed,
                ]}
                onPress={() => {
                  // Open WhatsApp support with the order reference so the team has context
                  const ref = order?.reference;
                  const url = whatsappOrderLink(
                    ref ? `Tracking question for order ${ref}` : "Tracking question"
                  );
                  import("react-native").then(({ Linking }) => {
                    Linking.openURL(url).catch(() => {});
                  });
                }}
              >
                <MessageCircle size={18} color={COLORS.white} />
                <Text style={styles.supportButtonText}>Contact Support</Text>
              </Pressable>
            </View>
          </>
        )}

        {/* Empty state when no id provided and no search yet */}
        {!order && !loading && !notFound && !searching && !id && (
          <View style={styles.emptyState}>
            <Package size={48} color={COLORS.gray300} />
            <Text style={styles.emptyTitle}>Track Your Order</Text>
            <Text style={styles.emptySubtitle}>
              Enter your order reference above to see real-time tracking updates.
            </Text>
          </View>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
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
  content: { flex: 1 },
  searchContainer: {
    flexDirection: "row",
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    gap: SPACING.sm,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 48,
  },
  searchInput: { flex: 1, fontSize: 15, color: COLORS.black, marginLeft: SPACING.sm, fontFamily: FONTS.regular },
  searchButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.xl,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  searchButtonPressed: { opacity: 0.8 },
  searchButtonText: { color: COLORS.white, fontSize: 15, fontWeight: "600", fontFamily: FONTS.semibold },
  buttonDisabled: { opacity: 0.5 },
  loadingContainer: { paddingVertical: SPACING.xxxl * 2, alignItems: "center" },
  notFoundContainer: { alignItems: "center", paddingTop: SPACING.xxxl * 2, paddingHorizontal: SPACING.lg },
  notFoundTitle: { fontSize: 18, fontFamily: FONTS.semibold, color: COLORS.black, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  notFoundText: { fontSize: 14, color: COLORS.textSecondary, textAlign: "center", fontFamily: FONTS.regular },
  summaryCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryHeader: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.lg },
  summaryInfo: { marginLeft: SPACING.md },
  summaryReference: { fontSize: 18, fontWeight: "700", color: COLORS.black, fontFamily: FONTS.bold },
  summaryMethod: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2, fontFamily: FONTS.regular },
  summaryDetails: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.warmWhite,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
  },
  summaryDetailItem: { flex: 1, alignItems: "center" },
  summaryDetailLabel: { fontSize: 12, color: COLORS.textMuted, fontFamily: FONTS.regular },
  summaryDetailValue: { fontSize: 16, fontWeight: "600", color: COLORS.black, marginTop: 4, fontFamily: FONTS.semibold },
  summaryDividerV: { width: 1, height: 32, backgroundColor: COLORS.border },
  timelineSection: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: COLORS.black, marginBottom: SPACING.lg, fontFamily: FONTS.semibold },
  actions: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl },
  supportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
    minHeight: 52,
  },
  supportButtonPressed: { opacity: 0.8 },
  supportButtonText: { color: COLORS.white, fontSize: 16, fontWeight: "600", marginLeft: SPACING.sm, fontFamily: FONTS.semibold },
  emptyState: { alignItems: "center", paddingTop: SPACING.xxxl * 2, paddingHorizontal: SPACING.lg },
  emptyTitle: { fontSize: 18, fontFamily: FONTS.semibold, color: COLORS.black, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  emptySubtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: "center", fontFamily: FONTS.regular },
  bottomPadding: { height: 100 },
});