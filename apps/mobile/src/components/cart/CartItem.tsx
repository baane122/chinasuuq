import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Minus, Plus, Trash2 } from "lucide-react-native";
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
});
