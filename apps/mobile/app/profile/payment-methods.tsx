import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  CreditCard,
  Check,
  Wallet,
  Banknote,
  Plus,
  X,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth";
import { supabase } from "@/lib/supabase";
import { getPaymentsByUser, type PaymentRecord } from "@/db/index";

const PREF_KEY = "chinasuuq-preferred-payment";

const METHODS = [
  { id: "zaad", name: "ZAAD", desc: "Hormuud Telecom", kind: "mobile_money" },
  { id: "edahab", name: "Edahab", desc: "Telesom", kind: "mobile_money" },
  { id: "evc_plus", name: "EVC Plus", desc: "Somtel", kind: "mobile_money" },
  { id: "premier", name: "Premier Wallet", desc: "Golis / Telesom", kind: "mobile_money" },
  { id: "sahal", name: "Sahal", desc: "Sahal Bank", kind: "mobile_money" },
  { id: "bank_transfer", name: "Bank Transfer", desc: "Amana / Dahabshil", kind: "bank" },
];

interface SavedMethod {
  id: string;
  method: string;
  identifier: string;
  label: string | null;
  is_default: boolean;
}

export default function PaymentMethodsScreen() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [selected, setSelected] = useState("zaad");
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<SavedMethod[]>([]);
  const [modalMethod, setModalMethod] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user?.id) { setLoading(false); return; }
      try {
        const list = await getPaymentsByUser(user.id);
        setPayments(list);
      } catch {}
      try {
        const stored = await AsyncStorage.getItem(PREF_KEY);
        if (stored) setSelected(stored);
        const { data } = await supabase
          .from("customer_payment_methods")
          .select("id, method, identifier, label, is_default")
          .eq("profile_id", user.id)
          .order("is_default", { ascending: false });
        if (data) setSaved(data as SavedMethod[]);
      } catch {}
      setLoading(false);
    })();
  }, [user?.id]);

  const choose = async (id: string) => {
    Haptics.selectionAsync();
    setSelected(id);
    await AsyncStorage.setItem(PREF_KEY, id);
  };

  const openAdd = (methodId: string) => {
    setModalMethod(methodId);
    setPhone("");
  };

  const saveMethod = async () => {
    if (!user?.id || !modalMethod) return;
    if (!/^[0-9+\s-]{7,}$/.test(phone.trim())) {
      Alert.alert(
        locale === "en" ? "Invalid number" : "Lambarka khaldan",
        locale === "en"
          ? "Please enter a valid phone or account number."
          : "Fadlan geli lambar taleefan ama akoon sax ah."
      );
      return;
    }
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const method = METHODS.find((m) => m.id === modalMethod);
      const { data, error } = await supabase
        .from("customer_payment_methods")
        .insert({
          profile_id: user.id,
          method: modalMethod,
          identifier: phone.trim(),
          label: method?.name || null,
          is_default: saved.length === 0,
        })
        .select("id, method, identifier, label, is_default")
        .single();
      if (error) throw error;
      if (data) setSaved((prev) => [data as SavedMethod, ...prev]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModalMethod(null);
      setPhone("");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not save payment method.");
    } finally {
      setSaving(false);
    }
  };

  const removeMethod = async (id: string) => {
    try {
      await supabase.from("customer_payment_methods").delete().eq("id", id);
      setSaved((prev) => prev.filter((m) => m.id !== id));
    } catch {}
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={22} color={COLORS.black} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {locale === "en" ? "Payment Methods" : "Hababka Lacag Bixinta"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
        data={[
          { key: "methods", title: locale === "en" ? "Choose your preferred method" : "Dooro habkaaga" },
          ...(user
            ? [{ key: "saved", title: locale === "en" ? "Saved methods" : "Hababka keydsan" }]
            : []),
          { key: "history", title: locale === "en" ? "Recent payments" : "Lacag bixintii u danbeysay" },
        ]}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => {
          if (item.key === "methods") {
            return (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{item.title}</Text>
                {METHODS.map((m, i) => {
                  const isSel = selected === m.id;
                  return (
                    <React.Fragment key={m.id}>
                      {i > 0 && <View style={styles.divider} />}
                      <Pressable
                        style={styles.methodRow}
                        onPress={() => choose(m.id)}
                      >
                        <View style={styles.methodIconWrap}>
                          {m.kind === "bank" ? (
                            <Banknote size={18} color={COLORS.primary} />
                          ) : (
                            <Wallet size={18} color={COLORS.primary} />
                          )}
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
          if (item.key === "saved") {
            return (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{item.title}</Text>
                {saved.length === 0 ? (
                  <Text style={styles.emptyText}>
                    {locale === "en"
                      ? "Add a mobile money or bank account below for faster checkout."
                      : "Ku dar lacagta moobaylka ama akoonka bankiga si aad u dhaqso ugu bixiso."}
                  </Text>
                ) : (
                  saved.map((m, i) => {
                    const meta = METHODS.find((x) => x.id === m.method);
                    return (
                      <React.Fragment key={m.id}>
                        {i > 0 && <View style={styles.divider} />}
                        <View style={styles.savedRow}>
                          <View style={styles.methodIconWrap}>
                            {meta?.kind === "bank" ? (
                              <Banknote size={18} color={COLORS.primary} />
                            ) : (
                              <Wallet size={18} color={COLORS.primary} />
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.methodName}>
                              {meta?.name || m.method} {m.is_default ? " · ✓" : ""}
                            </Text>
                            <Text style={styles.methodDesc}>{m.identifier}</Text>
                          </View>
                          <Pressable hitSlop={8} onPress={() => removeMethod(m.id)}>
                            <X size={16} color={COLORS.textMuted} />
                          </Pressable>
                        </View>
                      </React.Fragment>
                    );
                  })
                )}
                <View style={styles.addMethodRow}>
                  {METHODS.map((m) => (
                    <Pressable
                      key={m.id}
                      style={styles.addMethodChip}
                      onPress={() => openAdd(m.id)}
                    >
                      <Plus size={14} color={COLORS.primary} />
                      <Text style={styles.addMethodChipText}>{m.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          }
          return (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{item.title}</Text>
              {loading ? (
                <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 20 }} />
              ) : payments.length === 0 ? (
                <Text style={styles.emptyText}>
                  {locale === "en"
                    ? "No payment history yet. Payments appear after you place orders."
                    : "Wali taariikh lacag bixin ma jiro."}
                </Text>
              ) : (
                payments.map((p, i) => (
                  <React.Fragment key={p.id}>
                    {i > 0 && <View style={styles.divider} />}
                    <View style={styles.paymentRow}>
                      <View style={styles.paymentIconWrap}>
                        <CreditCard size={16} color={COLORS.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.paymentRef}>{p.reference || "Order payment"}</Text>
                        <Text style={styles.paymentStatus}>
                          {p.status} · {p.shipping_method || "—"} freight
                        </Text>
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

      {/* Add method modal */}
      <Modal visible={!!modalMethod} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {locale === "en" ? `Add ${METHODS.find((m) => m.id === modalMethod)?.name}` : `Ku dar ${METHODS.find((m) => m.id === modalMethod)?.name}`}
              </Text>
              <Pressable hitSlop={8} onPress={() => setModalMethod(null)}>
                <X size={20} color={COLORS.black} />
              </Pressable>
            </View>
            <Text style={styles.label}>
              {locale === "en" ? "Phone or account number" : "Lambarka taleefanka ama akoonka"}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="+252 61 234 5678"
              placeholderTextColor={COLORS.gray400}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setModalMethod(null)}
              >
                <Text style={styles.cancelText}>
                  {locale === "en" ? "Cancel" : "Jooji"}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={saveMethod}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.saveText}>
                    {locale === "en" ? "Save" : "Kaydi"}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: FONTS.semibold, color: COLORS.black },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  sectionTitle: { fontSize: 14, fontFamily: FONTS.semibold, color: COLORS.black, marginBottom: SPACING.sm },
  methodRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, paddingVertical: SPACING.md },
  savedRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, paddingVertical: SPACING.md },
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
  addMethodRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginTop: SPACING.md },
  addMethodChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.softOrange,
  },
  addMethodChipText: { fontSize: 12, fontFamily: FONTS.semibold, color: COLORS.primary },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.lg,
  },
  modalTitle: { fontSize: 18, fontFamily: FONTS.bold, color: COLORS.black },
  label: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  input: {
    height: 52,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    fontSize: 15,
    color: COLORS.black,
    backgroundColor: COLORS.warmWhite,
  },
  modalActions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.lg },
  cancelBtn: {
    flex: 1,
    height: 50,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { color: COLORS.textSecondary, fontSize: 15, fontFamily: FONTS.semibold },
  saveBtn: {
    flex: 2,
    height: 50,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: COLORS.white, fontSize: 15, fontFamily: FONTS.bold },
});
