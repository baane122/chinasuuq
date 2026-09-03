import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Bell, Package, Truck, CheckCircle2, Sparkles, Receipt } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth";
import { supabase } from "@/lib/supabase";
import { EmptyState } from "@/components/EmptyState";

interface Notification {
  id: string;
  title: string;
  body: string | null;
  type: string;
  read_at: string | null;
  created_at: string;
}

const TYPE_ICONS: Record<string, any> = {
  order: Package,
  shipping: Truck,
  delivered: CheckCircle2,
  promo: Sparkles,
  payment: Receipt,
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { locale } = useI18n();
  const user = useAuthStore((s) => s.user);

  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      if (!user?.id) {
        // Guest: show empty state
        setItems([]);
        return;
      }
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, type, read_at, created_at")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setItems((data as any[]) || []);
    } catch (e) {
      console.warn("Failed to load notifications", e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await load();
    setRefreshing(false);
  };

  const markAllRead = async () => {
    if (!user?.id) return;
    Haptics.selectionAsync();
    const now = new Date().toISOString();
    try {
      await supabase
        .from("notifications")
        .update({ read_at: now })
        .eq("profile_id", user.id)
        .is("read_at", null);
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || now })));
    } catch {}
  };

  const formatDate = (iso: string) => {
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

  const renderItem = ({ item }: { item: Notification }) => {
    const Icon = TYPE_ICONS[item.type] || Bell;
    const unread = !item.read_at;
    const rowStyle = [styles.row, unread && styles.rowUnread];
    return (
      <TouchableOpacity
        style={rowStyle}
        activeOpacity={0.85}
      >
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: unread ? COLORS.primaryBg : COLORS.gray50 },
          ]}
        >
          <Icon size={18} color={unread ? COLORS.primary : COLORS.textMuted} />
        </View>
        <View style={styles.body}>
          <Text style={[styles.title, unread && styles.titleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          {item.body ? (
            <Text style={styles.message} numberOfLines={2}>
              {item.body}
            </Text>
          ) : null}
          <Text style={styles.time}>{formatDate(item.created_at)}</Text>
        </View>
        {unread ? <View style={styles.dot} /> : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} hitSlop={8}>
          <ArrowLeft size={22} color={COLORS.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {locale === "en" ? "Notifications" : "Ogeysiisyada"}
        </Text>
        {items.some((i) => !i.read_at) ? (
          <TouchableOpacity onPress={markAllRead} style={styles.markBtn} hitSlop={8}>
            <Text style={styles.markBtnText}>
              {locale === "en" ? "Mark all read" : "Calaamadee dhamaan"}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerBtn} />
        )}
      </View>

      {!user ? (
        <View style={styles.guestWrap}>
          <EmptyState
            icon={<Bell size={48} color={COLORS.gray300} />}
            title={locale === "en" ? "Sign in to see notifications" : "Soo gal si aad u aragto ogeysiisyada"}
            subtitle={
              locale === "en"
                ? "Order updates, shipping alerts, and exclusive offers will appear here."
                : "Cusboonaysiinta dalabka, digniintada rarka, iyo dalabyada gaarka ah halkan ayay ka muuqan doonaan."
            }
            actionLabel={locale === "en" ? "Sign In" : "Gal"}
            onAction={() => router.push("/(auth)/login")}
          />
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell size={48} color={COLORS.gray300} />}
          title={locale === "en" ? "No notifications yet" : "Weli ogeysiis ma jiro"}
          subtitle={
            locale === "en"
              ? "We'll let you know when your order ships, arrives, or needs attention."
              : "Waan ku ogeysiin doonnaa marka dalabkaagu rikooray, gaadho, ama u baahdo feejignaan."
          }
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerBtn: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    textAlign: "center",
  },
  markBtn: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  markBtnText: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
    color: COLORS.primary,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  guestWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.lg },
  list: { padding: SPACING.md, paddingBottom: SPACING.xxxl },
  sep: { height: 1, backgroundColor: COLORS.border, marginHorizontal: SPACING.md },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    marginVertical: SPACING.xs,
    marginHorizontal: SPACING.xs,
  },
  rowUnread: { backgroundColor: COLORS.softOrange + "55" },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1 },
  title: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.textSecondary,
  },
  titleUnread: { color: COLORS.black, fontFamily: FONTS.bold },
  message: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  time: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
    fontFamily: FONTS.medium,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginTop: 8,
  },
});
