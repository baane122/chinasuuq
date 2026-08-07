import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";

export type BadgeVariant = "default" | "success" | "warning" | "error" | "info" | "primary";

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: "sm" | "md";
  style?: ViewStyle;
}

const VARIANT_MAP: Record<BadgeVariant, { bg: string; text: string }> = {
  default: { bg: COLORS.gray100, text: COLORS.gray600 },
  success: { bg: "#DCFCE7", text: COLORS.success },
  warning: { bg: "#FEF3C7", text: COLORS.warning },
  error: { bg: "#FEE2E2", text: COLORS.error },
  info: { bg: "#DBEAFE", text: COLORS.info },
  primary: { bg: COLORS.softOrange, text: COLORS.primary },
};

export function Badge({ label, variant = "default", size = "sm", style }: BadgeProps) {
  const colors = VARIANT_MAP[variant];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: colors.bg },
        size === "md" && styles.md,
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          { color: colors.text },
          size === "md" && styles.textMd,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    alignSelf: "flex-start",
  },
  md: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
  },
  text: {
    fontSize: 11,
    fontFamily: FONTS.semibold,
    lineHeight: 16,
  },
  textMd: {
    fontSize: 13,
    lineHeight: 20,
  },
});
