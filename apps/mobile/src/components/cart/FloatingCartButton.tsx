import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ShoppingCart } from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useCartStore } from "@/store/cart";

/**
 * Floating cartridge — the single on-screen access point to the cart with a
 * live item-count badge. Rendered once per screen (Home, Markets). Tapping
 * opens the cart. Hidden when the cart is empty.
 */
export function FloatingCartButton() {
  const router = useRouter();
  const count = useCartStore((s) => s.items.reduce((sum, i) => sum + i.quantity, 0));

  if (count <= 0) return null;

  return (
    <TouchableOpacity
      style={styles.fab}
      activeOpacity={0.85}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push("/cart");
      }}
    >
      <ShoppingCart size={22} color={COLORS.white} strokeWidth={2.2} />
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
      </View>
      <Text style={styles.label}>Cart</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: SPACING.lg,
    bottom: 96, // sits above the tab bar
    minWidth: 56,
    height: 56,
    borderRadius: 28,
    paddingHorizontal: 16,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 50,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 4,
    backgroundColor: COLORS.darkSurface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: FONTS.bold,
    color: COLORS.white,
  },
  label: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: COLORS.white,
  },
});
