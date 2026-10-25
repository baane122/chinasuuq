/**
 * StaffModeHeader
 *
 * Rendered while staff mode is ON (currently on /staff/marketplaces). It states
 * which mode the user is in and owns the visible way out — exiting returns to
 * the normal tabs, and nothing redirects on its own.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Cookie, LogOut } from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useStaffStore } from "@/store/staff";
import { useI18n } from "@/lib/i18n";

export function StaffModeHeader() {
  const router = useRouter();
  const { locale } = useI18n();
  const t = (en: string, so: string) => (locale === "en" ? en : so);

  const isActive = useStaffStore((s) => s.isActive);
  const role = useStaffStore((s) => s.role);
  const exitStaffMode = useStaffStore((s) => s.exitStaffMode);

  if (!isActive) return null;

  const handleExit = () => {
    exitStaffMode();
    // Explicit, tap-driven exit to the normal app. Staff mode no longer
    // changes what the tab layout renders, so this lands where it says.
    router.replace("/(tabs)/home");
  };

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <View style={styles.badge}>
          <Cookie size={14} color={COLORS.white} />
        </View>
        <Text style={styles.title}>{t("Staff mode is on", "Qaabka shaqaalaha waa furan")}</Text>
        {role ? <Text style={styles.role}>{role}</Text> : null}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.exitButton]}
          onPress={handleExit}
          accessibilityRole="button"
        >
          <LogOut size={15} color={COLORS.error} />
          <Text style={styles.exitText}>{t("Exit staff mode", "Ka bax qaabka shaqaalaha")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.darkSurface,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderColor: COLORS.primary,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  badge: {
    width: 26,
    height: 26,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 14,
    fontFamily: FONTS.bold,
    color: COLORS.white,
    flex: 1,
  },
  role: {
    fontSize: 11,
    fontFamily: FONTS.medium,
    color: COLORS.primaryLight,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  actions: {
    flexDirection: "row",
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
  },
  exitButton: {
    backgroundColor: COLORS.errorBg,
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  exitText: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
    color: COLORS.error,
  },
});
