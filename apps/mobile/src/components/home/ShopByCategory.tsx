import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { addRecentlyVisited } from "@/lib/marketplaces";

// PNG category icons (generated, consistent style)
const CATEGORY_ICONS: Record<string, any> = {
  home: require("../../../assets/categories/home.png"),
  fashion: require("../../../assets/categories/fashion.png"),
  electronics: require("../../../assets/categories/electronics.png"),
  baby: require("../../../assets/categories/baby.png"),
  hardware: require("../../../assets/categories/hardware.png"),
  beauty: require("../../../assets/categories/beauty.png"),
  packaging: require("../../../assets/categories/packaging.png"),
  shoes: require("../../../assets/categories/shoes.png"),
};

// Icon-driven categories. Each opens a real 1688 keyword search inside
// the marketplace browser (browse-first, never fabricated products).
const CATEGORIES = [
  { id: "home", color: "#F0780A", en: "Home", so: "Guryo", q: "home goods" },
  { id: "fashion", color: "#8347E5", en: "Fashion", so: "Dhar", q: "clothing" },
  { id: "electronics", color: "#1E6FD9", en: "Electronics", so: "Elektronik", q: "electronics" },
  { id: "baby", color: "#E84400", en: "Baby", so: "Dhallaanka", q: "baby products" },
  { id: "hardware", color: "#3F6212", en: "Hardware", so: "Qalab", q: "tools" },
  { id: "beauty", color: "#C026D3", en: "Beauty", so: "Quruxda", q: "beauty" },
  { id: "packaging", color: "#0F766E", en: "Packaging", so: "Baakad", q: "packaging" },
  { id: "shoes", color: "#B45309", en: "Shoes & Bags", so: "Kabaha", q: "shoes bags" },
];

export function ShopByCategory() {
  const { locale } = useI18n();
  const router = useRouter();

  const open = (q: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addRecentlyVisited("1688").catch(() => {});
    router.push({ pathname: "/marketplace/[marketplace]", params: { marketplace: "1688", q } });
  };

  return (
    <View style={styles.grid}>
      {CATEGORIES.map((c) => (
        <TouchableOpacity
          key={c.id}
          style={styles.cell}
          activeOpacity={0.7}
          onPress={() => open(c.q)}
        >
          <View style={[styles.tile, { backgroundColor: c.color + "1A" }]}>
            <Image
              source={CATEGORY_ICONS[c.id]}
              style={styles.categoryImg}
              contentFit="contain"
              transition={100}
            />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {locale === "en" ? c.en : c.so}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
  },
  cell: {
    width: "22%",
    flexGrow: 1,
    alignItems: "center",
    gap: 6,
  },
  tile: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryImg: { width: 36, height: 36 },
  label: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
    textAlign: "center",
  },
});
