import React from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import { COLORS, SPACING, RADIUS } from "@/lib/theme";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

/**
 * The product screen used to show a full-screen spinner, which reads as "broken"
 * rather than "loading". This mirrors the real content blocks — square gallery,
 * title lines, price + stock row, a variant/MOQ card and the sticky CTA bar —
 * so the layout is already there when the data lands and nothing jumps.
 */
export default function ProductSkeleton() {
  const image = SCREEN_WIDTH - SPACING.lg * 2;
  return (
    <View style={styles.container}>
      <View style={styles.gallery}>
        <SkeletonLoader width="100%" height={image} borderRadius={RADIUS.xl} />
      </View>

      <View style={styles.infoCard}>
        <SkeletonLoader width="85%" height={20} />
        <SkeletonLoader width="55%" height={20} style={{ marginTop: SPACING.sm }} />
        <View style={styles.row}>
          <SkeletonLoader width={120} height={30} style={{ marginTop: SPACING.lg }} />
          <SkeletonLoader width={70} height={16} style={{ marginTop: SPACING.lg }} />
        </View>
        <View style={styles.row}>
          <SkeletonLoader width={80} height={22} borderRadius={RADIUS.pill} style={{ marginTop: SPACING.md }} />
          <SkeletonLoader width={100} height={14} style={{ marginTop: SPACING.md }} />
        </View>
        <SkeletonLoader width="100%" height={64} borderRadius={RADIUS.md} style={{ marginTop: SPACING.lg }} />
      </View>

      <View style={styles.section}>
        <SkeletonLoader width={90} height={16} />
        <View style={styles.row}>
          <SkeletonLoader width={64} height={38} borderRadius={RADIUS.md} style={{ marginTop: SPACING.md }} />
          <SkeletonLoader width={64} height={38} borderRadius={RADIUS.md} style={{ marginTop: SPACING.md }} />
          <SkeletonLoader width={64} height={38} borderRadius={RADIUS.md} style={{ marginTop: SPACING.md }} />
        </View>
      </View>

      <View style={styles.section}>
        <SkeletonLoader width={120} height={16} />
        <SkeletonLoader width="100%" height={14} style={{ marginTop: SPACING.md }} />
        <SkeletonLoader width="90%" height={14} style={{ marginTop: SPACING.sm }} />
        <SkeletonLoader width="70%" height={14} style={{ marginTop: SPACING.sm }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  gallery: { backgroundColor: COLORS.white, padding: SPACING.lg },
  infoCard: { padding: SPACING.lg, backgroundColor: COLORS.white, marginTop: SPACING.sm },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  section: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginTop: SPACING.md,
  },
});
