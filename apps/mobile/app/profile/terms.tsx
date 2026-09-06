import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, FileText, Scale, Clock, AlertCircle } from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";

export default function TermsScreen() {
  const { locale } = useI18n();
  const router = useRouter();

  const sections = locale === "en" ? [
    { title: "1. Acceptance of Terms", content: "By using ChinaSuuq's services, you agree to these Terms of Service. If you do not agree, please do not use our platform. These terms apply to all users of our mobile application and website." },
    { title: "2. Order Process", content: "When you place an order through ChinaSuuq, we act as your procurement agent to source products from Chinese marketplaces (1688, Taobao, YiwuGo). Orders are subject to product availability and pricing at the time of purchase." },
    { title: "3. Pricing & Payments", content: "Prices displayed are estimates based on current exchange rates. Final prices are confirmed after order processing. Payment methods accepted include ZAAD, eDahab, EVC Plus, and Bank Transfer. Shipping costs are calculated based on weight and method." },
    { title: "4. Shipping & Delivery", content: "We offer Air Freight (7-14 days) and Sea Freight (25-35 days) from China to Somalia. Delivery times are estimates and may vary. We deliver to all major Somali cities including Mogadishu, Hargeisa, Bosaso, and Kismayo." },
    { title: "5. Returns & Refunds", content: "Returns are accepted within 7 days of delivery for damaged or incorrect items. Contact support via WhatsApp to initiate a return. Refunds are processed within 5-10 business days after inspection." },
    { title: "6. Limitation of Liability", content: "ChinaSuuq is not liable for delays caused by customs, shipping carriers, or marketplaces. Our liability is limited to the order value. We recommend purchasing insurance for high-value items." },
  ] : [
    { title: "1. Aqballida Shuruucda", content: "Isticmaalidda adeegyada ChinaSuuq, waxaad ku raacsan tahay Shuruucdan Adeega. Haddii aadan raacsanayn, fadlan ha isticmaalin shabakadayada." },
    { title: "2. Habka Dalabka", content: "Marka aad dalab ku samaynayso ChinaSuuq, waxaan u shaqaynaa wakiilka iibsashadaada si aan u helno alaabta suuqa Shiinaha (1688, Taobao, YiwuGo)." },
    { title: "3. Qiimaha & Lacag-bixinta", content: "Qiimaha la muujinayo waa qiyaaso ku salaysan heerka lacag-bixinta. Qiimaha kama dambaysta ah waa la xaqiijiyaa ka dib Processing dalabka." },
    { title: "4. Rarka & Gaarsiinta", content: "Waxaan bixinaa Rarka Hawada (7-14 maalmood) iyo Rarka Badda (25-35 maalmood) Shiinaha ilaa Soomaaliya. Waxaan gaarsiinaa magaalooyinka waaweyn." },
    { title: "5. Dib-u-celinta & Lacag-celinta", content: "Dib-u-celinta waa la aqbalayaa gudaha 7 maalmood ka dib gaarsiinta. La xiriir taageerada WhatsApp si aad u bilowdo dib-u-celinta." },
    { title: "6. Xaddidaadda Masuuliyadda", content: "ChinaSuuq ma aha masuul dibidhigida ka dib caqabadaha caymiska, raraayayaasha, ama suuqyada. Masuuliyadeenu waxay ku xaddidan tahay qiimaha dalabka." },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={COLORS.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{locale === "en" ? "Terms of Service" : "Shuruucda Adeega"}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroSection}>
          <Scale size={48} color={COLORS.primary} />
          <Text style={styles.heroTitle}>{locale === "en" ? "Terms of Service" : "Shuruucda Adeega"}</Text>
          <Text style={styles.heroSub}>{locale === "en" ? "Last updated: September 2026" : "Waxaa cusbooneysiisay: Sebtembar 2026"}</Text>
        </View>
        {sections.map((s, i) => (
          <View key={i} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{s.title}</Text>
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
  sectionTitle: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.black, marginBottom: SPACING.sm },
  sectionContent: { fontSize: 14, lineHeight: 22, color: COLORS.textSecondary },
});
