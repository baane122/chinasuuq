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
import { isBackendOnline, SHIPPING_METHODS, updateProfile } from "@/db/index";

type ShippingMethodId = (typeof SHIPPING_METHODS)[number]["id"];

export default function SettingsScreen() {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [fullName, setFullName] = useState(user?.full_name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [city, setCity] = useState(user?.city || "");
  const [selectedShipping, setSelectedShipping] = useState<ShippingMethodId>("air");
  const [selectedLanguage, setSelectedLanguage] = useState<"en" | "so">(locale);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [checkingBackend, setCheckingBackend] = useState(true);
  const [saving, setSaving] = useState(false);

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

  const handleSaveProfile = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSaving(true);
    try {
      if (user?.id) {
        // Persist to Supabase profiles table (local-first fallback in db layer)
        await updateProfile(user.id, { full_name: fullName.trim(), phone: phone.trim() || null, city: city.trim() || null });
      }
      Alert.alert("Saved", "Profile updated successfully.");
    } catch {
      Alert.alert("Error", "Could not save. Your changes were kept on this device.");
    } finally {
      setSaving(false);
    }
  };

  const handleLanguageChange = async (lang: "en" | "so") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedLanguage(lang);
    await setLocale(lang);
  };

  const handleShippingChange = (id: ShippingMethodId) => {
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
              ? "Checking..."
              : backendOnline
              ? "Backend Online"
              : "Offline — local data"}
          </Text>
        </View>

        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Profile Edit Section */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>
              <User size={16} color={COLORS.primary} /> Profile Information
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Full Name</Text>
              <View style={styles.inputRow}>
                <User size={18} color={COLORS.gray400} />
                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Your full name"
                  placeholderTextColor={COLORS.gray400}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Email</Text>
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
              <Text style={styles.fieldLabel}>Phone</Text>
              <View style={styles.inputRow}>
                <Text style={[styles.inputIconText, { color: COLORS.gray400 }]}>
                  +252
                </Text>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Phone number"
                  placeholderTextColor={COLORS.gray400}
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>City</Text>
              <View style={styles.inputRow}>
                <MapPin size={18} color={COLORS.gray400} />
                <TextInput
                  style={styles.input}
                  value={city}
                  onChangeText={setCity}
                  placeholder="e.g. Mogadishu, Hargeisa"
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
              <Truck size={16} color={COLORS.primary} /> Shipping Preference
            </Text>
            <Text style={styles.sectionSubtitle}>
              Choose your default shipping method
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
    backgroundColor: "#ECFDF5",
  },
  backendOffline: {
    backgroundColor: "#FEF2F2",
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