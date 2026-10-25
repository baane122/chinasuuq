import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";

interface QuantitySelectorProps {
  value: number;
  onChange: (qty: number) => void;
  min?: number;
  max?: number;
  /** Step when the supplier sells by the carton (pack size). Defaults to 1. */
  step?: number;
  /** Render an internal "Quantity" heading. Off when the section already titles it. */
  showLabel?: boolean;
  label?: string;
}

export default function QuantitySelector({
  value,
  onChange,
  min = 1,
  max = 999,
  step = 1,
  showLabel = false,
  label = "Quantity",
}: QuantitySelectorProps) {
  const bump = (delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(Math.min(max, Math.max(min, value + delta)));
  };

  return (
    <View style={[styles.section, !showLabel && styles.sectionTight]}>
      {showLabel && <Text style={styles.sectionTitle}>{label}</Text>}
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.btn, value <= min && styles.btnDisabled]}
          onPress={() => bump(-step)}
          disabled={value <= min}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={step > 1 ? `Decrease by ${step}` : "Decrease quantity"}
        >
          <Minus size={18} color={value <= min ? COLORS.gray400 : COLORS.black} />
        </TouchableOpacity>
        <Text style={styles.qty}>{value}</Text>
        <TouchableOpacity
          style={[styles.btn, value >= max && styles.btnDisabled]}
          onPress={() => bump(step)}
          disabled={value >= max}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={step > 1 ? `Increase by ${step}` : "Increase quantity"}
        >
          <Plus size={18} color={value >= max ? COLORS.gray400 : COLORS.black} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingVertical: SPACING.sm,
  },
  sectionTight: { paddingTop: 0 },
  sectionTitle: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    marginBottom: SPACING.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: SPACING.lg,
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.warmWhite,
  },
  btnDisabled: { opacity: 0.5 },
  qty: {
    fontSize: 18,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    minWidth: 44,
    textAlign: "center",
  },
});
