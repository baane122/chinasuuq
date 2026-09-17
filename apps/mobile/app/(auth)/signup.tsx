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
import { useState, useCallback } from "react";
import { useRouter, Link } from "expo-router";
import { useAuthStore } from "@/store/auth";
import { COLORS, SPACING, RADIUS } from "@/lib/theme";
import * as Haptics from "expo-haptics";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Image } from "expo-image";

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
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Image source={require("../../assets/images/logo.jpg")} style={styles.authLogo} resizeMode="contain" />
          <Text style={styles.brand}>ChinaSuuq</Text>
          <Text style={styles.sub}>One account for shopping, tracking and support across Somalia</Text>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.helper}>Save your favourite finds and get a smoother checkout next time.</Text>

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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  keyboardView: { flex: 1, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg },
  scrollContent: { flexGrow: 1, justifyContent: "center", paddingVertical: SPACING.xl },
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.xxl, padding: SPACING.xl, width: "100%", maxWidth: 480, alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  logoWrap: { width: 72, height: 72, borderRadius: 22, backgroundColor: COLORS.primary, justifyContent: "center", alignItems: "center", marginBottom: SPACING.lg },
  authLogo: { width: 110, height: 96, borderRadius: RADIUS.xl, marginBottom: SPACING.md },
  logo: { fontSize: 28, fontWeight: "800", color: COLORS.white },
  brand: { fontSize: 24, fontWeight: "800", color: COLORS.black, marginBottom: SPACING.md },
  sub: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.lg, textAlign: "center", lineHeight: 19 },
  title: { fontSize: 24, fontWeight: "800", color: COLORS.black, marginBottom: SPACING.xs, alignSelf: "flex-start" },
  helper: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.lg, alignSelf: "flex-start", lineHeight: 19 },
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
