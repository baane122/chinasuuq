import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, ActivityIndicator, Switch, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Home, MapPin, Phone, User, Save } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useAuthStore } from "@/store/auth";
import { getAddresses, saveAddress } from "@/db/index";

const LABELS = ["Home", "Office", "Other"];

export default function AddAddressScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const user = useAuthStore((s) => s.user);
  const editingId = params?.id;

  const [label, setLabel] = useState("Home");
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [city, setCity] = useState(user?.city || "");
  const [district, setDistrict] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load existing address when editing
  useEffect(() => {
    (async () => {
      if (!editingId || !user?.id) return;
      const list = await getAddresses(user.id);
      const found = list.find((a) => a.id === editingId);
      if (found) {
        setLabel(found.label || "Home");
        setFullName(found.full_name || "");
        setPhone(found.phone || "");
        setCity(found.city || "");
        setDistrict(found.district || "");
        setAddressLine1(found.address_line1 || "");
        setAddressLine2(found.address_line2 || "");
        setIsDefault(found.is_default || false);
      }
    })();
  }, [editingId, user?.id]);

  const handleSave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!user?.id) { Alert.alert("Sign in required", "Please sign in to save an address."); return; }
    if (!fullName.trim() || !city.trim() || !addressLine1.trim()) {
      Alert.alert("Missing fields", "Full name, city and address line are required.");
      return;
    }
    setSaving(true);
    try {
      await saveAddress({
        id: editingId,
        user_id: user.id,
        label,
        full_name: fullName.trim(),
        phone: phone.trim(),
        city: city.trim(),
        district: district.trim() || undefined,
        address_line1: addressLine1.trim(),
        address_line2: addressLine2.trim() || undefined,
        is_default: isDefault,
      });
      Alert.alert("Saved", editingId ? "Address updated." : "Address added.", [{ text: "OK", onPress: () => router.back() }]);
    } catch {
      Alert.alert("Error", "Could not save address. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()} android_ripple={{ color: COLORS.gray100 }}>
            <ArrowLeft size={22} color={COLORS.black} />
          </Pressable>
          <Text style={styles.headerTitle}>{editingId ? "Edit Address" : "Add Address"}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            {/* Label picker */}
            <Text style={styles.fieldLabel}>Label</Text>
            <View style={styles.labelRow}>
              {LABELS.map((l) => (
                <Pressable
                  key={l}
                  style={[styles.labelChip, label === l && styles.labelChipActive]}
                  onPress={() => { setLabel(l); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.labelChipText, label === l && styles.labelChipTextActive]}>{l}</Text>
                </Pressable>
              ))}
            </View>

            <Field label="Full Name" icon={<User size={18} color={COLORS.gray400} />} value={fullName} onChange={setFullName} placeholder="Recipient name" />
            <Field label="Phone" icon={<Phone size={18} color={COLORS.gray400} />} value={phone} onChange={setPhone} placeholder="+252 ..." keyboardType="phone-pad" />
            <Field label="City" icon={<MapPin size={18} color={COLORS.gray400} />} value={city} onChange={setCity} placeholder="e.g. Mogadishu" />
            <Field label="District / Area" icon={<MapPin size={18} color={COLORS.gray400} />} value={district} onChange={setDistrict} placeholder="e.g. Hamar Weyne" />
            <Field label="Address Line 1" icon={<Home size={18} color={COLORS.gray400} />} value={addressLine1} onChange={setAddressLine1} placeholder="Street, building, landmark" />
            <Field label="Address Line 2 (optional)" icon={<Home size={18} color={COLORS.gray400} />} value={addressLine2} onChange={setAddressLine2} placeholder="Apartment, floor" />

            <View style={styles.defaultRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.defaultTitle}>Set as default</Text>
                <Text style={styles.defaultSub}>Use this address for new orders by default</Text>
              </View>
              <Switch value={isDefault} onValueChange={setIsDefault} trackColor={{ false: COLORS.gray300, true: COLORS.primary }} thumbColor={COLORS.white} />
            </View>

            <Pressable style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving} android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
              {saving ? <ActivityIndicator size="small" color={COLORS.white} /> : <><Save size={18} color={COLORS.white} /><Text style={styles.saveButtonText}>Save Address</Text></>}
            </Pressable>
          </View>
          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, icon, value, onChange, placeholder, keyboardType }: { label: string; icon: React.ReactNode; value: string; onChange: (t: string) => void; placeholder?: string; keyboardType?: "default" | "phone-pad"; }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputRow}>
        {icon}
        <TextInput style={styles.input} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={COLORS.gray400} keyboardType={keyboardType} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: FONTS.semibold, color: COLORS.black },
  scroll: { flex: 1 },
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, marginHorizontal: SPACING.lg, marginTop: SPACING.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  fieldLabel: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.gray600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  labelRow: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.md },
  labelChip: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.gray300 },
  labelChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  labelChipText: { fontSize: 13, fontFamily: FONTS.medium, color: COLORS.textSecondary },
  labelChipTextActive: { color: COLORS.white },
  fieldGroup: { marginBottom: SPACING.md },
  inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.gray50, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, gap: SPACING.sm, height: 44 },
  input: { flex: 1, fontSize: 15, fontFamily: FONTS.regular, color: COLORS.black, height: 44 },
  defaultRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: SPACING.sm },
  defaultTitle: { fontSize: 14, fontFamily: FONTS.semibold, color: COLORS.black },
  defaultSub: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.textSecondary, marginTop: 1 },
  saveButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: SPACING.md, marginTop: SPACING.sm },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: 15, fontFamily: FONTS.semibold, color: COLORS.white },
});
