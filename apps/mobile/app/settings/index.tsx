import React, { useCallback, useEffect, useState } from "react";
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
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  User,
  Mail,
  MapPin,
  Truck,
  Globe,
  Wifi,
  WifiOff,
  Save,
  Check,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth";

// Lazy import to avoid crash if db module has issues
let isBackendOnline: () => Promise<boolean> = async () => false;
let refreshBackendState: () => Promise<{ online: boolean }> = async () => ({ online: false });
// Canonical durations match app/profile/shipping-info.tsx (air 7–14, sea
// 25–35) — the fallback used to show different numbers than every other
// shipping surface in the app.
const SHIPPING_METHODS_FALLBACK: Array<{ id: string; label: string; days: string; desc: string }> = [
  { id: "air", label: "Air Freight", days: "7–14 days", desc: "Faster, paid on arrival" },
  { id: "sea", label: "Sea Freight", days: "25–35 days", desc: "Economical, paid on arrival" },
];
let SHIPPING_METHODS: Array<{ id: string; label: string; days: string; desc: string }> = SHIPPING_METHODS_FALLBACK;
let updateProfile: (userId: string, updates: any) => Promise<{ error: string | null }> = async () => ({
  error: "Storage unavailable",
});

try {
  const db = require("@/db/index");
  if (db.isBackendOnline) isBackendOnline = db.isBackendOnline;
  if (db.refreshBackendState) refreshBackendState = db.refreshBackendState;
  // Deliberately NOT taking db.SHIPPING_METHODS — keep this screen aligned
  // with the shipping-info table until the db constant carries the same days.
  if (db.updateProfile) updateProfile = db.updateProfile;
} catch {}

type ShippingMethodId = "air" | "sea";

export default function SettingsScreen() {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [fullName, setFullName] = useState(user?.full_name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [city, setCity] = useState(user?.city || "");
  const [selectedShipping, setSelectedShipping] = useState<string>("air");
  const [selectedLanguage, setSelectedLanguage] = useState<"en" | "so">(locale);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [checkingBackend, setCheckingBackend] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const checkBackend = useCallback(async (force = false) => {
    if (force) setCheckingBackend(true);
    try {
      const online = force ? (await refreshBackendState()).online : await isBackendOnline();
      setBackendOnline(online);
    } catch {
      setBackendOnline(false);
    } finally {
      setCheckingBackend(false);
    }
  }, []);

  useEffect(() => {
    checkBackend();
  }, [checkBackend]);

  const onRefresh = async () => {
    setRefreshing(true);
    await checkBackend(true);
    setRefreshing(false);
  };

  const handleSaveProfile = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Guests have no profile row to write — saying "Saved" was a lie.
    if (!user?.id) {
      Alert.alert("Sign in required", "Please sign in to save your profile.");
      return;
    }
    // Never let a blank field wipe the stored name.
    const name = fullName.trim();
    if (!name) {
      Alert.alert("Name required", "Please enter your full name.");
      return;
    }
    setSaving(true);
    try {
      // updateProfile resolves { error } — only claim success when it is null.
      const { error } = await updateProfile(user.id, {
        full_name: name,
        phone: phone.trim() || null,
        city: city.trim() || null,
      });
      if (error) {
        Alert.alert(t("common.error"), error || t("settings.saveFailed"));
      } else {
        Alert.alert(t("settings.savedTitle"), t("settings.savedDesc"));
      }
    } catch {
      Alert.alert(t("common.error"), t("settings.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleLanguageChange = async (lang: "en" | "so") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedLanguage(lang);
    await setLocale(lang);
  };

  const handleShippingChange = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedShipping(id);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
            android_ripple={{ color: COLORS.gray100 }}
          >
            <ArrowLeft size={22} color={COLORS.black} />
          </Pressable>
          <Text style={styles.headerTitle}>{t("profile.settings")}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Backend Status */}
        <View
          style={[
            styles.backendBadge,
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
            <Wifi size={14} color={COLORS.success} />
          ) : (
            <WifiOff size={14} color={COLORS.error} />
          )}
          <Text
            style={[
              styles.backendBadgeText,
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
              ? t("settings.backendChecking")
              : backendOnline
              ? t("settings.backendOnline")
              : t("settings.backendOffline")}
          </Text>
        </View>

        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
        >
          {/* Profile Edit Section */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>
              <User size={16} color={COLORS.primary} /> {t("settings.profileInfo")}
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{t("settings.fullName")}</Text>
              <View style={styles.inputRow}>
                <User size={18} color={COLORS.gray400} />
                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder={t("settings.fullNamePlaceholder")}
                  placeholderTextColor={COLORS.gray400}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{t("common.email")}</Text>
              <View style={styles.inputRow}>
                <Mail size={18} color={COLORS.gray400} />
                <TextInput
                  style={[styles.input, styles.inputDisabled]}
                  value={user?.email || ""}
                  editable={false}
                  placeholderTextColor={COLORS.gray400}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{t("common.phone")}</Text>
              <View style={styles.inputRow}>
                <Text style={[styles.inputIconText, { color: COLORS.gray400 }]}>
                  +252
                </Text>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder={t("settings.phonePlaceholder")}
                  placeholderTextColor={COLORS.gray400}
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{t("settings.city")}</Text>
              <View style={styles.inputRow}>
                <MapPin size={18} color={COLORS.gray400} />
                <TextInput
                  style={styles.input}
                  value={city}
                  onChangeText={setCity}
                  placeholder={t("settings.cityPlaceholder")}
                  placeholderTextColor={COLORS.gray400}
                />
              </View>
            </View>

            <Pressable
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSaveProfile}
              disabled={saving}
              android_ripple={{ color: "rgba(255,255,255,0.2)" }}
            >
              {saving ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <>
                  <Save size={18} color={COLORS.white} />
                  <Text style={styles.saveButtonText}>{t("common.save")}</Text>
                </>
              )}
            </Pressable>
          </View>

          {/* Shipping Preference Section */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>
              <Truck size={16} color={COLORS.primary} /> {t("settings.shippingPreference")}
            </Text>
            <Text style={styles.sectionSubtitle}>
              {t("settings.chooseShippingMethod")}
            </Text>

            {SHIPPING_METHODS.map((method) => {
              const isSelected = selectedShipping === method.id;
              return (
                <Pressable
                  key={method.id}
                  style={[
                    styles.shippingOption,
                    isSelected && styles.shippingOptionSelected,
                  ]}
                  onPress={() => handleShippingChange(method.id)}
                  android_ripple={{ color: COLORS.gray100 }}
                >
                  <View
                    style={[
                      styles.radio,
                      isSelected && styles.radioSelected,
                    ]}
                  >
                    {isSelected && <Check size={14} color={COLORS.white} />}
                  </View>
                  <View style={styles.shippingTextBlock}>
                    <Text
                      style={[
                        styles.shippingLabel,
                        isSelected && { color: COLORS.primary },
                      ]}
                    >
                      {method.label}
                    </Text>
                    <Text style={styles.shippingDesc}>
                      {method.days} — {method.desc}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Language Section */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>
              <Globe size={16} color={COLORS.primary} />{" "}
              {t("profile.language")}
            </Text>

            <Pressable
              style={[
                styles.languageOption,
                selectedLanguage === "en" && styles.languageOptionSelected,
              ]}
              onPress={() => handleLanguageChange("en")}
              android_ripple={{ color: COLORS.gray100 }}
            >
              <View
                style={[
                  styles.radio,
                  selectedLanguage === "en" && styles.radioSelected,
                ]}
              >
                {selectedLanguage === "en" && (
                  <Check size={14} color={COLORS.white} />
                )}
              </View>
              <Text style={styles.languageLabel}>English</Text>
            </Pressable>

            <Pressable
              style={[
                styles.languageOption,
                selectedLanguage === "so" && styles.languageOptionSelected,
              ]}
              onPress={() => handleLanguageChange("so")}
              android_ripple={{ color: COLORS.gray100 }}
            >
              <View
                style={[
                  styles.radio,
                  selectedLanguage === "so" && styles.radioSelected,
                ]}
              >
                {selectedLanguage === "so" && (
                  <Check size={14} color={COLORS.white} />
                )}
              </View>
              <Text style={styles.languageLabel}>Soomaali</Text>
            </Pressable>
          </View>

          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.warmWhite,
  },
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
  },
  backendBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    marginTop: SPACING.sm,
    paddingVertical: 4,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.pill,
  },
  backendOnline: {
    backgroundColor: COLORS.successBg,
  },
  backendOffline: {
    backgroundColor: COLORS.errorBg,
  },
  backendChecking: {
    backgroundColor: COLORS.gray100,
  },
  backendBadgeText: {
    fontSize: 11,
    fontFamily: FONTS.medium,
  },
  scroll: {
    flex: 1,
  },
  sectionCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
    marginBottom: SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionSubtitle: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  fieldGroup: {
    marginBottom: SPACING.md,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: COLORS.gray600,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.gray50,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    height: 44,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONTS.regular,
    color: COLORS.black,
    height: 44,
  },
  inputDisabled: {
    color: COLORS.textMuted,
  },
  inputIconText: {
    fontSize: 15,
    fontFamily: FONTS.regular,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 15,
    fontFamily: FONTS.semibold,
    color: COLORS.white,
  },
  shippingOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  shippingOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.softOrange,
  },
  shippingTextBlock: {
    flex: 1,
  },
  shippingLabel: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
  },
  shippingDesc: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.gray300,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  languageOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  languageOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.softOrange,
  },
  languageLabel: {
    fontSize: 15,
    fontFamily: FONTS.medium,
    color: COLORS.black,
  },
});