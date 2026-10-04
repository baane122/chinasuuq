import React, { useCallback, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { Plus } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import type { Product } from "@/types";
import { useCartStore } from "@/store/cart";
import { parseMOQ, getMOQText } from "@/lib/shipping";
import { useFx, DEFAULT_CNY_PER_USD } from "@/lib/exchange";
import { useI18n } from "@/lib/i18n";

interface ProductCardProps {
  product: Product;
  onPress?: () => void;
}

/** Bundled gray placeholder — replaces the old external picsum.photos URL. */
const PLACEHOLDER_IMAGE = require("../../../assets/images/placeholder.png");

// Module-level so a memoized card doesn't allocate a new lookup object on
// every render of every visible card while the list scrolls.
const MARKETPLACE_BADGE_COLORS: Record<string, string> = {
  "1688": "#FF6600",
  taobao: "#FF5000",
  yiwugo: "#1A8CFF",
  chinasuuq: COLORS.primary,
};

export const ProductCard = React.memo(
  function ProductCard({
    product,
    onPress,
  }: ProductCardProps) {
    const { locale } = useI18n();
    const addItem = useCartStore((s) => s.addItem);
    const { cnyPerUsd } = useFx();
    // Bundled gray placeholder — no external picsum dependency.
    const thumbnail = product.images?.[0] || null;

    // `price_usd_estimated` is a snapshot taken when the row was cached — often at
    // the cold-start default, and it never moves when the admin changes the rate.
    // Deriving from the yuan figure at render keeps every card, the cart and the
    // checkout total agreeing with the one number in Admin → Settings.
    const priceCny = Number(product.price_cny_min) || 0;
    // Plausible CNY-per-USD band, same as the FX store: a flipped/stale rate must
    // never render ¥1 as $10,000.
    const rate = Math.min(Math.max(Number(cnyPerUsd) || DEFAULT_CNY_PER_USD, 2), 20);
    const usdPrice = priceCny > 0 ? priceCny / rate : Number(product.price_usd_estimated) || 0;

    // Smart MOQ parsing — only re-derived when the product itself changes, not
    // on every rate tick or list re-render.
    const smartMOQ = useMemo(
      () =>
        parseMOQ(
          product.moq || 1,
          product.attributes || {},
          product.title_original || product.title_english,
          product.description_original || product.description_english
        ),
      [product]
    );

    const handleAdd = useCallback(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      addItem(product, smartMOQ);
    }, [addItem, product, smartMOQ]);

    return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
      <Image
        source={thumbnail ? { uri: thumbnail } : PLACEHOLDER_IMAGE}
        style={styles.image}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
        recyclingKey={thumbnail ?? `placeholder-${product.id}`}
        placeholder={COLORS.gray100}
      />

      {/* Marketplace badge */}
      <View
        style={[
          styles.marketBadge,
          { backgroundColor: MARKETPLACE_BADGE_COLORS[product.marketplace] || COLORS.primary },
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
            ${usdPrice.toFixed(2)}
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
  },
  // Lists (home grid, search results) hand every card a fresh inline `onPress`
  // closure on each parent render, which defeats the default shallow compare.
  // The only value that closure captures and that ever changes is `product`
  // itself, so comparing product identity is sufficient — a "stale" onPress
  // from the previous render still navigates to the same id. Prices stay live
  // because useFx() subscribes inside the card and re-renders it on rate
  // changes regardless of this comparator.
  (prev, next) => prev.product === next.product
);

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
