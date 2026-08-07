import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { COLORS, SPACING, RADIUS } from "@/lib/theme";

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🔍</Text>
      <Text style={styles.title}>Page Not Found</Text>
      <Text style={styles.sub}>The page you're looking for doesn't exist</Text>
      <TouchableOpacity style={styles.btn} onPress={() => router.replace("/")}>
        <Text style={styles.btnText}>Go Home</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite, justifyContent: "center", alignItems: "center", padding: SPACING.xl },
  emoji: { fontSize: 64, marginBottom: SPACING.lg },
  title: { fontSize: 24, fontWeight: "800", color: COLORS.black },
  sub: { fontSize: 15, color: COLORS.textSecondary, marginTop: SPACING.sm, marginBottom: SPACING.xxl },
  btn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.xxl, paddingVertical: SPACING.lg },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
});
