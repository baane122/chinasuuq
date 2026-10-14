/**
 * ErrorState — the one card every screen shows when data did not arrive.
 *
 * Before this existed, a failed read and an empty table looked identical: the
 * list rendered nothing, the customer assumed ChinaSuuq had no products, and
 * support had no signal to work from (the "admin console is empty" incident was
 * diagnosed exactly this way). Screens pass the caught error in; the component
 * classifies it so the message — and the retry — match what actually happened.
 */
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { AlertTriangle, CloudOff, RefreshCw, Inbox } from "lucide-react-native";
import { COLORS } from "@/lib/theme";

export type ErrorStateKind = "network" | "permission" | "server" | "unknown" | "empty";

/** Map a thrown error (or a Supabase error object) onto a user-facing kind. */
export function classifyError(error: any): ErrorStateKind {
  const msg = String(error?.message ?? error ?? "").toLowerCase();
  const code = String(error?.code ?? "");
  if (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("abort") ||
    msg.includes("could not connect")
  ) {
    return "network";
  }
  if (
    code === "42501" ||
    msg.includes("row-level security") ||
    msg.includes("not authorized") ||
    msg.includes("jwt expired") ||
    msg.includes("invalid api key")
  ) {
    return "permission";
  }
  if (code?.startsWith("PGRST") || msg.includes("relation") || msg.includes("does not exist")) {
    return "server";
  }
  return "unknown";
}

const COPY: Record<ErrorStateKind, { title: string; body: string }> = {
  network: {
    title: "No connection",
    body: "ChinaSuuq couldn’t reach the server. Your cart and saved items are still on this device.",
  },
  permission: {
    title: "You can’t see this yet",
    body: "You’re signed in with an account that isn’t allowed to open this list. Sign in again or ask an admin.",
  },
  server: {
    title: "Service problem",
    body: "The server returned an error for this screen. Retry in a moment — if it keeps happening, tell support.",
  },
  unknown: {
    title: "Something went wrong",
    body: "This screen couldn’t load its data.",
  },
  empty: {
    title: "Nothing here yet",
    body: "There’s nothing to show in this list right now.",
  },
};

export function ErrorState({
  kind = "unknown",
  error,
  onRetry,
  retryLabel = "Try again",
  title,
  body,
  compact = false,
  extra,
}: {
  kind?: ErrorStateKind;
  /** A caught error — its message is shown in small print for support triage. */
  error?: any;
  onRetry?: () => void;
  retryLabel?: string;
  title?: string;
  body?: string;
  compact?: boolean;
  /** Optional extra action, e.g. "Browse markets". */
  extra?: { label: string; onPress: () => void };
}) {
  const resolved = kind === "unknown" && error ? classifyError(error) : kind;
  const copy = COPY[resolved];
  const Icon =
    resolved === "empty" ? Inbox : resolved === "network" ? CloudOff : AlertTriangle;
  const detail =
    typeof error === "string" ? error : String(error?.message ?? error ?? "").trim();

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={styles.iconWrap}>
        <Icon size={compact ? 20 : 26} color={COLORS.primary} />
      </View>
      <Text style={[styles.title, compact && styles.titleCompact]}>{title ?? copy.title}</Text>
      <Text style={styles.body}>{body ?? copy.body}</Text>
      {detail ? <Text style={styles.detail} numberOfLines={2}>{detail.slice(0, 140)}</Text> : null}
      {(onRetry || extra) && (
        <View style={styles.actions}>
          {onRetry && (
            <TouchableOpacity
              onPress={onRetry}
              style={styles.primary}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <RefreshCw size={14} color={COLORS.white} />
              <Text style={styles.primaryText}>{retryLabel}</Text>
            </TouchableOpacity>
          )}
          {extra && (
            <TouchableOpacity
              onPress={extra.onPress}
              style={styles.secondary}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>{extra.label}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 24,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    marginVertical: 12,
  },
  wrapCompact: { padding: 16, marginVertical: 8 },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primaryLight ?? COLORS.gray100,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: { fontSize: 16, fontWeight: "700", color: COLORS.gray900 },
  titleCompact: { fontSize: 15 },
  body: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.gray600,
    textAlign: "center",
    marginTop: 6,
  },
  detail: { fontSize: 11, color: COLORS.gray400, marginTop: 8, textAlign: "center" },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  primaryText: { color: COLORS.white, fontSize: 13, fontWeight: "700" },
  secondary: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryText: { color: COLORS.gray700, fontSize: 13, fontWeight: "600" },
});

export default ErrorState;
