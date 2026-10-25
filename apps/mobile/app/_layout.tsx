import { useEffect, useRef } from "react";
import { Linking } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { consumeAuthUrl } from "@/lib/supabase";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Font from "expo-font";
import * as Updates from "expo-updates";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { View, StyleSheet } from "react-native";
import { useAuthStore } from "@/store/auth";
import { warmFx } from "@/lib/exchange";
import { COLORS } from "@/lib/theme";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { I18nProvider } from "@/lib/i18n";

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
    //
    // `set-password` deliberately lives OUTSIDE the `(auth)` group. A customer
    // arriving from a password-reset link holds a recovery session, so a guard
    // that evicts signed-in users from `(auth)` would have thrown them out of
    // the very screen they were emailed into and back to the home tab, with no
    // way to finish the reset.
    if (user && segments[0] === "(auth)") {
      router.replace("/(tabs)/home");
    }
  }, [user, initialized, segments, router]);

  // Handle deep links for email verification and password recovery.
  //
  // Supabase hands the app a URL containing a single-use code. Exchanging it is
  // what creates the session; nothing else in the app can. This used to call
  // `supabase.auth.handleURLCallback(...)`, a method that does not exist in
  // supabase-js 2.x — every emailed link therefore threw, and nobody could
  // complete an email confirmation or a password reset on a phone.
  const lastUrl = useRef<string | null>(null);
  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url || url === lastUrl.current) return;
      lastUrl.current = url;
      void (async () => {
        const result = await consumeAuthUrl(url);
        if (!result.wasAuthUrl) return; // an ordinary deep link; expo-router routes it
        if (result.ok) {
          // A recovery session is not a finished reset: send them to the screen
          // that collects the new password. Any other link produced a normal
          // session, which the guard above already resolves to the app.
          if (result.kind === "recovery") router.replace("/set-password");
          return;
        }
        console.warn("[deep-link] auth url could not be consumed:", result.error);
      })();
    };

    // RN's addEventListener returns a subscription with `remove()`; the previous
    // `Linking.removeEventListener` call was not a real API on this platform, so
    // the listener leaked across hot reloads and fired twice per link.
    const subscription = Linking.addEventListener("url", (event) => handle(event.url));
    Linking.getInitialURL()
      .then((initialUrl) => {
        // A cold start delivers the same URL through both getInitialURL and the
        // `url` event on Android. Dedupe, because a code consumed twice is a
        // "link already used" error for a customer who just did nothing wrong.
        if (initialUrl) handle(initialUrl);
      })
      .catch((e) => console.warn("[deep-link] getInitialURL failed:", e));

    return () => subscription.remove();
  }, [router]);
}

export default function RootLayout() {
  const loadSession = useAuthStore((s) => s.loadSession);
  const startAuthListener = useAuthStore((s) => s.startAuthListener);

  const [fontsLoaded] = Font.useFonts({
    "Inter-Regular": Inter_400Regular,
    "Inter-Medium": Inter_500Medium,
    "Inter-SemiBold": Inter_600SemiBold,
    "Inter-Bold": Inter_700Bold,
  });

  // Subscribe before the first read so the INITIAL_SESSION event this
  // subscription fires is the one that hydrates the store, not a lost frame.
  useEffect(() => {
    startAuthListener();
  }, [startAuthListener]);

  useEffect(() => {
    warmFx(); // non-blocking: hydrate FX store + re-pull on app focus
    (async () => {
      await loadSession();
      if (fontsLoaded) {
        await SplashScreen.hideAsync();
      }
    })();
  }, [fontsLoaded, loadSession]);

  // OTA updates: check on launch, download in background, apply on next cold
  // start. Never blocks first render and never surfaces failures to the user.
  useEffect(() => {
    (async () => {
      try {
        if (!Updates.isEnabled) return; // dev / Expo Go / unconfigured
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable) {
          const fetched = await Updates.fetchUpdateAsync();
          // Intentionally no reloadAsync(): the update is applied silently on
          // the next cold start so the running UI is never interrupted.
          void fetched;
        }
      } catch (e) {
        // Offline, server hiccup, dev-mode rejection — stay silent to the user,
        // but leave a line in the log: "why is this build old" is unanswerable
        // when the update check swallows its own failure.
        console.warn("[updates] check/fetch skipped:", e);
      }
    })();
  }, []);

  // Keep splash visible while loading
  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <View style={styles.container}>
        <StatusBar style="dark" />
        <AuthRedirect />
        <I18nProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="onboarding" options={{ presentation: "card" }} />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(auth)" options={{ presentation: "card" }} />
            {/* Outside `(auth)` on purpose — see the guard in useAuthRedirect. */}
            <Stack.Screen name="set-password" options={{ presentation: "card" }} />
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
            <Stack.Screen name="profile/help" options={{ presentation: "card" }} />
            <Stack.Screen name="profile/about" options={{ presentation: "card" }} />
            <Stack.Screen name="profile/terms" options={{ presentation: "card" }} />
            <Stack.Screen name="profile/privacy" options={{ presentation: "card" }} />
            <Stack.Screen name="profile/returns" options={{ presentation: "card" }} />
            <Stack.Screen name="profile/shipping-info" options={{ presentation: "card" }} />
            <Stack.Screen name="notifications/index" options={{ presentation: "card" }} />
            <Stack.Screen name="notifications/settings" options={{ presentation: "card" }} />
            <Stack.Screen name="+not-found" />
          </Stack>
        </I18nProvider>
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
