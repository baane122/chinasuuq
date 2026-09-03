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
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS, whatsappOrderLink } from "@/lib/theme";
import { formatUSD, formatCNY } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth";
import { useCartStore } from "@/store/cart";
import { getProductById, toggleFavorite, getFavorites } from "@/db";
import type { Product, ProductVariant } from "@/types";
import ImageCarousel from "@/components/product/ImageCarousel";
import QuantitySelector from "@/components/product/QuantitySelector";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export default function ProductDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
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
          setQty(Math.max(1, p.moq || 1));
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
    return product?.images && product.images.length > 0
      ? product.images
      : ["https://picsum.photos/400/400"];
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
      )}\nQuantity: ${qty}\n${qs ? `Options: ${qs}\n` : ""}MOQ: ${product.moq}`;
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

  const priceRangeLabel =
    product.price_cny_min !== product.price_cny_max
      ? `${formatUSD(product.price_cny_min / 7.25)} – ${formatUSD(
          product.price_cny_max / 7.25
        )}`
      : formatUSD(product.price_usd_estimated);

  return (
    <SafeAreaView style={styles.container}>
      {header}

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
        {/* Image Carousel */}
        <ImageCarousel images={images} />

        {/* Product Info */}
        <View style={styles.infoCard}>
          <View style={styles.priceRow}>
            <Text style={styles.productName} numberOfLines={3}>
              {product.title_english || product.title_somali}
            </Text>
            <Text style={styles.price}>
              {formatUSD(product.price_usd_estimated)}
            </Text>
          </View>

          <Text style={styles.priceCNY}>
            {product.price_cny_min !== product.price_cny_max
              ? `${formatCNY(product.price_cny_min)} – ${formatCNY(
                  product.price_cny_max
                )}`
              : formatCNY(product.price_cny_min)}
          </Text>

          <View style={styles.metaRow}>
            <View style={styles.ratingBadge}>
              <Star size={14} color={COLORS.primary} fill={COLORS.primary} />
              <Text style={styles.ratingText}>
                {product.supplier_rating
                  ? product.supplier_rating.toFixed(1)
                  : "N/A"}
              </Text>
            </View>
            <Text style={styles.metaDot}>·</Text>
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
              <Text style={styles.shippingLabel}>{t("product.shipping")}</Text>
            </View>
            <Text style={styles.shippingEstimate}>
              Estimated 7–21 days · Paid on arrival
            </Text>
          </View>
        </View>

        {/* Variants */}
        {product.variants.map((v) => (
          <View key={v.id} style={styles.variantCard}>
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

        {/* Quantity (MOQ) */}
        <QuantitySelector
          value={qty}
          onChange={setQty}
          min={Math.max(1, product.moq)} // MOQ respected
        />

        {/* Attributes */}
        {Object.keys(attributes).length > 0 && (
          <View style={styles.attrSection}>
            <Text style={styles.sectionTitle}>Details</Text>
            {Object.entries(attributes).map(([key, val]) => (
              <View key={key} style={styles.attrRow}>
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
          <View style={styles.descSection}>
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
          <MessageCircle size={18} color={COLORS.white} />
          <Text style={styles.whatsappText}>Order on WhatsApp</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
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
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  productName: {
    fontSize: 18,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    flex: 1,
    marginRight: SPACING.md,
    lineHeight: 24,
  },
  price: { fontSize: 24, fontFamily: FONTS.bold, color: COLORS.primary },
  priceCNY: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
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
  metaDot: { fontSize: 13, color: COLORS.gray300 },
  metaText: { fontSize: 13, color: COLORS.textSecondary },
  platformBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    marginTop: SPACING.md,
    backgroundColor: COLORS.gray50,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  platformText: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
    color: COLORS.textSecondary,
  },
  shippingCard: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.warmWhite,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  shippingRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  shippingLabel: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
  },
  shippingEstimate: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    marginLeft: 30,
  },
  // Variants
  variantCard: {
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    marginTop: SPACING.sm,
  },
  variantRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  variantPill: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    minHeight: 40,
    justifyContent: "center",
  },
  variantPillActive: { borderColor: COLORS.primary, backgroundColor: COLORS.softOrange },
  variantPillText: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
  },
  variantPillTextActive: { color: COLORS.primary },
  // Attributes
  attrSection: {
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    marginTop: SPACING.sm,
  },
  attrRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    gap: SPACING.md,
  },
  attrKey: { fontSize: 13, color: COLORS.textSecondary, fontFamily: FONTS.medium, flex: 0.4 },
  attrValue: { fontSize: 13, color: COLORS.black, fontFamily: FONTS.medium, flex: 0.6, textAlign: "right" },
  // Description
  descSection: {
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    marginTop: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    marginBottom: SPACING.md,
  },
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
    gap: SPACING.sm,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  addToCartBtn: {
    height: 50,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.white,
  },
  addToCartText: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.primary },
  buyNowBtn: {
    height: 50,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  buyNowText: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.white },
  whatsappBtn: {
    height: 48,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.darkSurface,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: SPACING.sm,
  },
  whatsappText: { fontSize: 15, fontFamily: FONTS.semibold, color: COLORS.white },
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
