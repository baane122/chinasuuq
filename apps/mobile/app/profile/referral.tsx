import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, ScrollView, Share, Clipboard } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Share2, Copy, Gift } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useAuthStore } from "@/store/auth";
import { Image } from "expo-image";

const REFERRAL_IMG = require("../../assets/screens/referral.png");

export default function ReferralScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [copied, setCopied] = useState(false);

  // Deterministic referral code derived from the signed-in user's own account.
  // Guests are gated below — showing a fake shared "CHINASUUQ" code implied a
  // program the server has no notion of.
  const refCode = user
    ? (user.email || user.id || "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 8)
        .toUpperCase()
    : "";
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
    {
      step: "3",
      title: "Rewards coming soon",
      desc: "We're still building the reward program — there's no payout yet. We'll notify you when referrals start earning.",
    },
  ];

  // Guest gate: no account → no personal code, no promise to make.
  if (!user?.id) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()} android_ripple={{ color: COLORS.gray100 }}>
            <ArrowLeft size={22} color={COLORS.black} />
          </Pressable>
          <Text style={styles.headerTitle}>Refer & Earn</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.guestCard}>
          <Gift size={40} color={COLORS.primary} />
          <Text style={styles.guestTitle}>Sign in to get your code</Text>
          <Text style={styles.guestSub}>
            Referral codes are tied to your account. Sign in to share yours, and
            we'll let you know when rewards go live.
          </Text>
          <Pressable
            style={styles.shareBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(auth)/login" as any); }}
            android_ripple={{ color: "rgba(255,255,255,0.2)" }}
          >
            <Text style={styles.shareBtnText}>Sign In</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

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
          <Image source={REFERRAL_IMG} style={styles.heroIllustration} contentFit="contain" />
          <Text style={styles.heroTitle}>Share ChinaSuuq with friends</Text>
          <Text style={styles.heroSub}>
            Your personal code is below. Reward payouts are coming soon —
            we'll announce them here and in the app.
          </Text>
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
  guestCard: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xxxl, gap: SPACING.md },
  guestTitle: { fontSize: 18, fontFamily: FONTS.bold, color: COLORS.black, textAlign: "center" },
  guestSub: { fontSize: 14, fontFamily: FONTS.regular, color: COLORS.textSecondary, textAlign: "center", lineHeight: 20 },
  hero: { alignItems: "center", paddingVertical: SPACING.xxl, backgroundColor: COLORS.white, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  heroIllustration: { width: 120, height: 120, marginBottom: SPACING.md },
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
