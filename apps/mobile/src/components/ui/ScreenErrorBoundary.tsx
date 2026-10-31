import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { AlertTriangle } from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";

/**
 * Route-level boundary handed to expo-router's `unstable_screenErrorBoundary`.
 *
 * Why this and not a wrapper per screen: a screen that throws used to unwind to
 * the single boundary in app/_layout.tsx, which replaces the whole app —
 * tab bar included — so a bad row in one list looked like "ChinaSuuq crashed".
 * Declaring it once on the Stack/Tabs covers every route, including the ones
 * added later, and a route that cannot render gets a way OUT instead of a
 * re-render loop.
 */
export function ScreenErrorBoundary({
  error,
  retry,
}: {
  error: Error;
  retry: () => Promise<void>;
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const tt = (en: string, so: string) => (locale === "en" ? en : so);

  const goHome = async () => {
    try {
      // Clearing the boundary state first, then leaving the route: retry()
      // alone re-renders the tree that just threw.
      await retry();
    } finally {
      try {
        router.replace("/(tabs)/home");
      } catch {
        // No navigation context (rare); the cleared boundary is still an exit.
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <AlertTriangle size={44} color={COLORS.warning} />
      </View>
      <Text style={styles.title}>{t("common.error")}</Text>
      <Text style={styles.message} numberOfLines={4}>
        {error?.message || tt("Something went wrong.", "Wax baa qaldan.")}
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={goHome}
        activeOpacity={0.85}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{tt("Go to home", "U gudbo Bogga Hore")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.warmWhite,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xxxl,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#FEF3C7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: 18,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    marginBottom: SPACING.sm,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: SPACING.xl,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    minHeight: 48,
    justifyContent: "center",
  },
  buttonText: { color: COLORS.white, fontSize: 16, fontFamily: FONTS.bold },
});
