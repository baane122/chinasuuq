/**
 * StaffWelcomeScreen — the one-time welcome a staff account sees after signing
 * in (moved out of the `(auth)` group, which the root layout empties for
 * signed-in users, and out of the tab layout, which used to redirect into it
 * on every staff login).
 *
 * Rules that keep it out of a loop:
 *  - It is opened by StaffEntryBanner through `claimStaffWelcome()`, which
 *    persists the "seen" marker BEFORE navigating, so this screen can be
 *    reached at most once per staff account.
 *  - It never navigates on a timer (the old 3-second auto-dismiss re-entered
 *    the tabs, which re-entered the redirect). Every exit here is a tap.
 */
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import * as Haptics from "expo-haptics";
import { Cookie, CheckCircle2, Users, BarChart3 } from "lucide-react-native";
import { useI18n } from "@/lib/i18n";
import { useStaffStore, useIsStaff } from "@/store/staff";

const FEATURES: { Icon: typeof Cookie; en: string; so: string; descEn: string; descSo: string }[] = [
  {
    Icon: Cookie,
    en: "Marketplace management",
    so: "Maamulka suuqyada",
    descEn: "Open each marketplace and sync the shared session",
    descSo: "Fur suuq kasta oo aad sync gareyso fadhiga wadaaga",
  },
  {
    Icon: Users,
    en: "Browse as staff",
    so: "U fiiri shaqaale ahaan",
    descEn: "See every marketplace, not just the public catalog",
    descSo: "Arag suuq kasta, ma aha kaliya alaabta dadweynaha",
  },
  {
    Icon: CheckCircle2,
    en: "Order oversight",
    so: "Kormeerka dalabka",
    descEn: "Monitor orders across the stores you manage",
    descSo: "Raadso dalabyada dhammaan dukaamada aad maamusho",
  },
  {
    Icon: BarChart3,
    en: "Stays one tap from off",
    so: "Hal taabasho ayaa ka demisa",
    descEn: "You can leave staff mode at any time from the staff header",
    descSo: "Mar walba waad ka bixi kartaa qaabka shaqaalaha",
  },
];

export default function StaffWelcomeScreen() {
  const router = useRouter();
  const { locale } = useI18n();
  const t = (en: string, so: string) => (locale === "en" ? en : so);
  const isStaff = useIsStaff();
  const enterStaffMode = useStaffStore((s) => s.enterStaffMode);

  const leave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // replace, not back: the tabs are the destination either way, and this
    // leaves the welcome off the stack so it cannot be swiped back into.
    router.replace("/(tabs)/home");
  };

  const enter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    enterStaffMode();
    router.replace("/staff/marketplaces");
  };

  return (
    <SafeAreaView style={styles.outerContainer} edges={["top", "bottom"]}>
      <View style={styles.bgOrb1} />
      <View style={styles.bgOrb2} />

      <View style={styles.content}>
        <View style={styles.badgeContainer}>
          <View style={styles.badge}>
            <Cookie size={24} color={COLORS.primary} />
          </View>
          <Text style={styles.badgeText}>{t("Staff mode", "Qaabka shaqaalaha")}</Text>
        </View>

        <Text style={styles.title}>
          {t("Welcome, staff member", "Soo dhawoow, shaqaale")}
        </Text>
        <Text style={styles.subtitle}>
          {isStaff
            ? t(
                "Shopping works exactly as it always did. Staff tools are one tap away, and only turn on when you tap them.",
                "Iibsigu waa sida uu ahaan jiray. Qalabka shaqaaluhu waa hal taabasho, waana shidmaa oo kaliya markaad taabato."
              )
            : t(
                "This welcome is for staff accounts. You can keep shopping as usual.",
                "Soo dhawoontan waxaa loogu talagalay xisaabaadka shaqaalaha. Sii wad iibsiga caadiga ah."
              )}
        </Text>

        <View style={styles.featuresContainer}>
          {FEATURES.map((feature, index) => (
            <View key={feature.en}>
              {index > 0 && <View style={styles.featureDivider} />}
              <View style={styles.featureItem}>
                <View style={styles.featureIcon}>
                  <feature.Icon size={18} color={COLORS.primary} />
                </View>
                <View style={styles.featureText}>
                  <Text style={styles.featureTitle}>
                    {locale === "en" ? feature.en : feature.so}
                  </Text>
                  <Text style={styles.featureDesc}>
                    {locale === "en" ? feature.descEn : feature.descSo}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {isStaff ? (
          <TouchableOpacity style={styles.continueButton} onPress={enter} activeOpacity={0.85}>
            <Text style={styles.continueButtonText}>
              {t("Enter staff mode", "Gal qaabka shaqaalaha")}
            </Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity onPress={leave} style={styles.skipButton} activeOpacity={0.7}>
          <Text style={styles.skipButtonText}>
            {t("Browse as a customer", "U fiiri macmiil ahaan")}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: COLORS.warmWhite,
  },
  bgOrb1: {
    position: "absolute",
    top: -80,
    right: -80,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: COLORS.primaryBg,
    opacity: 0.7,
    pointerEvents: "none",
  },
  bgOrb2: {
    position: "absolute",
    bottom: 100,
    left: -60,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: COLORS.softOrange,
    opacity: 0.7,
    pointerEvents: "none",
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.xxl,
    paddingTop: SPACING.xxl,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeContainer: {
    alignItems: "center",
    marginBottom: SPACING.lg,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.softOrange,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.primaryLight,
    marginBottom: SPACING.md,
  },
  badgeText: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 26,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    textAlign: "center",
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: SPACING.xxl,
    lineHeight: 22,
    maxWidth: 340,
  },
  featuresContainer: {
    width: "100%",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.xxl,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  featureDivider: {
    height: 1,
    backgroundColor: COLORS.gray100,
    marginLeft: SPACING.lg,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryBg,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.md,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
  },
  continueButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xxl,
    minWidth: 240,
    alignItems: "center",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  continueButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontFamily: FONTS.semibold,
    letterSpacing: 0.3,
  },
  skipButton: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  skipButtonText: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
    textDecorationLine: "underline",
  },
});
