import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Image, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Heart, Trash2, ShoppingCart } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useAuthStore } from "@/store/auth";
import { getFavorites } from "@/db/index";
import type { Product } from "@/types";
import { WHATSAPP_LINK } from "@/lib/constants";
import { Linking } from "react-native";

export default function WishlistScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user?.id) { setLoading(false); return; }
      try {
        const list = await getFavorites(user.id);
        setItems(list);
      } catch {}
      setLoading(false);
    })();
  }, [user?.id]);

  const orderOnWhatsApp = (product: Product) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const title = product.title_english || product.title_somali || "product";
    const text = encodeURIComponent(`Hi ChinaSuuq, I'd like to order this item:\n\n${title}\nPrice: $${(product.price_usd_estimated ?? 0).toFixed(2)}\n\nPlease assist me.`);
    Linking.openURL(`${WHATSAPP_LINK}${WHATSAPP_LINK.includes("?") ? "&" : "?"}text=${text}`).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()} android_ripple={{ color: COLORS.gray100 }}>
          <ArrowLeft size={22} color={COLORS.black} />
        </Pressable>
        <Text style={styles.headerTitle}>Wishlist</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centerLoading}><ActivityIndicator color={COLORS.primary} /></View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Heart size={40} color={COLORS.primary} /></View>
          <Text style={styles.emptyTitle}>Your wishlist is empty</Text>
          <Text style={styles.emptySub}>Tap the heart on any product to save it here.</Text>
          <Pressable style={styles.shopBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(tabs)" as any); }}>
            <Text style={styles.shopBtnText}>Browse Products</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
          data={items}
          keyExtractor={(p) => String(p.id)}
          renderItem={({ item }) => (
            <View style={styles.itemCard}>
              <Pressable style={styles.itemMain} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push({ pathname: "/product/[id]", params: { id: String(item.id) } } as any); }}>
                {item.images?.[0] ? (
                  <Image source={{ uri: item.images[0] }} style={styles.itemImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.itemImage, styles.itemImagePlaceholder]}><ShoppingCart size={24} color={COLORS.gray400} /></View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName} numberOfLines={2}>{item.title_english || item.title_somali}</Text>
                  <Text style={styles.itemPrice}>${(item.price_usd_estimated ?? 0).toFixed(2)}</Text>
                </View>
              </Pressable>
              <View style={styles.itemActions}>
                <Pressable style={styles.whatsBtn} onPress={() => orderOnWhatsApp(item)}>
                  <Text style={styles.whatsBtnText}>Order</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: FONTS.semibold, color: COLORS.black },
  centerLoading: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xxxl },
  emptyIcon: { width: 84, height: 84, borderRadius: 42, backgroundColor: COLORS.softOrange, alignItems: "center", justifyContent: "center", marginBottom: SPACING.lg },
  emptyTitle: { fontSize: 18, fontFamily: FONTS.bold, color: COLORS.black, marginBottom: 4 },
  emptySub: { fontSize: 14, fontFamily: FONTS.regular, color: COLORS.textSecondary, textAlign: "center" },
  shopBtn: { marginTop: SPACING.lg, backgroundColor: COLORS.primary, paddingHorizontal: SPACING.xxl, paddingVertical: SPACING.md, borderRadius: RADIUS.pill },
  shopBtnText: { color: COLORS.white, fontSize: 15, fontFamily: FONTS.semibold },
  itemCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.md, flexDirection: "row", gap: SPACING.md },
  itemMain: { flex: 1, flexDirection: "row", gap: SPACING.md },
  itemImage: { width: 72, height: 72, borderRadius: RADIUS.md },
  itemImagePlaceholder: { backgroundColor: COLORS.gray50, alignItems: "center", justifyContent: "center" },
  itemName: { fontSize: 13, fontFamily: FONTS.medium, color: COLORS.black },
  itemPrice: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.primary, marginTop: 4 },
  itemActions: { justifyContent: "flex-end" },
  whatsBtn: { backgroundColor: "#25D366", paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: RADIUS.md },
  whatsBtnText: { color: COLORS.white, fontSize: 13, fontFamily: FONTS.semibold },
});
