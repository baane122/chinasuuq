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
  const { t, locale } = useI18n();
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
        {/* Dark Profile Card — matching reference */}
        <View style={styles.profileCard}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <User size={28} color={COLORS.white} />
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.displayName}>{displayName}</Text>
              {displayEmail ? (
                <Text style={styles.displayEmail}>{displayEmail}</Text>
              ) : null}
              <View style={styles.locationRow}>
                <MapPin size={12} color="rgba(255,255,255,0.6)" />
                <Text style={styles.displayLocation}>{displayLocation}</Text>
              </View>
            </View>
          </View>

          {/* Gold Buyer Badge */}
          <View style={styles.badgeRow}>
            <View style={styles.goldBadge}>
              <Text style={styles.goldBadgeText}>🏅 {locale === "en" ? "Gold Buyer" : "Iibiye Dahab"}</Text>
            </View>
          </View>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{orderCount}</Text>
              <Text style={styles.statLabel}>{locale === "en" ? "Orders" : "Dalab"}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>0</Text>
              <Text style={styles.statLabel}>{locale === "en" ? "Saved" : "Kaydka"}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>24/7</Text>
              <Text style={styles.statLabel}>{locale === "en" ? "Support" : "Taageero"}</Text>
            </View>
          </View>
        </View>

        {/* Backend Status */}
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
            <Text style={{ color: COLORS.success, fontSize: 12, fontFamily: FONTS.medium }}>✓ Online</Text>
          ) : (
            <Text style={{ color: COLORS.error, fontSize: 12, fontFamily: FONTS.medium }}>✕ Offline</Text>
          )}
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

  // Dark profile card — matching reference design
  profileCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.darkSurface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    shadowColor: COLORS.black,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  profileInfo: { flex: 1 },
  displayName: {
    fontSize: 18,
    fontFamily: FONTS.bold,
    color: COLORS.white,
    marginBottom: 4,
  },
  displayEmail: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    color: "rgba(255,255,255,0.6)",
    marginBottom: 4,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  displayLocation: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    color: "rgba(255,255,255,0.6)",
  },

  // Gold badge
  badgeRow: { marginBottom: SPACING.md },
  goldBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(218,165,32,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    gap: 6,
  },
  goldBadgeText: { fontSize: 12, fontFamily: FONTS.semibold, color: "#DAA520" },

  // Stats row
  statsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: RADIUS.md,
    paddingVertical: 14,
  },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 20, fontFamily: FONTS.bold, color: COLORS.white, marginBottom: 2 },
  statLabel: { fontSize: 11, color: "rgba(255,255,255,0.55)" },
  statDivider: { width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.12)", alignSelf: "center" },

  // Backend status
  backendCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.pill,
    alignSelf: "center",
  },
  backendOnline: { backgroundColor: "#ECFDF5" },
  backendOffline: { backgroundColor: "#FEF2F2" },
  backendChecking: { backgroundColor: COLORS.gray100 },

  // Menu
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
  menuTextBlock: { flex: 1 },
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
