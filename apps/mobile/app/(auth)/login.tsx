import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { Lock, Mail } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, FONTS, SPACING } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useAuthContract } from "@/components/auth/authContract";
import {
  AuthErrorBanner,
  AuthHeading,
  AuthScreen,
  AuthTrustFooter,
} from "@/components/auth/AuthScreen";
import { AuthField } from "@/components/auth/AuthField";
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const { signIn, clearError } = useAuthContract();
  const router = useRouter();
  const passwordRef = useRef<TextInput>(null);
  const { locale } = useI18n();

  const t = useCallback(
    (en: string, so: string) => (locale === "so" ? so : en),
    [locale]
  );

  // Single error source: this screen renders only `errorMsg` (per attempt).
  // The store's `error` is cleared on mount so a stale failure from a previous
  // visit can never reappear here.
  useEffect(() => {
    clearError();
  }, [clearError]);

  const goToVerify = useCallback(
    (targetEmail: string) => {
      router.replace({
        pathname: "/(auth)/verify-email",
        params: { email: targetEmail },
      });
    },
    [router]
  );

  const validate = useCallback((): boolean => {
    let ok = true;
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setEmailError(t("Enter your email address", "Geli cinwaanka iimaylkaaga"));
      ok = false;
    } else if (!EMAIL_RE.test(trimmedEmail)) {
      setEmailError(t("That email doesn't look right", "Iimaylkaasi sax ma aha"));
      ok = false;
    }
    if (!password) {
      setPasswordError(t("Enter your password", "Geli code-xufiskaaga"));
      ok = false;
    }
    return ok;
  }, [email, password, t]);

  const handleLogin = useCallback(async () => {
    if (loading) return;
    setErrorMsg(null);
    setEmailError(null);
    setPasswordError(null);
    clearError();

    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const result = await signIn(email.trim(), password);
      if (result.requiresVerification) {
        goToVerify(email.trim());
        return;
      }
      if (result.error) {
        const msg = result.error.toLowerCase();
        if (msg.includes("confirm")) {
          // Verification may still be on server-side — send them to the
          // verify screen instead of showing a raw Supabase message.
          goToVerify(email.trim());
          return;
        }
        if (msg.includes("network") || msg.includes("fetch") || msg.includes("connect")) {
          setErrorMsg(
            t("Network error. Please check your connection.", "Khalad shabaakad. Fadlan hubi isku xirka.")
          );
        } else if (msg.includes("too many") || msg.includes("wait")) {
          setErrorMsg(
            t("Too many attempts. Wait a minute and try again.", "Isku dayaad badan yihiin. Hal daqiiqo sug oo mar kale isku day.")
          );
        } else {
          // The store already maps every GoTrue error code to a sentence meant
          // for a customer, so showing it beats re-guessing here — a generic
          // "Login failed" throws away the difference between a wrong password,
          // an unknown email, and a rate limit, which are three different next
          // actions for the person holding the phone.
          setErrorMsg(result.error);
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      // Success: the root layout redirect moves a signed-in user into the app.
    } catch {
      setErrorMsg(
        t("Connection error. Please try again.", "Khalad xiriir. Fadlan isku day mar kale.")
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }, [clearError, email, goToVerify, loading, password, signIn, t, validate]);

  return (
    <AuthScreen
      tagline={t("One account for shopping & tracking", "Aqal kaliya oo ganacsi iyo raadraac ah")}
      footer={<AuthTrustFooter text={t("Your data is secure and encrypted", "Xogtaada waa ammaan")} />}
    >
      <AuthHeading
        title={t("Welcome back", "Kusoo noqo")}
        subtitle={t("Sign in to continue shopping", "Geli si aad wax u iibsato")}
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
        returnKeyType="next"
        editable={!loading}
        onSubmitEditing={() => passwordRef.current?.focus()}
        onBlur={() => {
          if (email.trim() && !EMAIL_RE.test(email.trim())) {
            setEmailError(t("That email doesn't look right", "Iimaylkaasi sax ma aha"));
          }
        }}
      />

      <AuthField
        label={t("Password", "Code-xufis")}
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          if (passwordError) setPasswordError(null);
          if (errorMsg) setErrorMsg(null);
        }}
        placeholder={t("Enter your password", "Geli code-xufiskaaga")}
        icon={<Lock size={18} color={COLORS.textMuted} />}
        error={passwordError}
        secure
        showLabel={t("Show password", "Muuji code-xufiska")}
        hideLabel={t("Hide password", "Qari code-xufiska")}
        labelTrailing={
          <Link href="/(auth)/forgot-password" asChild>
            <TouchableOpacity
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              accessibilityRole="link"
              accessibilityLabel={t("Forgot password?", "Ma ilowday code-xufiska?")}
            >
              <Text style={styles.forgotLink}>{t("Forgot?", "Ma ilowday?")}</Text>
            </TouchableOpacity>
          </Link>
        }
        autoComplete="password"
        textContentType="password"
        returnKeyType="go"
        editable={!loading}
        inputRef={passwordRef}
        onSubmitEditing={handleLogin}
      />

      <AuthSubmitButton
        label={t("Sign In", "Gal")}
        onPress={handleLogin}
        loading={loading}
      />

      <View style={styles.signupRow}>
        <Text style={styles.signupText}>
          {t("Don't have an account?", "Ma leedahay akoon?")}
        </Text>
        <Link href="/(auth)/signup" asChild>
          <TouchableOpacity
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            accessibilityRole="link"
            accessibilityLabel={t("Sign up", "Diwaangeli")}
          >
            <Text style={styles.signupLink}>{t("Sign up", "Diwaangeli")}</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  forgotLink: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
    color: COLORS.primary,
  },
  signupRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 44,
    marginTop: SPACING.md,
  },
  signupText: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.gray500,
  },
  signupLink: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.primary,
    marginLeft: SPACING.xs,
  },
});
