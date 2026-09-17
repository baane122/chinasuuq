import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";

const NOT_FOUND_IMG = require("../assets/screens/not_found.png");

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Image source={NOT_FOUND_IMG} style={styles.img} contentFit="contain" transition={150} />
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
  img: { width: 200, height: 180, marginBottom: SPACING.lg },
  title: { fontSize: 24, fontWeight: "800", color: COLORS.black, fontFamily: FONTS.bold },
  sub: { fontSize: 15, color: COLORS.textSecondary, marginTop: SPACING.sm, marginBottom: SPACING.xxl, fontFamily: FONTS.regular },
  btn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.xxl, paddingVertical: SPACING.lg },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: "700", fontFamily: FONTS.bold },
});