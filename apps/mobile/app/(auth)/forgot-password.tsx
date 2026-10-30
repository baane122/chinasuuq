import {
  type ComponentRef, useCallback, useEffect, useRef, useState } from "react";
import { TextInput } from "react-native";
import { useRouter } from "expo-router";
import { Mail } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useAuthContract } from "@/components/auth/authContract";
import {
  AuthBackButton,
  AuthErrorBanner,
  AuthHeading,
  AuthLinkRow,
  AuthScreen,
  AuthTrustFooter,
} from "@/components/auth/AuthScreen";
import { AuthField } from "@/components/auth/AuthField";
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The single "forgot password" email-entry screen for the auth flow.
 * (It replaces the old reset-password/forgot-password pair — two screens
 * doing the same job with inverted names.) After the link is sent, the
 * reset link opens the in-app set-password screen.
 */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { locale } = useI18n();
  const { forgotPassword, clearError } = useAuthContract();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const emailRef = useRef<ComponentRef<typeof TextInput>>(null);

  const t = useCallback(
    (en: string, so: string) => (locale === "so" ? so : en),
    [locale]
  );

  useEffect(() => {
    clearError();
  }, [clearError]);

  useEffect(() => {
    if (sent) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [sent]);

  const handleSubmit = useCallback(async () => {
    if (loading) return;
    setErrorMsg(null);
    clearError();

    const trimmed = email.trim();
    if (!trimmed || !EMAIL_RE.test(trimmed)) {
      setEmailError(
        trimmed
          ? t("That email doesn't look right", "Iimaylkaasi sax ma aha")
          : t("Enter your email address", "Geli cinwaanka iimaylkaaga")
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLoading(true);
    try {
      // Supabase intentionally doesn't reveal whether an email exists, so a
      // success-shaped response always shows the "check your email" state.
      const result = await forgotPassword(trimmed);
      if (result.error) {
        setErrorMsg(
          t("Could not send the reset link. Please try again.", "Lama soo dirin xiriirka dib-u-dejinta. Fadlan isku day mar kale.")
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        setSent(true);
      }
    } catch {
      setErrorMsg(
        t("Network error. Please check your connection.", "Khalad shabaakad. Fadlan hubi isku xirkaaga.")
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }, [clearError, email, forgotPassword, loading, t]);

  if (sent) {
    return (
      <AuthScreen
        tagline={t("Password reset", "Dib-u-dejinta code-xufiska")}
        footer={<AuthTrustFooter text={t("Your data is secure and encrypted", "Xogtaada waa ammaan")} />}
      >
        <AuthHeading
          title={t("Check your email", "Eeg iimaylkaaga")}
          subtitle={`${t("We sent a reset link to", "Waxaan u dirnay xiriirinta dib-u-dejinta")} ${email.trim()}`}
        />
        <AuthSubmitButton
          label={t("Back to login", "Dib u noqo Gal")}
          onPress={() => router.replace("/(auth)/login")}
        />
        <AuthLinkRow
          question={t("Wrong address?", "Cinwaan khaldan?")}
          action={t("Try another email", "Isku day emayl kale")}
          onPress={() => {
            setSent(false);
            setEmail("");
          }}
        />
        {/* Deliberate escape hatch, not decoration. The reset link only arrives
            if the project has a mail provider attached, and SMTP still has none on
            the live project (see AUTH-DASHBOARD-SETUP.md §2) — unlike the other
            auth switches, this one needs credentials from an email account nobody
            holds on this machine. A customer stuck at this screen
            with no way out concludes their account is gone; the support screen
            already carries the WhatsApp number and can reset a password by hand. */}
        <AuthLinkRow
          question={t("No email after a minute?", "Iimayl ma soo gaarin?")}
          action={t("Get help from support", "La xiriir taageerada")}
          onPress={() => router.push("/support")}
        />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      tagline={t("Password reset", "Dib-u-dejinta code-xufiska")}
      headerLeft={
        <AuthBackButton
          label={t("Back", "Dib u noqo")}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(auth)/login"))}
        />
      }
      footer={<AuthTrustFooter text={t("Your data is secure and encrypted", "Xogtaada waa ammaan")} />}
    >
      <AuthHeading
        title={t("Forgot your password?", "Ma ilowday code-xufiska?")}
        subtitle={t(
          "Enter your email and we'll send you a link to set a new password.",
          "Geli iimaylkaaga waxaana ku soo diri doonnaa xiriir aad ku dejiso code-xufis cusub."
        )}
      />

      {errorMsg ? <AuthErrorBanner message={errorMsg} /> : null}

      <AuthField
        label={t("Email address", "Cinwaanka iimaylka")}
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          if (emailError) setEmailError(null);
          if (errorMsg) setErrorMsg(null);
        }}
        placeholder={t("you@example.com", "tusaale@example.com")}
        icon={<Mail size={18} color={COLORS.textMuted} />}
        error={emailError}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        keyboardType="email-address"
        returnKeyType="go"
        editable={!loading}
        inputRef={emailRef}
        onSubmitEditing={handleSubmit}
        onBlur={() => {
          if (email.trim() && !EMAIL_RE.test(email.trim())) {
            setEmailError(t("That email doesn't look right", "Iimaylkaasi sax ma aha"));
          }
        }}
      />

      <AuthSubmitButton
        label={t("Send reset link", "Dir xiriirinta dib-u-dejinta")}
        onPress={handleSubmit}
        loading={loading}
      />

      <AuthLinkRow
        question={t("Remembered it?", "Horay ma xasuusatay?")}
        action={t("Sign in", "Gal")}
        onPress={() => router.replace("/(auth)/login")}
      />
    </AuthScreen>
  );
}
