import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Animated,
  Easing,
  Alert,
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
import { formatUSD, WHATSAPP_NUMBER } from "@/lib/utils";
import { Linking } from "react-native";
import { Image } from "expo-image";

const SUCCESS_IMG = require("../../assets/screens/order_success.png");
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

  const serverSubtotal = Number(order?.subtotal_usd) || 0;
  const serverFee = Number(order?.service_fee_usd) || 0;
  /** The fee's share is read OFF the two server-stamped amounts shown next to it,
   *  so the caption can never name a percentage the order was not billed at. */
  const serverFeePct =
    serverSubtotal > 0 && serverFee > 0
      ? `${Math.round((serverFee / serverSubtotal) * 1000) / 10}%`
      : null;

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
          <Image source={SUCCESS_IMG} style={styles.successImage} contentFit="contain" />
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
                {/* For a stored order createOrder replaced this preview with
                    the server's money echo from submit_mobile_order. */}
                {formatUSD(Number(order.total_usd) > 0 ? Number(order.total_usd) : 0)}
              </Text>
            </View>
            <View style={styles.detailDivider} />
            {Number(order.subtotal_usd) > 0 ? (
              <>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>
                    {locale === "en" ? "Subtotal (server)" : "Subtotal (server)"}
                  </Text>
                  <Text style={styles.detailValue}>
                    {formatUSD(serverSubtotal)}
                  </Text>
                </View>
                <View style={styles.detailDivider} />
              </>
            ) : null}
            {serverFee > 0 ? (
              <>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>
                    {`${locale === "en" ? "Service fee" : "Kharashka adeegga"}${
                      serverFeePct ? ` (${serverFeePct})` : ""
                    } (server)`}
                  </Text>
                  <Text style={styles.detailValue}>{formatUSD(serverFee)}</Text>
                </View>
                <View style={styles.detailDivider} />
              </>
            ) : null}
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

        {/* An order taken while offline or as a guest lives only on this device
            until syncPendingOrders() can push it, and the admin cannot see it
            before then. Say so instead of implying it arrived. */}
        {order && !order.synced ? (
          <View style={styles.queuedCard}>
            <Text style={styles.queuedTitle}>
              {locale === "en" ? "Saved on this device" : "Kigan kaydsan"}
            </Text>
            <Text style={styles.queuedText}>
              {locale === "en"
                ? "We could not send it to our warehouse yet. Sign in and open this order again once you are online, and it will be placed for you."
                : "Weli ma aanu u gudbin karin kaydka. Soo gali oo dib u fur dalabkan markaad internet hesho, waana la gudbin doonaa."}
            </Text>
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
              // openURL rejects when WhatsApp is absent — show the number so
              // the customer can still reach support instead of ignoring it.
              Linking.openURL(whatsappOrderLink(`Order ${order?.reference || ""}`)).catch(() => {
                Alert.alert(
                  locale === "en" ? "WhatsApp is not available." : "WhatsApp lama heli karo.",
                  locale === "en"
                    ? `Message us directly at ${WHATSAPP_NUMBER} on WhatsApp.`
                    : `Naga soo farriin tooska ah ${WHATSAPP_NUMBER} WhatsApp.`
                );
              });
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
    width: 140,
    height: 140,
    borderRadius: RADIUS.xxl,
    backgroundColor: COLORS.successBg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACING.xl,
    marginBottom: SPACING.lg,
    overflow: "hidden",
  },
  successImage: { width: 120, height: 120 },
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
  queuedCard: {
    width: "100%",
    backgroundColor: COLORS.warningBg,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.warning,
    marginBottom: SPACING.lg,
  },
  queuedTitle: { fontSize: 13, color: COLORS.warning, fontFamily: FONTS.bold, marginBottom: SPACING.xs },
  queuedText: { fontSize: 13, color: COLORS.textSecondary, fontFamily: FONTS.regular, lineHeight: 19 },
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
