import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { ChevronRight } from "lucide-react-native";
import { useRouter } from "expo-router";
import { COLORS, SPACING, RADIUS } from "@/lib/theme";
import { StatusBadge } from "./StatusBadge";

export interface OrderCardData {
  id: string;
  reference: string;
  itemCount: number;
  totalUsd: number;
  status: "pending" | "processing" | "warehouse" | "shipping" | "delivered";
  date: string;
  thumbnail?: string;
}

interface OrderCardProps {
  order: OrderCardData;
}

export function OrderCard({ order }: OrderCardProps) {
  const router = useRouter();

  const handlePress = () => {
    router.push(`/orders/${order.id}`);
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Order ${order.reference}`}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {order.thumbnail ? (
            <Image
              source={{ uri: order.thumbnail }}
              style={styles.thumbnail}
              contentFit="cover"
              transition={150}
              cachePolicy="memory-disk"
              recyclingKey={order.thumbnail}
            />
          ) : (
            <View style={styles.thumbnailPlaceholder}>
              <Text style={styles.thumbnailText}>📦</Text>
            </View>
          )}
          <View style={styles.headerInfo}>
            <Text style={styles.reference}>{order.reference}</Text>
            <Text style={styles.itemCount}>
              {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
            </Text>
          </View>
        </View>
        <StatusBadge status={order.status} />
      </View>

      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <Text style={styles.total}>${order.totalUsd.toFixed(2)}</Text>
          <Text style={styles.date}>{order.date}</Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.trackButton,
            pressed && styles.trackButtonPressed,
          ]}
          onPress={handlePress}
          accessibilityLabel="Track order"
        >
          <Text style={styles.trackButtonText}>Track</Text>
          <ChevronRight size={16} color={COLORS.primary} />
        </Pressable>
      </View>
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
  },
  cardPressed: {
    opacity: 0.7,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: SPACING.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.sm,
  },
  thumbnailPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbnailText: {
    fontSize: 20,
  },
  headerInfo: {
    marginLeft: SPACING.md,
    flex: 1,
  },
  reference: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.black,
    fontFamily: "Inter-SemiBold",
  },
  itemCount: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontFamily: "Inter-Regular",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.md,
  },
  footerLeft: {
    flexDirection: "column",
  },
  total: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.black,
    fontFamily: "Inter-Bold",
  },
  date: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
    fontFamily: "Inter-Regular",
  },
  trackButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.softOrange,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.pill,
    minHeight: 44,
    minWidth: 44,
  },
  trackButtonPressed: {
    opacity: 0.7,
  },
  trackButtonText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "600",
    marginRight: 4,
    fontFamily: "Inter-Medium",
  },
});
