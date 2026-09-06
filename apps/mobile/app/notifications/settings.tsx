import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Bell,
  Package,
  Truck,
  Tag,
  Sparkles,
  Clock,
} from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth";
import { supabase } from "@/lib/supabase";

const NOTIF_KEY = "chinasuuq-notif-settings";

interface NotifSettings {
  orderUpdates: boolean;
  shippingUpdates: boolean;
  promotions: boolean;
  priceDrops: boolean;
}

const defaults: NotifSettings = {
  orderUpdates: true,
  shippingUpdates: true,
  promotions: false,
  priceDrops: true,
};

interface NotificationHistory {
  id: string;
  title: string;
  type: string;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  order: "📦",
  shipping: "🚚",
  delivered: "✅",
  promo: "🎉",
  payment: "💰",
};

export default function NotificationSettingsScreen() {
  const { locale } = useI18n();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [settings, setSettings] = useState<NotifSettings>(defaults);
  const [history, setHistory] = useState<NotificationHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(NOTIF_KEY);
        if (stored) setSettings(JSON.parse(stored));
      } catch {}
    })();
  }, []);

  // Load notification history
  useEffect(() => {
    (async () => {
      if (!user?.id) {
        setLoadingHistory(false);
        return;
      }
      try {
        const { data } = await supabase
          .from("notifications")
          .select("id, title, type, created_at")
          .eq("profile_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);
        setHistory((data as any[]) || []);
      } catch {
        setHistory([]);
      } finally {
        setLoadingHistory(false);
      }
    })();
  }, [user?.id]);

  const toggle = async (key: keyof NotifSettings) => {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    await AsyncStorage.setItem(NOTIF_KEY, JSON.stringify(next));
  };

  const formatHistoryDate = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diff = (now.getTime() - d.getTime()) / 1000;
      if (diff < 60) return locale === "en" ? "Just now" : "Hadda";
      if (diff < 3600) return `${Math.floor(diff / 60)}m`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  const items = [
    {
      key: "orderUpdates" as const,
      icon: Package,
      title: locale === "en" ? "Order Updates" : "Cusbooneysiinta Dalabka",
      desc:
        locale === "en"
          ? "Status changes for your orders"
          : "Isbeddelka xaaladda dalabkaaga",
    },
    {
      key: "shippingUpdates" as const,
      icon: Truck,
      title: locale === "en" ? "Shipping Updates" : "Cusbooneysiinta Rarka",
      desc:
        locale === "en"
          ? "Tracking and delivery notifications"
          : "Raadraac iyo digniinta gaarsiinta",
    },
    {
      key: "promotions" as const,
      icon: Sparkles,
      title: locale === "en" ? "Promotions" : "Xayaysiisyada",
      desc:
        locale === "en"
          ? "Deals and special offers"
          : "Heshiisyada iyo dalabyada gaarka ah",
    },
    {
      key: "priceDrops" as const,
      icon: Tag,
      title:
        locale === "en" ? "Price Drop Alerts" : "Digniinta Hoos-u-dhaca Qiimaha",
      desc:
        locale === "en"
          ? "When saved products go on sale"
          : "Marka alaabta kaydsan ay hoos u dhacdo",
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={8}
        >
          <ArrowLeft size={22} color={COLORS.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {locale === "en"
            ? "Notification Settings"
            : "Dejinta Ogeysiisyada"}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Intro */}
        <View style={styles.iconWrap}>
          <Bell size={48} color={COLORS.primary} />
        </View>
        <Text style={styles.intro}>
          {locale === "en"
            ? "Choose what notifications you want to receive"
            : "Dooro ogeysiisyada aad rabto inaad hesho"}
        </Text>

        {/* Toggle Settings */}
        {items.map((item) => (
          <View key={item.key} style={styles.settingCard}>
            <View style={styles.settingIcon}>
              <item.icon size={20} color={COLORS.primary} />
            </View>
            <View style={styles.settingTextBlock}>
              <Text style={styles.settingTitle}>{item.title}</Text>
              <Text style={styles.settingDesc}>{item.desc}</Text>
            </View>
            <Switch
              value={settings[item.key]}
              onValueChange={() => toggle(item.key)}
              trackColor={{
                false: COLORS.gray200,
                true: COLORS.primary,
              }}
              thumbColor="#fff"
            />
          </View>
        ))}

        {/* Notification History */}
        <Text style={styles.sectionLabel}>
          {locale === "en"
            ? "Recent Notifications"
            : "Ogeysiisyadii Ugu Dambeeyay"}
        </Text>

        {history.length === 0 ? (
          <View style={styles.emptyCard}>
            <Bell size={32} color={COLORS.gray300} />
            <Text style={styles.emptyTitle}>
              {locale === "en" ? "No notifications yet" : "Weli ogeysiis ma jiro"}
            </Text>
            <Text style={styles.emptyDesc}>
              {locale === "en"
                ? "Your notification history will appear here"
                : "Taariikhda ogeysiisyadaada halkan ayay ka muuqan doonaan"}
            </Text>
          </View>
        ) : (
          <View style={styles.historyCard}>
            {history.map((item, index) => (
              <React.Fragment key={item.id}>
                {index > 0 && <View style={styles.historyDivider} />}
                <View style={styles.historyRow}>
                  <Text style={styles.historyEmoji}>
                    {TYPE_LABELS[item.type] || "🔔"}
                  </Text>
                  <View style={styles.historyTextBlock}>
                    <Text style={styles.historyTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <View style={styles.historyMeta}>
                      <Clock size={10} color={COLORS.textMuted} />
                      <Text style={styles.historyTime}>
                        {formatHistoryDate(item.created_at)}
                      </Text>
                    </View>
                  </View>
                </View>
              </React.Fragment>
            ))}
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    textAlign: "center",
    marginRight: 44,
  },
  content: { padding: SPACING.lg },

  // Intro
  iconWrap: { alignItems: "center", paddingVertical: SPACING.xl },
  intro: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: SPACING.xl,
  },

  // Settings
  settingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  settingIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.softOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  settingTextBlock: { flex: 1 },
  settingTitle: {
    fontSize: 15,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
  },
  settingDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  // Section label
  sectionLabel: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: COLORS.textSecondary,
    marginTop: SPACING.xl,
    marginBottom: SPACING.md,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // History
  historyCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
  },
  historyEmoji: {
    fontSize: 20,
    width: 36,
    textAlign: "center",
  },
  historyTextBlock: { flex: 1 },
  historyTitle: {
    fontSize: 14,
    fontFamily: FONTS.medium,
    color: COLORS.black,
  },
  historyMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  historyTime: {
    fontSize: 11,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
  },
  historyDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: SPACING.lg + 36 + SPACING.md,
  },

  // Empty state
  emptyCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.xxl,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
    marginTop: SPACING.md,
  },
  emptyDesc: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: "center",
  },
});
