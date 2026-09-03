import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, LayoutAnimation, Platform, UIManager } from "react-native";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import type { LocalOrder } from "@/db";
import { SmartRoute } from "./SmartRoute";
import { OrderInsights } from "./OrderInsights";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ActiveOrderCardProps {
  order: LocalOrder;
  index: number;
}

export function ActiveOrderCard({ order, index }: ActiveOrderCardProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(index === 0); // first order expanded by default
  const method = order.shipping_method === "sea" ? "sea" : "air";
  const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
  const date = new Date(order.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const toggle = () => {
    Haptics.selectionAsync();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((e) => !e);
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={toggle}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.refIcon, { backgroundColor: method === "air" ? COLORS.air + "1A" : COLORS.sea + "1A" }]}>
            <Text style={styles.refIconText}>#{String(index + 1).padStart(2, "0")}</Text>
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.reference}>{order.reference}</Text>
            <Text style={styles.date}>{date}</Text>
          </View>
        </View>
        <Pressable
          style={styles.toggleWrap}
          onPress={toggle}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {expanded ? (
            <ChevronDown size={20} color={COLORS.primary} />
          ) : (
            <ChevronRight size={20} color={COLORS.primary} />
          )}
        </Pressable>
      </View>

      {/* Collapsible body */}
      {expanded && (
        <View style={styles.body}>
          <SmartRoute
            method={method}
            city={order.city}
            status={order.status}
          />

          <OrderInsights order={order} />

          <View style={styles.summaryRow}>
            <View style={styles.summaryBlock}>
              <Text style={styles.summaryLabel}>Items</Text>
              <Text style={styles.summaryValue}>{itemCount}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryBlock}>
              <Text style={styles.summaryLabel}>Destination</Text>
              <Text style={styles.summaryValue}>{order.city || "—"}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryBlock}>
              <Text style={styles.summaryLabel}>Total</Text>
              <Text style={[styles.summaryValue, styles.summaryTotal]}>
                ${order.total_usd.toFixed(2)}
              </Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.detailBtn, pressed && { opacity: 0.8 }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/orders/${order.id}`);
              }}
            >
              <Text style={styles.detailBtnText}>View Details</Text>
            </Pressable>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.black,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardPressed: { opacity: 0.9 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  refIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.md,
  },
  refIconText: {
    fontSize: 14,
    fontFamily: FONTS.bold,
    color: COLORS.black,
  },
  headerInfo: { flex: 1 },
  reference: {
    fontSize: 15,
    fontFamily: FONTS.bold,
    color: COLORS.black,
  },
  date: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  toggleWrap: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    marginTop: SPACING.md,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.warmWhite,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
  },
  summaryBlock: { flex: 1, alignItems: "center" },
  summaryDivider: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.border,
  },
  summaryLabel: {
    fontSize: 10,
    fontFamily: FONTS.medium,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  summaryValue: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
  },
  summaryTotal: {
    color: COLORS.primary,
    fontFamily: FONTS.bold,
  },
  actions: {
    flexDirection: "row",
    marginTop: SPACING.md,
  },
  detailBtn: {
    flex: 1,
    height: 44,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  detailBtnText: {
    color: COLORS.white,
    fontSize: 14,
    fontFamily: FONTS.bold,
  },
});
