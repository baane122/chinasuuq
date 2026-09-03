import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Plane, Ship, CheckCircle2, Clock3, Package } from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { formatUSD } from "@/lib/utils";
import {
  buildSmartRoute,
  getProgressPercent,
  getEstimateRange,
  getNextMilestone,
} from "@/lib/smartRoute";
import type { LocalOrder } from "@/db";

interface OrderInsightsProps {
  order: LocalOrder;
}

export function OrderInsights({ order }: OrderInsightsProps) {
  const method = order.shipping_method === "sea" ? "sea" : "air";
  const route = React.useMemo(
    () => buildSmartRoute(method, order.city || "Hargeisa"),
    [method, order.city]
  );
  const progress = getProgressPercent(route, order.status);
  const eta = getEstimateRange(method, order.status);
  const next = getNextMilestone(route, order.status);
  const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
  const isPaid =
    order.payment_status === "confirmed" || order.payment_status === "paid";
  const MethodIcon = method === "air" ? Plane : Ship;
  const methodColor = method === "air" ? COLORS.air : COLORS.sea;

  return (
    <View style={styles.container}>
      {/* Next milestone banner */}
      <View style={styles.nextBanner}>
        <Clock3 size={16} color={COLORS.primary} />
        <Text style={styles.nextText} numberOfLines={1}>
          {next ? `Next: ${next}` : "Order delivered 🎉"}
        </Text>
      </View>

      {/* Dashboard grid */}
      <View style={styles.grid}>
        <View style={styles.gridItem}>
          <Text style={styles.metricLabel}>Progress</Text>
          <Text style={styles.metricValue}>{progress}%</Text>
        </View>
        <View style={styles.gridItem}>
          <Text style={styles.metricLabel}>Est. arrival</Text>
          <Text style={styles.metricValue}>{order.status === "delivered" ? "Delivered" : eta}</Text>
        </View>
        <View style={[styles.gridItem, { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }]}>
          <MethodIcon size={18} color={methodColor} />
          <Text style={[styles.methodLabel, { color: methodColor }]}>
            {method === "air" ? "Air" : "Sea"}
          </Text>
        </View>
      </View>

      {/* Second row */}
      <View style={styles.grid}>
        <View style={styles.gridItem}>
          <Text style={styles.metricLabel}>Total</Text>
          <Text style={styles.metricValue}>{formatUSD(order.total_usd)}</Text>
        </View>
        <View style={styles.gridItem}>
          <Text style={styles.metricLabel}>Items</Text>
          <Text style={styles.metricValue}>
            <Package size={12} color={COLORS.textSecondary} /> {itemCount}
          </Text>
        </View>
        <View style={[styles.gridItem, { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }]}>
          <CheckCircle2 size={16} color={isPaid ? COLORS.success : COLORS.error} />
          <Text style={[styles.paidText, { color: isPaid ? COLORS.success : COLORS.error }]}>
            {isPaid ? "Paid" : "Pending"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: SPACING.md,
  },
  nextBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.softOrange,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
  },
  nextText: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONTS.semibold,
    color: COLORS.primaryDark,
  },
  grid: {
    flexDirection: "row",
    backgroundColor: COLORS.gray50,
    borderRadius: RADIUS.md,
    overflow: "hidden",
    marginBottom: SPACING.xs,
  },
  gridItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xs,
  },
  metricLabel: {
    fontSize: 10,
    fontFamily: FONTS.medium,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.black,
  },
  methodLabel: {
    fontSize: 15,
    fontFamily: FONTS.bold,
  },
  paidText: {
    fontSize: 15,
    fontFamily: FONTS.bold,
  },
});
