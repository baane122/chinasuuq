import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ShoppingBag,
  CreditCard,
  Settings,
  HelpCircle,
  LogOut,
  User,
  ChevronRight,
  Wifi,
  WifiOff,
  MapPin,
  Home,
  Heart,
  Gift,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth";
import { isBackendOnline, getOrders } from "@/db/index";

type MenuItem = {
  id: string;
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  route?: string;
  textColor?: string;
  destructive?: boolean;
};

export default function AccountScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [checkingBackend, setCheckingBackend] = useState(true);
  const [orderCount, setOrderCount] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const online = await isBackendOnline();
        setBackendOnline(online);
      } catch {
        setBackendOnline(false);
      } finally {
        setCheckingBackend(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const orders = await getOrders();
        setOrderCount(orders?.length ?? 0);
      } catch {}
    })();
  }, []);

  const displayName = user?.full_name || "Guest User";
  const displayEmail = user?.email || "";
  const displayLocation = user?.city || "Somalia";

  const handleLogout = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      t("profile.logout"),
      "Are you sure you want to log out?",
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("profile.logout"),
          style: "destructive",
          onPress: async () => {
            await signOut();
          },
        },
      ]
    );
  };

  const handleMenuPress = (item: MenuItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (item.destructive) {
      handleLogout();
      return;
    }
    if (item.route) {
      router.push(item.route as any);
    }
  };

  const menuItems: MenuItem[] = [
    {
      id: "personal",
      icon: <User size={20} color={COLORS.primary} />,
      label: "Personal Information",
      subtitle: "Name, phone & business details",
      route: "/profile/personal-info",
    },
    {
      id: "addresses",
      icon: <Home size={20} color={COLORS.primary} />,
      label: "Saved Addresses",
      subtitle: "Delivery addresses in Somalia",
      route: "/profile/addresses",
    },
    {
      id: "payments",
      icon: <CreditCard size={20} color={COLORS.primary} />,
      label: "Payment Methods",
      subtitle: "ZAAD, Edahab, EVC Plus & more",
      route: "/profile/payment-methods",
    },
    {
      id: "orders",
      icon: <ShoppingBag size={20} color={COLORS.primary} />,
      label: t("profile.myOrders"),
      subtitle: orderCount ? `${orderCount} order(s)` : "Track & manage orders",
      route: "/profile/order-history",
    },
    {
      id: "wishlist",
      icon: <Heart size={20} color={COLORS.primary} />,
      label: "Wishlist",
      subtitle: "Products you've saved",
      route: "/profile/wishlist",
    },
    {
      id: "referral",
      icon: <Gift size={20} color={COLORS.primary} />,
      label: "Refer & Earn",
      subtitle: "Invite friends, get rewards",
      route: "/profile/referral",
    },
    {
      id: "settings",
      icon: <Settings size={20} color={COLORS.primary} />,
      label: t("profile.settings"),
      subtitle: "Language & shipping preference",
      route: "/settings/index",
    },
    {
      id: "help",
      icon: <HelpCircle size={20} color={COLORS.primary} />,
      label: t("profile.help"),
      subtitle: "FAQs & contact support",
      route: "/support/index",
    },
    {
      id: "logout",
      icon: <LogOut size={20} color={COLORS.error} />,
      label: t("profile.logout"),
      textColor: COLORS.error,
      destructive: true,
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <User size={28} color={COLORS.primary} />
            </View>
          </View>
          <Text style={styles.displayName}>{displayName}</Text>
          {displayEmail ? (
            <Text style={styles.displayEmail}>{displayEmail}</Text>
          ) : null}
          <View style={styles.locationRow}>
            <MapPin size={14} color={COLORS.textSecondary} />
            <Text style={styles.displayLocation}>{displayLocation}</Text>
          </View>
        </View>

        {/* Backend Status Card */}
        <View
          style={[
            styles.backendCard,
            backendOnline
              ? styles.backendOnline
              : backendOnline === false
              ? styles.backendOffline
              : styles.backendChecking,
          ]}
        >
          {checkingBackend ? (
            <ActivityIndicator size="small" color={COLORS.textSecondary} />
          ) : backendOnline ? (
            <Wifi size={18} color={COLORS.success} />
          ) : (
            <WifiOff size={18} color={COLORS.error} />
          )}
          <Text
            style={[
              styles.backendText,
              {
                color: checkingBackend
                  ? COLORS.textSecondary
                  : backendOnline
                  ? COLORS.success
                  : COLORS.error,
              },
            ]}
          >
            {checkingBackend
              ? "Checking connection..."
              : backendOnline
              ? "Backend Online"
              : "Backend Offline — using local data"}
          </Text>
        </View>

        {/* Menu List */}
        <View style={styles.menuCard}>
          {menuItems.map((item, index) => (
            <React.Fragment key={item.id}>
              {index > 0 && <View style={styles.menuDivider} />}
              <Pressable
                style={styles.menuItem}
                onPress={() => handleMenuPress(item)}
                android_ripple={{ color: COLORS.gray100 }}
              >
                <View style={styles.menuIcon}>{item.icon}</View>
                <View style={styles.menuTextBlock}>
                  <Text
                    style={[
                      styles.menuLabel,
                      item.textColor ? { color: item.textColor } : null,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {item.subtitle ? (
                    <Text style={styles.menuSubtitle}>
                      {item.subtitle}
                    </Text>
                  ) : null}
                </View>
                <ChevronRight size={18} color={COLORS.gray400} />
              </Pressable>
            </React.Fragment>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.version}>ChinaSuuq v1.0.0</Text>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.warmWhite,
  },
  content: {
    flex: 1,
  },
  profileCard: {
    alignItems: "center",
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  avatarContainer: {
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.softOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  displayName: {
    fontSize: 20,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    marginBottom: 4,
  },
  displayEmail: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  displayLocation: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
  },
  backendCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.pill,
    alignSelf: "center",
  },
  backendOnline: {
    backgroundColor: "#ECFDF5",
  },
  backendOffline: {
    backgroundColor: "#FEF2F2",
  },
  backendChecking: {
    backgroundColor: COLORS.gray100,
  },
  backendText: {
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
  menuCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    minHeight: 52,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.softOrange,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.md,
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONTS.medium,
    color: COLORS.black,
  },
  menuTextBlock: {
    flex: 1,
  },
  menuSubtitle: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  menuDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: SPACING.lg + 36 + SPACING.md,
  },
  footer: {
    alignItems: "center",
    paddingTop: SPACING.xxxl,
  },
  version: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
  },
  bottomPadding: {
    height: 100,
  },
});