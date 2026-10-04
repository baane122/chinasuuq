import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Image, Alert, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image as ExpoImage } from "expo-image";
import { ArrowLeft, Heart, Trash2, ShoppingCart } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth";
import { getFavorites, toggleFavorite } from "@/db/index";
import { useCartStore } from "@/store/cart";
import { moqOrderRules } from "@/lib/moqIngest";
import type { Product } from "@/types";
import { WHATSAPP_LINK } from "@/lib/constants";
import { Linking } from "react-native";

const EMPTY_WISHLIST_IMG = require("../../assets/screens/empty_wishlist.png");

/** The MOQ evidence a stored product carries — same inputs the product and
 *  cart screens hand to moqOrderRules(), the app's only MOQ reader. */
function moqEvidence(p: Product): string {
  const lines: string[] = [];
  if (p.moq_raw_text) lines.push(p.moq_raw_text);
  for (const [k, v] of Object.entries(p.attributes || {})) {
    if (v) lines.push(`${k}: ${v}`);
  }
  if (p.description_original) lines.push(p.description_original);
  if (p.description_english) lines.push(p.description_english);
  return lines.join("\n").slice(0, 4000);
}

export default function WishlistScreen() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const user = useAuthStore((s) => s.user);
  const addItem = useCartStore((s) => s.addItem);
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      const list = await getFavorites(user.id);
      setItems(list);
      setLoadFailed(false);
    } catch (e) {
      // getFavorites guards per-row, but an overall failure must not look
      // like "you have no favorites" — show the error and a retry instead.
      console.warn("[wishlist] load failed", e);
      setLoadFailed(true);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await load();
    setRefreshing(false);
  };

  const orderOnWhatsApp = (product: Product) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const title = product.title_english || product.title_somali || "product";
    const text = encodeURIComponent(`Hi ChinaSuuq, I'd like to order this item:\n\n${title}\nPrice: $${(product.price_usd_estimated ?? 0).toFixed(2)}\n\nPlease assist me.`);
    Linking.openURL(`${WHATSAPP_LINK}${WHATSAPP_LINK.includes("?") ? "&" : "?"}text=${text}`).catch(() => {});
  };

  const removeFromWishlist = async (item: Product) => {
    if (!user?.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await toggleFavorite(user.id, String(item.id));
      setItems((prev) => prev.filter((p) => p.id !== item.id));
    } catch {
      Alert.alert(t("wishlist.couldNotRemove"), t("wishlist.tryAgain"));
    }
  };

  const addToCart = (item: Product) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Same authority as the product sheet and the cart: moqOrderRules resolves
    // the stored MOQ provenance (manual > confident machine reading > stated).
    const { resolution } = moqOrderRules(item, moqEvidence(item));
    addItem(item, Math.max(1, resolution.displayMoq));
    Alert.alert(t("wishlist.addedToCart"), item.title_english || item.title_somali || t("common.item"));
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()} android_ripple={{ color: COLORS.gray100 }}>
          <ArrowLeft size={22} color={COLORS.black} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("wishlist.title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centerLoading}><ActivityIndicator color={COLORS.primary} /></View>
      ) : loadFailed ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 40, marginBottom: SPACING.md }}>⚠️</Text>
          <Text style={styles.emptyTitle}>{locale === "en" ? "Couldn't load your wishlist" : "Liiskaaga lama soo dejin karin"}</Text>
          <Text style={styles.emptySub}>
            {locale === "en" ? "Check your connection and try again." : "Hubi isku xirka internetka kadibna isku day mar kale."}
          </Text>
          <Pressable style={styles.shopBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); load(); }}>
            <Text style={styles.shopBtnText}>{locale === "en" ? "Try again" : "Isku day mar kale"}</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <ExpoImage source={EMPTY_WISHLIST_IMG} style={styles.emptyImg} contentFit="contain" transition={150} />
          <Text style={styles.emptyTitle}>{t("wishlist.emptyTitle")}</Text>
          <Text style={styles.emptySub}>{t("wishlist.emptySub")}</Text>
          <Pressable style={styles.shopBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(tabs)" as any); }}>
            <Text style={styles.shopBtnText}>{t("wishlist.browse")}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
          data={items}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
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
                <Pressable style={styles.removeBtn} onPress={() => removeFromWishlist(item)} hitSlop={8}>
                  <Trash2 size={18} color={COLORS.error} />
                </Pressable>
                <Pressable style={styles.cartBtn} onPress={() => addToCart(item)}>
                  <Text style={styles.cartBtnText}>{t("product.addToCart")}</Text>
                </Pressable>
                <Pressable style={styles.whatsBtn} onPress={() => orderOnWhatsApp(item)}>
                  <Text style={styles.whatsBtnText}>{t("wishlist.order")}</Text>
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
  emptyImg: { width: 200, height: 200, marginBottom: SPACING.lg },
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
  itemActions: { flexDirection: "row", gap: 8, alignItems: "center" },
  removeBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: COLORS.error, backgroundColor: COLORS.errorBg, alignItems: "center", justifyContent: "center" },
  cartBtn: { backgroundColor: COLORS.primary, height: 36, borderRadius: 10, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  cartBtnText: { color: COLORS.white, fontSize: 13, fontFamily: FONTS.semibold },
  whatsBtn: { backgroundColor: COLORS.whatsapp, paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: RADIUS.md },
  whatsBtnText: { color: COLORS.white, fontSize: 13, fontFamily: FONTS.semibold },
});
