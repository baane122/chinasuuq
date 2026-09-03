import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Mail } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { locale } = useI18n();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !email.includes("@")) {
      Alert.alert(
        locale === "en" ? "Invalid email" : "Emayl khaldan",
        locale === "en" ? "Please enter a valid email address." : "Fadlan geli emayl sax ah."
      );
      return;
    }
    try {
      setLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: "chinasuuq://reset",
      });
      if (error) {
        Alert.alert("Error", error.message);
      } else {
        setSent(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
            <ArrowLeft size={22} color={COLORS.black} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {locale === "en" ? "Reset password" : "Dib u deji erayga sirta"}
          </Text>
          <View style={styles.headerBtn} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.iconWrap}>
              <Mail size={32} color={COLORS.primary} />
            </View>
            <Text style={styles.title}>
              {locale === "en" ? "Forgot your password?" : "Ma ilmoontay eraygaaga sirta?"}
            </Text>
            <Text style={styles.subtitle}>
              {locale === "en"
                ? "Enter the email address associated with your ChinaSuuq account. We'll send you a link to reset your password."
                : "Geli emaylkaaga ku xiran akoonkaaga ChinaSuuq. Waxaan ku soo diri doonaa link dib loogu dejiyo eraygaaga sirta."}
            </Text>

            {sent ? (
              <View style={styles.sentCard}>
                <Text style={styles.sentText}>
                  {locale === "en"
                    ? "✓ Check your email. We sent a password reset link to "
                    : "✓ Eeg emaylkaaga. Waxaan ku soo dirnay link dib-u-dejin "}
                  <Text style={styles.sentEmail}>{email}</Text>
                </Text>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => router.replace("/(auth)/login")}
                >
                  <Text style={styles.secondaryBtnText}>
                    {locale === "en" ? "Back to login" : "Ku noqo gelitaanka"}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.label}>{locale === "en" ? "Email" : "Emayl"}</Text>
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor={COLORS.gray400}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                />
                <TouchableOpacity
                  style={[styles.submitBtn, loading && { opacity: 0.6 }]}
                  onPress={handleSubmit}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <Text style={styles.submitBtnText}>
                      {locale === "en" ? "Send reset link" : "Dir link dib-u-dejin"}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    textAlign: "center",
  },
  content: { padding: SPACING.lg, paddingTop: SPACING.xxl },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primaryBg,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: 22,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    textAlign: "center",
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: SPACING.xl,
    paddingHorizontal: SPACING.md,
  },
  label: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
  },
  input: {
    width: "100%",
    height: 52,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    fontSize: 15,
    color: COLORS.black,
    backgroundColor: COLORS.white,
    marginBottom: SPACING.md,
  },
  submitBtn: {
    height: 52,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACING.md,
  },
  submitBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontFamily: FONTS.bold,
  },
  sentCard: {
    backgroundColor: COLORS.successBg,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  sentText: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: "#065F46",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  sentEmail: { fontFamily: FONTS.bold },
  secondaryBtn: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryBtnText: {
    color: COLORS.black,
    fontSize: 14,
    fontFamily: FONTS.semibold,
  },
});
