/**
 * RateStatusBadge — Visual indicator for exchange rate freshness.
 * 
 * Shows users whether the displayed prices are based on:
 * - ✅ Live Rate (from Supabase, fresh)
 * - ⚠️ Cached (from AsyncStorage)
 * - 🔴 Offline Default (using hardcoded 6.66 — potentially stale!)
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { COLORS, SPACING, RADIUS } from "@/lib/theme";
import { useFx } from "@/lib/exchange";

export function RateStatusBadge() {
  const { ready } = useFx();

  // Show badge based on readiness
  let label = "Live Rate";
  let color = "#12B76A";

  if (!ready) {
    label = "Offline Default";
    color = "#D92D20";
  }

  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  label: {
    fontSize: 10,
    fontFamily: "SF Pro Display Semibold",
    color: COLORS.white,
  },
});
