import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, User, MapPin, Briefcase, Phone, Save } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth";
import { getProfile, updateProfile } from "@/db/index";

export default function PersonalInfoScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [fullName, setFullName] = useState(user?.full_name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [city, setCity] = useState(user?.city || "");
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Load persisted profile (from Supabase, fallback to local)
  useEffect(() => {
    (async () => {
      if (!user?.id) { setInitialized(true); return; }
      try {
        const p = await getProfile(user.id);
        if (p) {
          setFullName(p.full_name ?? user.full_name ?? "");
          setPhone(p.phone ?? user.phone ?? "");
          setCity(p.city ?? user.city ?? "");
        }
      } catch {}
      setInitialized(true);
    })();
  }, [user?.id]);

  const handleSave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!fullName.trim()) {
      Alert.alert("Name required", "Please enter your full name.");
      return;
    }
    setSaving(true);
    try {
      if (user?.id) {
        await updateProfile(user.id, { full_name: fullName.trim(), phone: phone.trim() || null, city: city.trim() || null });
      }
      // Also update local auth metadata name so the profile card reflects it
      setLoading(false);
      Alert.alert("Saved", "Your personal information has been updated.");
    } catch {
      Alert.alert("Error", "Could not save. Please try again.");
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
          <Text style={styles.headerTitle}>Personal Information</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {!initialized ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : (
            <View style={styles.card}>
              {/* Avatar */}
              <View style={styles.avatarWrap}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{fullName.slice(0, 1).toUpperCase() || "U"}</Text>
                </View>
              </View>

              <Field
                label="Full Name" icon={<User size={18} color={COLORS.gray400} />}
                value={fullName} onChange={setFullName} placeholder="Your full name"
              />
              <Field
                label="Email" icon={<MapPin size={18} color={COLORS.gray400} />}
                value={user?.email || ""} onChange={() => {}} editable={false} disabled
              />
              <Field
                label="Phone" icon={<Phone size={18} color={COLORS.gray400} />}
                value={phone} onChange={setPhone} placeholder="+252 ..." keyboardType="phone-pad"
              />
              <Field
                label="City" icon={<MapPin size={18} color={COLORS.gray400} />}
                value={city} onChange={setCity} placeholder="e.g. Mogadishu, Hargeisa"
              />
              <Field
                label="Business Name (optional)" icon={<Briefcase size={18} color={COLORS.gray400} />}
                value={businessName} onChange={setBusinessName} placeholder="e.g. My Trading Co."
              />

              <Pressable style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving} android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
                {saving ? <ActivityIndicator size="small" color={COLORS.white} /> : <><Save size={18} color={COLORS.white} /><Text style={styles.saveButtonText}>{t("common.save")}</Text></>}
              </Pressable>

              <Text style={styles.syncNote}>
                Your details sync with the ChinaSuuq admin mission control so our team can arrange deliveries faster.
              </Text>
            </View>
          )}
          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label, icon, value, onChange, placeholder, keyboardType, editable, disabled,
}: {
  label: string; icon: React.ReactNode; value: string; onChange: (t: string) => void;
  placeholder?: string; keyboardType?: "default" | "phone-pad"; editable?: boolean; disabled?: boolean;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputRow, disabled && styles.inputRowDisabled]}>
        {icon}
        <TextInput
          style={[styles.input, disabled && styles.inputDisabled]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={COLORS.gray400}
          keyboardType={keyboardType}
          editable={editable !== false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: FONTS.semibold, color: COLORS.black },
  scroll: { flex: 1 },
  centerLoading: { paddingVertical: 80, alignItems: "center" },
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, marginHorizontal: SPACING.lg, marginTop: SPACING.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  avatarWrap: { alignItems: "center", marginBottom: SPACING.lg },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: COLORS.softOrange, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 34, fontFamily: FONTS.bold, color: COLORS.primary },
  fieldGroup: { marginBottom: SPACING.md },
  fieldLabel: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.gray600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.gray50, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, gap: SPACING.sm, height: 44 },
  inputRowDisabled: { backgroundColor: COLORS.gray100 },
  input: { flex: 1, fontSize: 15, fontFamily: FONTS.regular, color: COLORS.black, height: 44 },
  inputDisabled: { color: COLORS.textMuted },
  saveButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: SPACING.md, marginTop: SPACING.sm },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: 15, fontFamily: FONTS.semibold, color: COLORS.white },
  syncNote: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.textMuted, textAlign: "center", marginTop: SPACING.lg },
});
