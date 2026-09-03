import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Font from "expo-font";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { View, StyleSheet } from "react-native";
import { useAuthStore } from "@/store/auth";
import { COLORS } from "@/lib/theme";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

// Keep splash screen visible while we load fonts + auth
SplashScreen.preventAutoHideAsync();

function useAuthRedirect() {
  const { user, initialized } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!initialized) return;

    // Guests are allowed to browse freely — no forced login.
    // Only redirect away from the auth group if actually signed in.
    if (user && segments[0] === "(auth)") {
      router.replace("/(tabs)/home");
    }
  }, [user, initialized, segments, router]);
}

export default function RootLayout() {
  const loadSession = useAuthStore((s) => s.loadSession);

  const [fontsLoaded] = Font.useFonts({
    "Inter-Regular": Inter_400Regular,
    "Inter-Medium": Inter_500Medium,
    "Inter-SemiBold": Inter_600SemiBold,
    "Inter-Bold": Inter_700Bold,
  });

  useEffect(() => {
    (async () => {
      await loadSession();
      if (fontsLoaded) {
        await SplashScreen.hideAsync();
      }
    })();
  }, [fontsLoaded, loadSession]);

  // Keep splash visible while loading
  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <View style={styles.container}>
        <StatusBar style="dark" />
        <AuthRedirect />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="onboarding" options={{ presentation: "card" }} />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" options={{ presentation: "card" }} />
          <Stack.Screen name="product/[id]" options={{ presentation: "card" }} />
          <Stack.Screen name="marketplace/[marketplace]" options={{ presentation: "card" }} />
          <Stack.Screen name="cart/index" options={{ presentation: "card" }} />
          <Stack.Screen name="cart/checkout" options={{ presentation: "card" }} />
          <Stack.Screen name="search/index" options={{ presentation: "card" }} />
          <Stack.Screen name="orders/[id]" options={{ presentation: "card" }} />
          <Stack.Screen name="orders/tracking" options={{ presentation: "card" }} />
          <Stack.Screen name="orders/success" options={{ presentation: "card" }} />
          <Stack.Screen name="settings/index" options={{ presentation: "card" }} />
          <Stack.Screen name="support/index" options={{ presentation: "card" }} />
          {/* Profile subscreens */}
          <Stack.Screen name="profile/personal-info" options={{ presentation: "card" }} />
          <Stack.Screen name="profile/addresses" options={{ presentation: "card" }} />
          <Stack.Screen name="profile/add-address" options={{ presentation: "modal" }} />
          <Stack.Screen name="profile/payment-methods" options={{ presentation: "card" }} />
          <Stack.Screen name="profile/order-history" options={{ presentation: "card" }} />
          <Stack.Screen name="profile/wishlist" options={{ presentation: "card" }} />
          <Stack.Screen name="profile/referral" options={{ presentation: "card" }} />
          <Stack.Screen name="notifications/index" options={{ presentation: "card" }} />
          <Stack.Screen name="+not-found" />
        </Stack>
      </View>
    </ErrorBoundary>
  );
}

function AuthRedirect() {
  useAuthRedirect();
  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.warmWhite,
  },
});
