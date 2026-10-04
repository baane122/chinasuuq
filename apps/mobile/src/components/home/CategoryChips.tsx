import React, { useEffect, useRef } from "react";
import {
  Animated,
  ScrollView,
  Text,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
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

function AnimatedChip({
  isActive,
  emoji,
  label,
  onPress,
}: {
  isActive: boolean;
  emoji: string;
  label: string;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(isActive ? 1 : 0.92)).current;

  useEffect(() => {
    if (isActive) {
      scale.setValue(0.92);
      Animated.spring(scale, {
        toValue: 1,
        friction: 3,
        tension: 140,
        useNativeDriver: true,
      }).start();
    } else {
      scale.setValue(1);
    }
  }, [isActive, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[styles.chip, isActive && styles.chipActive]}
        activeOpacity={0.75}
        onPress={onPress}
      >
        <Text style={styles.emoji}>{emoji}</Text>
        {isActive && <View style={styles.activeDot} />}
        <Text style={[styles.label, isActive && styles.labelActive]}>
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function CategoryChips({ selected = "all", onSelect }: CategoryChipsProps) {
  const { t } = useI18n();

  const handlePress = (id: string) => {
    void Haptics.selectionAsync();
    onSelect?.(id);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      contentContainerStyle={styles.container}
    >
      {CATEGORIES.map((cat) => {
        // t() echoes the key back when a translation is missing; fall back to
        // the built-in English label in that case (this is what the earlier
        // `t(key) || labelKey` expression could never do — a key is truthy).
        const key = `categories.${cat.id}`;
        const translated = t(key);
        return (
          <AnimatedChip
            key={cat.id}
            isActive={selected === cat.id}
            emoji={cat.emoji}
            label={translated === key ? cat.labelKey : translated}
            onPress={() => handlePress(cat.id)}
          />
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
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    // subtle inactive elevation
    shadowColor: COLORS.black,
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: "transparent",
    // brand-colored active glow
    shadowColor: COLORS.primary,
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  emoji: {
    fontSize: 15,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.white,
  },
  label: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: COLORS.black,
  },
  labelActive: {
    color: COLORS.white,
    fontFamily: FONTS.semibold,
  },
});
