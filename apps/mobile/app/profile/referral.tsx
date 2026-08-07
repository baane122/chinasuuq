import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, ScrollView, Share, Clipboard } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Gift, Share2, Copy, MessageCircle } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useAuthStore } from "@/store/auth";

export default function ReferralScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [copied, setCopied] = useState(false);

  // Simple deterministic referral code derived from user id / email
  const refCode = user
    ? (user.email || user.id || "GUEST")
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 8)
        .toUpperCase()
    : "CHINASUUQ";
  const refLink = `https://chinasuuq.com/r/${refCode}`;

  const handleCopy = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      Clipboard.setString(refCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({
        message: `Order from China to Somalia with ChinaSuuq! Use my referral code ${refCode} or ${refLink} to get started. 🇨🇳➡️🇸🇴`,
      });
    } catch {}
  };

  const HOW_IT_WORKS = [
    { step: "1", title: "Share your code", desc: "Send your referral code to friends & family in Somalia." },
    { step: "2", title: "They order", desc: "They use ChinaSuuq to import products from China with air or sea freight." },
    { step: "3", title: "You earn", desc: "Earn rewards on every completed order they make. Rewards come via ZAAD or Edahab." },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()} android_ripple={{ color: COLORS.gray100 }}>
          <ArrowLeft size={22} color={COLORS.black} />
        </Pressable>
        <Text style={styles.headerTitle}>Refer & Earn</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}><Gift size={34} color={COLORS.white} /></View>
          <Text style={styles.heroTitle}>Give $10, Get $10</Text>
          <Text style={styles.heroSub}>Share ChinaSuuq with friends and both of you earn rewards.</Text>
        </View>

        {/* Referral code */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>YOUR REFERRAL CODE</Text>
          <View style={styles.codeRow}>
            <Text style={styles.codeValue}>{refCode || "—"}</Text>
            <Pressable style={styles.copyBtn} onPress={handleCopy} android_ripple={{ color: COLORS.gray100 }}>
              {copied ? <Text style={styles.copyDone}>✓</Text> : <Copy size={18} color={COLORS.primary} />}
            </Pressable>
          </View>
          <Text style={styles.codeHint}>{copied ? "Copied to clipboard!" : "Tap the icon to copy your code"}</Text>

          <Pressable style={styles.shareBtn} onPress={handleShare} android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
            <Share2 size={18} color={COLORS.white} />
            <Text style={styles.shareBtnText}>Share Referral Link</Text>
          </Pressable>
        </View>

        {/* How it works */}
        <View style={styles.howCard}>
          <Text style={styles.howTitle}>How it works</Text>
          {HOW_IT_WORKS.map((h, i) => (
            <View key={h.step} style={[styles.howRow, i > 0 && styles.howRowBorder]}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepText}>{h.step}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.howStepTitle}>{h.title}</Text>
                <Text style={styles.howStepDesc}>{h.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: FONTS.semibold, color: COLORS.black },
  hero: { alignItems: "center", paddingVertical: SPACING.xxl, backgroundColor: COLORS.white, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  heroIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", marginBottom: SPACING.md },
  heroTitle: { fontSize: 20, fontFamily: FONTS.bold, color: COLORS.black },
  heroSub: { fontSize: 13, fontFamily: FONTS.regular, color: COLORS.textSecondary, textAlign: "center", marginTop: 4, paddingHorizontal: SPACING.lg },
  codeCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, marginTop: SPACING.lg },
  codeLabel: { fontSize: 12, fontFamily: FONTS.semibold, color: COLORS.gray600, letterSpacing: 1, textAlign: "center" },
  codeRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, marginTop: SPACING.sm },
  codeValue: { fontSize: 34, fontFamily: FONTS.bold, letterSpacing: 4, color: COLORS.primary },
  copyBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.softOrange },
  copyDone: { color: COLORS.success, fontSize: 20, fontWeight: "bold" },
  codeHint: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.textSecondary, textAlign: "center", marginTop: 4 },
  shareBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: SPACING.md, marginTop: SPACING.lg },
  shareBtnText: { fontSize: 15, fontFamily: FONTS.semibold, color: COLORS.white },
  howCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, marginTop: SPACING.lg },
  howTitle: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.black, marginBottom: SPACING.sm },
  howRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, paddingVertical: SPACING.md },
  howRowBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },
  stepBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.softOrange, alignItems: "center", justifyContent: "center" },
  stepText: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.primary },
  howStepTitle: { fontSize: 14, fontFamily: FONTS.semibold, color: COLORS.black },
  howStepDesc: { fontSize: 13, fontFamily: FONTS.regular, color: COLORS.textSecondary, marginTop: 2, lineHeight: 18 },
});
