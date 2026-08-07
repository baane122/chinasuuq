import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Home, MapPin, Plus, Trash2, Edit3, CheckCircle2 } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useAuthStore } from "@/store/auth";
import { getAddresses, deleteAddress, type SavedAddress } from "@/db/index";

export default function AddressesScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    const list = await getAddresses(user.id);
    setAddresses(list);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = (addr: SavedAddress) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert("Delete address?", `Remove ${addr.label}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (addr.id && user?.id) {
            await deleteAddress(addr.id, user.id);
            await load();
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()} android_ripple={{ color: COLORS.gray100 }}>
          <ArrowLeft size={22} color={COLORS.black} />
        </Pressable>
        <Text style={styles.headerTitle}>Saved Addresses</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centerLoading}><ActivityIndicator color={COLORS.primary} /></View>
      ) : addresses.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><MapPin size={40} color={COLORS.primary} /></View>
          <Text style={styles.emptyTitle}>No addresses yet</Text>
          <Text style={styles.emptySub}>Add a delivery address in Somalia to speed up checkout.</Text>
        </View>
      ) : (
        <FlatList
          data={addresses}
          keyExtractor={(a) => a.id || a.label}
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 120 }}
          renderItem={({ item }) => (
            <View style={styles.addrCard}>
              <View style={styles.addrTop}>
                <View style={styles.addrIconWrap}><Home size={18} color={COLORS.primary} /></View>
                <View style={styles.addrTextBlock}>
                  <View style={styles.addrLabelRow}>
                    <Text style={styles.addrLabel}>{item.label}</Text>
                    {item.is_default && (
                      <View style={styles.defaultBadge}>
                        <CheckCircle2 size={12} color={COLORS.success} />
                        <Text style={styles.defaultText}>Default</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.addrLine}>{item.full_name} · {item.phone}</Text>
                  <Text style={styles.addrLine2}>
                    {[item.district, item.address_line1, item.city].filter(Boolean).join(", ")}
                  </Text>
                </View>
              </View>
              <View style={styles.addrActions}>
                <Pressable
                  style={styles.actionBtn}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push({ pathname: "/profile/add-address", params: { id: item.id } } as any); }}
                >
                  <Edit3 size={16} color={COLORS.primary} />
                  <Text style={styles.actionText}>Edit</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, styles.deleteBtn]} onPress={() => handleDelete(item)}>
                  <Trash2 size={16} color={COLORS.error} />
                  <Text style={[styles.actionText, { color: COLORS.error }]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      {/* Add button */}
      <View style={styles.floatingBtnWrap}>
        <Pressable
          style={styles.addBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push("/profile/add-address" as any); }}
        >
          <Plus size={20} color={COLORS.white} />
          <Text style={styles.addBtnText}>Add Address</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: FONTS.semibold, color: COLORS.black },
  centerLoading: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xxxl },
  emptyIcon: { width: 84, height: 84, borderRadius: 42, backgroundColor: COLORS.softOrange, alignItems: "center", justifyContent: "center", marginBottom: SPACING.lg },
  emptyTitle: { fontSize: 18, fontFamily: FONTS.bold, color: COLORS.black, marginBottom: 4 },
  emptySub: { fontSize: 14, fontFamily: FONTS.regular, color: COLORS.textSecondary, textAlign: "center" },
  addrCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, marginBottom: SPACING.md },
  addrTop: { flexDirection: "row", gap: SPACING.md },
  addrIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.softOrange, alignItems: "center", justifyContent: "center" },
  addrTextBlock: { flex: 1 },
  addrLabelRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  addrLabel: { fontSize: 15, fontFamily: FONTS.semibold, color: COLORS.black },
  defaultBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#ECFDF5", paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.pill },
  defaultText: { fontSize: 11, fontFamily: FONTS.medium, color: COLORS.success },
  addrLine: { fontSize: 13, fontFamily: FONTS.regular, color: COLORS.textSecondary, marginTop: 4 },
  addrLine2: { fontSize: 13, fontFamily: FONTS.regular, color: COLORS.textSecondary, marginTop: 1 },
  addrActions: { flexDirection: "row", justifyContent: "flex-end", gap: SPACING.md, marginTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.sm },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: RADIUS.sm },
  deleteBtn: { backgroundColor: "#FEF2F2" },
  actionText: { fontSize: 13, fontFamily: FONTS.medium, color: COLORS.primary },
  floatingBtnWrap: { position: "absolute", bottom: 24, left: 0, right: 0, alignItems: "center" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.primary, paddingHorizontal: SPACING.xxl, paddingVertical: SPACING.md, borderRadius: RADIUS.pill, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  addBtnText: { color: COLORS.white, fontSize: 15, fontFamily: FONTS.semibold },
});
