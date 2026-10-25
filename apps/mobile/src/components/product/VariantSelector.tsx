import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { Image } from "expo-image";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";

/**
 * One choice inside a variant dimension. `image` is a real product photo pulled
 * from source_product_variants.image_url when the marketplace carries one — the
 * colour/pattern swatch a wholesale buyer actually decides on.
 */
export interface VariantOption {
  label: string;
  /** Stable value the marketplace used; falls back to the label. */
  value?: string;
  image?: string;
}

/** One dimension the customer picks along (Colour, Size, ...). */
export interface VariantGroup {
  name: string;
  options: VariantOption[];
}

interface VariantSelectorProps {
  groups: VariantGroup[];
  /** Selected option label per group name — the shape cart.addItem stores. */
  selections: Record<string, string>;
  onSelect: (groupName: string, optionLabel: string) => void;
  /** Heading word, bilingual, from the caller's i18n (defaults to "Variants"). */
  heading?: string;
}

/**
 * The single variant UI for the product screen. Renders image swatches when a
 * dimension has photos and labelled pills otherwise, so a colour-only listing
 * reads as a strip of real product images rather than text. Selected swatch is
 * ringed in the brand colour; a broken image URL degrades to the text pill, so
 * a dead CDN link never leaves an empty square.
 */
export default function VariantSelector({
  groups,
  selections,
  onSelect,
  heading,
}: VariantSelectorProps) {
  const dimensions = groups.filter((g) => g && g.options.length > 0);
  if (dimensions.length === 0) return null;

  const showHeading = Boolean(heading) && dimensions.length > 1;

  return (
    <>
      {showHeading && <Text style={styles.outerHeading}>{heading}</Text>}
      {dimensions.map((g) => {
        const selected = selections[g.name];
        const anyImage = g.options.some((o) => o.image);
        return (
          <View key={g.name} style={styles.card}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupName}>{g.name}</Text>
              {selected ? (
                <Text style={styles.selectedValue} numberOfLines={1}>
                  {selected}
                </Text>
              ) : null}
            </View>

            {anyImage ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.swatchRow}
              >
                {g.options.map((opt) => {
                  const active = selected === opt.label;
                  return (
                    <TouchableOpacity
                      key={`${g.name}-${opt.label}`}
                      activeOpacity={0.8}
                      onPress={() => onSelect(g.name, opt.label)}
                      style={[styles.swatchBox, active && styles.swatchBoxActive]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${g.name}: ${opt.label}`}
                    >
                      <Image
                        source={{ uri: opt.image ?? "" }}
                        style={styles.swatchImage}
                        contentFit="cover"
                        transition={150}
                        cachePolicy="memory-disk"
                        recyclingKey={opt.image ?? opt.label}
                        placeholder={COLORS.gray100}
                        // A dead swatch URL falls back to the tinted square plus
                        // the text label below it, never an empty hole.
                        onError={() => undefined}
                      />
                      <View style={styles.swatchLabelWrap}>
                        <Text
                          style={[styles.swatchLabel, active && styles.swatchLabelActive]}
                          numberOfLines={1}
                        >
                          {opt.label}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={styles.pillRow}>
                {g.options.map((opt) => {
                  const active = selected === opt.label;
                  return (
                    <TouchableOpacity
                      key={`${g.name}-${opt.label}`}
                      style={[styles.pill, active && styles.pillActive]}
                      onPress={() => onSelect(g.name, opt.label)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${g.name}: ${opt.label}`}
                    >
                      <Text
                        style={[styles.pillText, active && styles.pillTextActive]}
                        numberOfLines={1}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  outerHeading: {
    fontSize: 15,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    marginTop: SPACING.lg,
    marginBottom: -SPACING.xs,
    paddingHorizontal: SPACING.xs,
  },
  card: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginTop: SPACING.md,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  groupName: {
    fontSize: 14,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    flexShrink: 1,
  },
  selectedValue: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: COLORS.primary,
    flexShrink: 1,
  },
  swatchRow: { gap: SPACING.sm, paddingVertical: 2 },
  swatchBox: {
    width: 76,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    overflow: "hidden",
    backgroundColor: COLORS.white,
  },
  swatchBoxActive: {
    borderColor: COLORS.primary,
  },
  swatchImage: {
    width: "100%",
    height: 76,
    backgroundColor: COLORS.gray100,
  },
  swatchLabelWrap: { paddingHorizontal: 4, paddingVertical: 4 },
  swatchLabel: {
    fontSize: 11,
    fontFamily: FONTS.medium,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  swatchLabelActive: { color: COLORS.primary, fontFamily: FONTS.semibold },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  pill: {
    minHeight: 40,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    justifyContent: "center",
    alignItems: "center",
  },
  pillActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.softOrange,
  },
  pillText: { fontSize: 14, fontFamily: FONTS.semibold, color: COLORS.black },
  pillTextActive: { color: COLORS.primary },
});
