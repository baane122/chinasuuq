import React, { useMemo } from "react";
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
import { ArrowLeft, MessageCircle, Store } from "lucide-react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS, whatsappOrderLink } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useCartStore } from "@/store/cart";
import CartItem from "@/components/cart/CartItem";
import EmptyCart from "@/components/cart/EmptyCart";
import { formatUSD } from "@/lib/utils";
import type { Marketplace } from "@/types";

const MARKET_NAMES: Record<string, string> = {
  "1688": "1688.com",
  taobao: "Taobao",
  yiwugo: "YiwuGo",
  chinasuuq: "ChinaSuuq Deals",
};

const MARKET_COLORS: Record<string, string> = {
  "1688": "#FF5000",
  taobao: "#FF7400",
  yiwugo: "#1A8CFF",
  chinasuuq: "#FF5A0A",
};

export default function CartScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const getTotal = useCartStore((s) => s.getTotal);
  const getMarketplaceCount = useCartStore((s) => s.getMarketplaceCount);
  const total = getTotal();
  const marketCount = getMarketplaceCount();

  // Group items by marketplace
  const grouped = useMemo(() => {
    const map = new Map<Marketplace, typeof items>();
    for (const it of items) {
      const m = it.product.marketplace;
      if (!map.has(m)) map.set(m, []);
      map.get(m)!.push(it);
    }
    return Array.from(map.entries());
  }, [items]);

  // Shipping estimate comment removed — no cost calc in cart

  const handleWhatsAppOrder = async () => {
    try {
      const url = whatsappOrderLink();
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert("WhatsApp not available", "Please install WhatsApp to use this feature.");
      }
    } catch {
      Alert.alert("Error", "Unable to open WhatsApp.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color={COLORS.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("cart.title")}</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>
            {items.length} {t("cart.items")}
          </Text>
        </View>
      </View>

      {items.length === 0 ? (
        <EmptyCart />
      ) : (
        <>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.list}
          >
            {/* Cross-marketplace summary strip */}
            {marketCount > 1 && (
              <View style={styles.multiStrip}>
                <Store size={15} color={COLORS.primary} />
                <Text style={styles.multiText}>
                  {marketCount} marketplaces combined · one cart, one checkout
                </Text>
              </View>
            )}

            {grouped.map(([mkt, mktItems]) => (
              <View key={mkt} style={styles.group}>
                <View style={styles.groupHeader}>
                  <View style={[styles.groupDot, { backgroundColor: MARKET_COLORS[mkt] || COLORS.primary }]} />
                  <Text style={styles.groupName}>{MARKET_NAMES[mkt] || mkt}</Text>
                  <Text style={styles.groupCount}>{mktItems.length}</Text>
                </View>
                {mktItems.map((item) => (
                  <CartItem
                    key={item.id}
                    image={item.product.images?.[0] || ""}
                    title={item.product.title_english}
                    variant={Object.values(item.selected_options).join(", ") || "Default"}
                    quantity={item.quantity}
                    price={formatUSD(item.price_usd_estimated)}
                    onIncrease={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      updateQuantity(item.id, item.quantity + 1);
                    }}
                    onDecrease={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      updateQuantity(item.id, item.quantity - 1);
                    }}
                    onRemove={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      removeItem(item.id);
                    }}
                  />
                ))}
              </View>
            ))}
            <View style={styles.bottomSpacer} />
          </ScrollView>

          {/* Bottom Section */}
          <View style={styles.bottomSection}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t("cart.subtotal")}</Text>
              <Text style={styles.totalPrice}>{formatUSD(total.subtotalUSD)}</Text>
            </View>

            <TouchableOpacity
              style={styles.checkoutBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push("/cart/checkout");
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.checkoutText}>{t("cart.checkout")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.whatsappBtn}
              onPress={handleWhatsAppOrder}
              activeOpacity={0.8}
            >
              <MessageCircle size={18} color={COLORS.white} />
              <Text style={styles.whatsappText}>{t("cart.whatsapp")}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: FONTS.bold, color: COLORS.black, textAlign: "center" },
  countBadge: { backgroundColor: COLORS.softOrange, paddingHorizontal: SPACING.md, paddingVertical: 4, borderRadius: RADIUS.pill },
  countText: { fontSize: 13, fontFamily: FONTS.semibold, color: COLORS.primary },
  list: { padding: SPACING.lg },
  multiStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.softOrange,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
  },
  multiText: { fontSize: 12, fontFamily: FONTS.semibold, color: COLORS.primaryDark, flex: 1 },
  group: { marginBottom: SPACING.md },
  groupHeader: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.sm, paddingHorizontal: SPACING.xs },
  groupDot: { width: 8, height: 8, borderRadius: 4, marginRight: SPACING.sm },
  groupName: { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.textSecondary, flex: 1 },
  groupCount: { fontSize: 12, fontFamily: FONTS.semibold, color: COLORS.textMuted },
  bottomSection: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 6,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: SPACING.md },
  totalLabel: { fontSize: 16, fontFamily: FONTS.semibold, color: COLORS.black },
  totalPrice: { fontSize: 22, fontFamily: FONTS.bold, color: COLORS.black },
  checkoutBtn: { height: 50, borderRadius: RADIUS.lg, backgroundColor: COLORS.primary, justifyContent: "center", alignItems: "center", marginBottom: SPACING.sm },
  checkoutText: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.white },
  whatsappBtn: { height: 48, borderRadius: RADIUS.lg, backgroundColor: COLORS.darkSurface, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: SPACING.sm },
  whatsappText: { fontSize: 15, fontFamily: FONTS.semibold, color: COLORS.white },
  bottomSpacer: { height: 20 },
});
