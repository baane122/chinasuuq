import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, CreditCard, Check, Wallet, Banknote } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth";
import { getPaymentsByUser, type PaymentRecord } from "@/db/index";

const METHODS = [
  { id: "zaad", name: "ZAAD", desc: "Hormuud Telecom" },
  { id: "edahab", name: "Edahab", desc: "Telesom" },
  { id: "evc_plus", name: "EVC Plus", desc: "Somtel" },
  { id: "premier", name: "Premier Wallet", desc: "Golis / Telesom" },
  { id: "sahal", name: "Sahal", desc: "Sahal Bank" },
  { id: "bank_transfer", name: "Bank Transfer", desc: "Amana / Dahabshil" },
];

export default function PaymentMethodsScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [selected, setSelected] = useState("zaad");
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user?.id) { setLoading(false); return; }
      try {
        const list = await getPaymentsByUser(user.id);
        setPayments(list);
      } catch {}
      setLoading(false);
    })();
  }, [user?.id]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()} android_ripple={{ color: COLORS.gray100 }}>
          <ArrowLeft size={22} color={COLORS.black} />
        </Pressable>
        <Text style={styles.headerTitle}>Payment Methods</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        data={[
          { key: "methods", title: "Choose your preferred method" },
          { key: "history", title: "Recent payments" },
        ]}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => {
          if (item.key === "methods") {
            return (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Preferred payment method</Text>
                {METHODS.map((m, i) => {
                  const isSel = selected === m.id;
                  return (
                    <React.Fragment key={m.id}>
                      {i > 0 && <View style={styles.divider} />}
                      <Pressable
                        style={styles.methodRow}
                        onPress={() => { setSelected(m.id); Haptics.selectionAsync(); }}
                        android_ripple={{ color: COLORS.gray100 }}
                      >
                        <View style={styles.methodIconWrap}>
                          {m.id === "bank_transfer" ? <Banknote size={18} color={COLORS.primary} /> : <Wallet size={18} color={COLORS.primary} />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.methodName}>{m.name}</Text>
                          <Text style={styles.methodDesc}>{m.desc}</Text>
                        </View>
                        <View style={[styles.radio, isSel && styles.radioSelected]}>
                          {isSel && <Check size={13} color={COLORS.white} />}
                        </View>
                      </Pressable>
                    </React.Fragment>
                  );
                })}
              </View>
            );
          }
          return (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Recent payment activity</Text>
              {loading ? (
                <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 20 }} />
              ) : payments.length === 0 ? (
                <Text style={styles.emptyText}>No payment history yet. Payments appear after you place orders.</Text>
              ) : (
                payments.map((p, i) => (
                  <React.Fragment key={p.id}>
                    {i > 0 && <View style={styles.divider} />}
                    <View style={styles.paymentRow}>
                      <View style={styles.paymentIconWrap}><CreditCard size={16} color={COLORS.primary} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.paymentRef}>{p.reference || "Order payment"}</Text>
                        <Text style={styles.paymentStatus}>{p.status} · {p.shipping_method || "—"} freight</Text>
                      </View>
                      <Text style={styles.paymentAmount}>${(p.amount ?? 0).toFixed(2)}</Text>
                    </View>
                  </React.Fragment>
                ))
              )}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: FONTS.semibold, color: COLORS.black },
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, marginBottom: SPACING.lg },
  sectionTitle: { fontSize: 14, fontFamily: FONTS.semibold, color: COLORS.black, marginBottom: SPACING.sm },
  methodRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, paddingVertical: SPACING.md },
  methodIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.softOrange, alignItems: "center", justifyContent: "center" },
  methodName: { fontSize: 14, fontFamily: FONTS.semibold, color: COLORS.black },
  methodDesc: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.textSecondary },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.gray300, alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  divider: { height: 1, backgroundColor: COLORS.border },
  paymentRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, paddingVertical: SPACING.md },
  paymentIconWrap: { width: 32, height: 32, borderRadius: 8, backgroundColor: COLORS.softOrange, alignItems: "center", justifyContent: "center" },
  paymentRef: { fontSize: 13, fontFamily: FONTS.semibold, color: COLORS.black },
  paymentStatus: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.textSecondary, textTransform: "capitalize" },
  paymentAmount: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.primary },
  emptyText: { fontSize: 13, fontFamily: FONTS.regular, color: COLORS.textSecondary, paddingVertical: 12 },
});
