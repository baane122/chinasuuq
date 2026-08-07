import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";

interface VariantSelectorProps {
  title: string;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
}

export default function VariantSelector({
  title,
  options,
  selected,
  onSelect,
}: VariantSelectorProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.row}>
        {options.map((opt) => {
          const isActive = opt === selected;
          return (
            <TouchableOpacity
              key={opt}
              style={[styles.pill, isActive && styles.pillActive]}
              onPress={() => onSelect(opt)}
              activeOpacity={0.7}
            >
              <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
                {opt}
              </Text>
            </TouchableOpacity>
          );
        })}
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
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  pill: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    minHeight: 40,
    justifyContent: "center",
  },
  pillActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.softOrange,
  },
  pillText: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
  },
  pillTextActive: {
    color: COLORS.primary,
  },
});
