import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  Globe,
  TrendingUp,
  ShoppingCart,
  ShieldAlert,
  ChevronRight,
} from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { FloatingCartButton } from "@/components/cart/FloatingCartButton";

// Brand-faithful logo marks (letter-mark style like the real marketplaces)
function MarketplaceLogo({ id }: { id: string }) {
  if (id === "1688") {
    return (
      <LinearGradient
        colors={["#FF6600", "#FF3D00"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.logoBox}
      >
        <Text style={[styles.logoText, styles.logo1688]}>1688</Text>
      </LinearGradient>
    );
  }
  if (id === "taobao") {
    return (
      <LinearGradient
        colors={["#FF5000", "#FF7400"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.logoBox}
      >
        <Text style={[styles.logoText, styles.logoTao]}>淘</Text>
      </LinearGradient>
    );
  }
  // yiwugo
  return (
    <LinearGradient
      colors={["#1A8CFF", "#0052CC"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.logoBox}
    >
      <Text style={[styles.logoText, styles.logoYiwugo]}>YIWUGO</Text>
    </LinearGradient>
  );
}

const MARKETPLACES = [
  {
    id: "1688",
    name: "1688.com",
    tagline: "China's #1 wholesale & factory marketplace",
    desc: "Factory-direct pricing on millions of products. Browse fully inside ChinaSuuq — translate, convert, buy.",
    color: "#FF5000",
    status: "Works in-app",
    statusOk: true,
    accent: "direct",
    features: ["Live translation", "CNY → USD", "Smart Add to cart"],
  },
  {
    id: "taobao",
    name: "Taobao",
    tagline: "Retail giant — widest product selection",
    desc: "Taobao demands a one-time sign-in (WeChat/phone). We'll open it in your browser for that, then capture products here.",
    color: "#FF5000",
    status: "Sign-in needed",
    statusOk: false,
    accent: "external",
    features: ["One-time login", "Open in browser", "Smart capture"],
  },
  {
    id: "yiwugo",
    name: "YiwuGo",
    tagline: "Gateway to Yiwu International Trade City",
    desc: "The world's largest small-commodities market. Requires login for browsing — we open it externally, then you capture.",
    color: "#1A8CFF",
    status: "Sign-in needed",
    statusOk: false,
    accent: "external",
    features: ["One-time login", "Open in browser", "Smart capture"],
  },
];

export default function MarketsTab() {
  const { t } = useI18n();
  const router = useRouter();

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container} edges={["top"]}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>{t("markets.subtitle")}</Text>
          <Text style={styles.heroTitle}>{t("markets.title")}</Text>
          <Text style={styles.heroSub}>
            Seamless Chinese sourcing. Translate, convert & capture — all in one place.
          </Text>

          {/* 3-callout feature strip */}
          <View style={styles.strip}>
            <View style={styles.stripItem}>
              <Globe size={16} color={COLORS.primary} />
              <Text style={styles.stripText}>Live translate</Text>
            </View>
            <View style={styles.stripDot} />
            <View style={styles.stripItem}>
              <TrendingUp size={16} color={COLORS.primary} />
              <Text style={styles.stripText}>CNY → USD</Text>
            </View>
            <View style={styles.stripDot} />
            <View style={styles.stripItem}>
              <ShoppingCart size={16} color={COLORS.primary} />
              <Text style={styles.stripText}>Smart capture</Text>
            </View>
          </View>
        </View>

        {/* Marketplace cards */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        >
          {MARKETPLACES.map((market) => (
            <TouchableOpacity
              key={market.id}
              style={styles.card}
              activeOpacity={0.85}
              onPress={() =>
                router.push({
                  pathname: "/marketplace/[marketplace]",
                  params: { marketplace: market.id },
                })
              }
            >
              {/* Brand header row */}
              <View style={styles.cardHeader}>
                <MarketplaceLogo id={market.id} />
                <View style={styles.cardTitleWrap}>
                  <Text style={styles.cardName}>{market.name}</Text>
                  <Text style={styles.cardTagline} numberOfLines={1}>
                    {market.tagline}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    market.statusOk ? styles.statusOk : styles.statusWarn,
                  ]}
                >
                  {!market.statusOk && (
                    <ShieldAlert size={11} color={market.statusOk ? COLORS.success : COLORS.warning} />
                  )}
                  <Text
                    style={[
                      styles.statusText,
                      market.statusOk ? styles.statusTextOk : styles.statusTextWarn,
                    ]}
                  >
                    {market.status}
                  </Text>
                </View>
              </View>

              {/* Description */}
              <Text style={styles.cardDesc}>{market.desc}</Text>

              {/* Feature pills */}
              <View style={styles.featureRow}>
                {market.features.map((feat) => (
                  <View
                    key={feat}
                    style={[
                      styles.featureBadge,
                      market.accent === "external" && styles.featureBadgeAlt,
                    ]}
                  >
                    <Text
                      style={[
                        styles.featureText,
                        market.accent === "external" && styles.featureTextAlt,
                      ]}
                    >
                      {feat}
                    </Text>
                  </View>
                ))}
              </View>

              {/* CTA */}
              <View style={styles.ctaRow}>
                <Text style={styles.ctaText}>
                  {market.statusOk ? "Browse inside ChinaSuuq" : "Open & capture"}
                </Text>
                <ChevronRight size={18} color={COLORS.primary} />
              </View>
            </TouchableOpacity>
          ))}

          <View style={{ height: 110 }} />
        </ScrollView>
        <FloatingCartButton />
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  // Hero
  hero: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.white,
  },
  heroEyebrow: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
    color: COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  heroTitle: { fontSize: 26, fontFamily: FONTS.bold, color: COLORS.black, marginTop: 2 },
  heroSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 6, lineHeight: 19 },
  strip: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SPACING.md,
    backgroundColor: COLORS.softOrange,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    alignSelf: "flex-start",
  },
  stripItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  stripText: { fontSize: 12, fontFamily: FONTS.semibold, color: COLORS.primaryDark },
  stripDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: COLORS.primaryLight, marginHorizontal: SPACING.sm },

  // list + cards
  list: { padding: SPACING.lg },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: { flexDirection: "row", alignItems: "center" },
  logoBox: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.md,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  logoText: { color: COLORS.white, fontFamily: FONTS.bold },
  logo1688: { fontSize: 20, letterSpacing: -0.5 },
  logoTao: { fontSize: 30 },
  logoYiwugo: { fontSize: 12, letterSpacing: -0.2 },
  cardTitleWrap: { flex: 1 },
  cardName: { fontSize: 17, fontFamily: FONTS.bold, color: COLORS.black },
  cardTagline: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  statusOk: { backgroundColor: "#E8F8EF" },
  statusWarn: { backgroundColor: "#FFF4E5" },
  statusText: { fontSize: 11, fontFamily: FONTS.semibold },
  statusTextOk: { color: COLORS.success },
  statusTextWarn: { color: COLORS.warning },
  cardDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
    lineHeight: 19,
  },
  featureRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginTop: SPACING.md },
  featureBadge: {
    backgroundColor: COLORS.softOrange,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  featureBadgeAlt: { backgroundColor: COLORS.gray100 },
  featureText: { fontSize: 11, fontFamily: FONTS.semibold, color: COLORS.primary },
  featureTextAlt: { color: COLORS.textSecondary },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  ctaText: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONTS.semibold,
    color: COLORS.primary,
  },
});
