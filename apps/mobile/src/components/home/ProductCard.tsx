import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from "react-native";
import { Image } from "expo-image";
import { Plus, Package } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import type { Product } from "@/types";
import { useCartStore } from "@/store/cart";
import { parseMOQ, getMOQText } from "@/lib/shipping";
import { useFx, DEFAULT_CNY_PER_USD } from "@/lib/exchange";
import { useI18n } from "@/lib/i18n";
import { trackAddToCart, trackProductView, trackSearchClick } from "@/api/browseEvents";
import { prefersReduceMotion } from "@/lib/useReduceMotion";

interface ProductCardProps {
  product: Product;
  onPress?: () => void;
  /**
   * Which engagement the opening of THIS card reports. "view" is a browse
   * surface (home grid, wishlist); "search_click" is a search result. The
   * server throttles (product, event, 60 s), so the detail screen's own view
   * event never double-counts a card opened one moment earlier.
   */
  eventKind?: "view" | "search_click";
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
  function ProductCard({ product, onPress, eventKind = "view" }: ProductCardProps) {
    const { locale } = useI18n();
    const addItem = useCartStore((s) => s.addItem);
    const { cnyPerUsd } = useFx();

    // Image pipeline: the FIRST photo is the card; a second, slimmer photo
    // peeks along the right edge so a multi-image listing reads as "there is
    // more here" without any carousel machinery in a list cell (that would
    // cost a scroll listener and an animation per card). If the photo CDN
    // rejects the request the card degrades to the bundled placeholder plus a
    // "No photo" caption — a loaded-looking empty grey box is the failure this
    // used to have.
    const photos = product.images ?? [];
    const thumb = photos[0] || null;
    const second = photos.length > 1 ? photos[1] : null;
    const [failedUri, setFailedUri] = useState<string | null>(null);
    const thumbFailed = failedUri === thumb;
    const showPhoto = thumb !== null && !thumbFailed;

    // Title chain that finally includes Somali: in Somali mode the Somali
    // title wins, then English, then the original Chinese; in English mode
    // English wins but a Somali translation still beats nothing rather than
    // falling straight to a Chinese-only title.
    const displayTitle = useMemo(() => {
      const chain =
        locale === "so"
          ? [product.title_somali, product.title_english, product.title_original]
          : [product.title_english, product.title_somali, product.title_original];
      for (const candidate of chain) {
        if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
      }
      return "";
    }, [product, locale]);

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

    // Press feedback: a small scale/elevation dip (the old card only dimmed via
    // activeOpacity). Honours the device's reduce-motion setting; the flag is
    // read imperatively so a list of memoized cards never re-renders for it.
    const pressScale = useRef(new Animated.Value(1)).current;
    const beginPress = useCallback(() => {
      if (prefersReduceMotion()) return;
      Animated.spring(pressScale, {
        toValue: 0.97,
        friction: 6,
        tension: 200,
        useNativeDriver: true,
      }).start();
    }, [pressScale]);
    const endPress = useCallback(() => {
      if (prefersReduceMotion()) return;
      Animated.spring(pressScale, {
        toValue: 1,
        friction: 5,
        tension: 160,
        useNativeDriver: true,
      }).start();
    }, [pressScale]);

    const handleOpen = useCallback(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Real browsing feeds the trending ledger from here on — this card, not
      // only TrendingRow, reports its own opens.
      if (eventKind === "search_click") trackSearchClick(product);
      else trackProductView(product);
      onPress?.();
    }, [eventKind, onPress, product]);

    const handleAdd = useCallback(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      addItem(product, smartMOQ);
      trackAddToCart(product);
    }, [addItem, product, smartMOQ]);

    const featured = product.curation?.featured === true;

    return (
    <Animated.View style={[styles.cardOuter, { transform: [{ scale: pressScale }] }]}>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={handleOpen}
        onPressIn={beginPress}
        onPressOut={endPress}
      >
        <View style={styles.photoBox}>
          {showPhoto ? (
            <Image
              source={{ uri: thumb }}
              style={styles.image}
              contentFit="cover"
              transition={150}
              cachePolicy="memory-disk"
              recyclingKey={thumb ?? `placeholder-${product.id}`}
              placeholder={COLORS.gray100}
              onError={() => setFailedUri(thumb)}
            />
          ) : (
            <View style={styles.imageFallback}>
              <Package size={26} color={COLORS.gray400} strokeWidth={1.6} />
              <Text style={styles.imageFallbackText} numberOfLines={1}>
                {locale === "so" ? "Sawir ma jiro" : "No photo yet"}
              </Text>
            </View>
          )}

          {/* Second-photo peek: a slim strip of images[1] on the right edge,
              reading as a stacked deck. Static — costs nothing while scrolling. */}
          {second && showPhoto && (
            <View style={styles.peekWrap}>
              <Image
                source={{ uri: second }}
                style={styles.peekImage}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={second}
                placeholder={COLORS.gray100}
              />
            </View>
          )}

          {/* Photo count: the peek alone cannot say how deep the stack is. */}
          {photos.length > 1 && (
            <View style={styles.imageCountPill}>
              <Text style={styles.imageCountText}>1/{photos.length}</Text>
            </View>
          )}

          {/* Marketplace badge */}
          <View
            style={[
              styles.marketBadge,
              { backgroundColor: MARKETPLACE_BADGE_COLORS[product.marketplace] || COLORS.primary },
            ]}
          >
            <Text style={styles.marketBadgeText}>{product.marketplace}</Text>
          </View>

          {/* Featured ribbon — the staff pick the website's Mission Control
              pins via the reserved `_curation` attribute; rank 1 reads "#1 pick". */}
          {featured && (
            <View style={styles.ribbonWrap}>
              <Text style={styles.ribbonText}>
                {product.curation?.rank
                  ? `${locale === "so" ? "Dooro" : "Pick"} #${product.curation.rank}`
                  : locale === "so"
                    ? "La Doortay"
                    : "Featured"}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>
            {displayTitle}
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

          <View style={styles.metaRow}>
            <View style={styles.moqChip}>
              <Text style={styles.moqChipText}>{getMOQText(smartMOQ)}</Text>
            </View>
            {Boolean(product.category) && (
              <Text style={styles.categoryChip} numberOfLines={1}>
                {product.category}
              </Text>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={styles.addButton}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          onPress={handleAdd}
        >
          <Plus size={19} color={COLORS.white} strokeWidth={2.5} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
  },
  // Lists (home grid, search results) hand every card a fresh inline `onPress`
  // closure on each parent render, which defeats the default shallow compare.
  // The only values that closure captures and that ever change are `product`
  // and the constant `eventKind`, so comparing those two is sufficient — a
  // "stale" onPress from the previous render still navigates to the same id.
  // Prices stay live because useFx() subscribes inside the card and re-renders
  // it on rate changes regardless of this comparator.
  (prev, next) => prev.product === next.product && prev.eventKind === next.eventKind
);

const styles = StyleSheet.create({
  cardOuter: {
    width: "48%",
    marginBottom: SPACING.md,
  },
  card: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  photoBox: {
    width: "100%",
    height: 170,
    backgroundColor: COLORS.gray100,
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imageFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.softOrange,
    paddingHorizontal: SPACING.sm,
    gap: SPACING.xs,
  },
  imageFallbackText: {
    fontSize: 10,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
  },
  peekWrap: {
    position: "absolute",
    top: 6,
    right: 6,
    bottom: 6,
    width: 14,
    borderRadius: RADIUS.sm,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
  },
  peekImage: {
    width: "100%",
    height: "100%",
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
  ribbonWrap: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: COLORS.black,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  ribbonText: {
    fontSize: 9,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
    letterSpacing: 0.3,
  },
  imageCountPill: {
    position: "absolute",
    bottom: SPACING.sm,
    right: 30,
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
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
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
  categoryChip: {
    flex: 1,
    fontSize: 10,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
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
