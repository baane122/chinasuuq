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
import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter, Link } from "expo-router";
import { useAuthStore } from "@/store/auth";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import * as Haptics from "expo-haptics";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Image } from "expo-image";

const LOGO = require("../../assets/images/logo.jpg");

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { signIn, error, clearError } = useAuthStore();
  const router = useRouter();
  const passwordInputRef = useRef<TextInput>(null);

  // Load saved email
  useEffect(() => {
    const saved = localStorage.getItem("chinasuuq-login-email");
    if (saved) setEmail(saved);
  }, []);

  const handleLogin = useCallback(async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert(
        platformText("Missing fields", "Buuxi dhammaan go'aanka"),
        platformText("Please enter both email and password.", "Fadlan geli email iyo code-xufis.")
      );
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    clearError();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const result = await signIn(email.trim(), password);
      if (result.error) {
        const msg = result.error.toLowerCase();
        if (msg.includes("invalid") || msg.includes("credentials")) {
          setErrorMsg(platformText("Invalid email or password. Please try again.", "Email ama code-xufis khaldan. Fadlan isku day mar kale."));
        } else if (msg.includes("network") || msg.includes("fetch")) {
          setErrorMsg(platformText("Network error. Please check your connection and try again.", "Khalad shabaakad. Fadlan hubi isku xirkaaga."));
        } else {
          setErrorMsg(platformText("Sign in failed. Please try again.", "Gal wax khasaare ah. Fadlan isku day mar kale."));
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Remember email for next time
        try { localStorage.setItem("chinasuuq-login-email", email.trim()); } catch {}
      }
    } catch (e: any) {
      setErrorMsg(platformText("Connection error. Please try again.", "Khalad xiriir. Fadlan isku day mar kale."));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }, [email, password, signIn, clearError]);

  const platformText = (en: string, so: string) => {
    // Will be overridden by i18n in production; this is a fallback
    return en;
  };

  return (
    <ErrorBoundary>
    <SafeAreaView style={styles.outerContainer}>
      {/* Decorative gradient background */}
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
            <Text style={styles.brandTagline}>Your trusted bridge from China to Somalia</Text>
          </View>

          {/* Login Card */}
          <View style={styles.card}>
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.helper}>Sign in to track orders, save products and checkout faster.</Text>

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

            {/* Email Input */}
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

            {/* Password Input */}
            <View style={styles.inputWrap}>
              <View style={styles.inputLabelRow}>
                <Text style={styles.inputLabel}>Password</Text>
                <Link href="/(auth)/forgot-password" asChild>
                  <TouchableOpacity style={styles.forgotBtn} activeOpacity={0.7}>
                    <Text style={styles.forgotText}>Forgot?</Text>
                  </TouchableOpacity>
                </Link>
              </View>
              <View style={styles.passwordWrap}>
                <TextInput
                  ref={passwordInputRef}
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor={COLORS.gray400}
                  value={password}
                  onChangeText={(v) => { setPassword(v); setErrorMsg(null); }}
                  secureTextEntry={!showPass}
                  autoComplete="password"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  onPress={() => setShowPass(!showPass)}
                  style={styles.showPassBtn}
                >
                  <Text style={styles.showPassText}>{showPass ? "Hide" : "Show"}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Sign In Button */}
            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.btnText}>Sign In</Text>
              )}
            </TouchableOpacity>

            {/* Sign Up Link */}
            <Link href="/(auth)/signup" asChild>
              <TouchableOpacity style={styles.link} activeOpacity={0.7}>
                <Text style={styles.linkText}>
                  Don't have an account? {" "}
                  <Text style={styles.linkHighlight}>Sign Up</Text>
                </Text>
              </TouchableOpacity>
            </Link>

            {/* Guest Skip */}
            <TouchableOpacity
              style={styles.skipBtn}
              onPress={() => router.replace("/(tabs)/home")}
              activeOpacity={0.7}
            >
              <Text style={styles.skipText}>Continue as Guest</Text>
            </TouchableOpacity>
          </View>

          {/* Trust Footer */}
          <View style={styles.trustFooter}>
            <Text style={styles.trustText}>🔒 Secure · 🌍 Somalia-wide · ⚡ Fast Support</Text>
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
    top: -80,
    left: -80,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(255, 90, 10, 0.15)",
  },
  bgOrb2: {
    position: "absolute",
    bottom: -60,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(255, 140, 60, 0.12)",
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
  showPassBtn: {
    position: "absolute",
    right: SPACING.md,
    top: 14,
    minHeight: 24,
    justifyContent: "center",
  },
  showPassText: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
    color: COLORS.primary,
  },
  forgotBtn: {
    minHeight: 24,
    justifyContent: "center",
  },
  forgotText: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
    color: COLORS.primary,
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
  skipBtn: {
    marginTop: SPACING.md,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: SPACING.sm,
  },
  skipText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontFamily: FONTS.medium,
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
