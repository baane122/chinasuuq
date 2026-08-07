import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  GestureResponderEvent,
} from "react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "whatsapp";

interface ButtonProps {
  title: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
  size?: "sm" | "md" | "lg";
}

const VARIANT_STYLES: Record<ButtonVariant, { container: ViewStyle; text: TextStyle }> = {
  primary: {
    container: { backgroundColor: COLORS.primary },
    text: { color: COLORS.white },
  },
  secondary: {
    container: { backgroundColor: COLORS.softOrange },
    text: { color: COLORS.primary },
  },
  outline: {
    container: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: COLORS.border },
    text: { color: COLORS.black },
  },
  ghost: {
    container: { backgroundColor: "transparent" },
    text: { color: COLORS.primary },
  },
  whatsapp: {
    container: { backgroundColor: COLORS.whatsapp },
    text: { color: COLORS.white },
  },
};

const SIZE_STYLES: Record<string, { container: ViewStyle; text: TextStyle }> = {
  sm: {
    container: { height: 40, paddingHorizontal: SPACING.lg },
    text: { fontSize: 13 },
  },
  md: {
    container: { height: 48, paddingHorizontal: SPACING.xl },
    text: { fontSize: 15 },
  },
  lg: {
    container: { height: 56, paddingHorizontal: SPACING.xxl },
    text: { fontSize: 16 },
  },
};

export function Button({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  icon,
  style,
  textStyle,
  fullWidth = true,
  size = "md",
}: ButtonProps) {
  const variantStyle = VARIANT_STYLES[variant];
  const sizeStyle = SIZE_STYLES[size];

  return (
    <TouchableOpacity
      style={[
        styles.container,
        variantStyle.container,
        sizeStyle.container,
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator
          color={variantStyle.text.color}
          size="small"
        />
      ) : (
        <>
          {icon}
          <Text
            style={[
              styles.text,
              variantStyle.text,
              sizeStyle.text,
              icon ? { marginLeft: 8 } : undefined,
              textStyle,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    minHeight: 44,
  },
  fullWidth: {
    width: "100%",
  },
  text: {
    fontFamily: FONTS.semibold,
  },
  disabled: {
    opacity: 0.5,
  },
});
