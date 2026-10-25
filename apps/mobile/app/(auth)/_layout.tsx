import { Stack } from "expo-router";
import { COLORS } from "@/lib/theme";

/**
 * Auth group shell. One visual language for the whole flow
 * (Login · Sign up · Forgot password · Check your email · Set new password):
 * warm-white content background and a consistent horizontal slide between
 * steps, so every screen feels like the same place.
 */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.warmWhite },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="login" options={{ animation: "fade" }} />
      <Stack.Screen name="signup" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="verify-email" />
    </Stack>
  );
}
