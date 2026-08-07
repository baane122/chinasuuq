import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  MessageCircle,
  HelpCircle,
  ChevronRight,
  ExternalLink,
  Mail,
  Phone,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { WHATSAPP_LINK } from "@/lib/constants";
import { useI18n } from "@/lib/i18n";

const FAQ_ITEMS = [
  {
    q: "How do I place an order?",
    a: "Browse products from 1688, Taobao, or YiwuGo, add them to your cart, and proceed to checkout. You'll receive a WhatsApp confirmation.",
  },
  {
    q: "What shipping methods are available?",
    a: "Air Freight (5–12 days) and Sea Freight (25–40 days). Shipping is paid upon arrival in Somalia.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept ZAAD, Edahab, Premier Wallet, EVC Plus, Sahal, and Bank Transfer.",
  },
  {
    q: "How can I track my order?",
    a: "Go to the Orders tab in your account. Each order has real-time tracking updates from purchase to delivery.",
  },
  {
    q: "Can I return a product?",
    a: "Returns are handled case by case. Contact us on WhatsApp and we'll assist you with any issues.",
  },
  {
    q: "Do you ship to all cities in Somalia?",
    a: "Yes, we ship to Mogadishu, Hargeisa, Bosaso, Kismayo, Baidoa, and all major cities across Somalia.",
  },
];

export default function SupportScreen() {
  const { t } = useI18n();
  const router = useRouter();

  const openWhatsApp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(WHATSAPP_LINK).catch(() => {
      Alert.alert("Error", "Could not open WhatsApp. Please make sure it's installed.");
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          android_ripple={{ color: COLORS.gray100 }}
        >
          <ArrowLeft size={22} color={COLORS.black} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("profile.help")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* WhatsApp Contact Card */}
        <Pressable
          style={styles.whatsappCard}
          onPress={openWhatsApp}
          android_ripple={{ color: "rgba(37,211,102,0.1)" }}
        >
          <View style={styles.whatsappIconWrapper}>
            <MessageCircle size={28} color={COLORS.white} fill={COLORS.white} />
          </View>
          <View style={styles.whatsappTextBlock}>
            <Text style={styles.whatsappTitle}>Chat with us on WhatsApp</Text>
            <Text style={styles.whatsappSubtitle}>
              Fast responses — we're here 24/7
            </Text>
          </View>
          <ExternalLink size={18} color={COLORS.whatsapp} />
        </Pressable>

        {/* Contact Options */}
        <View style={styles.contactCard}>
          <Text style={styles.contactCardTitle}>Other Ways to Reach Us</Text>

          <Pressable
            style={styles.contactRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Linking.openURL("tel:+252611234567").catch(() => {});
            }}
            android_ripple={{ color: COLORS.gray100 }}
          >
            <View style={[styles.contactIconWrapper, { backgroundColor: COLORS.softOrange }]}>
              <Phone size={18} color={COLORS.primary} />
            </View>
            <View style={styles.contactTextBlock}>
              <Text style={styles.contactLabel}>Phone</Text>
              <Text style={styles.contactValue}>+252 61 123 4567</Text>
            </View>
            <ChevronRight size={18} color={COLORS.gray400} />
          </Pressable>

          <View style={styles.contactDivider} />

          <Pressable
            style={styles.contactRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Linking.openURL("mailto:support@chinasuuq.com").catch(() => {});
            }}
            android_ripple={{ color: COLORS.gray100 }}
          >
            <View style={[styles.contactIconWrapper, { backgroundColor: "#EFF6FF" }]}>
              <Mail size={18} color={COLORS.info} />
            </View>
            <View style={styles.contactTextBlock}>
              <Text style={styles.contactLabel}>Email</Text>
              <Text style={styles.contactValue}>support@chinasuuq.com</Text>
            </View>
            <ChevronRight size={18} color={COLORS.gray400} />
          </Pressable>
        </View>

        {/* FAQ Section */}
        <View style={styles.faqCard}>
          <Text style={styles.faqCardTitle}>
            <HelpCircle size={16} color={COLORS.primary} /> Frequently Asked Questions
          </Text>

          {FAQ_ITEMS.map((item, index) => (
            <React.Fragment key={index}>
              {index > 0 && <View style={styles.faqDivider} />}
              <View style={styles.faqItem}>
                <Text style={styles.faqQuestion}>{item.q}</Text>
                <Text style={styles.faqAnswer}>{item.a}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>ChinaSuuq — Order from China to Somalia</Text>
          <Text style={styles.footerVersion}>v1.0.0</Text>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.warmWhite,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
  },
  scroll: {
    flex: 1,
  },
  whatsappCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    backgroundColor: "#ECFDF5",
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  whatsappIconWrapper: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.whatsapp,
    alignItems: "center",
    justifyContent: "center",
  },
  whatsappTextBlock: {
    flex: 1,
  },
  whatsappTitle: {
    fontSize: 15,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
    marginBottom: 2,
  },
  whatsappSubtitle: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    color: COLORS.gray600,
  },
  contactCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  contactCardTitle: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
    padding: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
  },
  contactIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  contactTextBlock: {
    flex: 1,
  },
  contactLabel: {
    fontSize: 14,
    fontFamily: FONTS.medium,
    color: COLORS.black,
  },
  contactValue: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  contactDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: SPACING.lg + 36 + SPACING.md,
  },
  faqCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  faqCardTitle: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
    padding: SPACING.lg,
    paddingBottom: SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  faqItem: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  faqQuestion: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
    marginBottom: 4,
  },
  faqAnswer: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    lineHeight: 19,
  },
  faqDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: SPACING.lg,
  },
  footer: {
    alignItems: "center",
    paddingTop: SPACING.xxl,
    paddingBottom: SPACING.lg,
  },
  footerText: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  footerVersion: {
    fontSize: 11,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
  },
});