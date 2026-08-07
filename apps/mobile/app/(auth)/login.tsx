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
} from "react-native";
import { useState, useCallback } from "react";
import { useRouter, Link } from "expo-router";
import { useAuthStore } from "@/store/auth";
import { COLORS, SPACING, RADIUS } from "@/lib/theme";
import * as Haptics from "expo-haptics";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, error, clearError } = useAuthStore();
  const router = useRouter();

  const handleLogin = useCallback(async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Missing fields", "Please enter both email and password.");
      return;
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await signIn(email.trim(), password);
    setLoading(false);
    if (result.error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Sign In Failed", result.error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [email, password, signIn]);

  return (
    <ErrorBoundary>
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <View style={styles.card}>
          <View style={styles.logoWrap}>
            <Text style={styles.logo}>C</Text>
          </View>
          <Text style={styles.brand}>ChinaSuuq</Text>
          <Text style={styles.sub}>Mission Control</Text>
          <Text style={styles.title}>Sign In</Text>

          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={clearError}>
                <Text style={styles.errorDismiss}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={COLORS.gray400}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={COLORS.gray400}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPass}
            autoComplete="password"
          />

          <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.showPassBtn}>
            <Text style={styles.showPassText}>{showPass ? "Hide" : "Show"} Password</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.btnText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <Link href="/(auth)/signup" asChild>
            <TouchableOpacity style={styles.link} activeOpacity={0.7}>
              <Text style={styles.linkText}>Don't have an account? Sign Up</Text>
            </TouchableOpacity>
          </Link>

          <TouchableOpacity
            style={styles.skipBtn}
            onPress={() => router.replace("/(tabs)/home")}
            activeOpacity={0.7}
          >
            <Text style={styles.skipText}>Skip — Continue as Guest</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkSurface },
  keyboardView: { flex: 1, justifyContent: "center", alignItems: "center", padding: SPACING.xl },
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.xxxl, width: "100%", alignItems: "center" },
  logoWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.primary, justifyContent: "center", alignItems: "center", marginBottom: SPACING.md },
  logo: { fontSize: 28, fontWeight: "800", color: COLORS.white },
  brand: { fontSize: 24, fontWeight: "800", color: COLORS.black },
  sub: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.xl },
  title: { fontSize: 22, fontWeight: "700", color: COLORS.black, marginBottom: SPACING.lg, alignSelf: "flex-start" },
  input: { width: "100%", height: 52, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.lg, fontSize: 15, marginBottom: SPACING.md, color: COLORS.black, backgroundColor: COLORS.white },
  btn: { width: "100%", height: 52, borderRadius: RADIUS.lg, backgroundColor: COLORS.primary, justifyContent: "center", alignItems: "center", marginTop: SPACING.md },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  link: { marginTop: SPACING.lg, minHeight: 44, justifyContent: "center" },
  linkText: { color: COLORS.primary, fontSize: 14, fontWeight: "600" },
  showPassBtn: { alignSelf: "flex-end", marginBottom: SPACING.sm, minHeight: 32, justifyContent: "center" },
  showPassText: { color: COLORS.textSecondary, fontSize: 13 },
  skipBtn: {
    marginTop: SPACING.lg,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  skipText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: "600" },
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
  errorText: { color: COLORS.error, fontSize: 13, flex: 1 },
  errorDismiss: { color: COLORS.error, fontSize: 18, marginLeft: SPACING.sm, fontWeight: "700" },
});
