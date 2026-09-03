import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLORS } from "@/lib/theme";

const ONBOARDING_KEY = "chinasuuq-onboarding-seen";

export default function Index() {
  const [state, setState] = useState<"loading" | "onboarding" | "home">(
    "loading"
  );

  useEffect(() => {
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(ONBOARDING_KEY);
        setState(seen ? "home" : "onboarding");
      } catch {
        setState("home");
      }
    })();
  }, []);

  if (state === "loading") {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: COLORS.warmWhite,
        }}
      >
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (state === "onboarding") {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)/home" />;
}
