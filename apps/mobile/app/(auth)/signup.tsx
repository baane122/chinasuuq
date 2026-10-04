import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useState, useCallback, useRef } from "react";
import { useRouter, Link } from "expo-router";
import { useAuthStore } from "@/store/auth";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import * as Haptics from "expo-haptics";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Image } from "expo-image";

const LOGO = require("../../assets/images/logo.jpg");

// Password strength indicator
function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: "Weak", color: "#EF4444" };
  if (score <= 2) return { score, label: "Fair", color: "#F59E0B" };
  if (score <= 3) return { score, label: "Good", color: "#3B82F6" };
  return { score, label: "Strong", color: "#10B981" };
}

export default function SignupScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { signUp, error, clearError } = useAuthStore();
  const router = useRouter();
  const passwordInputRef = useRef<TextInput>(null);
  const confirmInputRef = useRef<TextInput>(null);

  const strength = passwordStrength(password);

  const handleSignup = useCallback(async () => {
    setErrorMsg(null);
    clearError();

    if (!name.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
      Alert.alert(
        platformText("Missing fields", "Buuxi dhammaan"),
        platformText("Please fill in all fields.", "Fadlan buuxi dhammaan go'aanka.")
      );
      return;
    }
    if (password.length < 6) {
      Alert.alert(
        platformText("Weak password", "Code-xufis dabacsan"),
        platformText("Password must be at least 6 characters.", "Code-xufis waa inuu noqdaa ugu yaraan 6 xaraf.")
      );
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(
        platformText("Passwords don't match", "Code-xufisyadu waa isku mid"),
        platformText("Passwords do not match. Please try again.", "Code-xufisyadu isku ma aha. Fadlan isku day mar kale.")
      );
      return;
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const result = await signUp(email.trim(), password, name.trim());
      if (result.error) {
        const msg = result.error.toLowerCase();
        if (msg.includes("email") || msg.includes("already")) {
          setErrorMsg(platformText("This email is already registered. Try signing in instead.", "Email-kan waa la qoray. Fadlan isku day gal."));
        } else if (msg.includes("network") || msg.includes("fetch")) {
          setErrorMsg(platformText("Network error. Please check your connection.", "Khalad shabaakad. Fadlan hubi isku xirka."));
        } else {
          setErrorMsg(platformText("Sign up failed. Please try again.", "Diwaangelin wax khasaare ah. Fadlan isku day mar kale."));
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          platformText("Welcome! 🎉", "Ku soo dhawoobo! 🎉"),
          platformText(
            "Your account has been created successfully.\n\nYou can now browse products, add to cart, and checkout.",
            "Xisaabtaada waa la abuuray.\n\nHadda waxaad yaaban kartaa alaabta, cart ku dar, iyo checkout."
          ),
          [{ text: platformText("Start Shopping", "Bilow Iibsashada"), onPress: () => router.replace("/(tabs)/home") }]
        );
      }
    } catch (e: any) {
      setErrorMsg(platformText("Connection error. Please try again.", "Khalad xiriir. Fadlan isku day mar kale."));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }, [name, email, password, confirmPassword, signUp, clearError]);

  const platformText = (en: string, so: string) => en;

  return (
    <ErrorBoundary>
    <SafeAreaView style={styles.outerContainer}>
      {/* Decorative background */}
      <View style={styles.bgOrb1} />
      <View style={styles.bgOrb2} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Brand Header */}
          <View style={styles.brandSection}>
            <Image source={LOGO} style={styles.authLogo} resizeMode="contain" />
            <Text style={styles.brandName}>ChinaSuuq</Text>
            <Text style={styles.brandTagline}>One account for shopping, tracking and support across Somalia</Text>
          </View>

          {/* Signup Card */}
          <View style={styles.card}>
            <Text style={styles.title}>Create Your Account</Text>
            <Text style={styles.helper}>Save your favourite finds and get a smoother checkout next time.</Text>

            {errorMsg ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMsg}</Text>
                <TouchableOpacity onPress={() => setErrorMsg(null)} style={styles.errorDismiss}>
                  <Text style={styles.errorDismissText}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={clearError} style={styles.errorDismiss}>
                  <Text style={styles.errorDismissText}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Full Name */}
            <View style={styles.inputWrap}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Abdirahman Baane"
                placeholderTextColor={COLORS.gray400}
                value={name}
                onChangeText={(v) => { setName(v); setErrorMsg(null); }}
                autoCapitalize="words"
                autoComplete="name"
                returnKeyType="next"
                onSubmitEditing={() => passwordInputRef.current?.focus()}
              />
            </View>

            {/* Email */}
            <View style={styles.inputWrap}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={COLORS.gray400}
                value={email}
                onChangeText={(v) => { setEmail(v); setErrorMsg(null); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                returnKeyType="next"
                onSubmitEditing={() => passwordInputRef.current?.focus()}
              />
            </View>

            {/* Password */}
            <View style={styles.inputWrap}>
              <View style={styles.inputLabelRow}>
                <Text style={styles.inputLabel}>Password</Text>
                {password.length > 0 && (
                  <Text style={[styles.strengthLabel, { color: strength.color }]}>
                    {strength.label}
                  </Text>
                )}
              </View>
              <TextInput
                ref={passwordInputRef}
                style={styles.input}
                placeholder="Min 6 characters"
                placeholderTextColor={COLORS.gray400}
                value={password}
                onChangeText={(v) => { setPassword(v); setErrorMsg(null); }}
                secureTextEntry
                autoComplete="new-password"
                returnKeyType="next"
                onSubmitEditing={() => confirmInputRef.current?.focus()}
              />
              {/* Strength bar */}
              {password.length > 0 && (
                <View style={styles.strengthBar}>
                  <View style={[styles.strengthFill, { width: `${(strength.score / 5) * 100}%`, backgroundColor: strength.color }]} />
                </View>
              )}
            </View>

            {/* Confirm Password */}
            <View style={styles.inputWrap}>
              <Text style={styles.inputLabel}>Confirm Password</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  ref={confirmInputRef}
                  style={styles.input}
                  placeholder="Re-enter your password"
                  placeholderTextColor={COLORS.gray400}
                  value={confirmPassword}
                  onChangeText={(v) => { setConfirmPassword(v); setErrorMsg(null); }}
                  secureTextEntry
                  autoComplete="new-password"
                  returnKeyType="done"
                  onSubmitEditing={handleSignup}
                />
              </View>
              {confirmPassword.length > 0 && password !== confirmPassword && (
                <Text style={styles.matchError}>Passwords do not match</Text>
              )}
              {confirmPassword.length > 0 && password === confirmPassword && (
                <Text style={styles.matchOk}>✓ Passwords match</Text>
              )}
            </View>

            {/* Sign Up Button */}
            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleSignup}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.btnText}>Create Account</Text>
              )}
            </TouchableOpacity>

            {/* Sign In Link */}
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity style={styles.link} activeOpacity={0.7}>
                <Text style={styles.linkText}>
                  Already have an account? {" "}
                  <Text style={styles.linkHighlight}>Sign In</Text>
                </Text>
              </TouchableOpacity>
            </Link>
          </View>

          {/* Trust Footer */}
          <View style={styles.trustFooter}>
            <Text style={styles.trustText}>🔒 Your data is secure · 🌍 Trusted by 10,000+ shoppers</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: COLORS.darkSurface,
    overflow: "hidden",
  },
  bgOrb1: {
    position: "absolute",
    top: -60,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(101, 163, 13, 0.12)",
  },
  bgOrb2: {
    position: "absolute",
    bottom: -40,
    left: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255, 90, 10, 0.1)",
  },
  keyboardView: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: SPACING.xl,
  },
  brandSection: {
    alignItems: "center",
    marginBottom: SPACING.xl,
  },
  authLogo: {
    width: 120,
    height: 104,
    borderRadius: RADIUS.xl,
    marginBottom: SPACING.md,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  brandName: {
    fontSize: 32,
    fontFamily: FONTS.bold,
    color: COLORS.white,
    letterSpacing: 0.5,
  },
  brandTagline: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: "rgba(255,255,255,0.55)",
    marginTop: 4,
    textAlign: "center",
    paddingHorizontal: SPACING.xl,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xxl,
    padding: SPACING.xl,
    width: "100%",
    shadowColor: COLORS.black,
    shadowOpacity: 0.25,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  title: {
    fontSize: 26,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    marginBottom: 6,
  },
  helper: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
    lineHeight: 19,
  },
  inputWrap: {
    marginBottom: SPACING.md,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
    color: COLORS.gray600,
    marginBottom: 6,
  },
  inputLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    height: 52,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    fontSize: 15,
    color: COLORS.black,
    backgroundColor: COLORS.gray50,
  },
  passwordWrap: {
    position: "relative",
  },
  strengthLabel: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
  },
  strengthBar: {
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.gray200,
    marginTop: 6,
    overflow: "hidden",
  },
  strengthFill: {
    height: "100%",
    borderRadius: 2,
  },
  matchError: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: "#EF4444",
    marginTop: 4,
  },
  matchOk: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: "#10B981",
    marginTop: 4,
  },
  btn: {
    width: "100%",
    height: 54,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginTop: SPACING.md,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    color: COLORS.white,
    fontSize: 16,
    fontFamily: FONTS.bold,
    letterSpacing: 0.3,
  },
  link: {
    marginTop: SPACING.lg,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  linkText: {
    fontSize: 14,
    fontFamily: FONTS.medium,
    color: COLORS.textSecondary,
  },
  linkHighlight: {
    color: COLORS.primary,
    fontFamily: FONTS.bold,
  },
  errorBanner: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    flex: 1,
    paddingRight: SPACING.sm,
  },
  errorDismiss: {
    minHeight: 24,
    justifyContent: "center",
  },
  errorDismissText: {
    color: COLORS.error,
    fontSize: 18,
    fontWeight: "700",
  },
  trustFooter: {
    marginTop: SPACING.xl,
    alignItems: "center",
  },
  trustText: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: "rgba(255,255,255,0.45)",
  },
});
