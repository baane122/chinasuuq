import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { COLORS, SPACING, RADIUS } from "@/lib/theme";

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
  showArrow?: boolean;
  textColor?: string;
}

export function MenuItem({
  icon,
  label,
  onPress,
  showArrow = true,
  textColor,
}: MenuItemProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!onPress}
    >
      <View style={styles.iconContainer}>{icon}</View>
      <Text
        style={[
          styles.label,
          textColor ? { color: textColor } : null,
        ]}
      >
        {label}
      </Text>
      {showArrow && onPress ? (
        <ChevronRight size={20} color={COLORS.primary} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    minHeight: 56,
  },
  pressed: {
    backgroundColor: COLORS.gray50,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.softOrange,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.md,
  },
  label: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: COLORS.black,
    fontFamily: "Inter-Medium",
  },
});
