import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { MapPin, ShoppingCart, Languages, ChevronDown, ChevronRight, ArrowUpRight } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { FloatingCartButton } from "@/components/cart/FloatingCartButton";
import { MARKETPLACES, addRecentlyVisited, type MarketplaceId } from "@/lib/marketplaces";
import { useCartStore } from "@/store/cart";

// Evidence-based best-use labels
const BEST_USE: Record<MarketplaceId, { en: string; so: string }> = {
  "1688": { en: "Wholesale", so: "Jumlo" },
  taobao: { en: "Retail", so: "Retail" },
  yiwugo: { en: "Small Commodities", so: "Alaab Yaryar" },
  alibaba: { en: "B2B Trade", so: "Ganacsiga B2B" },
  chinagoods: { en: "Yiwu Online", so: "Yiwu Online" },
  jd: { en: "Electronics", so: "Elektiroonigga" },
};

export default function MarketsTab() {
  const { locale, setLocale } = useI18n();
  const router = useRouter();
  const cartCount = useCartStore((s) => s.items.length);

  const openMarket = (id: MarketplaceId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addRecentlyVisited(id).catch(() => {});
    router.push({ pathname: "/marketplace/[marketplace]", params: { marketplace: id } });
  };

  const toggleLanguage = () => {
    Haptics.selectionAsync();
    setLocale(locale === "en" ? "so" : "en");
  };

  const l = (en: string, so: string) => (locale === "en" ? en : so);

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container} edges={["top"]}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>{l("Markets", "Suuqyada")}</Text>
              <TouchableOpacity style={styles.destSelector} activeOpacity={0.7}>
                <MapPin size={11} color={COLORS.primary} />
                <Text style={styles.destText}>{l("Mogadishu", "Muqdisho")}</Text>
                <ChevronDown size={11} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity style={styles.langBtn} onPress={toggleLanguage} activeOpacity={0.7}>
                <Languages size={14} color={COLORS.gray500} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.cartBtn} onPress={() => router.push("/cart")} activeOpacity={0.7}>
                <ShoppingCart size={18} color={COLORS.gray700} />
                {cartCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{cartCount}</Text></View>}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* ═══ MARKETPLACE LIST ═══ */}
          <View style={styles.list}>
            {MARKETPLACES.map((m) => {
              const badge = BEST_USE[m.id];
              return (
                <Pressable
                  key={m.id}
                  style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                  onPress={() => openMarket(m.id)}
                >
                  {/* Left: icon */}
                  <View style={[styles.iconWrap, { backgroundColor: m.brandColor + "0E" }]}>
                    <Image
                      source={m.icon}
                      style={styles.icon}
                      contentFit="contain"
                      transition={150}
                      cachePolicy="memory-disk"
                    />
                  </View>

                  {/* Center: info */}
                  <View style={styles.info}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name}>{m.name}</Text>
                      <View style={styles.tag}>
                        <Text style={styles.tagText}>{locale === "en" ? badge.en : badge.so}</Text>
                      </View>
                    </View>
                    <Text style={styles.desc} numberOfLines={1}>
                      {locale === "en" ? m.tagline_en : m.tagline_so}
                    </Text>
                    <Text style={styles.stat} numberOfLines={1}>
                      {locale === "en" ? m.stat_en : m.stat_so}
                    </Text>
                  </View>

                  {/* Right: arrow */}
                  <View style={[styles.arrow, { backgroundColor: m.brandColor + "10" }]}>
                    <ArrowUpRight size={16} color={m.brandColor} strokeWidth={2.2} />
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* ═══ DELIVERY NOTE ═══ */}
          <View style={styles.note}>
            <Text style={styles.noteText}>
              🚚 {l("Air 7–14 days · Sea 25–35 days to Somalia", "Hawada 7-14 maalmood · Badda 25-35 maalmood ilaa Soomaaliya")}
            </Text>
          </View>

          <View style={{ height: 130 }} />
        </ScrollView>
        <FloatingCartButton />
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },

  /* ── Header ── */
  header: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  headerRow: { flexDirection: "row", alignItems: "flex-start" },
  headerTitle: {
    fontSize: 30,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    letterSpacing: -0.8,
    marginBottom: 4,
  },
  destSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    minHeight: 24,
  },
  destText: { fontSize: 12, fontFamily: FONTS.semibold, color: COLORS.primary },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  langBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: { fontSize: 9, fontWeight: "700", color: COLORS.white },

  /* ── Scroll ── */
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.xl },

  /* ── Card List ── */
  list: { gap: 10 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.lg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  icon: { width: 44, height: 44 },
  info: { flex: 1 },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  name: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.black },
  tag: {
    backgroundColor: COLORS.gray100,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  tagText: { fontSize: 10, fontFamily: FONTS.semibold, color: COLORS.gray500 },
  desc: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 1 },
  stat: { fontSize: 11, color: COLORS.textMuted },
  arrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  /* ── Note ── */
  note: {
    marginTop: SPACING.xl,
    backgroundColor: COLORS.gray50,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  noteText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
    textAlign: "center",
  },
});
