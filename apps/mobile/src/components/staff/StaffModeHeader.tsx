/**
 * StaffModeHeader
 * 
 * Shows in staff mode - provides quick access to marketplace browser,
 * cookie sync controls, and exit button.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Cookie, LogOut } from "lucide-react-native";
import { COLORS, SPACING, RADIUS } from "@/lib/theme";
import { useStaffStore } from "@/store/staff";

export function StaffModeHeader() {
  const router = useRouter();
  const { isActive, exitStaffMode, canSyncCookies } = useStaffStore();

  if (!isActive) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🛠 Staff Mode</Text>
      
      <View style={styles.actions}>
        {/* Marketplace Browser */}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push("/staff/marketplaces")}
        >
          <Cookie size={16} color="#FF5A0A" />
          <Text style={styles.actionText}>Marketplaces</Text>
        </TouchableOpacity>

        {/* Exit Staff Mode */}
        <TouchableOpacity
          style={[styles.actionButton, styles.exitButton]}
          onPress={exitStaffMode}
        >
          <LogOut size={16} color="#D92D20" />
          <Text style={styles.exitText}>Exit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FF5A0A",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderColor: "#E84400",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: SPACING.sm,
  },
  actions: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
  },
  actionText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111111",
  },
  exitButton: {
    backgroundColor: "#FEE2E2",
  },
  exitText: {
    color: "#D92D20",
  },
});
