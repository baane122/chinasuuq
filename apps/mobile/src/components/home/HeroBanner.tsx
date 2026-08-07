import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Plane, ShoppingBag, Smartphone, Package } from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";

export function HeroBanner() {
  const { t } = useI18n();

  return (
    <View style={styles.container}>
      {/* Main content */}
      <View style={styles.content}>
        <Text style={styles.headline}>{t("home.title")}</Text>
        <Text style={styles.subtitle}>{t("home.subtitle")}</Text>
      </View>

      {/* 3D illustration elements */}
      <View style={styles.illustrations}>
        <View style={[styles.iconCircle, styles.bagIcon]}>
          <ShoppingBag size={22} color={COLORS.white} strokeWidth={2} />
        </View>
        <View style={[styles.iconCircle, styles.phoneIcon]}>
          <Smartphone size={18} color={COLORS.primary} strokeWidth={2} />
        </View>
        <View style={[styles.iconCircle, styles.planeIcon]}>
          <Plane size={20} color={COLORS.white} strokeWidth={2} />
        </View>
        <View style={[styles.iconCircle, styles.packageIcon]}>
          <Package size={16} color={COLORS.primary} strokeWidth={2} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.xl,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    overflow: "hidden",
    minHeight: 140,
  },
  content: {
    zIndex: 2,
    maxWidth: "65%",
  },
  headline: {
    fontSize: 20,
    fontFamily: FONTS.bold,
    color: COLORS.white,
    lineHeight: 26,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: "rgba(255,255,255,0.8)",
    letterSpacing: 1,
  },
  illustrations: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: 180,
    zIndex: 1,
  },
  iconCircle: {
    position: "absolute",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  bagIcon: {
    width: 52,
    height: 52,
    backgroundColor: "rgba(255,255,255,0.2)",
    top: 16,
    right: 24,
  },
  phoneIcon: {
    width: 40,
    height: 40,
    backgroundColor: COLORS.white,
    top: 48,
    right: 72,
  },
  planeIcon: {
    width: 44,
    height: 44,
    backgroundColor: "rgba(255,255,255,0.25)",
    top: 72,
    right: 16,
    transform: [{ rotate: "20deg" }],
  },
  packageIcon: {
    width: 36,
    height: 36,
    backgroundColor: COLORS.white,
    bottom: 16,
    right: 56,
  },
});
