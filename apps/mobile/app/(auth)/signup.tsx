import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { CheckCircle2, Lock, Mail, Phone, User } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, FONTS, RADIUS, SPACING } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { readAuthContract, useAuthContract } from "@/components/auth/authContract";
import {
  AuthErrorBanner,
  AuthHeading,
  AuthScreen,
  AuthTrustFooter,
} from "@/components/auth/AuthScreen";
import { AuthField } from "@/components/auth/AuthField";
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton";
import {
  normalizeSomaliPhone,
  passwordStrength,
  type PasswordLevel,
} from "@/components/auth/passwordStrength";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldKey = "name" | "email" | "phone" | "password" | "confirm";

export default function SignupScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState<Record<FieldKey, boolean>>({
    name: false,
    email: false,
    phone: false,
    password: false,
    confirm: false,
  });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { signUp, clearError } = useAuthContract();
  const router = useRouter();
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const { locale } = useI18n();

  const t = useCallback(
    (en: string, so: string) => (locale === "so" ? so : en),
    [locale]
  );

  // Single error source: render only this screen's per-attempt message;
  // stale store errors are cleared on mount and before every submit.
  useEffect(() => {
    clearError();
  }, [clearError]);

  const touch = useCallback((key: FieldKey) => {
    setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  // Per-field inline validation (computed on blur / submit via `touched`).
  const errors = useMemo(() => {
    const normalizedPhone = normalizeSomaliPhone(phone);
    return {
      name:
        name.trim().length === 0
          ? t("Enter your full name", "Geli magacaaga oo dhan")
          : name.trim().length < 2
            ? t("Name is too short", "Magacu waa gaaban yahay")
            : null,
      email:
        email.trim().length === 0
          ? t("Enter your email address", "Geli cinwaanka iimaylkaaga")
          : !EMAIL_RE.test(email.trim())
            ? t("That email doesn't look right", "Iimaylkaasi sax ma aha")
            : null,
      phone:
        phone.trim().length > 0 && !normalizedPhone
          ? t(
              "Use a Somali number, e.g. 0612345678 or +252…",
              "Isticmaal lambar Soomaaliyeed, tusaale 0612345678 ama +252…"
            )
          : null,
      password:
        password.length === 0
          ? t("Choose a password", "Dooro code-xufis")
          : password.length < 6
            ? t("Password must be at least 6 characters", "Code-xufis waa inuu noqdaa ugu yaraan 6 xaraf")
            : null,
      confirm:
        confirmPassword.length === 0
          ? t("Re-enter your password", "Dib geli code-xufiskaaga")
          : confirmPassword !== password
            ? t("Passwords do not match", "Code-xufisyadu isku ma aha")
            : null,
    };
  }, [name, email, phone, password, confirmPassword, t]);

  const strength = passwordStrength(password);
  const strengthLabel = {
    weak: t("Weak", "Taban"),
    fair: t("Fair", "Dhexdhexaad"),
    good: t("Good", "Fiican"),
    strong: t("Strong", "Xoog badan"),
  } satisfies Record<PasswordLevel, string>;

  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  const handleSignup = useCallback(async () => {
    if (loading) return;
    setErrorMsg(null);
    clearError();
    setTouched({ name: true, email: true, phone: true, password: true, confirm: true });

    if (errors.name || errors.email || errors.phone || errors.password || errors.confirm) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const normalizedPhone = normalizeSomaliPhone(phone);

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const result = await signUp(
        email.trim(),
        password,
        name.trim(),
        normalizedPhone ?? undefined
      );
      if (result.error) {
        const msg = result.error.toLowerCase();
        if (msg.includes("email") || msg.includes("already")) {
          setErrorMsg(
            t("This email is already registered. Try signing in instead.", "Email-kan waa la qoray. Fadlan isku day gal.")
          );
        } else if (msg.includes("network") || msg.includes("fetch")) {
          setErrorMsg(
            t("Network error. Please check your connection.", "Khalad shabaakad. Fadlan hubi isku xirka.")
          );
        } else {
          setErrorMsg(
            t("Sign up failed. Please try again.", "Diwaangelintii waa lagaga guuldareystay. Fadlan isku day mar kale.")
          );
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Email verification may be ON or OFF server-side — handle both:
      // if the store reports `requiresVerification`, go to the verify screen;
      // if it holds a live session, go straight into the app. Read the fresh
      // snapshot because the hook value in this closure predates the await.
      const hasLiveSession = !!readAuthContract().session;
      if (result.requiresVerification || !hasLiveSession) {
        router.replace({
          pathname: "/(auth)/verify-email",
          params: { email: email.trim() },
        });
      } else {
        router.replace("/(tabs)/home");
      }
    } catch {
      setErrorMsg(
        t("Connection error. Please try again.", "Khalad xiriir. Fadlan isku day mar kale.")
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }, [clearError, email, errors, loading, name, password, phone, router, signUp, t]);

  return (
    <AuthScreen
      tagline={t("Shop from China, delivered to Somalia", "Ka soo iibso Shiinaha, loo keeno Soomaaliya")}
      footer={<AuthTrustFooter text={t("Your data is secure and encrypted", "Xogtaada waa ammaan")} />}
    >
      <AuthHeading
        title={t("Create Account", "Abuur Akoon")}
        subtitle={t(
          "Save your favourites and checkout faster next time.",
          "Kaydi waxaad jeceshahay oo si degdeg ah u iibso mariga dambe."
        )}
      />

      {errorMsg ? <AuthErrorBanner message={errorMsg} /> : null}

      <AuthField
        label={t("Full name", "Magaca guud")}
        value={name}
        onChangeText={setName}
        placeholder={t("Amina Hassan", "Aamina Xasan")}
        icon={<User size={18} color={COLORS.textMuted} />}
        error={touched.name ? errors.name : null}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        editable={!loading}
        onBlur={() => touch("name")}
        onSubmitEditing={() => emailRef.current?.focus()}
      />

      <AuthField
        label={t("Email address", "Cinwaanka iimaylka")}
        value={email}
        onChangeText={setEmail}
        placeholder={t("you@example.com", "tusaale@example.com")}
        icon={<Mail size={18} color={COLORS.textMuted} />}
        error={touched.email ? errors.email : null}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        keyboardType="email-address"
        returnKeyType="next"
        editable={!loading}
        inputRef={emailRef}
        onBlur={() => touch("email")}
        onSubmitEditing={() => phoneRef.current?.focus()}
      />

      <AuthField
        label={t("Phone (optional)", "Taleefan (ikhyaari)")}
        value={phone}
        onChangeText={setPhone}
        placeholder={t("0612345678 or +252…", "0612345678 ama +252…")}
        icon={<Phone size={18} color={COLORS.textMuted} />}
        error={touched.phone ? errors.phone : null}
        helper={t(
          "Only for delivery updates on WhatsApp.",
          "Waa kaliya wararka gaarsiinta WhatsApp-ka."
        )}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="tel"
        textContentType="telephoneNumber"
        keyboardType="phone-pad"
        returnKeyType="next"
        editable={!loading}
        inputRef={phoneRef}
        onBlur={() => touch("phone")}
        onSubmitEditing={() => passwordRef.current?.focus()}
      />

      <AuthField
        label={t("Password", "Code-xufis")}
        value={password}
        onChangeText={setPassword}
        placeholder={t("Min 6 characters", "Ugu yaraan 6 xaraf")}
        icon={<Lock size={18} color={COLORS.textMuted} />}
        error={touched.password ? errors.password : null}
        secure
        showLabel={t("Show password", "Muuji code-xufiska")}
        hideLabel={t("Hide password", "Qari code-xufiska")}
        labelTrailing={
          password.length > 0 ? (
            <Text style={[styles.strengthLabel, { color: strength.color }]}>
              {strengthLabel[strength.level]}
            </Text>
          ) : null
        }
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        editable={!loading}
        inputRef={passwordRef}
        onBlur={() => touch("password")}
        onSubmitEditing={() => confirmRef.current?.focus()}
        style={password.length > 0 ? { marginBottom: 0 } : undefined}
      />

      {password.length > 0 ? (
        <View style={styles.strengthTrack} accessibilityLabel={t("Password strength", "Xooga code-xufiska")}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[
                styles.strengthSegment,
                i < strength.segments && { backgroundColor: strength.color },
              ]}
            />
          ))}
        </View>
      ) : null}

      <AuthField
        label={t("Confirm password", "Xaqiiji code-xufiska")}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder={t("Re-enter your password", "Dib geli code-xufiskaaga")}
        icon={<Lock size={18} color={COLORS.textMuted} />}
        error={touched.confirm ? errors.confirm : null}
        secure
        showLabel={t("Show password", "Muuji code-xufiska")}
        hideLabel={t("Hide password", "Qari code-xufiska")}
        trailing={
          passwordsMatch ? (
            <View
              style={styles.matchBox}
              accessibilityLabel={t("Passwords match", "Code-xufisyadu way is waafaqsan yihiin")}
            >
              <CheckCircle2 size={18} color={COLORS.success} />
            </View>
          ) : null
        }
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        editable={!loading}
        inputRef={confirmRef}
        onBlur={() => touch("confirm")}
        onSubmitEditing={handleSignup}
      />

      <AuthSubmitButton
        label={t("Create Account", "Abuur Akoon")}
        onPress={handleSignup}
        loading={loading}
      />

      <Text style={styles.termsText}>
        {t("By creating an account you agree to our", "Marka aad akoon abuurto waxaad ogolaanaysaa")}{" "}
        <Text
          accessibilityRole="link"
          onPress={() => router.push("/profile/terms")}
          style={styles.termsLink}
        >
          {t("Terms", "Qodobada Adeegga")}
        </Text>
        {" " + t("and", "iyo") + " "}
        <Text
          accessibilityRole="link"
          onPress={() => router.push("/profile/privacy")}
          style={styles.termsLink}
        >
          {t("Privacy Policy", "Siyaasadda Khatarka")}
        </Text>
        .
      </Text>

      <View style={styles.loginRow}>
        <Text style={styles.loginText}>
          {t("Already have an account?", "Horay akoon ma leedahay?")}
        </Text>
        <Link href="/(auth)/login" asChild>
          <TouchableOpacity
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            accessibilityRole="link"
            accessibilityLabel={t("Sign in", "Gal")}
          >
            <Text style={styles.loginLink}>{t("Sign in", "Gal")}</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  strengthLabel: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
  },
  strengthTrack: {
    flexDirection: "row",
    gap: SPACING.xs,
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  strengthSegment: {
    flex: 1,
    height: 4,
    borderRadius: RADIUS.sm / 2,
    backgroundColor: COLORS.gray200,
  },
  matchBox: {
    marginLeft: SPACING.sm,
    flexShrink: 0,
  },
  termsText: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 18,
    marginTop: SPACING.xl,
  },
  termsLink: {
    fontFamily: FONTS.semibold,
    color: COLORS.primary,
  },
  loginRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 44,
    marginTop: SPACING.sm,
  },
  loginText: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.gray500,
  },
  loginLink: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.primary,
    marginLeft: SPACING.xs,
  },
});
