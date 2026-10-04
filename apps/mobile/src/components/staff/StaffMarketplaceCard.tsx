/**
 * StaffMarketplaceCard
 * 
 * Enhanced marketplace card showing session status and a jump into the
 * marketplace webview. The real cookie sync lives in the webview header
 * (app/marketplace/[marketplace].tsx syncSession) — this card only navigates
 * there; duplicating the native cookie-jar logic here would drift.
 */
import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { COLORS, SPACING, RADIUS } from "@/lib/theme";
import { Cookie } from "lucide-react-native";
import { getMarketplaceSession } from "@/lib/supabase";
import type { Marketplace } from "@/lib/marketplaces";

interface Props {
  marketplace: Marketplace;
}

export function StaffMarketplaceCard({ marketplace }: Props) {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSession();
  }, [marketplace.id]);

  async function loadSession() {
    setLoading(true);
    const data = await getMarketplaceSession(marketplace.id);
    setSession(data);
    setLoading(false);
  }

  /**
   * Open this marketplace's webview. Staff log in there, then tap
   * "Sync session" in the webview header — that screen owns the native
   * cookie-jar read + marketplace-session-sync upload.
   */
  function handleOpen() {
    router.push(`/marketplace/${marketplace.id}`);
  }

  const getStatusColor = () => {
    if (!session) return "#D92D20";
    if (!session.cookies) return "#F79009";
    return "#12B76A";
  };

  const getStatusIcon = () => {
    if (!session) return "🔴";
    if (!session.cookies) return "🟡";
    return "🟢";
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.info}>
          <Text style={styles.name}>{marketplace.name}</Text>
          <Text style={styles.domain}>{marketplace.id}.com</Text>
        </View>
        
        <View style={[styles.status, { backgroundColor: getStatusColor() + '20' }]}>
          <Text style={styles.statusText}>{getStatusIcon()}</Text>
          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {loading ? "..." : session ? "Active" : "No Session"}
          </Text>
        </View>
      </View>

      <TouchableOpacity style={styles.syncButton} onPress={handleOpen}>
        <Cookie size={16} color="#FFFFFF" />
        <Text style={styles.syncText}>Open Marketplace</Text>
      </TouchableOpacity>

      <Text style={styles.syncHint}>
        Open marketplace, log in, then tap Sync in the header
      </Text>

      {session?.cookiesUpdatedAt && (
        <Text style={styles.timestamp}>
          Last synced: {new Date(session.cookiesUpdatedAt).toLocaleString()}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.md,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111111",
  },
  domain: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  status: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    gap: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF5A0A",
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    gap: SPACING.xs,
  },
  syncText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  syncHint: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: SPACING.xs,
    textAlign: "center",
  },
  timestamp: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: SPACING.sm,
    textAlign: "center",
  },
});
