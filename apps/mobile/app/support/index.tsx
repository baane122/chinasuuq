import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  Alert,
  TextInput,
  ActivityIndicator,
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
  Send,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { WHATSAPP_LINK } from "@/lib/constants";
import { useI18n } from "@/lib/i18n";
import { createSupportTicket } from "@/db";
import { useAuthStore } from "@/store/auth";

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
  const authUser = useAuthStore((s) => s.user);

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const openWhatsApp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(WHATSAPP_LINK).catch(() => {
      Alert.alert("Error", "Could not open WhatsApp. Please make sure it's installed.");
    });
  };

  const handleSubmitTicket = async () => {
    if (submitting) return;
    if (!subject.trim() || !message.trim()) {
      Alert.alert("Missing info", "Please enter both a subject and a message.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSubmitting(true);
    try {
      const result = await createSupportTicket(
        { subject, message },
        authUser?.id ?? null
      );
      if (result.ok) {
        Alert.alert("Ticket submitted", "Our support team will get back to you shortly.");
        setSubject("");
        setMessage("");
      } else {
        Alert.alert("Could not submit", result.error || "Please try again later.");
      }
    } finally {
      setSubmitting(false);
    }
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

        {/* Contact / Submit Ticket Form */}
        <View style={styles.ticketCard}>
          <View style={styles.ticketHeader}>
            <View style={styles.ticketIconWrap}>
              <Send size={18} color={COLORS.primary} />
            </View>
            <View>
              <Text style={styles.ticketTitle}>Submit a Support Ticket</Text>
              <Text style={styles.ticketSubtitle}>
                We'll reply to your request via email or WhatsApp
              </Text>
            </View>
          </View>

          <Text style={styles.inputLabel}>Subject</Text>
          <TextInput
            style={styles.input}
            value={subject}
            onChangeText={setSubject}
            placeholder="What is this about?"
            placeholderTextColor={COLORS.textMuted}
            maxLength={120}
          />

          <Text style={styles.inputLabel}>Message</Text>
          <TextInput
            style={[styles.input, styles.messageInput]}
            value={message}
            onChangeText={setMessage}
            placeholder="Describe your issue in a few sentences…"
            placeholderTextColor={COLORS.textMuted}
            multiline
            textAlignVertical="top"
            maxLength={2000}
          />

          <Pressable
            style={({ pressed }) => [
              styles.submitButton,
              pressed && { opacity: 0.85 },
              submitting && { opacity: 0.7 },
            ]}
            onPress={handleSubmitTicket}
            disabled={submitting}
            android_ripple={{ color: COLORS.primaryDark }}
          >
            {submitting ? (
              <ActivityIndicator color={COLORS.white} size="small" />
            ) : (
              <>
                <Send size={16} color={COLORS.white} />
                <Text style={styles.submitButtonText}>Submit Ticket</Text>
              </>
            )}
          </Pressable>
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
  // Contact / Submit Ticket form
  ticketCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  ticketHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  ticketIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.softOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  ticketTitle: {
    fontSize: 15,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
  },
  ticketSubtitle: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  inputLabel: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  input: {
    backgroundColor: COLORS.warmWhite,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.black,
    minHeight: 44,
    marginBottom: SPACING.md,
  },
  messageInput: {
    minHeight: 96,
    paddingTop: SPACING.md,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.pill,
    minHeight: 48,
    marginTop: SPACING.xs,
  },
  submitButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontFamily: FONTS.semibold,
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