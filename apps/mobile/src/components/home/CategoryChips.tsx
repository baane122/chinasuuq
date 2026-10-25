import React, { useEffect, useRef } from "react";
import {
  Animated,
  ScrollView,
  Text,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { categoryLabel, type BrowseCategory } from "@/api/categories";

interface CategoryChipsProps {
  /** The real categories (from `useBrowseCategories`) — already sorted and counted. */
  categories: BrowseCategory[];
  selected?: string;
  onSelect?: (id: string) => void;
  /** Total products behind the "All" chip; omit to hide the number. */
  totalCount?: number;
}

function AnimatedChip({
  isActive,
  emoji,
  iconUrl,
  label,
  count,
  showCount,
  onPress,
}: {
  isActive: boolean;
  emoji: string | null;
  iconUrl: string | null;
  label: string;
  count: number;
  showCount: boolean;
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
        {iconUrl ? (
          <Image
            source={{ uri: iconUrl }}
            style={styles.chipIconImg}
            contentFit="cover"
            transition={120}
            cachePolicy="memory-disk"
          />
        ) : emoji ? (
          <Text style={styles.emoji}>{emoji}</Text>
        ) : null}
        {isActive && <View style={styles.activeDot} />}
        <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
          {label}
        </Text>
        {showCount && (
          <View style={[styles.countBadge, isActive && styles.countBadgeActive]}>
            <Text style={[styles.countText, isActive && styles.countTextActive]}>
              {count}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

/**
 * The category row, driven by the REAL `categories` table (name_so/name_en per
 * app locale, icon or image, sort_order) with an honest per-shelf count — a
 * category with no products reads as 0 and the grid says so, instead of the old
 * behaviour where ten hardcoded ids matched almost nothing.
 */
export function CategoryChips({
  categories,
  selected = "all",
  onSelect,
  totalCount,
}: CategoryChipsProps) {
  const { locale } = useI18n();

  const handlePress = (id: string) => {
    void Haptics.selectionAsync();
    onSelect?.(id);
  };

  // Counts only become meaningful once the catalog itself is on screen; until
  // then chips show no number rather than a misleading row of zeroes.
  const showCounts = totalCount !== undefined && totalCount > 0;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      contentContainerStyle={styles.container}
    >
      <AnimatedChip
        isActive={selected === "all"}
        emoji="🔥"
        iconUrl={null}
        label={locale === "so" ? "Dhammaan" : "All"}
        count={totalCount ?? 0}
        showCount={showCounts}
        onPress={() => handlePress("all")}
      />
      {categories.map((cat) => {
        // The icon column is loose data: an http(s) value is an image, anything
        // else (an emoji like 🏠) is text. Either way it is optional.
        const iconIsUrl = Boolean(cat.icon && /^https?:\/\//i.test(cat.icon));
        return (
          <AnimatedChip
            key={cat.id}
            isActive={selected === cat.id}
            emoji={iconIsUrl ? null : cat.icon}
            iconUrl={iconIsUrl ? cat.icon : cat.imageUrl}
            label={categoryLabel(cat, locale)}
            count={cat.count}
            showCount={showCounts}
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
  chipIconImg: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.gray100,
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
  countBadge: {
    minWidth: 20,
    alignItems: "center",
    borderRadius: RADIUS.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
    backgroundColor: COLORS.gray100,
  },
  countBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  countText: {
    fontSize: 10,
    fontFamily: FONTS.semibold,
    color: COLORS.textSecondary,
  },
  countTextActive: {
    color: COLORS.white,
  },
});
