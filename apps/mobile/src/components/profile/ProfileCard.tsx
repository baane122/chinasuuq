import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Edit3, MapPin } from "lucide-react-native";
import { COLORS, SPACING, RADIUS } from "@/lib/theme";

interface ProfileCardProps {
  name: string;
  location?: string;
  avatarUrl?: string;
  onEdit?: () => void;
}

export function ProfileCard({ name, location, onEdit }: ProfileCardProps) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <View style={styles.card}>
      <View style={styles.content}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        </View>

        <View style={styles.info}>
          <Text style={styles.name}>{name}</Text>
          {location ? (
            <View style={styles.locationRow}>
              <MapPin size={14} color={COLORS.gray400} />
              <Text style={styles.location}>{location}</Text>
            </View>
          ) : null}
        </View>

        {onEdit ? (
          <Pressable
            style={({ pressed }) => [
              styles.editButton,
              pressed && styles.editButtonPressed,
            ]}
            onPress={onEdit}
            accessibilityLabel="Edit profile"
            accessibilityRole="button"
          >
            <Edit3 size={18} color={COLORS.white} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.darkSurface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    marginHorizontal: SPACING.lg,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarContainer: {
    marginRight: SPACING.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.gray700,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  avatarText: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.white,
    fontFamily: "Inter-Bold",
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.white,
    fontFamily: "Inter-SemiBold",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  location: {
    fontSize: 13,
    color: COLORS.gray400,
    marginLeft: 4,
    fontFamily: "Inter-Regular",
  },
  editButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.gray700,
    alignItems: "center",
    justifyContent: "center",
  },
  editButtonPressed: {
    opacity: 0.7,
  },
});
