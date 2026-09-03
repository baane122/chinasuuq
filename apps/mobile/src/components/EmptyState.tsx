import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Package } from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

export function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
  compact,
}: EmptyStateProps) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={styles.iconContainer}>
        {icon ?? <Package size={compact ? 32 : 48} color={COLORS.gray300} />}
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          style={({ pressed }) => [styles.action, pressed && { opacity: 0.85 }]}
          onPress={onAction}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingTop: SPACING.xxxl * 2,
    paddingHorizontal: SPACING.xl,
  },
  wrapCompact: {
    paddingTop: SPACING.xl,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.gray100,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: 18,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
    marginBottom: SPACING.sm,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
    fontFamily: FONTS.regular,
    textAlign: "center",
    lineHeight: 20,
  },
  action: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.pill,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
  },
  actionText: {
    color: COLORS.white,
    fontSize: 15,
    fontFamily: FONTS.semibold,
  },
});
