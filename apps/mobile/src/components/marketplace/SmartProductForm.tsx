import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { BottomSheet } from "@/components/BottomSheet";
import { useCartStore } from "@/store/cart";
import type { Marketplace, Product } from "@/types";
import { getCnyPerUsd } from "@/lib/exchange";
import { saveSourcingCapture } from "@/db";

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
const QTY_STEPS = [1, 2, 5, 10, 20, 50, 100];

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Feed the admin sourcing mission-control (local-first, syncs to sourcing_requests when online)
    void saveSourcingCapture({
      id: `src-${Date.now()}`,
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
    const product: Product = {
      id: `web-${listing.sourceId || Math.random().toString(36).slice(2, 10)}`,
      marketplace: (listing.platform as Marketplace) || "1688",
      source_product_id: listing.sourceId || listing.url,
      source_url: listing.url,
      title_original: listing.title,
      title_english: listing.title, // captured from page; user can edit note
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
    addItem(product, qty, specs, {
      estimated_kg: parseFloat(estKg) || undefined,
      estimated_cbm: parseFloat(estCbm) || undefined,
      exchange_rate: rate || undefined,
    });
    Alert.alert("Added to ChinaSuuq Cart", `${listing.title.slice(0, 60)} (×${qty})\n\nFully translated & converted — continue in your cart.`, [
      { text: "Noted" },
    ]);
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} height={460}>
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
                  const v = parseFloat(t.replace(/[^\d.]/g, "")) || 0;
                  setPriceCny(v);
                  setUsd(v > 0 ? v / rate : 0);
                }}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={COLORS.gray400}
              />
            </View>
            <Text style={styles.priceEditHint}>
              {priceCny > 0 ? `≈ $${(priceCny / rate).toFixed(2)} USD` : "Enter price if auto-detect missed it"}
            </Text>
          </View>
        </View>

        {/* Quantity stepper */}
        <View style={styles.block}>
          <Text style={styles.blockLabel}>Quantity</Text>
          <View style={styles.qtyWrap}>
            <TouchableOpacity
              style={[styles.qtyBtn, qty <= 1 && styles.disabled]}
              onPress={() => qty > 1 && (Haptics.selectionAsync(), setQty(qty - 1))}
              disabled={qty <= 1}
            >
              <Text style={styles.qtyBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.qtyValue}>{qty}</Text>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => (Haptics.selectionAsync(), setQty(qty + 1))}>
              <Text style={styles.qtyBtnText}>+</Text>
            </TouchableOpacity>
            <View style={styles.qtyQuick}>
              {QTY_STEPS.map((s, i) =>
                i < 4 ? (
                  <TouchableOpacity key={s} style={[styles.qtyChip, qty === s && styles.qtyChipActive]} onPress={() => setQty(s)}>
                    <Text style={[styles.qtyChipText, qty === s && styles.qtyChipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ) : null
              )}
            </View>
          </View>
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
          <TouchableOpacity style={styles.addBtn} onPress={handleAdd} activeOpacity={0.8}>
            <Text style={styles.addText}>+ Add to ChinaSuuq Cart</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // preview
  previewRow: { flexDirection: "row", gap: SPACING.md, paddingBottom: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  thumb: { width: 84, height: 84, borderRadius: RADIUS.md, backgroundColor: COLORS.gray100 },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  thumbFallbackText: { fontSize: 30, fontFamily: FONTS.bold, color: COLORS.primary },
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
});
