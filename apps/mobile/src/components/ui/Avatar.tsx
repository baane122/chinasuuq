import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { User } from "lucide-react-native";
import { COLORS, FONTS } from "@/lib/theme";

interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: number;
  style?: ViewStyle;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// Simple hash to get a color from name
function hashColor(name: string): string {
  const hue = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return `hsl(${hue}, 55%, 55%)`;
}

export function Avatar({ uri, name = "", size = 44, style }: AvatarProps) {
  const borderRadius = size / 2;
  const fontSize = size * 0.36;

  return (
    <View
      style={[
        styles.container,
        { width: size, height: size, borderRadius },
        style,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={[styles.image, { width: size, height: size, borderRadius }]}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          recyclingKey={uri}
        />
      ) : name ? (
        <View
          style={[
            styles.initialsContainer,
            {
              width: size,
              height: size,
              borderRadius,
              backgroundColor: hashColor(name),
            },
          ]}
        >
          <Text style={[styles.initials, { fontSize }]}>
            {getInitials(name)}
          </Text>
        </View>
      ) : (
        <View
          style={[
            styles.fallbackContainer,
            { width: size, height: size, borderRadius },
          ]}
        >
          <User size={size * 0.45} color={COLORS.gray400} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  image: {
    // Filled by props
  },
  initialsContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontFamily: FONTS.semibold,
    color: COLORS.white,
  },
  fallbackContainer: {
    backgroundColor: COLORS.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
});
