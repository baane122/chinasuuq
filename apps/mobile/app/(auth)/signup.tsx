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

export default function SignupScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signUp, error, clearError } = useAuthStore();
  const router = useRouter();

  const handleSignup = useCallback(async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      Alert.alert("Missing fields", "Please fill in all fields.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Weak password", "Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await signUp(email.trim(), password, name.trim());
    setLoading(false);
    if (result.error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Sign Up Failed", result.error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Welcome!", "Your account has been created.", [
        { text: "OK" },
      ]);
    }
  }, [name, email, password, signUp]);

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
          <Text style={styles.title}>Create Account</Text>

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
            placeholder="Full Name"
            placeholderTextColor={COLORS.gray400}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="name"
          />
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
            placeholder="Password (min 6 characters)"
            placeholderTextColor={COLORS.gray400}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
          />

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleSignup}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.btnText}>Sign Up</Text>
            )}
          </TouchableOpacity>

          <Link href="/(auth)/login" asChild>
            <TouchableOpacity style={styles.link} activeOpacity={0.7}>
              <Text style={styles.linkText}>Already have an account? Sign In</Text>
            </TouchableOpacity>
          </Link>
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
  brand: { fontSize: 24, fontWeight: "800", color: COLORS.black, marginBottom: SPACING.xl },
  title: { fontSize: 22, fontWeight: "700", color: COLORS.black, marginBottom: SPACING.lg, alignSelf: "flex-start" },
  input: { width: "100%", height: 52, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.lg, fontSize: 15, marginBottom: SPACING.md, color: COLORS.black, backgroundColor: COLORS.white },
  btn: { width: "100%", height: 52, borderRadius: RADIUS.lg, backgroundColor: COLORS.primary, justifyContent: "center", alignItems: "center", marginTop: SPACING.md },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  link: { marginTop: SPACING.lg, minHeight: 44, justifyContent: "center" },
  linkText: { color: COLORS.primary, fontSize: 14, fontWeight: "600" },
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
