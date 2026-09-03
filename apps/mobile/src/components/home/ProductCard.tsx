import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { Plus } from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import type { Product } from "@/types";
import { useCartStore } from "@/store/cart";
import { parseMOQ, getMOQText } from "@/lib/shipping";

interface ProductCardProps {
  product: Product;
  onPress?: () => void;
}

export const ProductCard = React.memo(function ProductCard({
  product,
  onPress,
}: ProductCardProps) {
  const addItem = useCartStore((s) => s.addItem);
  const thumbnail = product.images?.[0] || "https://picsum.photos/300/300";

  // Smart MOQ parsing
  const smartMOQ = parseMOQ(
    product.moq || 1,
    product.attributes || {},
    product.title_original || product.title_english,
    product.description_original || product.description_english
  );

  const marketplaceColors: Record<string, string> = {
    "1688": "#FF6600",
    taobao: "#FF5000",
    yiwugo: "#1A8CFF",
    chinasuuq: COLORS.primary,
  };

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
      <Image
        source={{ uri: thumbnail }}
        style={styles.image}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
        recyclingKey={thumbnail}
        placeholder={COLORS.gray100}
      />

      {/* Marketplace badge */}
      <View
        style={[
          styles.marketBadge,
          { backgroundColor: marketplaceColors[product.marketplace] || COLORS.primary },
        ]}
      >
        <Text style={styles.marketBadgeText}>{product.marketplace}</Text>
      </View>

      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {product.title_english || product.title_original}
        </Text>
        <Text style={styles.price}>${product.price_usd_estimated.toFixed(2)}</Text>
        <Text style={styles.moq}>{getMOQText(smartMOQ)}</Text>
      </View>

      <TouchableOpacity
        style={styles.addButton}
        activeOpacity={0.7}
        onPress={() => addItem(product, smartMOQ)}
      >
        <Plus size={18} color={COLORS.white} strokeWidth={2.5} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    width: "48%",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    marginBottom: SPACING.md,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  image: {
    width: "100%",
    height: 160,
    backgroundColor: COLORS.gray100,
  },
  marketBadge: {
    position: "absolute",
    top: SPACING.sm,
    left: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  marketBadgeText: {
    fontSize: 10,
    fontFamily: FONTS.semibold,
    color: COLORS.white,
    textTransform: "uppercase",
  },
  info: {
    padding: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  title: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: COLORS.black,
    lineHeight: 18,
    marginBottom: SPACING.xs,
  },
  price: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
    marginBottom: 2,
  },
  moq: {
    fontSize: 11,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
  },
  addButton: {
    position: "absolute",
    bottom: SPACING.md,
    right: SPACING.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
});
