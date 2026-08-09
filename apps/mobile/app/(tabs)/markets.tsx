import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { FloatingCartButton } from "@/components/cart/FloatingCartButton";

const { width: SCREEN_W } = Dimensions.get("window");

// Real brand logo
const LOGO = require("../../assets/images/logo.jpg");

// Real marketplace data with generated icons
const MARKETPLACES = [
  {
    id: "1688",
    name: "1688",
    desc_en: "Wholesale prices",
    desc_so: "Qiimo jumlo",
    icon: require("../../assets/marketplaces/1688.png"),
  },
  {
    id: "taobao",
    name: "Taobao",
    desc_en: "Millions of products",
    desc_so: "Malaayiin alaab",
    icon: require("../../assets/marketplaces/taobao.png"),
  },
  {
    id: "yiwugo",
    name: "YiwuGo",
    desc_en: "Direct trade access",
    desc_so: "Ganacsi toos ah",
    icon: require("../../assets/marketplaces/yiwugo.png"),
  },
];

export default function MarketsTab() {
  const { t, locale } = useI18n();
  const router = useRouter();

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header with real logo */}
          <View style={styles.headerRow}>
            <Image source={LOGO} style={styles.headerLogo} resizeMode="contain" />
          </View>

          {/* Title */}
          <Text style={styles.title}>
            {locale === "en" ? "Select Marketplace" : "Dooro Suuq"}
          </Text>
          <Text style={styles.subtitle}>
            {locale === "en"
              ? "Compare and order from top Chinese platforms"
              : "Isbarbardhig oo ka dalbo platform-yada Shiinaha"}
          </Text>

          {/* Marketplace Cards — matching reference exactly */}
          {MARKETPLACES.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={styles.marketCard}
              activeOpacity={0.85}
              onPress={() =>
                router.push({
                  pathname: "/marketplace/[marketplace]",
                  params: { marketplace: m.id },
                })
              }
            >
              <Image source={m.icon} style={styles.marketIconImg} resizeMode="contain" />
              <View style={styles.marketInfo}>
                <Text style={styles.marketName}>{m.name}</Text>
                <Text style={styles.marketDesc}>
                  {locale === "en" ? m.desc_en : m.desc_so}
                </Text>
              </View>
              <View style={styles.arrowWrap}>
                <Text style={styles.arrowText}>›</Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* CTA Button */}
          <TouchableOpacity style={styles.ctaBtn} activeOpacity={0.85}>
            <Text style={styles.ctaText}>
              {locale === "en" ? "Find the best price before ordering" : "Hel qiimaha ugu fiican ka hor intaadan dalban"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
        <FloatingCartButton />
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  scroll: { padding: SPACING.lg },

  headerRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: SPACING.xxl,
  },
  headerLogo: { width: 140, height: 48 },

  title: {
    fontSize: 28, fontFamily: FONTS.bold, color: COLORS.black, letterSpacing: -0.5, marginBottom: 6,
  },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginBottom: SPACING.xxl, lineHeight: 20 },

  // Marketplace cards — matching reference exactly
  marketCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: COLORS.white, borderRadius: 18,
    padding: 18, marginBottom: 14,
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: COLORS.black, shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  marketIconImg: {
    width: 60, height: 60, borderRadius: 16,
  },
  marketInfo: { flex: 1 },
  marketName: { fontSize: 20, fontFamily: FONTS.bold, color: COLORS.black, marginBottom: 2 },
  marketDesc: { fontSize: 13, color: COLORS.textSecondary },
  arrowWrap: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary,
    alignItems: "center", justifyContent: "center",
  },
  arrowText: { fontSize: 22, fontFamily: FONTS.bold, color: COLORS.white },

  // CTA
  ctaBtn: {
    backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 18, alignItems: "center",
    marginTop: 10, shadowColor: COLORS.primary, shadowOpacity: 0.3, shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  ctaText: { color: COLORS.white, fontSize: 16, fontFamily: FONTS.semibold },
});
