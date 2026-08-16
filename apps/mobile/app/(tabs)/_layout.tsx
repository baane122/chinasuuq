import { Tabs, usePathname } from "expo-router";
import { Home, Store, ShoppingBag, User } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View, Text, StyleSheet } from "react-native";
import { useEffect, useState } from "react";
import { COLORS, RADIUS, FONTS } from "@/lib/theme";
import { useCartStore } from "@/store/cart";
import { useAuthStore } from "@/store/auth";
import { getUnreadNotificationCount } from "@/db";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const isMarketplaceFlow = pathname.startsWith("/marketplace/");
  const cartCount = useCartStore((s) => s.items.length);
  const authUser = useAuthStore((s) => s.user);

  // Unread notification count badge — poll on mount while signed in.
  const [notifCount, setNotifCount] = useState(0);
  useEffect(() => {
    if (!authUser?.id) {
      setNotifCount(0);
      return;
    }
    let cancelled = false;
    const refreshCount = async () => {
      const n = await getUnreadNotificationCount(authUser.id);
      if (!cancelled) setNotifCount(n);
    };
    refreshCount();
    const timer = setInterval(refreshCount, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [authUser?.id]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.gray500,
        tabBarStyle: {
          display: isMarketplaceFlow ? "none" : "flex",
          backgroundColor: COLORS.darkSurface,
          borderTopWidth: 0,
          borderTopLeftRadius: RADIUS.xl,
          borderTopRightRadius: RADIUS.xl,
          height: 70 + Math.max(insets.bottom - 20, 0),
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom - 20, 8),
          // Shadow
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
          elevation: 16,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: FONTS.medium,
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginBottom: -2,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="markets"
        options={{
          title: "Markets",
          tabBarIcon: ({ color, size }) => <Store size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Orders",
          tabBarIcon: ({ color, size }) => (
            <View>
              <ShoppingBag size={size} color={color} />
              {cartCount > 0 && (
                <View style={tabStyles.badge}>
                  <Text style={tabStyles.badgeText}>
                    {cartCount > 99 ? "99+" : cartCount}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color, size }) => (
            <View>
              <User size={size} color={color} />
              {notifCount > 0 && (
                <View style={tabStyles.badge}>
                  <Text style={tabStyles.badgeText}>
                    {notifCount > 99 ? "99+" : notifCount}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const tabStyles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: FONTS.bold,
    color: COLORS.white,
  },
});
