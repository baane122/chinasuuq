import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useRouter } from "expo-router";
import { useI18n } from "@/lib/i18n";

const EMPTY_IMG = require("../../../assets/screens/empty_cart.png");

export default function EmptyCart() {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <View style={styles.container}>
      <Image source={EMPTY_IMG} style={styles.illustration} contentFit="contain" />
      <Text style={styles.title}>{t("cart.emptyTitle")}</Text>
      <Text style={styles.subtitle}>{t("cart.emptySubtitle")}</Text>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => router.push("/")}
        activeOpacity={0.8}
      >
        <Text style={styles.btnText}>{t("cart.startShopping")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xxxl,
    minHeight: 400,
  },
  illustration: {
    width: 140,
    height: 140,
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: 20,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: SPACING.xxl,
  },
  btn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xxxl,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.lg,
    minHeight: 48,
    justifyContent: "center",
  },
  btnText: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.white,
  },
});
