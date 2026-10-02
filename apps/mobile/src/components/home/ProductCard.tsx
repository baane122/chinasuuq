import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { Plus } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import type { Product } from "@/types";
import { useCartStore } from "@/store/cart";
import { parseMOQ, getMOQText } from "@/lib/shipping";
import { useI18n } from "@/lib/i18n";

interface ProductCardProps {
  product: Product;
  onPress?: () => void;
}

export const ProductCard = React.memo(function ProductCard({
  product,
  onPress,
}: ProductCardProps) {
  const { locale } = useI18n();
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

  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addItem(product, smartMOQ);
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

      {/* Image count pill */}
      {product.images.length > 1 && (
        <View style={styles.imageCountPill}>
          <Text style={styles.imageCountText}>{product.images.length} photos</Text>
        </View>
      )}

      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {product.title_english || product.title_original}
        </Text>

        <View style={styles.priceRow}>
          <Text style={styles.price}>
            ${product.price_usd_estimated.toFixed(2)}
          </Text>
          <View
            style={[
              styles.stockDot,
              {
                backgroundColor:
                  product.stock_status === "in_stock"
                    ? COLORS.success
                    : COLORS.warning,
              },
            ]}
          />
          {product.price_cny_max > product.price_cny_min && (
            <Text style={styles.cnyRange}>
              ¥{product.price_cny_min}~{product.price_cny_max}
            </Text>
          )}
        </View>

        {(product.sales_count > 0 || product.supplier_rating > 0) && (
          <View style={styles.statsRow}>
            {product.sales_count > 0 && (
              <Text style={styles.stat}>
                {locale === "so"
                  ? `🔥 ${product.sales_count}+ la iibsaday`
                  : `🔥 ${product.sales_count}+ sold`}
              </Text>
            )}
            {product.supplier_rating > 0 && (
              <Text style={styles.stat}>⭐ {product.supplier_rating.toFixed(1)}</Text>
            )}
          </View>
        )}

        <View style={styles.moqChip}>
          <Text style={styles.moqChipText}>{getMOQText(smartMOQ)}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.addButton}
        activeOpacity={0.7}
        onPress={handleAdd}
      >
        <Plus size={19} color={COLORS.white} strokeWidth={2.5} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    width: "48%",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    marginBottom: SPACING.md,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  image: {
    width: "100%",
    height: 170,
    backgroundColor: COLORS.gray100,
  },
  marketBadge: {
    position: "absolute",
    top: SPACING.sm,
    left: SPACING.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  marketBadgeText: {
    fontSize: 9,
    fontFamily: FONTS.semibold,
    color: COLORS.white,
    textTransform: "uppercase",
  },
  imageCountPill: {
    position: "absolute",
    bottom: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: "rgba(17,17,17,0.65)",
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  imageCountText: {
    fontSize: 10,
    fontFamily: FONTS.semibold,
    color: COLORS.white,
  },
  info: {
    padding: SPACING.md,
    gap: 4,
  },
  title: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: COLORS.black,
    lineHeight: 18,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  price: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
  },
  stockDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  cnyRange: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  stat: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  moqChip: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.softOrange,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  moqChipText: {
    fontSize: 10,
    fontFamily: FONTS.semibold,
    color: COLORS.primaryDark,
  },
  addButton: {
    position: "absolute",
    bottom: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
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
