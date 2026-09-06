import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, RotateCcw, CheckCircle, Clock, MessageCircle } from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";

export default function ReturnsScreen() {
  const { locale } = useI18n();
  const router = useRouter();

  const steps = locale === "en" ? [
    { num: "1", title: "Contact Support", desc: "Message us on WhatsApp within 7 days of delivery with your order ID and reason for return." },
    { num: "2", title: "Provide Evidence", desc: "Share photos or videos showing the issue with the product (damage, wrong item, etc.)." },
    { num: "3", title: "Get Approval", desc: "Our team reviews your request within 24 hours and provides return instructions." },
    { num: "4", title: "Return Item", desc: "Ship the item back using the provided return address. Return shipping is covered for damaged items." },
    { num: "5", title: "Receive Refund", desc: "After inspection (3-5 days), your refund is processed to your original payment method." },
  ] : [
    { num: "1", title: "La xiriir Taageerada", desc: "Noo soo dir WhatsApp gudaha 7 maalmood ka dib gaarsiinta ID-ga dalabka iyo sababta dib-u-celinta." },
    { num: "2", title: "Sii Caddeyn", desc: "Soo dhig sawiro ama muuqaal muujinaya dhibta alaabta (dhaawac, alaab qaldan, iwm)." },
    { num: "3", title: "Hel Ogolaanshaha", desc: "Kooxdayadu waxay dib u eegaan codsagaaga gudaha 24 saacadood waxayna bixiyaan tilaabooyin dib-u-celin." },
    { num: "4", title: "Celi Alaabta", desc: "Dir alaabta dib u gelinta cinwaanka la bixiyay. Rarka dib-u-celinta waa la daboolayaa alaabta dhaawacan." },
    { num: "5", title: "Hel Lacag-celinta", desc: "Ka dib hubinta (3-5 maalmood), lacag-celintaada waxaa loo qaabeynayaa habka lacag-bixinta asalka." },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={COLORS.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{locale === "en" ? "Returns Policy" : "Siyaasadda Dib-u-celinta"}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroSection}>
          <RotateCcw size={48} color={COLORS.primary} />
          <Text style={styles.heroTitle}>{locale === "en" ? "Easy Returns" : "Dib-u-celin Fudud"}</Text>
          <Text style={styles.heroSub}>{locale === "en" ? "7-day return window for all orders" : "Fasax dib-u-celin 7 maalmood ah"}</Text>
        </View>

        {/* Policy highlights */}
        <View style={styles.highlightRow}>
          <View style={styles.highlightCard}>
            <Clock size={24} color={COLORS.primary} />
            <Text style={styles.highlightTitle}>{locale === "en" ? "7 Days" : "7 Maalmood"}</Text>
            <Text style={styles.highlightDesc}>{locale === "en" ? "Return window" : "Fasax dib-u-celin"}</Text>
          </View>
          <View style={styles.highlightCard}>
            <CheckCircle size={24} color={COLORS.primary} />
            <Text style={styles.highlightTitle}>{locale === "en" ? "Free" : "Bilaash"}</Text>
            <Text style={styles.highlightDesc}>{locale === "en" ? "For damaged items" : "Alaabta dhaawacan"}</Text>
          </View>
          <View style={styles.highlightCard}>
            <MessageCircle size={24} color={COLORS.primary} />
            <Text style={styles.highlightTitle}>24h</Text>
            <Text style={styles.highlightDesc}>{locale === "en" ? "Response time" : "Waqtiga jawaabta"}</Text>
          </View>
        </View>

        {/* Steps */}
        <Text style={styles.sectionLabel}>{locale === "en" ? "How to Return" : "Sida loo Celiyo"}</Text>
        {steps.map((s, i) => (
          <View key={i} style={styles.stepCard}>
            <View style={styles.stepNum}>
              <Text style={styles.stepNumText}>{s.num}</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>{s.title}</Text>
              <Text style={styles.stepDesc}>{s.desc}</Text>
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.ctaBtn} onPress={() => router.push("/support/index")}>
          <Text style={styles.ctaText}>{locale === "en" ? "Start a Return" : "Bilow Dib-u-celin"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: FONTS.bold, color: COLORS.black, textAlign: "center", marginRight: 44 },
  content: { padding: SPACING.lg, paddingBottom: 40 },
  heroSection: { alignItems: "center", paddingVertical: SPACING.xxl },
  heroTitle: { fontSize: 22, fontFamily: FONTS.bold, color: COLORS.black, marginTop: SPACING.md },
  heroSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: SPACING.xs },
  highlightRow: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.xl },
  highlightCard: { flex: 1, backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.md, alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  highlightTitle: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.black, marginTop: SPACING.sm },
  highlightDesc: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2, textAlign: "center" },
  sectionLabel: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.textSecondary, marginBottom: SPACING.md, textTransform: "uppercase", letterSpacing: 0.5 },
  stepCard: { flexDirection: "row", gap: SPACING.md, backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  stepNum: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  stepNumText: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.white },
  stepContent: { flex: 1 },
  stepTitle: { fontSize: 15, fontFamily: FONTS.semibold, color: COLORS.black },
  stepDesc: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4, lineHeight: 18 },
  ctaBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingVertical: SPACING.lg, alignItems: "center", marginTop: SPACING.lg },
  ctaText: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.white },
});
