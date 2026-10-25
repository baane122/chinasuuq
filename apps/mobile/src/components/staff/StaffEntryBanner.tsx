/**
 * StaffEntryBanner
 *
 * The staff member's opt-in control. Rendered on the home and account tabs,
 * self-hides for non-staff accounts.
 *
 * Two jobs, neither of which is navigation-by-force:
 *  1. Enter / leave staff mode. Starting staff mode is a tap here — sign-in
 *     used to set it automatically, and the tab layout then redirected on it,
 *     which locked staff users out of the app.
 *  2. Open the one-time welcome, exactly once per staff account, through
 *     `claimStaffWelcome()` (the marker is persisted before we navigate, so
 *     returning to these tabs can never re-fire it).
 */
import React, { useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Cookie, LogIn, LogOut } from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useStaffStore } from "@/store/staff";
import { useAuthStore } from "@/store/auth";
import { useI18n } from "@/lib/i18n";

export function StaffEntryBanner() {
  const router = useRouter();
  const { locale } = useI18n();
  const t = (en: string, so: string) => (locale === "en" ? en : so);

  const role = useStaffStore((s) => s.role);
  const isActive = useStaffStore((s) => s.isActive);
  const enterStaffMode = useStaffStore((s) => s.enterStaffMode);
  const exitStaffMode = useStaffStore((s) => s.exitStaffMode);
  const claimStaffWelcome = useStaffStore((s) => s.claimStaffWelcome);
  const userId = useAuthStore((s) => s.user?.id);

  // One-time welcome. `claimStaffWelcome` resolves true at most once per staff
  // account (AsyncStorage marker written before it resolves), so this cannot
  // become the redirect the layout used to be.
  useEffect(() => {
    if (!role || !userId) return;
    let cancelled = false;
    claimStaffWelcome(userId).then((show) => {
      if (show && !cancelled) router.push("/staff/welcome");
    });
    return () => {
      cancelled = true;
    };
  }, [role, userId, claimStaffWelcome, router]);

  if (!role) return null;

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Cookie size={15} color={COLORS.primaryDark} />
        <Text style={styles.title}>
          {isActive
            ? t("You are browsing as staff", "Waxaad u fiirineysaa shaqaale ahaan")
            : t("Staff tools available", "Qalabka shaqaalaha waa la heli karaa")}
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => {
            // Only enters when it is not already on; a staff member already in
            // mode just goes back to the tools.
            if (!isActive) enterStaffMode();
            router.push("/staff/marketplaces");
          }}
          accessibilityRole="button"
        >
          <LogIn size={15} color={COLORS.white} />
          <Text style={styles.buttonText}>
            {isActive
              ? t("Staff marketplaces", "Suuqyada shaqaalaha")
              : t("Manage marketplaces", "Maamul suuqyada")}
          </Text>
        </TouchableOpacity>

        {isActive ? (
          // The way out, on the control that turned it on.
          <TouchableOpacity
            style={[styles.button, styles.exitButton]}
            onPress={exitStaffMode}
            accessibilityRole="button"
          >
            <LogOut size={15} color={COLORS.error} />
            <Text style={[styles.buttonText, styles.exitButtonText]}>
              {t("Exit staff mode", "Ka bax qaabka shaqaalaha")}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.primaryBg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderColor: COLORS.primaryLight,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  title: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: COLORS.primaryDark,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    flexWrap: "wrap",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    gap: SPACING.xs,
  },
  buttonText: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
    color: COLORS.white,
  },
  exitButton: {
    backgroundColor: COLORS.errorBg,
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  exitButtonText: {
    color: COLORS.error,
  },
});
