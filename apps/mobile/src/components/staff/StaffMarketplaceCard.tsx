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
import { fetchMarketplaceSession } from "@/lib/supabase";
import type { MarketplaceSessionResult } from "@/lib/supabase";
import type { Marketplace } from "@/lib/marketplaces";

interface Props {
  marketplace: Marketplace;
}

export function StaffMarketplaceCard({ marketplace }: Props) {
  const router = useRouter();
  const [result, setResult] = useState<MarketplaceSessionResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSession();
  }, [marketplace.id]);

  async function loadSession() {
    setLoading(true);
    // Returns a result rather than null so a network failure cannot be drawn
    // as "No Session": that wording tells a staff member their shared login is
    // gone, and they will re-log-in or escalate over a read that simply timed
    // out. "Unknown" is the honest answer, and it is tappable.
    const data = await fetchMarketplaceSession(marketplace.id);
    setResult(data);
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

  const session = result?.session ?? null;
  const failed = result?.failed === true;

  const statusLabel = loading
    ? "..."
    : !session
      ? failed
        ? "Unknown"
        : "No Session"
      : failed
        ? "Last known"
        : "Active";

  const getStatusColor = () => {
    if (loading) return "#6B7280";
    if (!session) return failed ? "#F79009" : "#D92D20";
    return failed ? "#F79009" : "#12B76A";
  };

  const getStatusIcon = () => {
    if (loading) return "⚪";
    if (!session) return failed ? "🟠" : "🔴";
    return failed ? "🟠" : "🟢";
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.info}>
          <Text style={styles.name}>{marketplace.name}</Text>
          <Text style={styles.domain}>{marketplace.id}.com</Text>
        </View>

        <TouchableOpacity
          style={[styles.status, { backgroundColor: getStatusColor() + "20" }]}
          onPress={loadSession}
          disabled={loading}
        >
          <Text style={styles.statusText}>{getStatusIcon()}</Text>
          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {statusLabel}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.syncButton} onPress={handleOpen}>
        <Cookie size={16} color="#FFFFFF" />
        <Text style={styles.syncText}>Open Marketplace</Text>
      </TouchableOpacity>

      <Text style={styles.syncHint}>
        Open marketplace, log in, then tap Sync in the header
      </Text>

      {failed && !loading && (
        // Says which of the two it is: the read failed, or the login really is
        // missing. Tapping the chip above retries without leaving the screen.
        <Text style={styles.syncHint}>
          Couldn’t check the shared session{session ? " — showing the last one read" : ""}. Tap the status to retry.
        </Text>
      )}

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
