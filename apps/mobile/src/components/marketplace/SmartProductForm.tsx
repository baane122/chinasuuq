// SmartProductForm — capture + MOQ-aware review flow for ChinaSuuq
// Now integrated with the MOQ engine and the 5-section ProductReviewSheet

import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Linking,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { BottomSheet } from "@/components/BottomSheet";
import { useCartStore } from "@/store/cart";
import type { Marketplace, Product } from "@/types";
import { getCnyPerUsd } from "@/lib/exchange";
import { saveSourcingCapture } from "@/db";
import { whatsappOrderLink } from "@/lib/utils";
import {
  type OrderRules,
  validateMOQ,
  calculateTierPrice,
  getSuggestedQuantities,
  createDefaultRules,
} from "@/lib/moq";
import ProductReviewSheet from "./ProductReviewSheet";

export interface CapturedListing {
  title: string;
  price: number; // CNY
  image: string;
  url: string;
  brand: string;
  platform: string; // marketplace id
  sourceId: string;
}

interface SmartProductFormProps {
  visible: boolean;
  listing: CapturedListing | null;
  onClose: () => void;
}

// Common specs a customer may pick per category — freeform so any market item works
const COMMON_SPECS = ["Color", "Size", "Model", "Material", "Length", "Weight"];

export default function SmartProductForm({ visible, listing, onClose }: SmartProductFormProps) {
  const addItem = useCartStore((s) => s.addItem);

  const [qty, setQty] = useState(1);
  const [specs, setSpecs] = useState<Record<string, string>>({});
  const [activeSpec, setActiveSpec] = useState("Color");
  const [priceCny, setPriceCny] = useState(0);
  const [usd, setUsd] = useState(0);
  const [rate, setRate] = useState(7.25);
  const [estKg, setEstKg] = useState("");
  const [estCbm, setEstCbm] = useState("");
  const [showReviewSheet, setShowReviewSheet] = useState(false);

  // Build a stable Product object from the listing (memoized for the review sheet)
  const product = useMemo<Product | null>(() => {
    if (!listing) return null;
    return {
      id: "web-" + (listing.sourceId || "capture"),
      marketplace: (listing.platform as Marketplace) || "1688",
      source_product_id: listing.sourceId || listing.url,
      source_url: listing.url,
      title_original: listing.title,
      title_english: listing.title,
      title_somali: listing.title,
      images: listing.image ? [listing.image] : [],
      category: "",
      attributes: specs,
      variants: [],
      moq: 1,
      price_cny_min: priceCny,
      price_cny_max: priceCny,
      price_usd_estimated: usd,
      domestic_shipping_cny: 0,
      stock_status: "in_stock",
      supplier_rating: 0,
      sales_count: 0,
      last_synced_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
  }, [listing, specs, priceCny, usd]);

  // MOQ rules derived from the product
  const moqRules = useMemo<OrderRules>(() => {
    if (!product) return { productMoq: 1, tiers: [] };
    return createDefaultRules(product);
  }, [product]);

  // MOQ validation
  const validation = useMemo(() => validateMOQ(moqRules, qty), [moqRules, qty]);

  // Current tier
  const tier = useMemo(() => calculateTierPrice(moqRules, qty), [moqRules, qty]);

  // Suggested quick-buy quantities
  const suggested = useMemo(() => getSuggestedQuantities(moqRules), [moqRules]);

  useEffect(() => {
    if (!listing) return;
    setQty(1);
    setSpecs({});
    setEstKg("");
    setEstCbm("");
    const p = Number(listing.price) || 0;
    setPriceCny(p);
    getCnyPerUsd().then((r) => {
      setRate(r);
      setUsd(p / r);
    });
  }, [listing]);

  if (!listing) return null;

  const handleAdd = () => {
    if (!validation.valid) {
      Alert.alert("Quantity Issue", validation.message);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Feed the admin sourcing mission-control (local-first, syncs to sourcing_requests when online)
    void saveSourcingCapture({
      id: "src-" + Date.now(),
      marketplace: listing.platform || "1688",
      product_url: listing.url,
      product_description: listing.title,
      quantity: qty,
      destination_city: "",
      price_cny: priceCny,
      price_usd: usd,
      images: listing.image ? [listing.image] : [],
      selected_options: specs,
      status: "pending",
      created_at: new Date().toISOString(),
      synced: false,
    });
    if (product) {
      addItem(product, qty, specs, {
        estimated_kg: parseFloat(estKg) || undefined,
        estimated_cbm: parseFloat(estCbm) || undefined,
        exchange_rate: rate || undefined,
      });
    }
    Alert.alert(
      "Added to ChinaSuuq Cart",
      listing.title.slice(0, 60) + " (x" + qty + ")\n\nFully translated & converted — continue in your cart.",
      [{ text: "Noted" }],
    );
    onClose();
  };

  const handleReview = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowReviewSheet(true);
  };

  const handleAskSmallerQty = () => {
    const link = whatsappOrderLink(
      "Hello ChinaSuuq! I would like to order a smaller quantity of: " + listing.title + " | " + listing.url
    );
    if (link) void Linking.openURL(link);
  };

  return (
    <>
      <BottomSheet visible={visible && !showReviewSheet} onClose={onClose} height={460}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Captured preview */}
          <View style={styles.previewRow}>
            {listing.image ? (
              <Image source={{ uri: listing.image }} style={styles.thumb} contentFit="cover" transition={120} cachePolicy="memory-disk" />
            ) : null}
            <View style={styles.previewInfo}>
              <Text style={styles.previewTitle} numberOfLines={2}>{listing.title}</Text>
              <Text style={styles.priceLine}>
                <Text style={styles.priceCny}>¥{priceCny.toFixed(2)}</Text>
                <Text style={styles.priceSep}>  ·  </Text>
                <Text style={styles.priceUsd}>${usd.toFixed(2)} USD</Text>
                <Text style={styles.rateHint}>  @ 1:{rate.toFixed(2)}</Text>
              </Text>
              <Text style={styles.sourceTag}>{listing.platform.toUpperCase()}</Text>
            </View>
            <View style={styles.priceEditWrap}>
              <Text style={styles.priceEditLabel}>Price (CNY)</Text>
              <View style={styles.priceEditRow}>
                <Text style={styles.priceEditPrefix}>¥</Text>
                <TextInput
                  style={styles.priceEditInput}
                  value={priceCny ? String(priceCny) : ""}
                  onChangeText={(t) => {
                    const v = parseFloat(t.replace(/[^\\d.]/g, "")) || 0;
                    setPriceCny(v);
                    setUsd(v > 0 ? v / rate : 0);
                  }}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={COLORS.gray400}
                />
              </View>
              <Text style={styles.priceEditHint}>
                {priceCny > 0 ? "≈ $" + (priceCny / rate).toFixed(2) + " USD" : "Enter price if auto-detect missed it"}
              </Text>
            </View>
          </View>

          {/* Quantity with MOQ awareness */}
          <View style={styles.block}>
            <Text style={styles.blockLabel}>
              Quantity{"  "}
              <Text style={styles.moqHint}>(MOQ: {moqRules.productMoq} pcs)</Text>
            </Text>
            <View style={styles.qtyWrap}>
              <TouchableOpacity
                style={[styles.qtyBtn, qty <= moqRules.productMoq && styles.disabled]}
                onPress={() => qty > moqRules.productMoq && (Haptics.selectionAsync(), setQty(qty - 1))}
                disabled={qty <= moqRules.productMoq}
              >
                <Text style={styles.qtyBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.qtyValue}>{qty}</Text>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => (Haptics.selectionAsync(), setQty(qty + 1))}>
                <Text style={styles.qtyBtnText}>+</Text>
              </TouchableOpacity>
              <View style={styles.qtyQuick}>
                {suggested.slice(0, 4).map((s) => (
                  <TouchableOpacity key={s} style={[styles.qtyChip, qty === s && styles.qtyChipActive]} onPress={() => setQty(s)}>
                    <Text style={[styles.qtyChipText, qty === s && styles.qtyChipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {!validation.valid ? (
              <View style={styles.validationRow}>
                <Text style={styles.validationText}>⚠️ {validation.message}</Text>
                {validation.suggestedQty ? (
                  <TouchableOpacity onPress={() => setQty(validation.suggestedQty!)} style={styles.fixBtn}>
                    <Text style={styles.fixBtnText}>Use {validation.suggestedQty}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : tier ? (
              <View style={styles.tierRow}>
                <Text style={styles.tierText}>
                  💰 {tier.label || "Tier"} price: ¥{tier.priceCny.toFixed(2)}/pc
                </Text>
              </View>
            ) : null}
          </View>

          {/* Estimated weight / volume (for shipping quote) */}
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Shipping estimate <Text style={styles.optional}>(optional — used for air/sea quote)</Text></Text>
            <View style={styles.wtRow}>
              <View style={styles.wtField}>
                <TextInput
                  style={styles.wtInput}
                  placeholder="Weight / kg"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="decimal-pad"
                  value={estKg}
                  onChangeText={setEstKg}
                />
                <Text style={styles.wtUnit}>kg</Text>
              </View>
              <View style={styles.wtField}>
                <TextInput
                  style={styles.wtInput}
                  placeholder="Volume"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="decimal-pad"
                  value={estCbm}
                  onChangeText={setEstCbm}
                />
                <Text style={styles.wtUnit}>CBM</Text>
              </View>
            </View>
          </View>

          {/* Smart specs */}
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Specifications <Text style={styles.optional}>(pick what the customer sees — all added to cart)</Text></Text>
            <ScrollView
              horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.specTabs}
            >
              {COMMON_SPECS.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.specTab, activeSpec === s && styles.specTabActive]}
                  onPress={() => { setActiveSpec(s); Haptics.selectionAsync(); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.specTabText, activeSpec === s && styles.specTabTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.specInputRow}>
              <TextInput
                style={styles.specInput}
                placeholder={`Enter ${activeSpec.toLowerCase()} (e.g. Red / XL / ABS)`}
                placeholderTextColor={COLORS.textMuted}
                value={specs[activeSpec] || ""}
                onChangeText={(t) => setSpecs((p) => ({ ...p, [activeSpec]: t }))}
              />
              {!!specs[activeSpec] && (
                <TouchableOpacity onPress={() => setSpecs((p) => { const n = { ...p }; delete n[activeSpec]; return n; })} style={styles.clearBtn}>
                  <Text style={styles.clearText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.addedSpecs}>
              {Object.entries(specs).filter(([, v]) => !!v).map(([k, v]) => (
                <View key={k} style={styles.specChip}>
                  <Text style={styles.specChipLabel}>{k}:</Text>
                  <Text style={styles.specChipValue}>{v}</Text>
                </View>
              ))}
              {Object.values(specs).filter(Boolean).length === 0 && (
                <Text style={styles.noSpecs}>No specs yet — add to fully configure the item.</Text>
              )}
            </View>
          </View>

          {/* Total */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Estimated Total (USD)</Text>
            <Text style={styles.totalValue}>${(usd * qty).toFixed(2)}</Text>
          </View>

          {/* Actions */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addBtn, !validation.valid && styles.disabled]}
              onPress={handleAdd}
              disabled={!validation.valid}
              activeOpacity={0.8}
            >
              <Text style={styles.addText}>+ Add {qty} to Cart</Text>
            </TouchableOpacity>
          </View>

          {/* Full review sheet trigger */}
          <TouchableOpacity style={styles.reviewBtn} onPress={handleReview} activeOpacity={0.8}>
            <Text style={styles.reviewBtnText}>📋 Review full costs & MOQ details</Text>
          </TouchableOpacity>
        </ScrollView>
      </BottomSheet>

      {/* 5-section product review sheet */}
      <ProductReviewSheet
        visible={showReviewSheet}
        product={product}
        rules={moqRules}
        onClose={() => {
          setShowReviewSheet(false);
          onClose();
        }}
        onAddToCart={() => {
          setShowReviewSheet(false);
          onClose();
        }}
        onAskSmallerQty={handleAskSmallerQty}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // preview
  previewRow: { flexDirection: "row", gap: SPACING.md, paddingBottom: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  thumb: { width: 84, height: 84, borderRadius: RADIUS.md, backgroundColor: COLORS.gray100 },
  previewInfo: { flex: 1, justifyContent: "center" },
  previewTitle: { fontSize: 14, fontFamily: FONTS.semibold, color: COLORS.black, lineHeight: 19 },
  priceLine: { marginTop: 6 },
  priceCny: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.textSecondary },
  priceSep: { fontSize: 13, color: COLORS.gray400 },
  priceUsd: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.primary },
  rateHint: { fontSize: 11, color: COLORS.textMuted },
  sourceTag: { marginTop: 6, alignSelf: "flex-start", backgroundColor: COLORS.softOrange, paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: RADIUS.pill },
  // price edit
  priceEditWrap: { justifyContent: "center", alignItems: "flex-end", marginLeft: SPACING.sm },
  priceEditLabel: { fontSize: 10, fontFamily: FONTS.semibold, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  priceEditRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm, height: 38, marginTop: 4, backgroundColor: COLORS.gray50 },
  priceEditPrefix: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.textSecondary, marginRight: 2 },
  priceEditInput: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.primary, minWidth: 70, padding: 0 },
  priceEditHint: { fontSize: 10, color: COLORS.textMuted, marginTop: 3 },
  // block
  block: { paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: SPACING.sm },
  blockLabel: { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.black, marginBottom: SPACING.sm },
  optional: { fontSize: 11, fontFamily: FONTS.regular, color: COLORS.textMuted },
  moqHint: { fontSize: 11, fontFamily: FONTS.medium, color: COLORS.primary },
  // qty
  qtyWrap: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  qtyBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: COLORS.border, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.warmWhite },
  qtyBtnText: { fontSize: 20, fontFamily: FONTS.bold, color: COLORS.black },
  qtyValue: { fontSize: 18, fontFamily: FONTS.bold, color: COLORS.black, minWidth: 32, textAlign: "center" },
  disabled: { opacity: 0.4 },
  qtyQuick: { flexDirection: "row", gap: 6, flex: 1, justifyContent: "flex-end" },
  qtyChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill, backgroundColor: COLORS.gray100 },
  qtyChipActive: { backgroundColor: COLORS.primary },
  qtyChipText: { fontSize: 12, fontFamily: FONTS.semibold, color: COLORS.textSecondary },
  qtyChipTextActive: { color: COLORS.white },
  // MOQ validation and tier
  validationRow: { marginTop: SPACING.sm, backgroundColor: COLORS.errorBg, borderRadius: RADIUS.md, padding: SPACING.sm, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  validationText: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.error, flex: 1 },
  fixBtn: { backgroundColor: COLORS.white, paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.error, marginLeft: SPACING.sm },
  fixBtnText: { fontSize: 11, fontFamily: FONTS.semibold, color: COLORS.error },
  tierRow: { marginTop: SPACING.sm, backgroundColor: COLORS.successBg, borderRadius: RADIUS.md, padding: SPACING.sm },
  tierText: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.success },
  // specs
  specTabs: { gap: SPACING.sm, paddingBottom: SPACING.sm },
  specTab: { paddingHorizontal: SPACING.md, paddingVertical: 7, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  specTabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  specTabText: { fontSize: 12, fontFamily: FONTS.semibold, color: COLORS.textSecondary },
  specTabTextActive: { color: COLORS.white },
  specInputRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  specInput: { flex: 1, height: 44, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, fontSize: 14, color: COLORS.black, backgroundColor: COLORS.white },
  clearBtn: { paddingHorizontal: SPACING.sm, paddingVertical: 6 },
  clearText: { fontSize: 13, fontFamily: FONTS.semibold, color: COLORS.primary },
  addedSpecs: { marginTop: SPACING.sm },
  specChip: { flexDirection: "row", backgroundColor: COLORS.gray50, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: 5, marginRight: 6, alignSelf: "flex-start", marginBottom: 4 },
  specChipLabel: { fontSize: 12, fontFamily: FONTS.semibold, color: COLORS.textSecondary, marginRight: 4 },
  specChipValue: { fontSize: 12, fontFamily: FONTS.semibold, color: COLORS.black },
  noSpecs: { fontSize: 12, color: COLORS.textMuted },
  // weight / cbm
  wtRow: { flexDirection: "row", gap: SPACING.md },
  wtField: { flex: 1, flexDirection: "row", alignItems: "center" },
  wtInput: {
    flex: 1,
    height: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    fontSize: 14,
    color: COLORS.black,
    backgroundColor: COLORS.white,
  },
  wtUnit: { marginLeft: 6, fontSize: 13, color: COLORS.textSecondary, fontFamily: FONTS.semibold },
  // total
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: SPACING.sm },
  totalLabel: { fontSize: 13, fontFamily: FONTS.semibold, color: COLORS.textSecondary },
  totalValue: { fontSize: 22, fontFamily: FONTS.bold, color: COLORS.black },
  // actions
  actionRow: { flexDirection: "row", gap: SPACING.md, paddingTop: SPACING.sm },
  cancelBtn: { flex: 1, height: 50, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.border, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.white },
  cancelText: { fontSize: 15, fontFamily: FONTS.semibold, color: COLORS.textSecondary },
  addBtn: { flex: 2, height: 50, borderRadius: RADIUS.lg, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  addText: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.white },
  // review sheet trigger
  reviewBtn: {
    height: 48,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.softOrange,
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  reviewBtnText: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.primary,
  },
});
