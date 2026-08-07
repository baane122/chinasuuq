import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { COLORS } from "@/lib/theme";

type StatusType =
  | "pending"
  | "processing"
  | "warehouse"
  | "shipping"
  | "delivered"
  | "cancelled";

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
}

const STATUS_CONFIG: Record<
  StatusType,
  { bg: string; text: string; label: string }
> = {
  pending: {
    bg: "#FEF3C7",
    text: "#92400E",
    label: "Pending",
  },
  processing: {
    bg: "#DBEAFE",
    text: "#1E40AF",
    label: "Processing",
  },
  warehouse: {
    bg: "#FEE2E2",
    text: "#991B1B",
    label: "Warehouse",
  },
  shipping: {
    bg: "#E0E7FF",
    text: "#3730A3",
    label: "Shipping",
  },
  delivered: {
    bg: "#DCFCE7",
    text: COLORS.success,
    label: "Delivered",
  },
  cancelled: {
    bg: COLORS.gray100,
    text: COLORS.gray700,
    label: "Cancelled",
  },
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const displayLabel = label || config.label;

  return (
    <View
      style={[styles.badge, { backgroundColor: config.bg }]}
      accessibilityLabel={`Status: ${displayLabel}`}
    >
      <Text style={[styles.text, { color: config.text }]}>{displayLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,  // Pill-like badge
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Inter-Medium",
  },
});
