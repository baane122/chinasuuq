import React from "react";
import { View, ActivityIndicator, StyleSheet, ViewStyle } from "react-native";
import { COLORS, FONTS, SPACING } from "@/lib/theme";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  color?: string;
  fullScreen?: boolean;
  style?: ViewStyle;
}

const SIZE_MAP = {
  sm: 20,
  md: 32,
  lg: 48,
};

export function LoadingSpinner({
  size = "md",
  color = COLORS.primary,
  fullScreen = false,
  style,
}: LoadingSpinnerProps) {
  if (fullScreen) {
    return (
      <View style={[styles.fullScreen, style]}>
        <ActivityIndicator size={SIZE_MAP[size]} color={color} />
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <ActivityIndicator size={SIZE_MAP[size]} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.lg,
    minHeight: 44,
  },
  fullScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.warmWhite,
  },
});
