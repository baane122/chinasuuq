/**
 * SetNewPasswordScreen — the last half of a password reset.
 *
 * This screen did not exist. The app could email a reset link, and Supabase
 * would even hand back a recovery session, but nothing in the codebase ever
 * called `updateUser`, so there was nowhere for a customer to type the new
 * password. The flow dead-ended after the hardest part: getting them to open
 * the email.
 *
 * It lives at the route root rather than inside `(auth)` because the root guard
 * evicts any signed-in user from `(auth)`, and arriving here means holding a
 * recovery session — i.e. being signed in.
 *
 * Built on the shared `src/components/auth` primitives so it reads as the same
 * flow the customer started on login: same card, same 44px reveal toggle, same
 * error banner, same double-submit guard. Those primitives also carry the
 * keyboard behaviour, which is exactly the kind of per-platform detail that
 * goes stale when a screen keeps its own copy of it.
 */
import {
  type ComponentRef, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { CheckCircle2, Lock } from "lucide-react-native";
import { COLORS, FONTS, RADIUS, SPACING } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
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
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

const MIN_LENGTH = 6;

export default function SetPasswordScreen() {
  const router = useRouter();
  const { locale } = useI18n();
  const { setNewPassword, clearError, error: storeError } = useAuthContract();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  /** False until we know a recovery session is present, so the CTA can be honest. */
  const [hasRecoverySession, setHasRecoverySession] = useState(false);

  const confirmRef = useRef<ComponentRef<typeof TextInput>>(null);

  const t = useCallback(
    (en: string, so: string) => (locale === "so" ? so : en),
    [locale]
  );

  useEffect(() => {
    clearError();
  }, [clearError]);

  // The emailed link is what creates a session. Arriving here without one — an
  // old link, a link opened on another phone, or this route reached from a
  // bookmark — has to say so plainly rather than fail on submit three fields
  // later. Any live session can set a password, so presence is the check; the
  // recovery-specific failure still surfaces from `setNewPassword` with its own
  // copy if the token behind the session was not a recovery one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!cancelled) setHasRecoverySession(!!data.session);
      } catch (e: any) {
        if (!cancelled) {
          setHasRecoverySession(false);
          console.warn("[set-password] session check failed:", e?.message);
        }
      } finally {
        if (!cancelled) setCheckingLink(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit =
    password.length >= MIN_LENGTH && password === confirm && !loading && hasRecoverySession;

  const handleSubmit = useCallback(async () => {
    if (loading) return;
    setErrorMsg(null);
    clearError();
    if (password.length < MIN_LENGTH) {
      setErrorMsg(
        t(
          `Password must be at least ${MIN_LENGTH} characters`,
          `Code-xufisku waa inuu ka badan yahay ${MIN_LENGTH} xaraf`
        )
      );
      return;
    }
    if (password !== confirm) {
      setErrorMsg(t("The two passwords do not match", "Labada code-xufis isku ma aha"));
      return;
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await setNewPassword(password);
      if (result.error) {
        setErrorMsg(result.error);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        setDone(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      setErrorMsg(
        t("Connection error. Please try again.", "Khalad xiriir. Fadlan isku day mar kale.")
      );
    } finally {
      setLoading(false);
    }
  }, [clearError, confirm, loading, password, setNewPassword, t]);

  if (done) {
    return (
      <ErrorBoundary>
        <AuthScreen
          tagline={t("Account secured", "Akoonkaaga waa la ilaaliyay")}
          footer={
            <AuthTrustFooter text={t("Your data is secure and encrypted", "Xogtaada waa ammaan")} />
          }
        >
          <View style={styles.successIcon}>
            <CheckCircle2 size={32} color={COLORS.success} />
          </View>
          <AuthHeading
            title={t("Password updated", "Code-xufiskii waa la beddelay")}
            subtitle={t(
              "You are signed in. Use your new password next time.",
              "Waa laguu gelinayaa. Code-xufiska cusub isticmaal markan xigta."
            )}
          />
          <AuthSubmitButton
            label={t("Continue shopping", "Sii wad iibsashada")}
            onPress={() => router.replace("/(tabs)/home")}
          />
        </AuthScreen>
      </ErrorBoundary>
    );
  }

  const linkNotice = checkingLink ? (
    <View style={styles.waitRow}>
      <ActivityIndicator size="small" color={COLORS.primary} />
      <Text style={styles.waitText}>
        {t("Checking your reset link…", "Waan hubaynaa xiriirkaaga dib-u-dejinta…")}
      </Text>
    </View>
  ) : !hasRecoverySession ? (
    <AuthErrorBanner
      message={t(
        "This page needs the link from your reset email. Please open that email on this phone and tap the link again.",
        "Boggan wuxuu u baahan yahay xiriirka emaylka dib-u-dejinta. Fadlan emaylka ka fur taleefankan oo mar kale guji xiriirka."
      )}
    />
  ) : null;

  return (
    <ErrorBoundary>
      <AuthScreen
        tagline={t("Password reset", "Dib-u-dejinta code-xufiska")}
        headerLeft={
          <AuthBackButton
            label={t("Back to sign in", "Ku noqo galitaanka")}
            onPress={() => router.replace("/(auth)/login")}
          />
        }
        footer={
          <AuthTrustFooter text={t("Your data is secure and encrypted", "Xogtaada waa ammaan")} />
        }
      >
        <AuthHeading
          title={t("Choose a new password", "Dooro code-xufis cusub")}
          subtitle={t(
            "Your new password must be at least 6 characters.",
            "Code-xufiskaaga cusub waa inuu ugu yaraan 6 xaraf ka kooban yahay."
          )}
        />

        {linkNotice}
        {errorMsg || storeError ? (
          <AuthErrorBanner message={errorMsg ?? storeError ?? ""} />
        ) : null}

        <AuthField
          label={t("New password", "Code-xufis cusub")}
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            if (errorMsg) setErrorMsg(null);
          }}
          placeholder={t("At least 6 characters", "Ugu yaraan 6 xaraf")}
          icon={<Lock size={18} color={COLORS.textMuted} />}
          error={
            tooShort
              ? t(
                  `At least ${MIN_LENGTH} characters needed`,
                  `Ugu yaraan ${MIN_LENGTH} xaraf waa loo baahan yahay`
                )
              : null
          }
          secure
          showLabel={t("Show password", "Muuji code-xufiska")}
          hideLabel={t("Hide password", "Qari code-xufiska")}
          autoComplete="new-password"
          textContentType="newPassword"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          editable={!loading && hasRecoverySession}
          onSubmitEditing={() => confirmRef.current?.focus()}
        />

        <AuthField
          label={t("Confirm new password", "Xaqiiji code-xufiska cusub")}
          value={confirm}
          onChangeText={(v) => {
            setConfirm(v);
            if (errorMsg) setErrorMsg(null);
          }}
          placeholder={t("Re-enter it", "Dib u geli")}
          icon={<Lock size={18} color={COLORS.textMuted} />}
          trailing={
            mismatch || confirm.length === 0 ? undefined : (
              <CheckCircle2 size={18} color={COLORS.success} />
            )
          }
          error={
            mismatch ? t("The passwords do not match", "Code-xufisyadu isku ma aha") : null
          }
          secure
          showLabel={t("Show password", "Muuji code-xufiska")}
          hideLabel={t("Hide password", "Qari code-xufiska")}
          autoComplete="new-password"
          textContentType="newPassword"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          inputRef={confirmRef}
          editable={!loading && hasRecoverySession}
          onSubmitEditing={canSubmit ? handleSubmit : undefined}
        />

        <AuthSubmitButton
          label={t("Save new password", "Kaydi code-xufiska cusub")}
          onPress={handleSubmit}
          loading={loading}
          disabled={!canSubmit}
        />

        {/* A reset link expires. Without this the only way out is the back
            button, which returns to a login screen the customer cannot use. */}
        <AuthLinkRow
          question={t("Link expired?", "Xiriirkii waa dhacay?")}
          action={t("Send a new one", "Soo dir mid cusub")}
          onPress={() => router.replace("/(auth)/forgot-password")}
        />
      </AuthScreen>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  successIcon: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.successBg,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: SPACING.md,
  },
  waitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  waitText: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: COLORS.textSecondary,
  },
});
