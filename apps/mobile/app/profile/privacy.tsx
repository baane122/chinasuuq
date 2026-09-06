import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Shield, Globe, Lock, Eye } from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";

export default function PrivacyScreen() {
  const { locale } = useI18n();
  const router = useRouter();

  const sections = locale === "en" ? [
    { title: "Information We Collect", icon: Eye, content: "We collect information you provide directly, including your name, phone number, email address, and delivery addresses when you create an account or place an order. We also collect device information and usage data to improve our services." },
    { title: "How We Use Your Information", icon: Globe, content: "Your information is used to process orders, communicate with you about your orders, improve our services, send promotional offers (with your consent), and ensure the security of our platform." },
    { title: "Data Security", icon: Shield, content: "We implement industry-standard security measures to protect your personal information. All payment data is encrypted, and we use Supabase for secure data storage with row-level security policies." },
    { title: "Third-Party Sharing", icon: Lock, content: "We share your information only with necessary third parties: shipping carriers for delivery, payment processors for transactions, and marketplace partners (1688, Taobao) for order fulfillment. We never sell your personal data." },
    { title: "Your Rights", icon: Eye, content: "You have the right to access, correct, or delete your personal data. You can manage your data through the app settings or contact our support team. We respond to data requests within 30 days." },
  ] : [
    { title: "Macluumaadka aan ururinno", icon: Eye, content: "Waxaan ururinaa macluumaadka aad si toos ah noo siiso, oo ay ku jiraan magacaaga, numberka taleefanka, cinwaanka iimaylka, iyo cinwaanada gaarsiinta marka aad akoon samaynayso ama dalab samaynayso." },
    { title: "Sida aan u isticmaalno", icon: Globe, content: "Macluumaadkaaga waxaa loo isticmaalaa in lagu gudbiyo dalabka, lala xiriirko dalabka, hagaajiyo adeegyada, soo diro dalabyo (ogolaanshahaaga), iyo in lagu hubiyo amniga shabakadayada." },
    { title: "Amniga Xogta", icon: Shield, content: "Waxaan implementing tallaabooyin amni oo heer-sare ah si loo ilaaliyo macluumaadkaaga shakhsiga. Dhammaan xogta lacag-bixintu waa la xardhayaa, waxaan isticmaalnaa Supabase amniga xogta." },
    { title: "La wadaagida dhinaca saddexaad", icon: Lock, content: "Macluumaadkaaga waxaan la wadaagnaa kaliya dhinacyada loo baahan yahay: shirkadaha gaarsiinta, hababka lacag-bixinta, iyo lamaanaha suuqa. Siyaasadeena ma iibinayso macluumaadkaaga." },
    { title: "Xaquuqdaada", icon: Eye, content: "Waxaa lagu leedahay xaqa aad ku arki karto, wax ka beddeli karto, ama tirtiri karto macluumaadkaaga. Waxaad ku maamuli kartaa goobta app-ka ama nala soo xiriir." },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={COLORS.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{locale === "en" ? "Privacy Policy" : "Siyaasadda Arrimaha Gaarka"}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroSection}>
          <Shield size={48} color={COLORS.primary} />
          <Text style={styles.heroTitle}>{locale === "en" ? "Your Privacy Matters" : "Arrimaha Gaarkaaga muhiim yihiin"}</Text>
          <Text style={styles.heroSub}>{locale === "en" ? "Last updated: September 2026" : "Waxaa cusbooneysiisay: Sebtembar 2026"}</Text>
        </View>
        {sections.map((s, i) => (
          <View key={i} style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <s.icon size={20} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>{s.title}</Text>
            </View>
            <Text style={styles.sectionContent}>{s.content}</Text>
          </View>
        ))}
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
  heroSection: { alignItems: "center", paddingVertical: SPACING.xxl, marginBottom: SPACING.lg },
  heroTitle: { fontSize: 22, fontFamily: FONTS.bold, color: COLORS.black, marginTop: SPACING.md },
  heroSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: SPACING.xs },
  sectionCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginBottom: SPACING.md },
  sectionTitle: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.black },
  sectionContent: { fontSize: 14, lineHeight: 22, color: COLORS.textSecondary },
});
