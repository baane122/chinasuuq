import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Animated,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  CheckCircle2,
  Truck,
  MessageCircle,
  Package,
  ArrowRight,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { whatsappOrderLink } from "@/lib/theme";
import { Linking } from "react-native";
import { useCartStore } from "@/store/cart";
import { getOrders } from "@/db";
import type { LocalOrder } from "@/db";

export default function OrderSuccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { locale } = useI18n();
  const clearCart = useCartStore((s) => s.clearCart);
  const [order, setOrder] = React.useState<LocalOrder | null>(null);
  const scale = React.useRef(new Animated.Value(0.4)).current;
  const opacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    (async () => {
      if (params.id) {
        const all = await getOrders();
        const found = all.find((o) => o.id === params.id);
        if (found) setOrder(found);
      }
    })();
    return () => {
      // Ensure cart is fully cleared (checkout.tsx may have already done so, but be safe)
      clearCart();
    };
  }, [params.id]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Animated success badge */}
        <Animated.View
          style={[
            styles.successCircle,
            { transform: [{ scale }], opacity },
          ]}
        >
          <CheckCircle2 size={64} color={COLORS.success} strokeWidth={2.5} />
        </Animated.View>

        <Text style={styles.title}>
          {locale === "en" ? "Order placed!" : "Dalabka waa la sameeyay!"}
        </Text>
        <Text style={styles.subtitle}>
          {locale === "en"
            ? "We've received your order. Our team will reach out on WhatsApp to confirm details and arrange payment."
            : "Waxaan helnay dalabkaaga. Kooxdayadu waxay kula soo xiriiri doonaan WhatsApp si ay u xaqiijiyaan faahfaahinta."}
        </Text>

        {order ? (
          <View style={styles.detailCard}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>
                {locale === "en" ? "Reference" : "Tixraac"}
              </Text>
              <Text style={styles.detailValue}>{order.reference}</Text>
            </View>
            <View style={styles.detailDivider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>
                {locale === "en" ? "Items" : "Alaabta"}
              </Text>
              <Text style={styles.detailValue}>{order.items.length}</Text>
            </View>
            <View style={styles.detailDivider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>
                {locale === "en" ? "Total" : "Wadarta"}
              </Text>
              <Text style={[styles.detailValue, styles.total]}>
                ${order.total_usd.toFixed(2)}
              </Text>
            </View>
            <View style={styles.detailDivider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>
                {locale === "en" ? "Shipping" : "Rarka"}
              </Text>
              <Text style={styles.detailValue}>
                {order.shipping_method === "sea" ? "🚢 Sea" : "✈️ Air"}
              </Text>
            </View>
            <View style={styles.detailDivider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>
                {locale === "en" ? "City" : "Magaalada"}
              </Text>
              <Text style={styles.detailValue}>{order.city || "—"}</Text>
            </View>
          </View>
        ) : null}

        {/* What happens next */}
        <View style={styles.nextCard}>
          <Text style={styles.nextTitle}>
            {locale === "en" ? "What happens next?" : "Maxaa dhacaya kadib?"}
          </Text>
          <View style={styles.nextStep}>
            <View style={[styles.stepBadge, { backgroundColor: COLORS.primaryBg }]}>
              <MessageCircle size={16} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepTitle}>
                {locale === "en" ? "WhatsApp confirmation" : "Xaqiijinta WhatsApp"}
              </Text>
              <Text style={styles.stepDesc}>
                {locale === "en"
                  ? "We'll message you within 1 hour to confirm and arrange payment."
                  : "Waxaan ku soo diri doonaa fariin saacad gudahood si aan u xaqiijino oo aan u qaabeyno lacag bixinta."}
              </Text>
            </View>
          </View>
          <View style={styles.nextStep}>
            <View style={[styles.stepBadge, { backgroundColor: COLORS.successBg }]}>
              <Package size={16} color={COLORS.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepTitle}>
                {locale === "en" ? "Sourcing & quality check" : "Raadinta & hubinta tayada"}
              </Text>
              <Text style={styles.stepDesc}>
                {locale === "en"
                  ? "We find the supplier, inspect the goods, and pack securely."
                  : "Waxaan helaynaa iibiyaha, hubinnaa alaabta, oo aan u xirxirnaa si ammaan ah."}
              </Text>
            </View>
          </View>
          <View style={styles.nextStep}>
            <View style={[styles.stepBadge, { backgroundColor: "#EFF6FF" }]}>
              <Truck size={16} color={COLORS.info} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepTitle}>
                {locale === "en" ? "Shipping & delivery" : "Rarka & gaarsiinta"}
              </Text>
              <Text style={styles.stepDesc}>
                {locale === "en"
                  ? "Track every step from China to your door in the Orders tab."
                  : "Raadraac tallaabo kasta Shiinaha ilaa albaabkaaga tab-ka Dalabka."}
              </Text>
            </View>
          </View>
        </View>

        {/* CTAs */}
        <View style={styles.actions}>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              if (order) router.push(`/orders/${order.id}`);
              else router.push("/(tabs)/orders");
            }}
          >
            <Text style={styles.primaryText}>
              {locale === "en" ? "Track my order" : "Raadi dalabkayga"}
            </Text>
            <ArrowRight size={18} color={COLORS.white} />
          </Pressable>

          <Pressable
            style={styles.secondaryBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.replace("/(tabs)/markets");
            }}
          >
            <Text style={styles.secondaryText}>
              {locale === "en" ? "Keep shopping" : "Sii wad iibsiga"}
            </Text>
          </Pressable>

          <Pressable
            style={styles.whatsappBtn}
            onPress={() => {
              try {
                Linking.openURL(whatsappOrderLink(`Order ${order?.reference || ""}`));
              } catch {}
            }}
          >
            <MessageCircle size={16} color={COLORS.success} />
            <Text style={styles.whatsappText}>
              {locale === "en" ? "Chat on WhatsApp" : "WhatsApp la xiriir"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  scroll: { padding: SPACING.xl, alignItems: "center", paddingBottom: SPACING.xxxl * 2 },
  successCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.successBg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: 28,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    textAlign: "center",
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: SPACING.xl,
    maxWidth: 320,
  },
  detailCard: {
    width: "100%",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.lg,
  },
  detailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: SPACING.sm },
  detailDivider: { height: 1, backgroundColor: COLORS.border },
  detailLabel: { fontSize: 13, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  detailValue: { fontSize: 14, color: COLORS.black, fontFamily: FONTS.semibold },
  total: { color: COLORS.primary, fontFamily: FONTS.bold, fontSize: 16 },
  nextCard: {
    width: "100%",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.lg,
  },
  nextTitle: {
    fontSize: 15,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    marginBottom: SPACING.md,
  },
  nextStep: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.md, marginBottom: SPACING.md },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  stepTitle: { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.black, marginBottom: 2 },
  stepDesc: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 },
  actions: { width: "100%", gap: SPACING.sm, marginTop: SPACING.md },
  primaryBtn: {
    height: 52,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
  },
  primaryText: { color: COLORS.white, fontSize: 16, fontFamily: FONTS.bold },
  secondaryBtn: {
    height: 50,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: COLORS.primary, fontSize: 15, fontFamily: FONTS.semibold },
  whatsappBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    height: 44,
    borderRadius: RADIUS.lg,
  },
  whatsappText: { color: COLORS.success, fontSize: 14, fontFamily: FONTS.semibold },
});
