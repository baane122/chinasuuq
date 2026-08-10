import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ChevronRight,
  Search,
  Link2,
  Store,
  TrendingUp,
  Sparkles,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { FloatingCartButton } from "@/components/cart/FloatingCartButton";

const { width: SCREEN_W } = Dimensions.get("window");

// Real marketplace data with generated icons
const MARKETPLACES = [
  {
    id: "1688",
    name: "1688",
    tagline_en: "China's #1 wholesale & factories",
    tagline_so: "Jumlada & warshadaha Shiinaha",
    desc_en: "Factory-direct, bulk-friendly pricing",
    desc_so: "Qiimo jumlo oo toos u ah",
    icon: require("../../assets/marketplaces/1688.png"),
    stat: { en: "50M+ items", so: "50M+ alaab" },
  },
  {
    id: "taobao",
    name: "Taobao",
    tagline_en: "Retail giant — widest selection",
    tagline_so: "Ganacsiga ugu weyn",
    desc_en: "Trending consumer goods, single items",
    desc_so: "Alaab caan ah, hal shay",
    icon: require("../../assets/marketplaces/taobao.png"),
    stat: { en: "100M+ items", so: "100M+ alaab" },
  },
  {
    id: "yiwugo",
    name: "YiwuGo",
    tagline_en: "Gateway to Yiwu Trade City",
    tagline_so: "Iridda Suuqa Yiwu",
    desc_en: "World's largest small-commodities market",
    desc_so: "Suuqa yaryar ee ugu weyn",
    icon: require("../../assets/marketplaces/yiwugo.png"),
    stat: { en: "5M+ items", so: "5M+ alaab" },
  },
];

export default function MarketsTab() {
  const { locale } = useI18n();
  const router = useRouter();
  const [query, setQuery] = React.useState("");

  const openMarket = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/marketplace/[marketplace]",
      params: { marketplace: id },
    });
  };

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* ── Dark Hero Band (no logo, strong brand) ── */}
          <View style={styles.hero}>
            <Text style={styles.heroEyebrow}>
              {locale === "en" ? "MARKETPLACES" : "SUUQYADA"}
            </Text>
            <Text style={styles.heroTitle}>
              {locale === "en" ? "Shop China's\nTop Platforms" : "Ka Dalbo\nSuuqyada Koowaad"}
            </Text>
            <Text style={styles.heroSub}>
              {locale === "en"
                ? "One cart. Multiple marketplaces. Stress-free sourcing from China to Somalia."
                : "Hal gaari. Suuqyo badan. Raadinta caajis la'aan ah Shiinaha ilaa Soomaaliya."}
            </Text>

            {/* Feature pills */}
            <View style={styles.pillRow}>
              <View style={styles.pill}>
                <TrendingUp size={14} color={COLORS.white} />
                <Text style={styles.pillText}>{locale === "en" ? "Live translate" : "Turjumo toos"} </Text>
              </View>
              <View style={styles.pill}>
                <Sparkles size={14} color={COLORS.white} />
                <Text style={styles.pillText}>{locale === "en" ? "CNY → USD" : "CNY → USD"}</Text>
              </View>
              <View style={styles.pill}>
                <Store size={14} color={COLORS.white} />
                <Text style={styles.pillText}>{locale === "en" ? "Smart capture" : "Qabsasho"}</Text>
              </View>
            </View>
          </View>

          {/* ── Search / Paste Link ── */}
          <View style={styles.searchCard}>
            <Search size={18} color={COLORS.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder={locale === "en" ? "Search or paste a product link..." : "Raadi ama geli link alaab..."}
              placeholderTextColor={COLORS.textMuted}
              onSubmitEditing={() => openMarket("1688")}
            />
            <View style={styles.linkIcon}>
              <Link2 size={16} color={COLORS.primary} />
            </View>
          </View>

          {/* ── Section Label ── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {locale === "en" ? "Choose a Marketplace" : "Dooro Suuq"}
            </Text>
            <Text style={styles.sectionHint}>
              {locale === "en" ? "Tap to browse" : "Taabo si aad u eegtid"}
            </Text>
          </View>

          {/* ── Marketplace Cards ── */}
          {MARKETPLACES.map((m, i) => (
            <TouchableOpacity
              key={m.id}
              style={styles.marketCard}
              activeOpacity={0.88}
              onPress={() => openMarket(m.id)}
            >
              {/* Icon */}
              <View style={styles.marketIconWrap}>
                <Image source={m.icon} style={styles.marketIconImg} resizeMode="contain" />
              </View>

              {/* Info */}
              <View style={styles.marketInfo}>
                <View style={styles.marketNameRow}>
                  <Text style={styles.marketName}>{m.name}</Text>
                  <View style={styles.statBadge}>
                    <Text style={styles.statBadgeText}>
                      {locale === "en" ? m.stat.en : m.stat.so}
                    </Text>
                  </View>
                </View>
                <Text style={styles.marketTagline} numberOfLines={1}>
                  {locale === "en" ? m.tagline_en : m.tagline_so}
                </Text>
                <Text style={styles.marketDesc} numberOfLines={1}>
                  {locale === "en" ? m.desc_en : m.desc_so}
                </Text>
              </View>

              {/* Arrow */}
              <View style={[styles.arrowWrap, i === 1 && styles.arrowWrapDark]}>
                <ChevronRight size={20} color={COLORS.white} strokeWidth={3} />
              </View>
            </TouchableOpacity>
          ))}

          {/* ── Paste Link CTA ── */}
          <TouchableOpacity
            style={styles.pasteCard}
            activeOpacity={0.85}
            onPress={() => openMarket("1688")}
          >
            <View style={styles.pasteIcon}>
              <Link2 size={22} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pasteTitle}>
                {locale === "en" ? "Have a product link?" : "Link alaab ma haysaa?"}
              </Text>
              <Text style={styles.pasteSub}>
                {locale === "en" ? "Paste any 1688, Taobao or YiwuGo URL to import it" : "Geli URL kasta oo 1688, Taobao ama YiwuGo ah"}
              </Text>
            </View>
            <ChevronRight size={20} color={COLORS.primary} />
          </TouchableOpacity>

          {/* bottom spacer */}
          <View style={{ height: 110 }} />
        </ScrollView>
        <FloatingCartButton />
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  scroll: { padding: SPACING.lg },

  // Dark hero band
  hero: {
    backgroundColor: COLORS.darkSurface,
    borderRadius: 24,
    padding: SPACING.xl,
    paddingTop: SPACING.xxl,
    marginBottom: SPACING.lg,
    overflow: "hidden",
  },
  heroEyebrow: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
    color: COLORS.primary,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: SPACING.sm,
  },
  heroTitle: {
    fontSize: 30,
    fontFamily: FONTS.bold,
    color: COLORS.white,
    lineHeight: 36,
    letterSpacing: -0.5,
    marginBottom: SPACING.sm,
  },
  heroSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    lineHeight: 20,
    marginBottom: SPACING.lg,
    maxWidth: 300,
  },
  pillRow: { flexDirection: "row", gap: SPACING.sm, flexWrap: "wrap" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  pillText: { fontSize: 11, fontFamily: FONTS.semibold, color: COLORS.white },

  // Search card
  searchCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    height: 52,
    marginBottom: SPACING.xl,
    shadowColor: COLORS.black,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    marginLeft: SPACING.sm,
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.black,
  },
  linkIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.softOrange,
    alignItems: "center",
    justifyContent: "center",
  },

  // Section
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.xs,
  },
  sectionTitle: { fontSize: 18, fontFamily: FONTS.bold, color: COLORS.black },
  sectionHint: { fontSize: 12, color: COLORS.textSecondary, fontFamily: FONTS.medium },

  // Marketplace cards
  marketCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.black,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  marketIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.warmWhite,
    overflow: "hidden",
  },
  marketIconImg: { width: 60, height: 60, borderRadius: 16 },
  marketInfo: { flex: 1 },
  marketNameRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginBottom: 3 },
  marketName: { fontSize: 19, fontFamily: FONTS.bold, color: COLORS.black },
  statBadge: {
    backgroundColor: COLORS.softOrange,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  statBadgeText: { fontSize: 9, fontFamily: FONTS.semibold, color: COLORS.primary },
  marketTagline: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: COLORS.black,
    marginBottom: 2,
  },
  marketDesc: { fontSize: 12, color: COLORS.textSecondary },
  arrowWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  arrowWrapDark: { backgroundColor: COLORS.info },

  // Paste link CTA
  pasteCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: COLORS.softOrange,
    borderRadius: 18,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: "rgba(255,90,10,0.15)",
    marginTop: SPACING.xs,
  },
  pasteIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
  },
  pasteTitle: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.black, marginBottom: 2 },
  pasteSub: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 },
});
