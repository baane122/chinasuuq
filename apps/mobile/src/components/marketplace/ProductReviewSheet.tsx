// Product Review Sheet — 5-section native bottom sheet for ChinaSuuq
// Sections: 1 Product identity · 2 Variants · 3 Quantity & MOQ · 4 Costs · 5 Actions
// Uses the MOQ engine (@/lib/moq) for validation, tiers, packs and suggested quantities.
// Cost honesty: unknown charges are shown as "Pending" — never invented numbers.

import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { BottomSheet } from "@/components/BottomSheet";
import { useCartStore } from "@/store/cart";
import { useI18n } from "@/lib/i18n";
import type { Product } from "@/types";
import { getCnyPerUsd } from "@/lib/exchange";
import {
  type OrderRules,
  type MOQValidationResult,
  type PackDisplay,
  type PriceTier,
  validateMOQ,
  calculateTierPrice,
  getSuggestedQuantities,
  formatPackDisplay,
  createDefaultRules,
} from "@/lib/moq";

interface ProductReviewSheetProps {
  visible: boolean;
  product: Product | null;
  /** Optional externally-supplied rules (e.g. from supplier listing data); defaults derived from the product */
  rules?: OrderRules;
  onClose: () => void;
  onAddToCart?: (quantity: number, options: Record<string, string>) => void;
  onAskSmallerQty?: () => void;
}

/** Cost line with honesty status — pending lines NEVER render a fake number */
interface CostLine {
  label: string;
  amountCny: number | null; // null = unknown → Pending badge
  status: "known" | "estimated" | "pending" | "included";
}

export default function ProductReviewSheet({
  visible,
  product,
  rules: externalRules,
  onClose,
  onAddToCart,
  onAskSmallerQty,
}: ProductReviewSheetProps) {
  const addItem = useCartStore((s) => s.addItem);
  const { t, locale } = useI18n();

  // Central i18n keys (design-qa owned) with an inline English fallback if a key ever disappears
  const ts = (key: string, fallback: string): string => {
    const v = t(key);
    return v === key ? fallback : v;
  };

  const [qty, setQty] = useState(0); // 0 = uninitialized; initialized from rules below
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [rate, setRate] = useState(7.25);

  const rules = useMemo<OrderRules | null>(
    () => externalRules ?? (product ? createDefaultRules(product) : null),
    [externalRules, product]
  );

  useEffect(() => {
    getCnyPerUsd().then(setRate).catch(() => {});
  }, []);

  // Reset when a new product arrives
  useEffect(() => {
    if (!product) return;
    setSelectedVariantId(product.variants.length === 1 ? product.variants[0].id : null);
    setSelectedOptions({});
    setQty(0); // triggers init from rules
  }, [product?.id]);

  // Initialize / floor quantity at the MOQ once rules are known
  useEffect(() => {
    if (!rules) return;
    setQty((q) => (q < rules.productMoq ? rules.productMoq : q));
  }, [rules?.productMoq]);

  /** True when the caller supplied supplier-grade rules; false = derived defaults from a captured listing */
  const rulesProvided = externalRules != null;

  const currentVariant = useMemo(() => {
    if (!product || !selectedVariantId) return null;
    return product.variants.find((v) => v.id === selectedVariantId) ?? null;
  }, [product, selectedVariantId]);

  const basePriceCny = useMemo(() => {
    if (!product) return 0;
    return currentVariant?.price_cny ?? product.price_cny_min ?? 0;
  }, [product, currentVariant]);

  const tier = useMemo<PriceTier | null>(() => (rules ? calculateTierPrice(rules, qty) : null), [rules, qty]);

  const validation = useMemo<MOQValidationResult | null>(
    () => (rules ? validateMOQ(rules, qty, selectedVariantId ? [selectedVariantId] : undefined, locale) : null),
    [rules, qty, selectedVariantId]
  );

  const packDisplay = useMemo<PackDisplay | null>(() => (rules ? formatPackDisplay(rules, qty, locale) : null), [rules, qty]);

  const suggestedQty = useMemo<number[]>(() => (rules ? getSuggestedQuantities(rules) : []), [rules]);

  const serviceFeeRate = 0.05; // ChinaSuuq service fee, 5% of goods

  /** Section 4 cost lines. Domestic shipping is known only when the product carries a real value;
   *  international shipping needs weight/volume → pending; duties depend on destination rules → pending. */
  const costLines = useMemo((): CostLine[] => {
    if (!product) return [];
    const goods = basePriceCny * qty;
    const hasDomestic = (product.domestic_shipping_cny ?? 0) > 0;
    return [
      { label: ts("reviewSheet.goodsSubtotal", "Goods subtotal"), amountCny: goods, status: "known" },
      {
        label: ts("reviewSheet.domesticDelivery", "China domestic delivery"),
        amountCny: hasDomestic ? product.domestic_shipping_cny : null,
        status: hasDomestic ? "known" : "pending",
      },
      { label: ts("reviewSheet.serviceFee", "ChinaSuuq service fee"), amountCny: goods * serviceFeeRate, status: "known" },
      { label: ts("reviewSheet.internationalShipping", "International shipping"), amountCny: null, status: "pending" },
      { label: ts("reviewSheet.duties", "Duties & destination charges"), amountCny: null, status: "pending" },
    ];
  }, [product, basePriceCny, qty, locale]);

  /** Only charges with real numbers go into "payable now" — pending lines are excluded, never guessed */
  const amountPayableNow = useMemo(
    () => costLines.reduce((sum, l) => sum + (l.amountCny ?? 0), 0),
    [costLines]
  );

  const hasPendingCosts = costLines.some((l) => l.amountCny === null);

  if (!product || !rules) return null;

  const fmtCNY = (n: number) => "¥" + n.toFixed(2);
  const fmtUSD = (n: number) => "$" + (n / (rate || 7.25)).toFixed(2);

  const unitPriceCny = tier?.priceCny ?? basePriceCny;

  const handleAddToCart = () => {
    if (validation && !validation.valid) {
      Alert.alert(ts("moq.minimumNotMet", "Minimum order not met"), validation.message);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addItem(product, qty, selectedOptions, { exchange_rate: rate || undefined });
    onAddToCart?.(qty, selectedOptions);
  };

  const handleAskSmallerQty = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAskSmallerQty?.();
  };

  const selectVariant = (variantId: string, optionLabel: string) => {
    Haptics.selectionAsync();
    setSelectedVariantId(variantId);
    setSelectedOptions((prev) => {
      const next = { ...prev };
      if (currentVariant) {
        // clear the previous variant group’s keys
        currentVariant.options.forEach((o) => delete next[o.label]);
      }
      next[optionLabel] = variantId;
      return next;
    });
  };


  return (
    <BottomSheet visible={visible} onClose={onClose} height={680}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>

        {/* ============ Section 1: Product identity ============ */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionNumber}>1</Text>
            <Text style={styles.sectionTitle}>{ts("reviewSheet.productIdentity", "Product")}</Text>
          </View>
          <View style={styles.identityRow}>
            {product.images.length > 0 ? (
              <Image
                source={{ uri: product.images[0] }}
                style={styles.productImage}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={[styles.productImage, styles.imageFallback]}>
                <Text style={styles.imageFallbackText}>📦</Text>
              </View>
            )}
            <View style={styles.identityInfo}>
              <Text style={styles.productTitle} numberOfLines={2}>
                {product.title_english || product.title_original}
              </Text>
              <View style={styles.metaRow}>
                <View style={styles.marketplaceBadge}>
                  <Text style={styles.marketplaceText}>{product.marketplace.toUpperCase()}</Text>
                </View>
                {product.sales_count > 0 && (
                  <Text style={styles.salesText}>{product.sales_count}+ {ts("product.sales", "orders")}</Text>
                )}
              </View>
              {rulesProvided ? (
                <View style={styles.dataBadge}>
                  <Text style={styles.dataBadgeText}>
                    ✓ {ts("reviewSheet.detailsExtracted", "Details extracted")}
                  </Text>
                </View>
              ) : (
                <View style={styles.dataBadgeWarn}>
                  <Text style={styles.dataBadgeTextWarn}>
                    ⏳ {ts("reviewSheet.supplierConfirmationNeeded", "Supplier confirmation needed")}
                  </Text>
                </View>
              )}
              {product.source_url ? (
                <TouchableOpacity
                  onPress={() => Linking.openURL(product.source_url).catch(() => {})}
                  activeOpacity={0.7}
                >
                  <Text style={styles.viewOriginalText}>
                    ↗ {ts("reviewSheet.viewOriginal", "View original listing")}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>

        {/* ============ Section 2: Variants ============ */}
        {product.variants.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionNumber}>2</Text>
              <Text style={styles.sectionTitle}>{ts("reviewSheet.variants", "Options")}</Text>
            </View>
            <View style={styles.variantRow}>
              {product.variants.map((variant) => {
                const active = selectedVariantId === variant.id;
                const image = variant.options.find((o) => o.image)?.image;
                const soldOut = variant.stock <= 0;
                return (
                  <TouchableOpacity
                    key={variant.id}
                    style={[styles.variantCard, active && styles.variantCardActive, soldOut && styles.variantCardDisabled]}
                    onPress={() => !soldOut && selectVariant(variant.id, variant.options[0]?.label ?? variant.name)}
                    disabled={soldOut}
                    activeOpacity={0.7}
                  >
                    {image ? (
                      <Image source={{ uri: image }} style={styles.variantImage} contentFit="cover" transition={150} />
                    ) : (
                      <View style={[styles.variantImage, styles.variantImageFallback]}>
                        <Text style={styles.variantImageFallbackText}>🎨</Text>
                      </View>
                    )}
                    <Text style={styles.variantName} numberOfLines={1}>{variant.name}</Text>
                    {typeof variant.price_cny === "number" && variant.price_cny > 0 && (
                      <Text style={styles.variantPrice}>{fmtCNY(variant.price_cny)}</Text>
                    )}
                    <Text style={[styles.variantStock, soldOut && styles.variantStockOut]}>
                      {soldOut ? ts("reviewSheet.notAvailable", "Not available") : active ? ts("reviewSheet.selected", "Selected") : String(variant.stock)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ============ Section 3: Quantity & MOQ ============ */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionNumber}>3</Text>
            <Text style={styles.sectionTitle}>{ts("reviewSheet.quantityAndMoq", "Quantity & minimum order")}</Text>
          </View>

          {/* MOQ facts */}
          <View style={styles.moqFacts}>
            <View style={styles.moqFactRow}>
              <Text style={styles.moqFactLabel}>{ts("reviewSheet.minimumOrder", "Minimum order")}</Text>
              <Text style={styles.moqFactValue}>{rules.productMoq} {ts("moq.pieces", "pieces")}</Text>
            </View>
            {rules.packs?.[0] && (
              <View style={styles.moqFactRow}>
                <Text style={styles.moqFactLabel}>{ts("reviewSheet.packSize", "Pack size")}</Text>
                <Text style={styles.moqFactValue}>
                  {rules.packs[0].piecesPerPack} {ts("moq.pieces", "pieces")} {ts("moq.perCarton", "per carton")}
                </Text>
              </View>
            )}
            {!!rules.orderIncrement && rules.orderIncrement > 1 && (
              <View style={styles.moqFactRow}>
                <Text style={styles.moqFactLabel}>{ts("reviewSheet.orderIncrement", "Order increment")}</Text>
                <Text style={styles.moqFactValue}>×{rules.orderIncrement}</Text>
              </View>
            )}
            {rules.mixedVariant && (
              <View style={styles.moqFactRow}>
                <Text style={styles.moqFactLabel}>{ts("reviewSheet.mixedVariants", "Mixed options")}</Text>
                <Text style={styles.moqFactValue}>
                  {rules.mixedVariant.allowMix
                    ? ts("moq.totalPieces", "Total") + " ≥ " + rules.mixedVariant.totalMinQty
                    : "—"}
                </Text>
              </View>
            )}
          </View>

          {/* Stepper */}
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={[styles.stepperBtn, qty <= rules.productMoq && styles.stepperBtnDisabled]}
              onPress={() => {
                const step = rules.orderIncrement ?? 1;
                const next = Math.max(rules.productMoq, qty - step);
                if (next !== qty) { Haptics.selectionAsync(); setQty(next); }
              }}
              disabled={qty <= rules.productMoq}
            >
              <Text style={styles.stepperBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{qty}</Text>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => {
                Haptics.selectionAsync();
                setQty(qty + (rules.orderIncrement ?? 1));
              }}
            >
              <Text style={styles.stepperBtnText}>+</Text>
            </TouchableOpacity>
            <Text style={styles.stepperUnit}>{ts("moq.quantity", "Quantity")} · {ts("moq.pieces", "pieces")}</Text>
          </View>

          {/* Smart quick-buy */}
          <View style={styles.chipRow}>
            {suggestedQty.slice(0, 5).map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.chip, qty === s && styles.chipActive]}
                onPress={() => { Haptics.selectionAsync(); setQty(s); }}
              >
                <Text style={[styles.chipText, qty === s && styles.chipTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Pack math display */}
          {packDisplay && (
            <View style={styles.packBox}>
              <Text style={styles.packBoxText}>📦 {packDisplay.displayText}</Text>
            </View>
          )}

          {/* Tier price + next-tier nudge */}
          {tier && (
            <View style={styles.tierBox}>
              <Text style={styles.tierBoxText}>
                  💰 {tier.label ? tier.label + " · " : ""}{ts("moq.unitPrice", "Unit price")}: {fmtCNY(tier.priceCny)}
              </Text>
            </View>
          )}

          {/* Validation message */}
          {validation && !validation.valid && (
            <View style={styles.validationBox}>
              <Text style={styles.validationText}>⚠️ {validation.message}</Text>
              {validation.suggestedQty ? (
                <TouchableOpacity
                  style={styles.validationFixBtn}
                  onPress={() => { Haptics.selectionAsync(); setQty(validation.suggestedQty!); }}
                >
                  <Text style={styles.validationFixText}>
                    {ts("reviewSheet.minimumOrder", "Minimum order")}: {validation.suggestedQty}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        </View>

        {/* ============ Section 4: Costs ============ */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionNumber}>4</Text>
            <Text style={styles.sectionTitle}>{ts("reviewSheet.costs", "Costs")}</Text>
          </View>
          <View style={styles.costsBox}>
            {costLines.map((line) => (
              <View key={line.label} style={styles.costRow}>
                <Text style={styles.costLabel}>{line.label}</Text>
                {line.amountCny !== null ? (
                  <Text style={[styles.costValue, line.status === "estimated" && styles.costValueEstimated]}>
                    {line.status === "estimated" ? "~" : ""}{fmtCNY(line.amountCny)}
                  </Text>
                ) : (
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>⏳ {ts("reviewSheet.pending", "Pending")}</Text>
                  </View>
                )}
              </View>
            ))}

            <View style={styles.costDivider} />

            <View style={styles.costTotalRow}>
              <Text style={styles.costTotalLabel}>{ts("reviewSheet.amountPayableNow", "Amount payable now")}</Text>
              <View style={styles.costTotalValues}>
                <Text style={styles.costTotalCny}>{fmtCNY(amountPayableNow)}</Text>
                <Text style={styles.costTotalUsd}>≈ {fmtUSD(amountPayableNow)}</Text>
              </View>
            </View>

            {hasPendingCosts && (
              <View style={styles.pendingNoteBox}>
                <Text style={styles.pendingNoteText}>
                  ⏳ {ts("reviewSheet.remainingToConfirm", "Remaining amount to be confirmed")} — {ts("reviewSheet.shippingPendingNote", "Shipping will be quoted after weight and packing details are confirmed.")}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ============ Section 5: Actions ============ */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionNumber}>5</Text>
            <Text style={styles.sectionTitle}>{ts("common.confirm", "Confirm")}</Text>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, validation && !validation.valid && styles.primaryBtnDisabled]}
            onPress={handleAddToCart}
            disabled={!validation || !validation.valid}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryBtnText}>
              {ts("product.addToCart", "Add to Cart")} · {qty} {ts("moq.pieces", "pieces")}
            </Text>
            <Text style={styles.primaryBtnSub}>{fmtCNY(amountPayableNow)} · {fmtUSD(amountPayableNow)}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={handleAskSmallerQty} activeOpacity={0.7}>
            <Text style={styles.secondaryBtnText}>💬 {ts("reviewSheet.askSmallerQuantity", "Ask about a smaller quantity")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: SPACING.xxl },

  // ---- section chrome ----
  section: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sectionNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    color: COLORS.white,
    fontSize: 12,
    fontFamily: FONTS.bold,
    textAlign: "center",
    textAlignVertical: "center",
    lineHeight: 22,
  },
  sectionTitle: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.black, flex: 1 },

  // ---- section 1: identity ----
  identityRow: { flexDirection: "row", gap: SPACING.md },
  productImage: { width: 88, height: 88, borderRadius: RADIUS.md, backgroundColor: COLORS.gray100 },
  imageFallback: { alignItems: "center", justifyContent: "center" },
  imageFallbackText: { fontSize: 30 },
  identityInfo: { flex: 1, justifyContent: "center", gap: 4 },
  productTitle: { fontSize: 15, fontFamily: FONTS.semibold, color: COLORS.black, lineHeight: 20 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  marketplaceBadge: {
    backgroundColor: COLORS.softOrange,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  marketplaceText: { fontSize: 10, fontFamily: FONTS.bold, color: COLORS.primary },
  salesText: { fontSize: 11, fontFamily: FONTS.medium, color: COLORS.textMuted },
  dataBadge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.successBg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  dataBadgeText: { fontSize: 10, fontFamily: FONTS.semibold, color: COLORS.success },
  dataBadgeWarn: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.warningBg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  dataBadgeTextWarn: { fontSize: 10, fontFamily: FONTS.semibold, color: COLORS.warning },
  viewOriginalText: {
    fontSize: 11,
    fontFamily: FONTS.medium,
    color: COLORS.info,
    textDecorationLine: "underline",
  },

  // ---- section 2: variants ----
  variantRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  variantCard: {
    width: 84,
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: "center",
  },
  variantCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg },
  variantCardDisabled: { opacity: 0.5 },
  variantImage: { width: 44, height: 44, borderRadius: RADIUS.sm, marginBottom: 4, backgroundColor: COLORS.gray100 },
  variantImageFallback: { alignItems: "center", justifyContent: "center" },
  variantImageFallbackText: { fontSize: 20 },
  variantName: { fontSize: 11, fontFamily: FONTS.medium, color: COLORS.black, maxWidth: "100%" },
  variantPrice: { fontSize: 10, fontFamily: FONTS.semibold, color: COLORS.primary },
  variantStock: { fontSize: 9, fontFamily: FONTS.medium, color: COLORS.textSecondary },
  variantStockOut: { color: COLORS.error },

  // ---- section 3: quantity & MOQ ----
  moqFacts: { backgroundColor: COLORS.gray50, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  moqFactRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  moqFactLabel: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.textSecondary },
  moqFactValue: { fontSize: 12, fontFamily: FONTS.semibold, color: COLORS.black },
  stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.lg, marginBottom: SPACING.md },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.white,
  },
  stepperBtnDisabled: { opacity: 0.4, backgroundColor: COLORS.gray100 },
  stepperBtnText: { fontSize: 22, fontFamily: FONTS.bold, color: COLORS.black },
  stepperValue: { fontSize: 26, fontFamily: FONTS.bold, color: COLORS.black, minWidth: 64, textAlign: "center" },
  stepperUnit: { fontSize: 11, fontFamily: FONTS.medium, color: COLORS.textMuted },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginBottom: SPACING.md },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.gray100,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    minHeight: 36,
    justifyContent: "center",
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, fontFamily: FONTS.semibold, color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.white },
  packBox: { backgroundColor: COLORS.infoBg, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  packBoxText: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.info },
  tierBox: { backgroundColor: COLORS.successBg, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  tierBoxText: { fontSize: 12, fontFamily: FONTS.semibold, color: COLORS.success },
  validationBox: {
    backgroundColor: COLORS.errorBg,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  validationText: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.error, flex: 1 },
  validationFixBtn: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  validationFixText: { fontSize: 12, fontFamily: FONTS.semibold, color: COLORS.error },

  // ---- section 4: costs ----
  costsBox: { backgroundColor: COLORS.gray50, borderRadius: RADIUS.md, padding: SPACING.md },
  costRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  costLabel: { fontSize: 13, fontFamily: FONTS.medium, color: COLORS.textSecondary, flex: 1 },
  costValue: { fontSize: 13, fontFamily: FONTS.semibold, color: COLORS.black },
  costValueEstimated: { color: COLORS.info },
  pendingBadge: {
    backgroundColor: COLORS.warningBg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
  },
  pendingBadgeText: { fontSize: 11, fontFamily: FONTS.semibold, color: COLORS.warning },
  costDivider: { height: 1, backgroundColor: COLORS.gray200, marginVertical: SPACING.sm },
  costTotalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  costTotalLabel: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.black, flex: 1 },
  costTotalValues: { alignItems: "flex-end" },
  costTotalCny: { fontSize: 20, fontFamily: FONTS.bold, color: COLORS.primary },
  costTotalUsd: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.textMuted, marginTop: 2 },
  pendingNoteBox: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.warningBg,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
  },
  pendingNoteText: { fontSize: 11, fontFamily: FONTS.medium, color: COLORS.warning, lineHeight: 16 },

  // ---- section 5: actions ----
  primaryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    paddingHorizontal: SPACING.xl,
    alignItems: "center",
    minHeight: 52,
    justifyContent: "center",
  },
  primaryBtnDisabled: { backgroundColor: COLORS.gray300 },
  primaryBtnText: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.white },
  primaryBtnSub: { fontSize: 12, fontFamily: FONTS.medium, color: "rgba(255,255,255,0.85)", marginTop: 2 },
  secondaryBtn: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingVertical: 14,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { fontSize: 14, fontFamily: FONTS.semibold, color: COLORS.textSecondary },
});
