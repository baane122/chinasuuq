import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Mail } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, FONTS, RADIUS, SPACING } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useAuthContract } from "@/components/auth/authContract";
import {
  AuthHeading,
  AuthLinkRow,
  AuthScreen,
  AuthTrustFooter,
} from "@/components/auth/AuthScreen";
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton";

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { locale } = useI18n();
  const { email } = useLocalSearchParams<{ email: string }>();
  const { resendVerification } = useAuthContract();
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "fail"; text: string } | null>(null);

  const t = useCallback(
    (en: string, so: string) => (locale === "so" ? so : en),
    [locale]
  );

  const handleResend = useCallback(async () => {
    if (resending || !email) return;
    setNotice(null);
    setResending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await resendVerification(email.trim());
      if (result.error) {
        setNotice({
          kind: "fail",
          text: t("Couldn't resend right now. Please try again.", "Lama dib-u-dirin hadda. Fadlan isku day mar kale."),
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        setNotice({
          kind: "ok",
          text: t("A new verification email is on its way.", "Emayl tixraac cusub ayaa soo socda."),
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      setNotice({
        kind: "fail",
        text: t("Network error. Please check your connection.", "Khalad shabaakad. Fadlan hubi isku xirkaaga."),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setResending(false);
    }
  }, [email, resendVerification, resending, t]);

  return (
    <AuthScreen
      tagline={t("Almost there — one step left", "Waa la gaadhay — hal tallaabo baa hadhay")}
      footer={<AuthTrustFooter text={t("Your data is secure and encrypted", "Xogtaada waa ammaan")} />}
    >
      <AuthHeading
        title={t("Check your email", "Eeg iimaylkaaga")}
        subtitle={t(
          "We sent a verification link to",
          "Waxaan u dirnay xiriirinta tixraaca"
        )}
      />

      {email ? (
        <View style={styles.emailChip}>
          <Mail size={16} color={COLORS.primaryDark} />
          <Text style={styles.emailText}>{email}</Text>
        </View>
      ) : null}

      <Text style={styles.instructions}>
        {t(
          "1. Open your inbox and find the email from ChinaSuuq.\n2. Tap the verification link to activate your account.\n3. Return to the app and sign in.",
          "1. Fur sanduuqaaga oo raadi emaylka ChinaSuuq.\n2. Taabo xiriirinta tixraaca si aad u furto akoonkaaga.\n3. Ku noqo abka oo gal."
        )}
      </Text>

      {notice ? (
        <Text style={notice.kind === "ok" ? styles.noticeOk : styles.noticeFail}>
          {notice.text}
        </Text>
      ) : null}

      <AuthSubmitButton
        label={t("Resend verification email", "Dib u dir emaylka tixraaca")}
        onPress={handleResend}
        loading={resending}
        disabled={!email}
      />

      {email ? (
        <AuthLinkRow
          question={t("Verified already?", "Horay ma xaqiijisay?")}
          action={t("Sign in", "Gal")}
          onPress={() => router.replace("/(auth)/login")}
        />
      ) : null}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  emailChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.softOrange,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.xl,
    alignSelf: "center",
    maxWidth: "100%",
  },
  emailText: {
    fontSize: 15,
    fontFamily: FONTS.semibold,
    color: COLORS.primaryDark,
  },
  instructions: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  noticeOk: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: COLORS.success,
    marginBottom: SPACING.md,
    textAlign: "center",
  },
  noticeFail: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: COLORS.error,
    marginBottom: SPACING.md,
    textAlign: "center",
  },
});
