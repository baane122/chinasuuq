import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import {
  ChevronRight,
  Search,
  Link2,
  Store,
  TrendingUp,
  Sparkles,
  Globe,
  Languages,
  Shield,
  Clock,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { FloatingCartButton } from "@/components/cart/FloatingCartButton";
import {
  MARKETPLACES,
  detectMarketplaceFromUrl,
  getRecentlyVisited,
  addRecentlyVisited,
  type Marketplace,
  type MarketplaceId,
} from "@/lib/marketplaces";
import { FadeIn } from "@/components/animations/FadeIn";

export default function MarketsTab() {
  const { locale } = useI18n();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState("");
  const [smartHint, setSmartHint] = useState<MarketplaceId | null>(null);
  const [recent, setRecent] = useState<Marketplace[]>([]);
  const [recentLoaded, setRecentLoaded] = useState(false);

  // Load recently-visited marketplace shortcuts on mount
  useEffect(() => {
    (async () => {
      const visited = await getRecentlyVisited();
      setRecent(visited);
      setRecentLoaded(true);
    })();
  }, []);

  const isTablet = width >= 720;
  const numColumns = isTablet ? 2 : 1;

  const detected = useMemo(() => {
    if (!query.trim()) return null;
    return detectMarketplaceFromUrl(query);
  }, [query]);

  const handleSubmit = () => {
    if (!query.trim()) {
      // Just open the default 1688 if user pressed enter on empty
      openMarket("1688");
      return;
    }
    const m = detected || (query.toLowerCase().includes("taobao") ? "taobao" : null);
    if (m) {
      openMarket(m);
      return;
    }
    // Treat as a search term — open the default marketplace with the query
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openMarket("1688");
  };

  const openMarket = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Record the visit so it shows up in the Recent row next time
    addRecentlyVisited(id).then(() => {
      getRecentlyVisited().then(setRecent);
    });
    router.push({
      pathname: "/marketplace/[marketplace]",
      params: { marketplace: id, q: query || undefined },
    });
  };

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero */}
          <FadeIn delay={40}>
            <View style={styles.hero}>
              <View style={styles.heroTopRow}>
                <View style={styles.heroIcon}>
                  <Store size={20} color={COLORS.white} />
                </View>
                <View style={styles.heroTopCopy}>
                  <Text style={styles.heroEyebrow}>
                    {locale === "en" ? "CHINASUUQ MARKETS" : "SUUQYADA CHINASUUQ"}
                  </Text>
                  <Text style={styles.heroTitle}>
                    {locale === "en" ? "Find your next source" : "Hel meeshaada xigta"}
                  </Text>
                </View>
              </View>
              <Text style={styles.heroSub}>
                {locale === "en"
                  ? "Browse trusted Chinese marketplaces with one-tap translation, smart-capture, and a unified cart."
                  : "Ka dhex raadi suuqyada Shiinaha, turjun, qabso, oo ku dar hal gaari oo caqli leh."}
              </Text>
              <View style={styles.heroFeatureRow}>
                <View style={styles.heroFeature}>
                  <TrendingUp size={13} color={COLORS.primary} />
                  <Text style={styles.heroFeatureText}>
                    {locale === "en" ? "Live rate" : "Qiime toos ah"}
                  </Text>
                </View>
                <View style={styles.heroFeature}>
                  <Sparkles size={13} color={COLORS.primary} />
                  <Text style={styles.heroFeatureText}>
                    {locale === "en" ? "Smart capture" : "Qabasho caqli leh"}
                  </Text>
                </View>
                <View style={styles.heroFeature}>
                  <Languages size={13} color={COLORS.primary} />
                  <Text style={styles.heroFeatureText}>
                    {locale === "en" ? "Translate" : "Turjun"}
                  </Text>
                </View>
              </View>
            </View>
          </FadeIn>

          {/* Smart search / paste */}
          <FadeIn delay={120}>
            <View style={styles.searchCard}>
              <Search size={18} color={COLORS.textSecondary} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={(t) => {
                  setQuery(t);
                  setSmartHint(detectMarketplaceFromUrl(t));
                }}
                placeholder={locale === "en" ? "Search or paste a product link…" : "Raadi ama geli link alaab…"}
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
              />
              <TouchableOpacity
                style={styles.linkIcon}
                onPress={handleSubmit}
                hitSlop={8}
                accessibilityLabel={locale === "en" ? "Open link" : "Fur link"}
              >
                <Link2 size={16} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
            {smartHint || detected ? (
              <View style={styles.hintCard}>
                <Shield size={14} color={COLORS.success} />
                <Text style={styles.hintText}>
                  {locale === "en"
                    ? `Detected ${(detected || smartHint)?.toUpperCase()} — tap the link icon to browse`
                    : `${(detected || smartHint)?.toUpperCase()} waa la ogaaday — taabo summadda si aad u eegtid`}
                </Text>
              </View>
            ) : null}
          </FadeIn>

          {/* Recently-visited shortcuts */}
          {recentLoaded && recent.length > 0 && (
            <View style={styles.recentSection}>
              <View style={styles.recentHeader}>
                <Clock size={14} color={COLORS.primary} />
                <Text style={styles.recentLabel}>
                  {locale === "en" ? "Recently visited" : "Dhowaan la booqday"}
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.recentRow}
                keyboardShouldPersistTaps="handled"
              >
                {recent.map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.recentChip, { borderColor: m.brandColor + "55", backgroundColor: m.brandColor + "14" }]}
                    activeOpacity={0.8}
                    onPress={() => openMarket(m.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Recently visited ${m.name}`}
                  >
                    <Clock size={12} color={m.brandColor} />
                    <Text style={[styles.recentChipText, { color: m.brandColor }]} numberOfLines={1}>
                      {m.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Section label */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {locale === "en" ? "Choose a Marketplace" : "Dooro Suuq"}
            </Text>
            <Text style={styles.sectionHint}>
              {locale === "en" ? `${MARKETPLACES.length} trusted` : `${MARKETPLACES.length} la aamintay`}
            </Text>
          </View>

          {/* Marketplace grid */}
          <View style={[styles.grid, numColumns > 1 && styles.gridTablet]}>
            {MARKETPLACES.map((m, i) => (
              <FadeIn key={m.id} delay={120 + i * 60}>
                <TouchableOpacity
                  style={[styles.marketCard, numColumns > 1 && styles.marketCardTablet]}
                  activeOpacity={0.85}
                  onPress={() => openMarket(m.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Browse ${m.name} — ${locale === "en" ? m.tagline_en : m.tagline_so}`}
                  accessibilityHint={locale === "en" ? "Opens in-app marketplace browser" : "Wuxuu furayaa browser-ka suuqa"}
                >
                  <View
                    style={[styles.iconWrap, { borderColor: m.brandColor + "33" }]}
                  >
                    <Image
                      source={m.icon}
                      style={styles.marketIcon}
                      contentFit="contain"
                      transition={150}
                      cachePolicy="memory-disk"
                      accessibilityIgnoresInvertColors
                    />
                    {m.loginWalled ? (
                      <View style={styles.lockBadge}>
                        <Text style={styles.lockText}>
                          {locale === "en" ? "SHARED" : "WADAAG"}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.marketInfo}>
                    <View style={styles.marketNameRow}>
                      <Text style={styles.marketName}>{m.name}</Text>
                      <View style={[styles.statBadge, { backgroundColor: m.brandColor + "1A" }]}>
                        <Text style={[styles.statBadgeText, { color: m.brandColor }]}>
                          {locale === "en" ? m.stat_en : m.stat_so}
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
                  <View style={[styles.arrowWrap, { backgroundColor: m.brandColor }]}>
                    <ChevronRight size={20} color={COLORS.white} strokeWidth={2.6} />
                  </View>
                </TouchableOpacity>
              </FadeIn>
            ))}
          </View>

          {/* How it works */}
          <FadeIn delay={600}>
            <View style={styles.howCard}>
              <View style={styles.howIcon}>
                <Globe size={18} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.howTitle}>
                  {locale === "en" ? "How it works" : "Sida uu u shaqeeyo"}
                </Text>
                <Text style={styles.howDesc}>
                  {locale === "en"
                    ? "Tap a marketplace to open it inside ChinaSuuq. We auto-translate Chinese to English, smart-capture product details, and ship directly to your city."
                    : "Taabo suuq si aad ugu furto gudaha ChinaSuuq. Waanu u turjunnaa Shiinaha, qabanaa faahfaahinta, oo ku soo diraynaa magaaladaada."}
                </Text>
              </View>
            </View>
          </FadeIn>

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

  // Hero
  hero: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.md,
  },
  heroTopCopy: { flex: 1 },
  heroEyebrow: {
    fontSize: 10,
    fontFamily: FONTS.semibold,
    color: COLORS.primary,
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 20,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    letterSpacing: -0.3,
  },
  heroSub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
    marginBottom: SPACING.md,
  },
  heroFeatureRow: {
    flexDirection: "row",
    gap: SPACING.xs,
    flexWrap: "wrap",
  },
  heroFeature: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.gray50,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
  },
  heroFeatureText: {
    fontSize: 11,
    fontFamily: FONTS.semibold,
    color: COLORS.textSecondary,
  },

  // Search
  searchCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    height: 52,
    marginBottom: SPACING.sm,
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
  hintCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    backgroundColor: COLORS.successBg,
    borderRadius: RADIUS.pill,
    alignSelf: "flex-start",
    marginBottom: SPACING.md,
  },
  hintText: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
    color: "#065F46",
  },

  // Section
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.xs,
    marginTop: SPACING.xs,
  },
  sectionTitle: { fontSize: 17, fontFamily: FONTS.bold, color: COLORS.black },
  sectionHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontFamily: FONTS.medium,
  },

  // Grid
  grid: { gap: SPACING.md },
  gridTablet: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -SPACING.xs },
  marketCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: COLORS.white,
    borderRadius: 20,
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
  marketCardTablet: { width: "48%", marginHorizontal: "1%" },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.warmWhite,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    overflow: "hidden",
  },
  marketIcon: { width: 44, height: 44 },
  lockBadge: {
    position: "absolute",
    top: -4,
    right: -6,
    backgroundColor: COLORS.success,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  lockText: {
    color: COLORS.white,
    fontSize: 8,
    fontFamily: FONTS.bold,
    letterSpacing: 0.4,
  },
  marketInfo: { flex: 1 },
  marketNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    marginBottom: 3,
  },
  marketName: {
    fontSize: 17,
    fontFamily: FONTS.bold,
    color: COLORS.black,
  },
  statBadge: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  statBadgeText: {
    fontSize: 10,
    fontFamily: FONTS.semibold,
  },
  marketTagline: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: COLORS.black,
    marginBottom: 2,
  },
  marketDesc: { fontSize: 11, color: COLORS.textSecondary },
  arrowWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.black,
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  // How-it-works card
  howCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  howIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.softOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  howTitle: {
    fontSize: 14,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    marginBottom: 2,
  },
  howDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 17,
  },

  // Recently-visited shortcuts
  recentSection: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.xs,
  },
  recentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: SPACING.md,
  },
  recentLabel: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
    color: COLORS.textSecondary,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  recentRow: {
    gap: SPACING.sm,
    paddingRight: SPACING.lg,
  },
  recentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 38,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  recentChipText: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
    maxWidth: 120,
  },
});
