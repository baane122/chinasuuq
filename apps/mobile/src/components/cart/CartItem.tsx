import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Minus, Plus, Trash2, AlertTriangle } from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";

interface CartItemProps {
  image: string;
  title: string;
  variant: string;
  quantity: number;
  price: string;
  onIncrease: () => void;
  onDecrease: () => void;
  onRemove: () => void;
  /**
   * Inline MOQ warning — never a modal: a customer mid-edit must see the rule
   * attached to the line it applies to. From validateCartItem(), whose rules come
   * from the product's resolved MOQ (moqOrderRules), not from `product.moq`.
   */
  warning?: string | null;
  /** Label for the one-tap fix, e.g. "Set 20". */
  fixLabel?: string | null;
  /** Jump the quantity to the smallest that satisfies the supplier's rules. */
  onFix?: () => void;
  /** Structural facts read off the listing: "Sold in cartons of 48 pieces". */
  notes?: string[];
}

export default function CartItem({
  image,
  title,
  variant,
  quantity,
  price,
  onIncrease,
  onDecrease,
  onRemove,
  warning,
  fixLabel,
  onFix,
  notes,
}: CartItemProps) {
  return (
    <View style={styles.card}>
      <Image
        source={{ uri: image }}
        style={styles.image}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
        recyclingKey={image}
        placeholder={COLORS.gray100}
      />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.variant}>{variant}</Text>
        <Text style={styles.price}>{price}</Text>
        <View style={styles.qtyRow}>
          <TouchableOpacity style={styles.qtyBtn} onPress={onDecrease} activeOpacity={0.7}>
            <Minus size={16} color={COLORS.black} />
          </TouchableOpacity>
          <Text style={styles.qtyNum}>{quantity}</Text>
          <TouchableOpacity style={styles.qtyBtn} onPress={onIncrease} activeOpacity={0.7}>
            <Plus size={16} color={COLORS.black} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.removeBtn} onPress={onRemove} activeOpacity={0.7}>
            <Trash2 size={16} color={COLORS.error} />
          </TouchableOpacity>
        </View>

        {!!notes?.length && (
          <View style={styles.notesRow}>
            {notes.map((n) => (
              <Text key={n} style={styles.noteText}>
                {n}
              </Text>
            ))}
          </View>
        )}

        {warning ? (
          <View style={styles.warningRow}>
            <AlertTriangle size={14} color={COLORS.warning} />
            <Text style={styles.warningText} numberOfLines={2}>
              {warning}
            </Text>
            {fixLabel && onFix ? (
              <TouchableOpacity style={styles.fixBtn} onPress={onFix} activeOpacity={0.7}>
                <Text style={styles.fixText}>{fixLabel}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  image: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.md,
  },
  info: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  name: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
  },
  variant: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  price: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    marginTop: 4,
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.warmWhite,
  },
  qtyNum: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
    minWidth: 24,
    textAlign: "center",
  },
  removeBtn: {
    marginLeft: "auto",
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  notesRow: { marginTop: SPACING.xs, gap: 1 },
  noteText: { fontSize: 11, fontFamily: FONTS.medium, color: COLORS.textMuted },
  warningRow: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.warningBg,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  warningText: { fontSize: 11, fontFamily: FONTS.medium, color: COLORS.warning, flex: 1 },
  fixBtn: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.warning,
  },
  fixText: { fontSize: 11, fontFamily: FONTS.semibold, color: COLORS.warning },
});
