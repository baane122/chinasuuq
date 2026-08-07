import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet } from "react-native";
import { COLORS, SPACING, RADIUS } from "@/lib/theme";

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: object;
}

export function SkeletonLoader({ width, height = 16, borderRadius = RADIUS.sm, style }: SkeletonProps) {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { height, borderRadius, width: width as any },
        { opacity: pulseAnim },
        style,
      ]}
    />
  );
}

export function ProductCardSkeleton() {
  return (
    <View style={styles.cardSkeleton}>
      <SkeletonLoader height={160} borderRadius={RADIUS.lg} />
      <View style={{ padding: SPACING.md }}>
        <SkeletonLoader width="80%" height={14} />
        <SkeletonLoader width="40%" height={18} style={{ marginTop: SPACING.sm }} />
        <SkeletonLoader width="30%" height={12} style={{ marginTop: SPACING.xs }} />
      </View>
    </View>
  );
}

export function OrderCardSkeleton() {
  return (
    <View style={styles.orderSkeleton}>
      <View style={styles.orderSkeletonRow}>
        <SkeletonLoader width={48} height={48} borderRadius={RADIUS.sm} />
        <View style={{ flex: 1, marginLeft: SPACING.md }}>
          <SkeletonLoader width="60%" height={16} />
          <SkeletonLoader width="30%" height={12} style={{ marginTop: SPACING.xs }} />
        </View>
        <SkeletonLoader width={80} height={28} borderRadius={RADIUS.pill} />
      </View>
      <SkeletonLoader width="100%" height={1} style={{ marginVertical: SPACING.md }} />
      <View style={styles.orderSkeletonRow}>
        <SkeletonLoader width="25%" height={16} />
        <SkeletonLoader width={70} height={28} borderRadius={RADIUS.pill} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: COLORS.gray200,
  },
  cardSkeleton: {
    width: "48%",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    marginBottom: SPACING.md,
  },
  orderSkeleton: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  orderSkeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
