import { type ReactNode } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { COLORS, FONTS, RADIUS, SPACING } from "@/lib/theme";

interface AuthSubmitButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * The single primary action on an auth screen. While loading (or disabled)
 * the button cannot fire a second submit: onPress is guarded twice (prop
 * `disabled` plus an internal busy check) so slow taps cannot double-send.
 */
export function AuthSubmitButton({
  label,
  onPress,
  loading,
  disabled,
  icon,
  style,
}: AuthSubmitButtonProps) {
  const busy = !!loading || !!disabled;
  return (
    <TouchableOpacity
      style={[styles.button, busy && styles.buttonDim, style]}
      onPress={() => {
        if (busy) return;
        onPress();
      }}
      disabled={busy}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy, busy: !!loading }}
    >
      {loading ? (
        <ActivityIndicator color={COLORS.white} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={styles.text}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    marginTop: SPACING.sm,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  buttonDim: {
    opacity: 0.6,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
  },
  text: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.white,
  },
});
