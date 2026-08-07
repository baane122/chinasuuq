import React from "react";
import { ScrollView, Text, StyleSheet, TouchableOpacity } from "react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";

interface CategoryChipsProps {
  selected?: string;
  onSelect?: (id: string) => void;
}

const CATEGORIES = [
  { id: "all", emoji: "🔥", labelKey: "All" },
  { id: "electronics", emoji: "📱", labelKey: "Electronics" },
  { id: "clothing", emoji: "👔", labelKey: "Clothing" },
  { id: "home", emoji: "🏠", labelKey: "Home" },
  { id: "beauty", emoji: "💄", labelKey: "Beauty" },
  { id: "toys", emoji: "🧸", labelKey: "Toys" },
  { id: "sports", emoji: "⚽", labelKey: "Sports" },
  { id: "automotive", emoji: "🚗", labelKey: "Auto" },
  { id: "jewelry", emoji: "💎", labelKey: "Jewelry" },
  { id: "bags", emoji: "👜", labelKey: "Bags" },
];

export function CategoryChips({ selected = "all", onSelect }: CategoryChipsProps) {
  const { t } = useI18n();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {CATEGORIES.map((cat) => {
        const isActive = selected === cat.id;
        return (
          <TouchableOpacity
            key={cat.id}
            style={[styles.chip, isActive && styles.chipActive]}
            activeOpacity={0.7}
            onPress={() => onSelect?.(cat.id)}
          >
            <Text style={styles.emoji}>{cat.emoji}</Text>
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {t(`categories.${cat.id}`) || cat.labelKey}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    gap: SPACING.xs + 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  emoji: {
    fontSize: 16,
  },
  label: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: COLORS.black,
  },
  labelActive: {
    color: COLORS.white,
  },
});
