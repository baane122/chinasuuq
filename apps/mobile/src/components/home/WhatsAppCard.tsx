import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking } from "react-native";
import { MessageCircle } from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS, WHATSAPP_LINK } from "@/lib/theme";

export function WhatsAppCard() {
  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={0.8}
      onPress={() => Linking.openURL(WHATSAPP_LINK)}
    >
      <View style={styles.iconWrapper}>
        <MessageCircle size={24} color={COLORS.white} fill={COLORS.white} />
      </View>
      <View style={styles.textBlock}>
        <Text style={styles.title}>Can't find what you need?</Text>
        <Text style={styles.subtitle}>Chat with us on WhatsApp for free sourcing</Text>
      </View>
      <View style={styles.buttonBadge}>
        <Text style={styles.buttonText}>Chat</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xxl,
    backgroundColor: COLORS.softOrange,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.whatsapp,
    alignItems: "center",
    justifyContent: "center",
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    color: COLORS.gray600,
  },
  buttonBadge: {
    backgroundColor: COLORS.whatsapp,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.pill,
  },
  buttonText: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
    color: COLORS.white,
  },
});
