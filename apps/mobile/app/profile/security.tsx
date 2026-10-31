/**
 * Security — the customer-facing half of the one-device rule.
 *
 * The rule itself is enforced server-side (claim_device_session revokes any
 * other MOBILE session of the account on sign-in), so this screen does not
 * "turn it on"; it explains it and gives the customer the two actions they can
 * take without calling support:
 *
 *   1. See which devices this account is signed in on.
 *   2. Sign the others out right now (the "I lost my phone" case — the owner
 *      should not have to wait for the next sign-in to revoke it).
 *
 * Both buttons are honest about the residual window: a revoked phone keeps a
 * valid access token until it expires, but it is dropped to the login screen
 * the next time it is opened or refreshed.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  ShieldCheck,
  Smartphone,
  LogOut,
  RefreshCw,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth";
import { supabase } from "@/lib/supabase";
import { getDeviceId } from "@/lib/deviceId";

interface DeviceRow {
  id: string;
  device_id: string;
  device_name: string | null;
  platform: string | null;
  last_seen_at: string;
  revoked_at: string | null;
}

export default function SecurityScreen() {
  const router = useRouter();
  const { locale } = useI18n();
  const tt = useCallback(
    (en: string, so: string) => (locale === "en" ? en : so),
    [locale]
  );

  const user = useAuthStore((s) => s.user);
  const authReady = useAuthStore((s) => s.initialized);
  const revokeOtherDevices = useAuthStore((s) => s.revokeOtherDevices);

  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [thisDeviceId, setThisDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoadError(null);
    try {
      const [id, result] = await Promise.all([
        getDeviceId(),
        supabase
          .from("user_devices")
          .select("id, device_id, device_name, platform, last_seen_at, revoked_at")
          .eq("user_id", user.id)
          .order("last_seen_at", { ascending: false }),
      ]);
      setThisDeviceId(id);
      if (result.error) {
        // A failed read is NOT "no devices": saying "you have no devices"
        // while holding a phone would read as a data-loss bug.
        setLoadError(result.error.message);
        setDevices([]);
        return;
      }
      setDevices((result.data as DeviceRow[] | null) ?? []);
    } catch (e: any) {
      setLoadError(e?.message ?? "Network error");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!authReady) return;
    void load();
  }, [authReady, load]);

  const handleRevokeOthers = useCallback(async () => {
    if (busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(true);
    try {
      const res = await revokeOtherDevices();
      if (!res.ok) {
        Alert.alert(
          tt("Couldn't sign out other devices", "Lama saari karin qalabka kale"),
          res.error ?? tt("Please check your connection and try again.", "Hubi isku xirka kadibna isku day mar kale.")
        );
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        tt("Done", "La sameeyay"),
        res.revoked
          ? tt(
              `${res.revoked} other device(s) signed out.`,
              `${res.revoked} qalab kale ayaa laga saaray.`
            )
          : tt("No other devices were signed in.", "Ma jirin qalab kale oo galay."),
        [{ text: tt("OK", "Hagaag") }]
      );
      await load();
    } catch (e: any) {
      Alert.alert(tt("Error", "Khalad"), e?.message ?? "");
    } finally {
      setBusy(false);
    }
  }, [busy, load, revokeOtherDevices, tt]);

  const formatWhen = (iso: string) => {
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return "—";
    const mins = Math.floor((Date.now() - then) / 60000);
    if (mins < 1) return tt("Just now", "Hadda");
    if (mins < 60) return tt(`${mins} min ago`, `${mins} daqiiqo ka hor`);
    const hours = Math.floor(mins / 60);
    if (hours < 24) return tt(`${hours} h ago`, `${hours} saac ka hor`);
    return new Date(iso).toLocaleDateString();
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          android_ripple={{ color: COLORS.gray100 }}
          accessibilityRole="button"
        >
          <ArrowLeft size={22} color={COLORS.black} />
        </Pressable>
        <Text style={styles.headerTitle}>{tt("Security", "Ammaanka")}</Text>
        <View style={{ width: 40 }} />
      </View>

      {!authReady || loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : !user?.id ? (
        <View style={styles.center}>
          <ShieldCheck size={40} color={COLORS.gray300} />
          <Text style={styles.emptyTitle}>{tt("Sign in to manage devices", "Gal si aad u maamusho qalabka")}</Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.push("/(auth)/login")}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>{tt("Sign In", "Gal")}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.ruleCard}>
            <View style={styles.ruleIcon}>
              <Smartphone size={20} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ruleTitle}>
                {tt("One phone at a time", "Hal taleefan hal mar")}
              </Text>
              <Text style={styles.ruleBody}>
                {tt(
                  "Your account stays signed in on one phone. Signing in on a new phone signs the previous one out automatically.",
                  "Akoonkaaga wuxuu ku sii jiraa hal taleefan. Marka aad taleefan cusub gasho, kii hore si otomaatig ah ayaa laga saaraa."
                )}
              </Text>
            </View>
          </View>

          {loadError ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>
                {tt("Couldn't load your devices.", "Qalabkaaga lama soo dejin karin.")}
              </Text>
              <Pressable style={styles.retryBtn} onPress={() => { void load(); }} accessibilityRole="button">
                <RefreshCw size={14} color={COLORS.primary} />
                <Text style={styles.retryText}>{tt("Try again", "Isku day mar kale")}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.listCard}>
              <Text style={styles.sectionLabel}>{tt("Signed in on", "La galay")}</Text>
              {devices.length === 0 ? (
                <Text style={styles.muted}>
                  {tt("No devices recorded yet.", "Weli qalab lama diiwaangelin.")}
                </Text>
              ) : (
                devices.map((d, i) => {
                  const isThis = d.device_id === thisDeviceId;
                  return (
                    <View key={d.id}>
                      {i > 0 ? <View style={styles.divider} /> : null}
                      <View style={styles.deviceRow}>
                        <Smartphone
                          size={18}
                          color={d.revoked_at ? COLORS.gray400 : COLORS.primary}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.deviceName}>
                            {d.device_name || d.platform || tt("Phone", "Taleefan")}
                            {isThis ? tt("  (this phone)", "  (taleefankan)") : ""}
                          </Text>
                          <Text style={styles.deviceMeta}>
                            {d.revoked_at
                              ? tt("Signed out", "Waa laga saaray")
                              : formatWhen(d.last_seen_at)}
                          </Text>
                        </View>
                        {isThis && !d.revoked_at ? <View style={styles.thisDot} /> : null}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          <Pressable
            style={[styles.revokeBtn, busy && { opacity: 0.6 }]}
            onPress={handleRevokeOthers}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
          >
            {busy ? (
              <ActivityIndicator size="small" color={COLORS.error} />
            ) : (
              <LogOut size={16} color={COLORS.error} />
            )}
            <Text style={styles.revokeText}>
              {tt("Sign out all other devices", "Ka saar dhammaan qalabka kale")}
            </Text>
          </Pressable>

          <Text style={styles.footnote}>
            {tt(
              "A signed-out phone returns to the login screen the next time it is opened. It may keep showing the app for up to an hour before that.",
              "Taleefanka la saaray wuxuu ku noqonayaa shaashadda gelitaanka marka xiga ee la furo. Waxaa laga yaabaa inuu app-ka sii muujiyo ilaa saacad ka hor intaas."
            )}
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontFamily: FONTS.bold, color: COLORS.black },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xxl,
    gap: SPACING.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: FONTS.semibold,
    color: COLORS.gray700,
    textAlign: "center",
  },
  scroll: { padding: SPACING.lg, paddingBottom: SPACING.xxxl, gap: SPACING.lg },
  ruleCard: {
    flexDirection: "row",
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  ruleIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primaryBg,
    alignItems: "center",
    justifyContent: "center",
  },
  ruleTitle: {
    fontSize: 15,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    marginBottom: 4,
  },
  ruleBody: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    lineHeight: 19,
  },
  listCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: SPACING.sm,
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  deviceName: { fontSize: 14, fontFamily: FONTS.semibold, color: COLORS.black },
  deviceMeta: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  thisDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  divider: { height: 1, backgroundColor: COLORS.gray100, marginVertical: 2 },
  muted: { fontSize: 13, fontFamily: FONTS.regular, color: COLORS.textSecondary },
  revokeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    minHeight: 48,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.errorBg,
    backgroundColor: COLORS.errorBg,
  },
  revokeText: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.error },
  footnote: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
    lineHeight: 18,
    textAlign: "center",
  },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    minHeight: 48,
    justifyContent: "center",
  },
  primaryBtnText: { color: COLORS.white, fontSize: 15, fontFamily: FONTS.bold },
  errorCard: {
    backgroundColor: COLORS.errorBg,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  errorText: { fontSize: 13, fontFamily: FONTS.medium, color: COLORS.error },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  retryText: { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.primary },
});
