import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Linking,
  Alert,
} from "react-native";
import {
  ArrowLeft,
  Star,
  Truck,
  MessageCircle,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Heart,
} from "lucide-react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS, whatsappOrderLink } from "@/lib/theme";
import { formatUSD, formatCNY } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth";
import { useCartStore } from "@/store/cart";
import { getProductById, toggleFavorite, getFavorites } from "@/db";
import type { Product, ProductVariant } from "@/types";
import { moqOrderRules, describeMoq } from "@/lib/moqIngest";
import type { ResolvedMoq } from "@/lib/moqIngest";
import { getSuggestedQuantities } from "@/lib/moq";
import AiTranslateCard from "@/components/product/AiTranslateCard";
import ImageCarousel from "@/components/product/ImageCarousel";
import QuantitySelector from "@/components/product/QuantitySelector";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

/**
 * The MOQ evidence a stored product carries: the marketplace wording its MOQ was
 * read out of, plus the supplier's own spec fields and description. Handed to
 * moqOrderRules() — the only MOQ reader in the app, so no screen parses 起批
 * itself. The title stays out: "5件套" in a product name is a set count.
 */
function moqEvidence(p: Product): string {
  const lines: string[] = [];
  if (p.moq_raw_text) lines.push(p.moq_raw_text);
  for (const [k, v] of Object.entries(p.attributes || {})) {
    if (v) lines.push(`${k}: ${v}`);
  }
  if (p.description_original) lines.push(p.description_original);
  if (p.description_english) lines.push(p.description_english);
  return lines.join("\n").slice(0, 4000);
}

/** Who stood behind the number, in the customer's language. */
function moqSourceLine(r: ResolvedMoq, locale: "en" | "so"): string {
  const pct = r.confidence > 0 ? ` (${Math.round(r.confidence * 100)}%)` : "";
  if (r.source === "manual")
    return locale === "so" ? "Dalabka ugu yar waxaa xaqiijiyay shaqaalahayaga" : "Confirmed by ChinaSuuq staff";
  if (r.source === "ai")
    return locale === "so" ? "Bogg alaabta ayaa ka soo qaatay" + pct : "Extracted from the listing" + pct;
  if (r.source === "regex")
    return locale === "so" ? "Waxaa laga helay bogga alaabta" + pct : "Detected from the listing" + pct;
  return locale === "so" ? "Dalabka ugu yar laguma sheegin bogga" : "Not stated on the listing";
}

export default function ProductDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useI18n();
  const addItem = useCartStore((s) => s.addItem);
  const user = useAuthStore((s) => s.user);

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [togglingFav, setTogglingFav] = useState(false);

  const [qty, setQty] = useState(1);
  const [variantSelections, setVariantSelections] = useState<
    Record<string, string>
  >({});
  const [descExpanded, setDescExpanded] = useState(false);

  // Load real product from the resilient data layer.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotFound(false);
    getProductById(id ?? "")
      .then((p) => {
        if (!active) return;
        if (!p) {
          setProduct(null);
          setNotFound(true);
        } else {
          setProduct(p);
          // Default-select the first option of every variant group.
          const defaults: Record<string, string> = {};
          p.variants.forEach((v: ProductVariant) => {
            if (v.options && v.options.length > 0) {
              defaults[v.name] = v.options[0].label;
            }
          });
          setVariantSelections(defaults);
        }
      })
      .catch(() => {
        if (active) {
          setProduct(null);
          setNotFound(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  /** MOQ floor, price ladder, carton size — resolved once, from stored provenance. */
  const order = useMemo(() => (product ? moqOrderRules(product, moqEvidence(product)) : null), [product]);
  const rules = order?.rules ?? null;
  const resolution = order?.resolution ?? null;
  const structure = order?.structure ?? null;

  /** Quick-buy amounts: the floor, carton multiples, every tier boundary. */
  const suggestedQtys = useMemo<number[]>(
    () => (rules ? getSuggestedQuantities(rules) : [1, 2, 5, 10]),
    [rules]
  );

  // The stepper ceiling has to clear a 5000-piece carton minimum.
  const qtyMax = useMemo(
    () => Math.max(999, resolution?.displayMoq ?? 1, ...suggestedQtys),
    [resolution?.displayMoq, suggestedQtys]
  );

  // Open on a quantity the supplier will actually sell, not on 1.
  useEffect(() => {
    if (!resolution) return;
    setQty((q) => (q < resolution.displayMoq ? resolution.displayMoq : q));
  }, [resolution?.displayMoq]);

  // Check if this product is in the user's wishlist
  useEffect(() => {
    (async () => {
      if (!user?.id || !id) {
        setIsFavorite(false);
        return;
      }
      try {
        const favs = await getFavorites(user.id);
        setIsFavorite(favs.some((p) => p.id === id));
      } catch {}
    })();
  }, [id, user?.id]);

  const handleToggleFavorite = async () => {
    if (!user?.id) {
      Alert.alert(
        "Sign in to save",
        "Create an account or sign in to save items to your wishlist."
      );
      return;
    }
    if (!id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTogglingFav(true);
    try {
      const nowFav = await toggleFavorite(user.id, id);
      setIsFavorite(nowFav);
    } finally {
      setTogglingFav(false);
    }
  };

  const images = useMemo(() => {
    return product?.images && product.images.length > 0 ? product.images : [];
  }, [product]);

  const description = useMemo(() => {
    return (
      product?.description_english ||
      product?.description_somali ||
      product?.description_original ||
      ""
    );
  }, [product]);

  const attributes = useMemo(() => product?.attributes ?? {}, [product]);

  const handleAddToCart = () => {
    if (!product) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addItem(product, qty, variantSelections);
    const title = product.title_english || product.title_somali;
    Alert.alert(
      "Added to Cart",
      `${title} (×${qty}) has been added to your cart.`,
      [
        { text: "Continue Shopping", style: "cancel" },
        { text: "View Cart", onPress: () => router.push("/cart") },
      ]
    );
  };

  const handleBuyNow = () => {
    if (!product) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    handleAddToCart();
    router.push("/cart");
  };

  const handleWhatsAppOrder = async () => {
    if (!product) return;
    try {
      const qs = Object.entries(variantSelections)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      const msg = `${product.title_english || product.title_somali}\n\nPrice: ${formatUSD(
        product.price_usd_estimated
      )}\nQuantity: ${qty}\n${qs ? `Options: ${qs}\n` : ""}${
        resolution ? describeMoq(resolution) : `MOQ: ${product.moq}`
      }${resolution?.raw ? ` (${resolution.raw})` : ""}`;
      const url = whatsappOrderLink(msg);
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert(
          "WhatsApp not available",
          "Please install WhatsApp to use this feature."
        );
      }
    } catch {
      Alert.alert("Error", "Unable to open WhatsApp.");
    }
  };

  // Header
  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.headerBtn}
        onPress={() => router.back()}
        activeOpacity={0.7}
      >
        <ArrowLeft size={22} color={COLORS.black} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Product Detail</Text>
      <TouchableOpacity
        style={styles.headerBtn}
        onPress={handleToggleFavorite}
        activeOpacity={0.7}
        disabled={togglingFav}
      >
        <Heart
          size={22}
          color={isFavorite ? COLORS.error : COLORS.black}
          fill={isFavorite ? COLORS.error : "transparent"}
        />
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        {header}
        <LoadingSpinner fullScreen />
      </SafeAreaView>
    );
  }

  if (notFound || !product) {
    return (
      <SafeAreaView style={styles.container}>
        {header}
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyEmoji}>🛒</Text>
          <Text style={styles.emptyTitle}>Product not found</Text>
          <Text style={styles.emptySubtitle}>
            This product may have been removed or is no longer available.
          </Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => router.push("/search")}
            activeOpacity={0.8}
          >
            <Text style={styles.emptyBtnText}>Browse products</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Stock indicator: success dot for in stock, warning otherwise.
  const stockInfo =
    product.stock_status === "in_stock"
      ? { color: COLORS.success, label: "In stock" }
      : {
          color: COLORS.warning,
          label:
            product.stock_status === "out_of_stock"
              ? "Out of stock"
              : "Low stock",
        };

  return (
    <SafeAreaView style={styles.container}>
      {header}

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
        {/* Image Carousel (bundled gray placeholder when the product has none) */}
        {images.length > 0 ? (
          <ImageCarousel images={images} />
        ) : (
          <View style={styles.placeholderWrap}>
            <Image
              source={require("../../assets/images/placeholder.png")}
              style={styles.placeholderImage}
              contentFit="cover"
              transition={150}
            />
          </View>
        )}

        {/* Product Info */}
        <View style={styles.infoCard}>
          <Text style={styles.productName} numberOfLines={3}>
            {product.title_english || product.title_somali}
          </Text>

          {/* Price row: USD + CNY + stock dot */}
          <View style={styles.priceRow}>
            <View style={styles.priceBlock}>
              <Text style={styles.price}>
                {formatUSD(product.price_usd_estimated)}
              </Text>
              <Text style={styles.priceCNY}>
                {product.price_cny_min !== product.price_cny_max
                  ? `${formatCNY(product.price_cny_min)} – ${formatCNY(
                      product.price_cny_max
                    )}`
                  : formatCNY(product.price_cny_min)}
              </Text>
            </View>
            <View style={styles.stockWrap}>
              <View
                style={[styles.stockDot, { backgroundColor: stockInfo.color }]}
              />
              <Text style={[styles.stockText, { color: stockInfo.color }]}>
                {stockInfo.label}
              </Text>
            </View>
          </View>

          {/* Rating + sales */}
          <View style={styles.metaRow}>
            <View style={styles.ratingBadge}>
              <Star size={14} color={COLORS.primary} fill={COLORS.primary} />
              <Text style={styles.ratingText}>
                {product.supplier_rating
                  ? product.supplier_rating.toFixed(1)
                  : "N/A"}
              </Text>
            </View>
            <Text style={styles.metaText}>
              {product.sales_count
                ? `${product.sales_count.toLocaleString()} orders`
                : "No sales yet"}
            </Text>
          </View>

          {/* Platform Badge */}
          <View style={styles.platformBadge}>
            <ShieldCheck size={14} color={COLORS.primary} />
            <Text style={styles.platformText}>
              {t("product.platform")}: {product.marketplace}
            </Text>
          </View>

          {/* Shipping */}
          <View style={styles.shippingCard}>
            <View style={styles.shippingRow}>
              <Truck size={18} color={COLORS.primary} />
              <View style={styles.shippingBody}>
                <Text style={styles.shippingLabel}>
                  {t("product.shipping")}
                </Text>
                <Text style={styles.shippingEstimate}>
                  Estimated 7–21 days · Paid on arrival
                </Text>
              </View>
            </View>
            <View style={styles.shippingProtectRow}>
              <ShieldCheck size={18} color={COLORS.primary} />
              <Text style={styles.shippingProtect}>
                Buyer protection · MOQ verified
              </Text>
            </View>
          </View>
        </View>

        {/* Variants */}
        {product.variants.map((v) => (
          <View key={v.id} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{v.name}</Text>
            <View style={styles.variantRow}>
              {v.options.map((opt) => {
                const active = variantSelections[v.name] === opt.label;
                return (
                  <TouchableOpacity
                    key={opt.label}
                    style={[styles.variantPill, active && styles.variantPillActive]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setVariantSelections((prev) => ({
                        ...prev,
                        [v.name]: opt.label,
                      }));
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.variantPillText,
                        active && styles.variantPillTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        {/* Quantity (MOQ) — resolved from the listing's own wording */}
        <View style={styles.sectionCard}>
          <View style={styles.qtyHeader}>
            <Text style={styles.sectionTitle}>{t("product.quantity")}</Text>
            {resolution && (
              <Text style={styles.moqBadge}>{describeMoq(resolution, locale)}</Text>
            )}
          </View>

          {resolution && (
            <Text style={styles.moqNote}>
              {moqSourceLine(resolution, locale)}
              {resolution.raw ? ` — “${resolution.raw}”` : ""}
            </Text>
          )}

          {/* Quick quantity buttons */}
          <View style={styles.qtyQuickRow}>
            {suggestedQtys.map((q) => (
              <TouchableOpacity
                key={q}
                style={[styles.qtyQuickBtn, qty === q && styles.qtyQuickBtnActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setQty(q);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.qtyQuickText, qty === q && styles.qtyQuickTextActive]}>
                  {q}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* The supplier's price ladder, as read off the page */}
          {rules && rules.tiers.length > 1 && (
            <View style={styles.tierBox}>
              {rules.tiers.map((tr) => {
                const applies = qty >= tr.minQty && (tr.maxQty === null || qty <= tr.maxQty);
                return (
                  <View key={tr.minQty} style={styles.tierRow}>
                    <Text style={styles.tierQty}>
                      {tr.maxQty ? `${tr.minQty}–${tr.maxQty}` : `${tr.minQty}+`} pcs
                    </Text>
                    <Text style={[styles.tierPrice, applies && styles.tierPriceActive]}>
                      ¥{tr.priceCny.toFixed(2)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {structure?.packSize && (
            <Text style={styles.packNote}>
              Sold in cartons of {structure.packSize} pieces
            </Text>
          )}

          {/* Manual quantity selector */}
          <QuantitySelector
            value={qty}
            onChange={setQty}
            min={Math.max(1, resolution?.displayMoq ?? 1)}
            max={qtyMax}
          />
        </View>

        {/* Attributes */}
        {Object.keys(attributes).length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Details</Text>
            {Object.entries(attributes).map(([key, val], i, arr) => (
              <View
                key={key}
                style={[styles.attrRow, i === arr.length - 1 && styles.attrRowLast]}
              >
                <Text style={styles.attrKey}>{key}</Text>
                <Text style={styles.attrValue} numberOfLines={2}>
                  {val}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Description */}
        {description ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{t("product.description")}</Text>
            <Text
              style={styles.descText}
              numberOfLines={descExpanded ? undefined : 4}
            >
              {description}
            </Text>
            {description.length > 180 && (
              <TouchableOpacity
                onPress={() => setDescExpanded(!descExpanded)}
                activeOpacity={0.7}
                style={styles.expandBtn}
              >
                <Text style={styles.expandText}>
                  {descExpanded ? "Show Less" : "Read More"}
                </Text>
                {descExpanded ? (
                  <ChevronUp size={16} color={COLORS.primary} />
                ) : (
                  <ChevronDown size={16} color={COLORS.primary} />
                )}
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {/* AI Translate — productId lets a finished translation survive the
            screen unmount, so reopening this product never re-asks the AI. */}
        <AiTranslateCard
          productId={id}
          title={product.title_original || product.title_english}
          description={product.description_original}
        />

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Sticky Bottom Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.buyNowBtn}
          onPress={handleBuyNow}
          activeOpacity={0.8}
        >
          <Text style={styles.buyNowText}>{t("product.buyNow")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.addToCartBtn}
          onPress={handleAddToCart}
          activeOpacity={0.8}
        >
          <Text style={styles.addToCartText}>{t("product.addToCart")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.whatsappBtn}
          onPress={handleWhatsAppOrder}
          activeOpacity={0.8}
        >
          <MessageCircle size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  placeholderWrap: { backgroundColor: COLORS.white, padding: SPACING.lg },
  placeholderImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.gray100,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  headerTitle: { fontSize: 18, fontFamily: FONTS.bold, color: COLORS.black },
  scroll: { flex: 1 },
  // Product Info Card
  infoCard: {
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    marginTop: SPACING.sm,
  },
  productName: {
    fontSize: 17,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    lineHeight: 24,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: SPACING.md,
  },
  priceBlock: { flexDirection: "column" },
  price: { fontSize: 26, fontFamily: FONTS.bold, color: COLORS.primary },
  priceCNY: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  stockWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 3,
  },
  stockDot: { width: 7, height: 7, borderRadius: 3.5 },
  stockText: { fontSize: 12, fontFamily: FONTS.semibold },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.softOrange,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
  },
  ratingText: { fontSize: 13, fontFamily: FONTS.semibold, color: COLORS.primary },
  metaText: { fontSize: 13, color: COLORS.textSecondary },
  platformBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    marginTop: SPACING.md,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
  },
  platformText: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
    color: COLORS.textSecondary,
  },
  shippingCard: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.softOrange,
    borderRadius: RADIUS.md,
  },
  shippingRow: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm },
  shippingBody: { flex: 1 },
  shippingLabel: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
  },
  shippingEstimate: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  shippingProtectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  shippingProtect: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: COLORS.textSecondary,
    flex: 1,
  },
  // Shared section card
  sectionCard: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginTop: SPACING.md,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    marginBottom: SPACING.md,
  },
  // Variants
  variantRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  variantPill: {
    height: 38,
    paddingHorizontal: 18,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    justifyContent: "center",
    alignItems: "center",
  },
  variantPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  variantPillText: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
  },
  variantPillTextActive: { color: COLORS.white },
  // Quantity Section
  qtyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.md,
  },
  moqBadge: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
    color: COLORS.primary,
    backgroundColor: COLORS.primaryBg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    flex: 1,
    textAlign: "right",
  },
  moqNote: {
    fontSize: 11,
    fontFamily: FONTS.medium,
    color: COLORS.textSecondary,
    marginTop: -SPACING.sm,
    marginBottom: SPACING.md,
  },
  tierBox: {
    backgroundColor: COLORS.gray50,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  tierRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  tierQty: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.textSecondary },
  tierPrice: { fontSize: 12, fontFamily: FONTS.semibold, color: COLORS.black },
  tierPriceActive: { color: COLORS.primary },
  packNote: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: COLORS.info,
    marginBottom: SPACING.md,
  },
  qtyQuickRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    flexWrap: "wrap",
  },
  qtyQuickBtn: {
    minWidth: 48,
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.md,
  },
  qtyQuickBtnActive: {
    backgroundColor: COLORS.softOrange,
    borderColor: COLORS.primary,
  },
  qtyQuickText: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
  },
  qtyQuickTextActive: {
    color: COLORS.primaryDark,
  },
  // Attributes
  attrRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    gap: SPACING.md,
  },
  attrRowLast: { borderBottomWidth: 0 },
  attrKey: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontFamily: FONTS.medium,
    width: 110,
  },
  attrValue: {
    fontSize: 13,
    color: COLORS.black,
    fontFamily: FONTS.medium,
    flex: 1,
  },
  // Description
  descText: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 22 },
  expandBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: SPACING.sm,
    minHeight: 44,
    justifyContent: "center",
  },
  expandText: { fontSize: 14, fontFamily: FONTS.semibold, color: COLORS.primary },
  // Bottom Bar
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    backgroundColor: COLORS.white,
    flexDirection: "row",
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
  buyNowBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  buyNowText: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.white },
  addToCartBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: COLORS.black,
    justifyContent: "center",
    alignItems: "center",
  },
  addToCartText: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.white },
  whatsappBtn: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: COLORS.whatsapp,
    justifyContent: "center",
    alignItems: "center",
  },
  bottomSpacer: { height: 200 },
  // Empty / error states
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: SPACING.xxl,
  },
  emptyEmoji: { fontSize: 64, marginBottom: SPACING.lg },
  emptyTitle: {
    fontSize: 18,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    marginBottom: SPACING.sm,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: SPACING.xl,
  },
  emptyBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  emptyBtnText: { color: COLORS.white, fontSize: 15, fontFamily: FONTS.bold },
});
