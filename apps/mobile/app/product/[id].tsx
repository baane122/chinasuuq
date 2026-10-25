import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Star,
  Truck,
  MessageCircle,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Heart,
  RefreshCw,
  SearchX,
  WifiOff,
} from "lucide-react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS, whatsappOrderLink } from "@/lib/theme";
import { formatUSD, formatCNY } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useFx } from "@/lib/exchange";
import { useAuthStore } from "@/store/auth";
import { useCartStore } from "@/store/cart";
import { getProductById, toggleFavorite, isFavorite as isFavoriteOnServer } from "@/db";
import type { Product } from "@/types";
import { moqOrderRules, describeMoq } from "@/lib/moqIngest";
import type { ResolvedMoq } from "@/lib/moqIngest";
import { getSuggestedQuantities } from "@/lib/moq";
import { recordProductEvent } from "@/api/productEvents";
import AiTranslateCard from "@/components/product/AiTranslateCard";
import ImageCarousel from "@/components/product/ImageCarousel";
import VariantSelector from "@/components/product/VariantSelector";
import QuantitySelector from "@/components/product/QuantitySelector";
import PriceTable from "@/components/product/PriceTable";
import ProductSkeleton from "@/components/product/ProductSkeleton";
import ScreenReveal from "@/components/product/ScreenReveal";
import { useProductVariants } from "@/components/product/useProductVariants";
import { RouteErrorBoundary } from "@/components/ui/ErrorBoundary";

/** The sticky CTA bar is absolutely positioned; content must clear its height. */
const BAR_BASE_HEIGHT = 50 + SPACING.lg * 2;

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
    if (k.startsWith("_")) continue; // staff metadata, never a customer spec
    if (v) lines.push(`${k}: ${v}`);
  }
  if (p.description_original) lines.push(p.description_original);
  if (p.description_english) lines.push(p.description_english);
  return lines.join("\n").slice(0, 4000);
}

/** Who stood behind the MOQ number, in the customer's language. */
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

/**
 * Attributes are rendered to customers as product specs. The website team now
 * stores internal staff metadata in the same object under `_`-prefixed keys
 * (e.g. `_curation`), so every render site filters them out. A tiny local helper
 * rather than a db change, because the shared layer is owned elsewhere.
 */
function customerAttributes(attrs: Record<string, string> | undefined): Array<[string, string]> {
  return Object.entries(attrs ?? {}).filter(([k]) => !k.startsWith("_"));
}

/**
 * Somali is a first-class language here, not an afterthought. When the app is in
 * Somali, show the Somali title/description first; otherwise English first. The
 * scraped original is the last resort so a curated row is never blank.
 */
function displayTitle(p: Product, locale: "en" | "so"): string {
  if (locale === "so") return p.title_somali || p.title_english || p.title_original;
  return p.title_english || p.title_somali || p.title_original;
}
function displayDescription(p: Product, locale: "en" | "so"): string {
  if (locale === "so") return p.description_somali || p.description_english || p.description_original || "";
  return p.description_english || p.description_somali || p.description_original || "";
}

/**
 * The product screen is where a customer lands from a shared link with a row
 * that may be half-populated (no images, no title, a MOQ the importer never
 * read), and it had no boundary: the throw escaped to the root fallback and
 * took the tab bar with it. Wrapping the component rather than one return also
 * covers the not-found, loading and error renders.
 */
export default function ProductDetailScreen() {
  return (
    <RouteErrorBoundary>
      <ProductDetailScreenContent />
    </RouteErrorBoundary>
  );
}

function ProductDetailScreenContent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useI18n();
  const addItem = useCartStore((s) => s.addItem);
  const user = useAuthStore((s) => s.user);
  const fx = useFx();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [togglingFav, setTogglingFav] = useState(false);

  const [qty, setQty] = useState(1);
  const [variantSelections, setVariantSelections] = useState<Record<string, string>>({});
  const [descExpanded, setDescExpanded] = useState(false);

  const [reloadToken, setReloadToken] = useState(0);

  // Load real product from the resilient data layer. A null result is "not
  // found"; only an unexpected throw is an error — the two states read
  // differently so a network failure never masquerades as an empty catalog.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotFound(false);
    setError(false);
    getProductById(id ?? "")
      .then((p) => {
        if (!active) return;
        if (p) setProduct(p);
        else setNotFound(true);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, reloadToken]);

  const retry = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReloadToken((n) => n + 1);
  }, []);

  /** MOQ floor, price ladder, carton size — resolved once, from stored provenance. */
  const order = useMemo(
    () => (product ? moqOrderRules(product, moqEvidence(product)) : null),
    [product]
  );
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

  // Variant dimensions: inline catalog variants (if any) plus a screen-local
  // read of source_product_variants for real colour/size swatches.
  const variantGroups = useProductVariants(product?.id, product?.variants);

  // Auto-select the first option of every dimension once, so the cart line and
  // WhatsApp message are never left with an empty choice.
  useEffect(() => {
    if (variantGroups.length === 0) return;
    setVariantSelections((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const g of variantGroups) {
        if (!next[g.name] && g.options.length > 0) {
          next[g.name] = g.options[0].label;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [variantGroups]);

  // Check if this product is in the user's wishlist.
  useEffect(() => {
    (async () => {
      if (!user?.id || !id) {
        setIsFavorite(false);
        return;
      }
      try {
        setIsFavorite(await isFavoriteOnServer(user.id, id));
      } catch (e) {
        console.warn("[product] favorite state read failed", e);
      }
    })();
  }, [id, user?.id]);

  // Engagement telemetry: one `view` when the product really opened. The server
  // throttles a repeat inside 60s, and recordProductEvent catches its own
  // failures, so this is fire-and-forget and never blocks or awaits the UI.
  useEffect(() => {
    if (!product) return;
    void recordProductEvent({
      productId: product.id,
      eventType: "view",
      marketplaceKey: product.marketplace,
    });
  }, [product?.id, product]);

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

  const images = useMemo(() => product?.images ?? [], [product]);

  // The yuan figure is the fact; derive USD from CNY at the live rate and keep
  // the stored snapshot only for CNY-less rows — matching ProductCard and the
  // cart so every surface agrees with the admin's one rate.
  const rate = Math.min(Math.max(Number(fx.cnyPerUsd) || 7, 2), 20);
  const usdPrice = useMemo(() => {
    if (!product) return 0;
    const cny = Number(product.price_cny_min) || 0;
    return cny > 0 ? cny / rate : Number(product.price_usd_estimated) || 0;
  }, [product, rate]);

  const attributes = useMemo(() => customerAttributes(product?.attributes), [product]);

  const handleAddToCart = useCallback(() => {
    if (!product) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addItem(product, qty, variantSelections);
    void recordProductEvent({
      productId: product.id,
      eventType: "add_to_cart",
      marketplaceKey: product.marketplace,
    });
    const title = displayTitle(product, locale);
    Alert.alert(
      locale === "so" ? "Waa lagu daray" : "Added to Cart",
      `${title} (×${qty})`,
      [
        { text: locale === "so" ? "Sii wad" : "Continue Shopping", style: "cancel" },
        { text: locale === "so" ? "Eeg Karada" : "View Cart", onPress: () => router.push("/cart") },
      ]
    );
  }, [product, qty, variantSelections, addItem, locale, router]);

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
      const msg = `${displayTitle(product, locale)}\n\nEst. price: ${formatUSD(usdPrice)} · ${
        product.price_cny_min > 0 ? formatCNY(product.price_cny_min) : ""
      }\nQuantity: ${qty}\n${qs ? `Options: ${qs}\n` : ""}${
        resolution ? describeMoq(resolution, locale) : `MOQ: ${product.moq}`
      }${resolution?.raw ? ` (${resolution.raw})` : ""}`;
      const url = whatsappOrderLink(msg);
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert(
          locale === "so" ? "WhatsApp ma jiro" : "WhatsApp not available",
          locale === "so" ? "Soo rakib WhatsApp." : "Please install WhatsApp to use this feature."
        );
      }
    } catch {
      Alert.alert("Error", "Unable to open WhatsApp.");
    }
  };

  // Header is shared across every state so the back button always works.
  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.headerBtn}
        onPress={() => router.back()}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={locale === "so" ? "Dib u noqo" : "Go back"}
      >
        <ArrowLeft size={22} color={COLORS.black} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {locale === "so" ? "Faahfaahinta Alaabta" : "Product Detail"}
      </Text>
      <TouchableOpacity
        style={styles.headerBtn}
        onPress={handleToggleFavorite}
        activeOpacity={0.7}
        disabled={togglingFav || loading}
        accessibilityRole="button"
        accessibilityLabel={isFavorite ? "Saved" : "Save to wishlist"}
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
      <SafeAreaView style={styles.container} edges={["top"]}>
        {header}
        <ProductSkeleton />
      </SafeAreaView>
    );
  }

  // Genuine failure: read as failure, with a way to try again.
  if (error && !product) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        {header}
        <View style={styles.stateWrap}>
          <View style={styles.stateIcon}>
            <WifiOff size={30} color={COLORS.warning} />
          </View>
          <Text style={styles.stateTitle}>
            {locale === "so" ? "Alaabta lama soo dejin karin" : "Couldn't load this product"}
          </Text>
          <Text style={styles.stateSubtitle}>
            {locale === "so"
              ? "Xiriirka internetka ayaa u muuqda mid go'an. Isku day mar kale."
              : "The connection dropped before the item arrived. Try again."}
          </Text>
          <TouchableOpacity style={styles.statePrimaryBtn} onPress={retry} activeOpacity={0.8}>
            <RefreshCw size={16} color={COLORS.white} />
            <Text style={styles.statePrimaryText}>{locale === "so" ? "Isku day mar kale" : "Try again"}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Distinct "not found": the row genuinely isn't there — empty, not broken.
  if (notFound || !product) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        {header}
        <View style={styles.stateWrap}>
          <View style={styles.stateIcon}>
            <SearchX size={30} color={COLORS.gray400} />
          </View>
          <Text style={styles.stateTitle}>
            {locale === "so" ? "Alaabta lama helin" : "Product not found"}
          </Text>
          <Text style={styles.stateSubtitle}>
            {locale === "so"
              ? "Alaabtan waa laga yaabaa in la saaray ama aanan diyaar ahayn."
              : "This item may have been removed or isn't available yet."}
          </Text>
          <TouchableOpacity style={styles.stateSecondaryBtn} onPress={retry} activeOpacity={0.8}>
            <RefreshCw size={15} color={COLORS.primary} />
            <Text style={styles.stateSecondaryText}>{locale === "so" ? "Dib u eeg" : "Check again"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.stateLink}
            onPress={() => router.push("/search")}
            activeOpacity={0.7}
          >
            <Text style={styles.stateLinkText}>
              {locale === "so" ? "Raadi alaab kale" : "Browse other products"}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Stock status in the customer's language; out-of-stock still explains that a
  // ChinaSuuq order can be placed against a restock, rather than dead-ending.
  const stockInfo =
    product.stock_status === "in_stock"
      ? { color: COLORS.success, label: locale === "so" ? "Diyaar" : "In stock" }
      : product.stock_status === "out_of_stock"
        ? { color: COLORS.warning, label: locale === "so" ? "Ka maqan — dalab la geli karo" : "Out of stock — orderable" }
        : { color: COLORS.warning, label: locale === "so" ? "Yar" : "Low stock" };

  const salesLabel = product.sales_count
    ? locale === "so"
      ? `${product.sales_count.toLocaleString()} ka iibmay ${product.marketplace}`
      : `${product.sales_count.toLocaleString()} sold on ${product.marketplace}`
    : locale === "so"
      ? `Cusub ${product.marketplace}`
      : `New on ${product.marketplace}`;

  const cnyRange =
    product.price_cny_min !== product.price_cny_max
      ? `${formatCNY(product.price_cny_min)} – ${formatCNY(product.price_cny_max)}`
      : formatCNY(product.price_cny_min);

  const description = displayDescription(product, locale);

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {header}

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: BAR_BASE_HEIGHT + insets.bottom + SPACING.xl }]}
      >
        <ScreenReveal>
          {images.length > 0 || product.video ? (
            <ImageCarousel images={images} videoUrl={product.video ?? null} />
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
        </ScreenReveal>

        {/* Price card */}
        <ScreenReveal delay={60}>
          <View style={styles.infoCard}>
            <Text style={styles.productName} numberOfLines={3}>
              {displayTitle(product, locale)}
            </Text>

            <View style={styles.priceRow}>
              <View style={styles.priceBlock}>
                <View style={styles.usdLine}>
                  <Text style={styles.price}>≈ {formatUSD(usdPrice)}</Text>
                  <Text style={styles.estTag}>{locale === "so" ? "qiyaas" : "est."}</Text>
                </View>
                <Text style={styles.priceCNY}>
                  {product.price_cny_min > 0 ? cnyRange : "—"}
                </Text>
              </View>
              <View style={styles.stockWrap}>
                <View style={[styles.stockDot, { backgroundColor: stockInfo.color }]} />
                <Text style={[styles.stockText, { color: stockInfo.color }]}>
                  {stockInfo.label}
                </Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              <View style={styles.ratingBadge}>
                <Star size={14} color={COLORS.primary} fill={COLORS.primary} />
                <Text style={styles.ratingText}>
                  {product.supplier_rating ? product.supplier_rating.toFixed(1) : "—"}
                </Text>
              </View>
              {/* Sales is marketplace provenance ("sold on 1688"), not local popularity. */}
              <Text style={styles.metaText}>{salesLabel}</Text>
            </View>

            <View style={styles.platformBadge}>
              <ShieldCheck size={14} color={COLORS.primary} />
              <Text style={styles.platformText}>
                {t("product.platform")}: {product.marketplace}
              </Text>
            </View>

            <View style={styles.shippingCard}>
              <View style={styles.shippingRow}>
                <Truck size={18} color={COLORS.primary} />
                <View style={styles.shippingBody}>
                  <Text style={styles.shippingLabel}>{t("product.shipping")}</Text>
                  <Text style={styles.shippingEstimate}>
                    {locale === "so" ? "Qiyaas 7–21 maalmood · Bixi markuu yimaado" : "Estimated 7–21 days · Pay on arrival"}
                  </Text>
                </View>
              </View>
              <View style={styles.shippingProtectRow}>
                <ShieldCheck size={18} color={COLORS.primary} />
                <Text style={styles.shippingProtect}>
                  {locale === "so" ? "Ilaalinta iibsadaha · MOQ la xaqiijiyay" : "Buyer protection · MOQ verified"}
                </Text>
              </View>
            </View>
          </View>
        </ScreenReveal>

        {/* Variants — real image swatches when the marketplace carries them. */}
        {variantGroups.length > 0 && (
          <ScreenReveal delay={100}>
            <VariantSelector
              groups={variantGroups}
              selections={variantSelections}
              heading={t("product.variants")}
              onSelect={(groupName, optionLabel) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setVariantSelections((prev) => ({ ...prev, [groupName]: optionLabel }));
              }}
            />
          </ScreenReveal>
        )}

        {/* Quantity + MOQ + one honest price table */}
        <ScreenReveal delay={140}>
          <View style={styles.sectionCard}>
            <View style={styles.qtyHeader}>
              <Text style={styles.sectionTitle}>{t("product.quantity")}</Text>
              {resolution && <Text style={styles.moqBadge}>{describeMoq(resolution, locale)}</Text>}
            </View>

            {resolution && (
              <Text style={styles.moqNote}>
                {moqSourceLine(resolution, locale)}
                {resolution.raw ? ` — “${resolution.raw}”` : ""}
              </Text>
            )}

            <PriceTable
              tiers={rules?.tiers ?? []}
              fallbackUnitCny={product.price_cny_min}
              qty={qty}
              cnyPerUsd={fx.cnyPerUsd}
              locale={locale}
            />

            <Text style={styles.qtyQuickLabel}>{locale === "so" ? "Xulasho degdeg ah" : "Quick quantities"}</Text>
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
                  <Text style={[styles.qtyQuickText, qty === q && styles.qtyQuickTextActive]}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {structure?.packSize ? (
              <Text style={styles.packNote}>
                {locale === "so" ? `Sanduq kasta ${structure.packSize} xabbadood` : `Sold in cartons of ${structure.packSize} pieces`}
              </Text>
            ) : null}

            <QuantitySelector
              value={qty}
              onChange={setQty}
              min={Math.max(1, resolution?.displayMoq ?? 1)}
              max={qtyMax}
            />
          </View>
        </ScreenReveal>

        {/* Attributes (internal `_`-prefixed staff keys filtered out) */}
        {attributes.length > 0 && (
          <ScreenReveal delay={160}>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{locale === "so" ? "Faahfaahin dheeraad ah" : "Details"}</Text>
              {attributes.map(([key, val], i) => (
                <View
                  key={key}
                  style={[styles.attrRow, i === attributes.length - 1 && styles.attrRowLast]}
                >
                  <Text style={styles.attrKey}>{key}</Text>
                  <Text style={styles.attrValue} numberOfLines={3}>
                    {val}
                  </Text>
                </View>
              ))}
            </View>
          </ScreenReveal>
        )}

        {/* Description */}
        {description ? (
          <ScreenReveal delay={180}>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{t("product.description")}</Text>
              <Text style={styles.descText} numberOfLines={descExpanded ? undefined : 4}>
                {description}
              </Text>
              {description.length > 180 && (
                <TouchableOpacity
                  onPress={() => setDescExpanded(!descExpanded)}
                  activeOpacity={0.7}
                  style={styles.expandBtn}
                >
                  <Text style={styles.expandText}>
                    {descExpanded
                      ? locale === "so"
                        ? "Yaree"
                        : "Show Less"
                      : locale === "so"
                        ? "Akhri wax dheeraad ah"
                        : "Read More"}
                  </Text>
                  {descExpanded ? (
                    <ChevronUp size={16} color={COLORS.primary} />
                  ) : (
                    <ChevronDown size={16} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              )}
            </View>
          </ScreenReveal>
        ) : null}

        <AiTranslateCard
          productId={id}
          title={product.title_original || product.title_english}
          description={product.description_original}
        />
      </ScrollView>

      {/* Sticky bottom bar — safe-area aware, sits above the home indicator. */}
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: insets.bottom + SPACING.lg },
        ]}
      >
        <TouchableOpacity style={styles.buyNowBtn} onPress={handleBuyNow} activeOpacity={0.8}>
          <Text style={styles.buyNowText}>{t("product.buyNow")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.addToCartBtn} onPress={handleAddToCart} activeOpacity={0.8}>
          <Text style={styles.addToCartText}>{t("product.addToCart")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.whatsappBtn}
          onPress={handleWhatsAppOrder}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Order on WhatsApp"
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
  headerTitle: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.black, flexShrink: 1, marginHorizontal: SPACING.sm },
  scroll: { flex: 1 },
  scrollContent: {},
  infoCard: { padding: SPACING.lg, backgroundColor: COLORS.white, marginTop: SPACING.sm },
  productName: { fontSize: 18, fontFamily: FONTS.bold, color: COLORS.black, lineHeight: 25 },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: SPACING.md,
  },
  priceBlock: { flexDirection: "column", flexShrink: 1 },
  usdLine: { flexDirection: "row", alignItems: "baseline", gap: SPACING.xs },
  price: { fontSize: 26, fontFamily: FONTS.bold, color: COLORS.primary },
  estTag: { fontSize: 11, fontFamily: FONTS.medium, color: COLORS.textMuted },
  priceCNY: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  stockWrap: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 3 },
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
  metaText: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.textSecondary, flexShrink: 1 },
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
  platformText: { fontSize: 12, fontFamily: FONTS.semibold, color: COLORS.textSecondary },
  shippingCard: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.softOrange,
    borderRadius: RADIUS.md,
  },
  shippingRow: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm },
  shippingBody: { flex: 1 },
  shippingLabel: { fontSize: 14, fontFamily: FONTS.semibold, color: COLORS.black },
  shippingEstimate: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  shippingProtectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  shippingProtect: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.textSecondary, flex: 1 },
  sectionCard: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
  },
  sectionTitle: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.black, marginBottom: SPACING.md },
  qtyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  moqBadge: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
    color: COLORS.primary,
    backgroundColor: COLORS.primaryBg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    flexShrink: 1,
    textAlign: "right",
  },
  moqNote: {
    fontSize: 11,
    fontFamily: FONTS.medium,
    color: COLORS.textSecondary,
    marginTop: -SPACING.sm,
    marginBottom: SPACING.md,
  },
  qtyQuickLabel: { fontSize: 12, fontFamily: FONTS.semibold, color: COLORS.textSecondary, marginBottom: SPACING.sm },
  qtyQuickRow: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.md, flexWrap: "wrap" },
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
  qtyQuickBtnActive: { backgroundColor: COLORS.softOrange, borderColor: COLORS.primary },
  qtyQuickText: { fontSize: 14, fontFamily: FONTS.semibold, color: COLORS.black },
  qtyQuickTextActive: { color: COLORS.primaryDark },
  packNote: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.info, marginBottom: SPACING.md },
  attrRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    gap: SPACING.md,
  },
  attrRowLast: { borderBottomWidth: 0 },
  attrKey: { fontSize: 12, color: COLORS.textMuted, fontFamily: FONTS.medium, width: 120 },
  attrValue: { fontSize: 13, color: COLORS.black, fontFamily: FONTS.medium, flex: 1 },
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
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
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
    flex: 1.2,
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
  // Loading / error / empty states
  stateWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: SPACING.xxl,
  },
  stateIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.lg,
  },
  stateTitle: { fontSize: 18, fontFamily: FONTS.bold, color: COLORS.black, marginBottom: SPACING.sm, textAlign: "center" },
  stateSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: SPACING.xl,
    lineHeight: 20,
  },
  statePrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
  },
  statePrimaryText: { color: COLORS.white, fontSize: 15, fontFamily: FONTS.bold },
  stateSecondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  stateSecondaryText: { color: COLORS.primary, fontSize: 14, fontFamily: FONTS.semibold },
  stateLink: { padding: SPACING.md, minHeight: 44, justifyContent: "center" },
  stateLinkText: { color: COLORS.textSecondary, fontSize: 14, fontFamily: FONTS.medium, textDecorationLine: "underline" },
});
