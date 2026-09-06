import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  ExternalLink,
  Shield,
  FileText,
  Package,
  Globe,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";

export default function AboutScreen() {
  const { t, locale } = useI18n();
  const router = useRouter();

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
          {locale === "en" ? "About ChinaSuuq" : "ChinaSuuq HORTA"}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* App Logo / Brand */}
        <View style={styles.brandCard}>
          <View style={styles.logoWrap}>
            <Text style={styles.logoText}>CS</Text>
          </View>
          <Text style={styles.appName}>ChinaSuuq</Text>
          <Text style={styles.version}>Version 1.0.0</Text>
        </View>

        {/* Mission Statement */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Globe size={18} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>
              {locale === "en" ? "Our Mission" : "Hawsha Noo"}
            </Text>
          </View>
          <Text style={styles.bodyText}>
            {locale === "en"
              ? "ChinaSuuq is the easiest way for Somali businesses and individuals to source products directly from China. We bridge the gap between Chinese manufacturers and Somali buyers, offering transparent pricing, reliable shipping, and dedicated support — all from your phone."
              : "ChinaSuuq waa habka ugu fudud ee ganacsatada iyo dadweynaha Soomaaliyeed ay ku heli karaan alaabta tooska ah Shiinaha. Waxaan xidhidhimo u nahay warshadaha Shiinaha iyo iibiyayaasha Soomaaliyeed, oo aan bixinno qiimo daahfuran, rar wax ku ool ah, iyo taageero go'an — dhammaan taleefankaaga."}
          </Text>
        </View>

        {/* What We Do */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            {locale === "en" ? "What We Offer" : "Waa Maxay Aannu Bixinno"}
          </Text>

          <View style={styles.featureRow}>
            <View style={styles.featureIconWrap}>
              <Package size={18} color={COLORS.primary} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureLabel}>
                {locale === "en" ? "1688, Taobao & YiwuGo Access" : "Galinta 1688, Taobao & YiwuGo"}
              </Text>
              <Text style={styles.featureDesc}>
                {locale === "en"
                  ? "Millions of products from verified Chinese suppliers"
                  : "Malaayiin alaab ah oo ka yimid dhaamisayaal Shiineese ah oo la xaqiijiyay"}
              </Text>
            </View>
          </View>

          <View style={styles.featureRow}>
            <View style={styles.featureIconWrap}>
              <Package size={18} color={COLORS.primary} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureLabel}>
                {locale === "en" ? "Air & Sea Shipping" : "Rarka Hawada & Badda"}
              </Text>
              <Text style={styles.featureDesc}>
                {locale === "en"
                  ? "Fast air freight (7–14 days) or affordable sea freight (25–35 days)"
                  : "Rarka dhakhso leh (7-14 maalmood) ama rarka jaban (25-35 maalmood)"}
              </Text>
            </View>
          </View>

          <View style={styles.featureRow}>
            <View style={styles.featureIconWrap}>
              <Shield size={18} color={COLORS.primary} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureLabel}>
                {locale === "en" ? "Secure Payments" : "Lacag Bixinta Ammaanka"}
              </Text>
              <Text style={styles.featureDesc}>
                {locale === "en"
                  ? "ZAAD, Edahab, EVC Plus, Sahal, and bank transfers"
                  : "ZAAD, Edahab, EVC Plus, Sahal, iyo kuwareejinta bangiga"}
              </Text>
            </View>
          </View>
        </View>

        {/* Team */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            {locale === "en" ? "Our Team" : "Kooxdayada"}
          </Text>
          <Text style={styles.bodyText}>
            {locale === "en"
              ? "ChinaSuuq was founded by a team of entrepreneurs who understand both Chinese supply chains and the Somali market. With offices in both China and Somalia, we ensure smooth operations from sourcing to doorstep delivery."
              : "ChinaSuuq waxaa aasaasay kood ganacsato ah oo fahmaya xidhiidhada Shiinaha iyo suuqa Soomaaliyeed. Xafiisyo ku leh labada Shiinaha iyo Soomaaliya, waxaan hubinnaa hawlgallo qurux badan laga bilaabo raadinta ilaa gaarsiinta albaabka."}
          </Text>
        </View>

        {/* Legal Links */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            {locale === "en" ? "Legal" : "Sharciga"}
          </Text>

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/profile/terms");
            }}
          >
            <FileText size={18} color={COLORS.textSecondary} />
            <Text style={styles.linkLabel}>
              {locale === "en" ? "Terms of Service" : "Shuruudaha Adeegga"}
            </Text>
            <ExternalLink size={16} color={COLORS.gray400} />
          </TouchableOpacity>

          <View style={styles.linkDivider} />

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/profile/privacy");
            }}
          >
            <Shield size={18} color={COLORS.textSecondary} />
            <Text style={styles.linkLabel}>
              {locale === "en" ? "Privacy Policy" : "Siyaasadda Arrimaha Gaarka"}
            </Text>
            <ExternalLink size={16} color={COLORS.gray400} />
          </TouchableOpacity>

          <View style={styles.linkDivider} />

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Linking.openURL("https://chinasuuq.com").catch(() => {});
            }}
          >
            <Globe size={18} color={COLORS.textSecondary} />
            <Text style={styles.linkLabel}>chinasuuq.com</Text>
            <ExternalLink size={16} color={COLORS.gray400} />
          </TouchableOpacity>
        </View>

        {/* Copyright */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>© 2025 ChinaSuuq</Text>
          <Text style={styles.footerSubtext}>
            {locale === "en"
              ? "All rights reserved"
              : "Dhammaan xuquuqudu way leeyihiin"}
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

  // Brand
  brandCard: {
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.xxl,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.lg,
  },
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
  },
  logoText: {
    fontSize: 28,
    fontFamily: FONTS.bold,
    color: COLORS.white,
  },
  appName: {
    fontSize: 22,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    marginBottom: 4,
  },
  version: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
  },

  // Sections
  sectionCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
    marginBottom: SPACING.sm,
  },
  bodyText: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },

  // Features
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.softOrange,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  featureText: { flex: 1 },
  featureLabel: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },

  // Legal links
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  linkLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: FONTS.medium,
    color: COLORS.black,
  },
  linkDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 18 + SPACING.md,
  },

  // Footer
  footer: {
    alignItems: "center",
    paddingTop: SPACING.xxl,
    paddingBottom: SPACING.lg,
  },
  footerText: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  footerSubtext: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
  },
});
