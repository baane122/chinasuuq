/**
 * StaffMarketplacesScreen
 * 
 * Staff-only view showing all marketplaces with session status and sync controls
 */
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Cookie } from "lucide-react-native";
import { COLORS, SPACING, RADIUS } from "@/lib/theme";
import { MARKETPLACES } from "@/lib/marketplaces";
import { StaffMarketplaceCard } from "@/components/staff/StaffMarketplaceCard";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth";
import { supabase } from "@/lib/supabase";

export default function StaffMarketplacesScreen() {
  const router = useRouter();
  const { locale } = useI18n();
  const tt = (en: string, so: string) => (locale === "en" ? en : so);
  const authUser = useAuthStore((s) => s.user);
  const authReady = useAuthStore((s) => s.initialized);

  // Staff gate (product decision 2026-10-03: marketplace credentials/session
  // controls are staff-only). Mirrors the profiles.role check in
  // app/marketplace/[marketplace].tsx — the auth store role is the fast path,
  // the profiles query is the authority.
  const [roleChecked, setRoleChecked] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  // A failed profiles read is NOT a "not staff" verdict — treating a network
  // blip as an auth failure locked genuine staff out with an auth-looking
  // Alert. roleError distinguishes the two, and Retry re-runs the check.
  const [roleError, setRoleError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!authReady) return; // wait for session restore before deciding
    let alive = true;
    setRoleChecked(false);
    setRoleError(null);
    (async () => {
      if (!authUser?.id) {
        if (alive) { setIsStaff(false); setRoleChecked(true); }
        return;
      }
      const storeRole = String(authUser.role ?? "");
      if (storeRole === "staff" || storeRole === "super_admin") {
        if (alive) { setIsStaff(true); setRoleChecked(true); }
        return;
      }
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", authUser.id)
          .maybeSingle();
        if (!alive) return;
        if (error) {
          // PostgREST answered (RLS/permission rejection → honest "not
          // staff"); anything else means we never got an answer.
          if (/network|fetch|timeout|Failed to fetch/i.test(String(error.message || ""))) {
            setRoleError(
              tt(
                "Couldn't verify your role — check your connection.",
                "Lama xaqiijin karin booskaaga — fadlan hubi isku xirka."
              )
            );
          } else {
            setIsStaff(false);
          }
        } else {
          const role = String((data as any)?.role ?? "");
          setIsStaff(role === "staff" || role === "super_admin");
        }
      } catch {
        if (alive) {
          setRoleError(
            tt(
              "Couldn't verify your role — check your connection.",
              "Lama xaqiijin karin booskaaga — fadlan hubi isku xirka."
            )
          );
        }
      } finally {
        if (alive) setRoleChecked(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [authReady, authUser?.id, authUser?.role, attempt]);

  useEffect(() => {
    if (roleChecked && !isStaff && !roleError) {
      Alert.alert(
        tt("Staff only", "Shaqaalaha oo kaliya"),
        tt(
          "This screen is for staff accounts only.",
          "Shaashaddan waa kuwa shaqaalaha ah oo kaliya."
        ),
        [{ text: tt("OK", "Hagaag"), onPress: () => router.replace("/(tabs)/home") }]
      );
    }
  }, [roleChecked, isStaff, roleError]);

  if (!roleChecked) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (roleError && !isStaff) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={20} color="#111111" />
          </TouchableOpacity>
          <Text style={styles.title}>Staff Marketplaces</Text>
          <View style={styles.spacer} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xl }}>
          <Text style={{ fontSize: 15, color: "#374151", textAlign: "center", marginBottom: SPACING.md }}>
            {roleError}
          </Text>
          <TouchableOpacity
            onPress={() => setAttempt((a) => a + 1)}
            style={{ backgroundColor: "#FF5A0A", paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm, borderRadius: RADIUS.md }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600" }}>
              {tt("Retry", "Isku day mar kale")}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!isStaff) return null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={20} color="#111111" />
        </TouchableOpacity>
        <Text style={styles.title}>Staff Marketplaces</Text>
        <View style={styles.spacer} />
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Cookie size={16} color="#FF5A0A" />
        <Text style={styles.infoText}>
          Open each marketplace below, log in inside the webview, then tap "Sync session" in the header to save the cookies.
        </Text>
      </View>

      {/* Marketplace List */}
      <ScrollView style={styles.scroll}>
        {MARKETPLACES.map((mp: any) => (
          <StaffMarketplaceCard key={mp.id} marketplace={mp} />
        ))}

        <View style={styles.footer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAFAFA",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderColor: "#E5E7EB",
  },
  backButton: {
    padding: SPACING.xs,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111111",
  },
  spacer: {
    width: 40,
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF7ED",
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: "#C2410C",
    lineHeight: 18,
  },
  scroll: {
    flex: 1,
    padding: SPACING.lg,
  },
  footer: {
    height: 100,
  },
});
