import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { COLORS, SPACING, RADIUS } from "@/lib/theme";

interface StatsItem {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}

interface StatsCardProps {
  items: StatsItem[];
}

export function StatsCard({ items }: StatsCardProps) {
  return (
    <View style={styles.card}>
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && <View style={styles.divider} />}
          <Pressable
            style={styles.item}
            accessibilityLabel={`${item.label}: ${item.value}`}
          >
            <Text style={styles.value}>{item.value}</Text>
            <Text style={styles.label}>{item.label}</Text>
            {index === 0 && <View style={styles.accentBar} />}
          </Pressable>
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.lg,
    position: "relative",
  },
  divider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.md,
  },
  value: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.black,
    fontFamily: "Inter-Bold",
  },
  label: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    fontFamily: "Inter-Regular",
  },
  accentBar: {
    position: "absolute",
    bottom: 0,
    left: "20%",
    right: "20%",
    height: 3,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
});
