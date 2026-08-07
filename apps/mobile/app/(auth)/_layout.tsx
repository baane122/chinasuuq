import { Stack } from "expo-router";
import { View, StyleSheet } from "react-native";
import { COLORS } from "@/lib/theme";

export default function AuthLayout() {
  return (
    <View style={styles.container}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.warmWhite },
          animation: "slide_from_right",
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.warmWhite,
  },
});
