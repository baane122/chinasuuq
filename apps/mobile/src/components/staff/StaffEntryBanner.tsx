/**
 * StaffEntryBanner
 * 
 * Shows on home screen when staff logs in.
 * One-tap entry to staff mode.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Cookie, LogIn } from "lucide-react-native";
import { COLORS, SPACING, RADIUS } from "@/lib/theme";
import { useStaffStore } from "@/store/staff";

export function StaffEntryBanner() {
  const router = useRouter();
  const { role, enterStaffMode } = useStaffStore();

  if (!role) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Staff Access Available</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          enterStaffMode();
          router.push("/staff/marketplaces");
        }}
      >
        <Cookie size={16} color="#FFFFFF" />
        <Text style={styles.buttonText}>Manage Marketplaces</Text>
        <LogIn size={14} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FB923C",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderColor: "#FF5A0A",
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#E84400",
    marginBottom: SPACING.sm,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF5A0A",
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    gap: SPACING.xs,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
