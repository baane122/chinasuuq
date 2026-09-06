import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Linking,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  ChevronDown,
  MessageCircle,
  Phone,
  Mail,
  ExternalLink,
  HelpCircle,
  Send,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { WHATSAPP_LINK } from "@/lib/constants";
import { useI18n } from "@/lib/i18n";

type FAQItem = {
  q_en: string;
  q_so: string;
  a_en: string;
  a_so: string;
};

const FAQ_ITEMS: FAQItem[] = [
  {
    q_en: "How do I place an order?",
    q_so: "Sideen u dalban karaa dalab?",
    a_en: "Browse products from 1688, Taobao, or YiwuGo, add them to your cart, and proceed to checkout. You'll receive a WhatsApp confirmation within minutes.",
    a_so: "Eeg alaabta 1688, Taobao, ama YiwuGo, ku dar karadaaga, oo aad u gudub bixinta. Waxaad heli doontaa xaqiijin WhatsApp daqiiqado gudahood.",
  },
  {
    q_en: "What shipping methods are available?",
    q_so: "Nooca rarka ee la heli karo waa kuu?",
    a_en: "We offer Air Freight (7–14 days) and Sea Freight (25–35 days). Shipping is paid upon arrival in Somalia. Air is faster but costs more; Sea is cheaper for bulk orders.",
    a_so: "Waxaan bixinaa Rarka Hawada (7-14 maalmood) iyo Rarka Badda (25-35 maalmood). Rarka waa la bixiyaa marka la gaaro Soomaaliya.",
  },
  {
    q_en: "What payment methods do you accept?",
    q_so: "Hababka lacag bixinta ee la aqbalayo waa kuwa?",
    a_en: "We accept ZAAD, Edahab, Premier Wallet, EVC Plus, Sahal, and Bank Transfer. All payments are processed securely.",
    a_so: "Waxaan aqbalnaa ZAAD, Edahab, Premier Wallet, EVC Plus, Sahal, iyo Bank Transfer. Lacag bixintu waa la diiwaan gelinayaa si ammaan ah.",
  },
  {
    q_en: "How can I track my order?",
    q_so: "Sideen u raadikaraa dalabkayga?",
    a_en: "Go to the Orders tab in your account. Each order has real-time tracking updates from purchase to delivery. You can also track via WhatsApp notifications.",
    a_so: "Ku tag tab-ka Dalabka ee akoonkaaga. Dalab kasta wuxuu leeyahay cusbooneysiin raadraac toos ah. Waxaad sidoo kale raadin kartaa WhatsApp.",
  },
  {
    q_en: "Can I return a product?",
    q_so: "Ma dib u CELIN karaa alaab?",
    a_en: "Returns are handled case by case. Contact us on WhatsApp within 7 days of delivery with your order number and photos of the issue. We'll guide you through the process.",
    a_so: "Dib u celintu waa loo maamulaa xaalad walba. La xiriir WhatsApp gudaha 7 maalmood ee soo raacda gaarsiinta oo leh nambarada dalabka iyo sawirada dhibaatooyinka.",
  },
  {
    q_en: "Do you ship to all cities in Somalia?",
    q_so: "Maad u dirtaa magaalooyinka Soomaaliya oo dhan?",
    a_en: "Yes, we ship to Mogadishu, Hargeisa, Bosaso, Kismayo, Baidoa, and all major cities across Somalia. Remote areas may have additional delivery time.",
    a_so: "Haa, waxaan u dirnaa Muqdisho, Hargeysa, Bosaso, Kismaayo, Baydhabo, iyo magaalooyiin kale oo waaweyn. Meelaha fog waxaa laga yaabaa inay ku qaadan waqti dheeraad.",
  },
  {
    q_en: "How long does shipping take?",
    q_so: "Iminka dheer ayay qaadanaysaa rarka?",
    a_en: "Air freight takes 7–14 days, Sea freight takes 25–35 days. Times may vary based on customs clearance and local delivery schedules.",
    a_so: "Rarka Hawada wuxuu qaadanayaa 7-14 maalmood, Rarka Badda wuxuu qaadanayaa 25-35 maalmood. Waqtigu wuu kala duwanaan karaa.",
  },
  {
    q_en: "What is the minimum order?",
    q_so: "Waa maxay dalabka ugu yar?",
    a_en: "There is no minimum order amount. You can order a single item or bulk quantities. Prices may be lower for bulk orders.",
    a_so: "Dalabka ugu yar ma jiro. Waxaad dalban kartaa hal alaab ama tirooyin badan. Qiimuhu wuu hooseeyaa marka tirooyin badan la dalbado.",
  },
];

export default function HelpScreen() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const openWhatsApp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(WHATSAPP_LINK).catch(() => {
      Alert.alert(
        locale === "en" ? "Error" : "Qalad",
        locale === "en"
          ? "Could not open WhatsApp. Please make sure it's installed."
          : "Ma furi karo WhatsApp. Fadlan hubi in la soo dajiyay."
      );
    });
  };

  const openPhone = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL("tel:+252611234567").catch(() => {});
  };

  const openEmail = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL("mailto:support@chinasuuq.com").catch(() => {});
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={8}
        >
          <ArrowLeft size={22} color={COLORS.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {locale === "en" ? "Help & FAQ" : "Caawimaad & Su'aalo"}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Contact Options */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            {locale === "en" ? "Contact Us" : "Nala Soo Xiriir"}
          </Text>
          <Text style={styles.sectionSubtitle}>
            {locale === "en"
              ? "We're here to help you 24/7"
              : "Waxaan halkan u joognaa inaan ku caawinno 24/7"}
          </Text>

          {/* WhatsApp */}
          <Pressable
            style={styles.contactRow}
            onPress={openWhatsApp}
            android_ripple={{ color: COLORS.gray100 }}
          >
            <View
              style={[
                styles.contactIconWrap,
                { backgroundColor: "#ECFDF5" },
              ]}
            >
              <MessageCircle size={20} color={COLORS.whatsapp} />
            </View>
            <View style={styles.contactTextBlock}>
              <Text style={styles.contactLabel}>WhatsApp</Text>
              <Text style={styles.contactValue}>
                {locale === "en" ? "Chat with us" : "Nagu la hadal"}
              </Text>
            </View>
            <ExternalLink size={16} color={COLORS.gray400} />
          </Pressable>

          <View style={styles.contactDivider} />

          {/* Phone */}
          <Pressable
            style={styles.contactRow}
            onPress={openPhone}
            android_ripple={{ color: COLORS.gray100 }}
          >
            <View
              style={[
                styles.contactIconWrap,
                { backgroundColor: COLORS.softOrange },
              ]}
            >
              <Phone size={20} color={COLORS.primary} />
            </View>
            <View style={styles.contactTextBlock}>
              <Text style={styles.contactLabel}>
                {locale === "en" ? "Phone" : "Telefoon"}
              </Text>
              <Text style={styles.contactValue}>+252 61 123 4567</Text>
            </View>
            <ExternalLink size={16} color={COLORS.gray400} />
          </Pressable>

          <View style={styles.contactDivider} />

          {/* Email */}
          <Pressable
            style={styles.contactRow}
            onPress={openEmail}
            android_ripple={{ color: COLORS.gray100 }}
          >
            <View
              style={[
                styles.contactIconWrap,
                { backgroundColor: COLORS.infoBg },
              ]}
            >
              <Mail size={20} color={COLORS.info} />
            </View>
            <View style={styles.contactTextBlock}>
              <Text style={styles.contactLabel}>Email</Text>
              <Text style={styles.contactValue}>support@chinasuuq.com</Text>
            </View>
            <ExternalLink size={16} color={COLORS.gray400} />
          </Pressable>
        </View>

        {/* Support Ticket Link */}
        <Pressable
          style={styles.ticketLinkCard}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/support/index");
          }}
          android_ripple={{ color: COLORS.gray100 }}
        >
          <View style={styles.ticketLinkIconWrap}>
            <Send size={18} color={COLORS.primary} />
          </View>
          <View style={styles.ticketLinkText}>
            <Text style={styles.ticketLinkTitle}>
              {locale === "en" ? "Submit a Support Ticket" : "Gudbi Tikidh Taageero"}
            </Text>
            <Text style={styles.ticketLinkSubtitle}>
              {locale === "en"
                ? "Get help with orders, payments, or shipping"
                : "Hel caawimaad dalabka, lacag bixinta, ama rarka"}
            </Text>
          </View>
          <ChevronDown
            size={18}
            color={COLORS.gray400}
            style={{ transform: [{ rotate: "-90deg" }] }}
          />
        </Pressable>

        {/* FAQ Accordion */}
        <View style={styles.faqCard}>
          <Text style={styles.faqCardTitle}>
            <HelpCircle size={16} color={COLORS.primary} />{" "}
            {locale === "en"
              ? "Frequently Asked Questions"
              : "Su'aalaha Badanaa La Isweydiiyo"}
          </Text>

          {FAQ_ITEMS.map((item, index) => {
            const isExpanded = expandedIndex === index;
            return (
              <View key={index}>
                <Pressable
                  style={styles.faqItem}
                  onPress={() => toggleFaq(index)}
                  android_ripple={{ color: COLORS.gray50 }}
                >
                  <Text
                    style={styles.faqQuestion}
                    numberOfLines={isExpanded ? undefined : 2}
                  >
                    {locale === "en" ? item.q_en : item.q_so}
                  </Text>
                  <ChevronDown
                    size={18}
                    color={COLORS.gray400}
                    style={[
                      styles.faqChevron,
                      isExpanded && styles.faqChevronOpen,
                    ]}
                  />
                </Pressable>
                {isExpanded && (
                  <View style={styles.faqAnswerWrap}>
                    <Text style={styles.faqAnswer}>
                      {locale === "en" ? item.a_en : item.a_so}
                    </Text>
                  </View>
                )}
                {index < FAQ_ITEMS.length - 1 && (
                  <View style={styles.faqDivider} />
                )}
              </View>
            );
          })}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>ChinaSuuq</Text>
          <Text style={styles.footerSubtext}>
            {locale === "en"
              ? "Order from China to Somalia"
              : "Dalabka Shiinaha ilaa Soomaaliya"}
          </Text>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
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
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    textAlign: "center",
    marginRight: 44,
  },
  content: { padding: SPACING.lg },

  // Contact section
  sectionCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  contactIconWrap: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  contactTextBlock: { flex: 1 },
  contactLabel: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
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
    marginLeft: 40 + SPACING.md,
  },

  // Support ticket link
  ticketLinkCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.lg,
    gap: SPACING.md,
  },
  ticketLinkIconWrap: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.softOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  ticketLinkText: { flex: 1 },
  ticketLinkTitle: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
  },
  ticketLinkSubtitle: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  // FAQ accordion
  faqCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    marginBottom: SPACING.lg,
  },
  faqCardTitle: {
    fontSize: 15,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
    padding: SPACING.lg,
    paddingBottom: SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  faqItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 14,
    fontFamily: FONTS.medium,
    color: COLORS.black,
    lineHeight: 20,
  },
  faqChevron: {
    transform: [{ rotate: "0deg" }],
  },
  faqChevronOpen: {
    transform: [{ rotate: "180deg" }],
  },
  faqAnswerWrap: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.gray50,
    marginHorizontal: SPACING.md,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.sm,
  },
  faqAnswer: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    lineHeight: 20,
    paddingVertical: SPACING.md,
  },
  faqDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: SPACING.lg,
  },

  // Footer
  footer: {
    alignItems: "center",
    paddingTop: SPACING.xxl,
    paddingBottom: SPACING.lg,
  },
  footerText: {
    fontSize: 14,
    fontFamily: FONTS.bold,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  footerSubtext: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
  },
});
