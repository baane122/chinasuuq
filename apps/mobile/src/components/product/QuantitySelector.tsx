import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";

interface QuantitySelectorProps {
  value: number;
  onChange: (qty: number) => void;
  min?: number;
  max?: number;
}

export default function QuantitySelector({
  value,
  onChange,
  min = 1,
  max = 999,
}: QuantitySelectorProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Quantity</Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.btn, value <= min && styles.btnDisabled]}
          onPress={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          activeOpacity={0.7}
        >
          <Minus size={18} color={value <= min ? COLORS.gray400 : COLORS.black} />
        </TouchableOpacity>
        <Text style={styles.qty}>{value}</Text>
        <TouchableOpacity
          style={[styles.btn, value >= max && styles.btnDisabled]}
          onPress={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          activeOpacity={0.7}
        >
          <Plus size={18} color={value >= max ? COLORS.gray400 : COLORS.black} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    marginTop: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    marginBottom: SPACING.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
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
  btnDisabled: {
    opacity: 0.5,
  },
  qty: {
    fontSize: 18,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    minWidth: 40,
    textAlign: "center",
  },
});
