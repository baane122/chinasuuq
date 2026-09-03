import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Plane, Ship, Check } from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import {
  buildSmartRoute,
  getProgressPercent,
  getCurrentWaypointIndex,
  getNextMilestone,
  getEstimateRange,
  isWaypointDone,
} from "@/lib/smartRoute";

interface SmartRouteProps {
  method: "air" | "sea";
  city: string;
  status: string;
}

export function SmartRoute({ method, city, status }: SmartRouteProps) {
  const route = React.useMemo(
    () => buildSmartRoute(method, city || "Hargeisa"),
    [method, city]
  );
  const progress = getProgressPercent(route, status);
  const currentIdx = getCurrentWaypointIndex(route, status);
  const next = getNextMilestone(route, status);
  const eta = getEstimateRange(method, status);
  const MethodIcon = method === "air" ? Plane : Ship;
  const methodColor = method === "air" ? COLORS.air : COLORS.sea;

  return (
    <View style={styles.container}>
      {/* Method + progress header */}
      <View style={styles.headerRow}>
        <View style={[styles.methodBadge, { backgroundColor: methodColor + "1A" }]}>
          <MethodIcon size={14} color={methodColor} />
          <Text style={[styles.methodText, { color: methodColor }]}>
            {method === "air" ? "Air Freight" : "Sea Freight"}
          </Text>
        </View>
        <Text style={styles.progressPct}>{progress}%</Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${progress}%`,
              backgroundColor: methodColor,
            },
          ]}
        />
      </View>

      {/* Route waypoints */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.routeRow}
      >
        {route.map((wp, i) => {
          const done = isWaypointDone(wp.statusMin, status);
          const isCurrent = i === currentIdx && !done;
          return (
            <React.Fragment key={wp.key}>
              {i > 0 && (
                <View
                  style={[
                    styles.connector,
                    i <= currentIdx ? { backgroundColor: methodColor } : styles.connectorPending,
                  ]}
                />
              )}
              <View style={styles.waypoint}>
                <View
                  style={[
                    styles.dot,
                    done && { backgroundColor: methodColor, borderColor: methodColor },
                    isCurrent && [styles.dotCurrent, { borderColor: methodColor }],
                  ]}
                >
                  {done ? (
                    <Check size={12} color={COLORS.white} strokeWidth={3} />
                  ) : (
                    <Text style={styles.dotIcon}>{wp.icon}</Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.label,
                    done && styles.labelDone,
                    isCurrent && { color: methodColor },
                  ]}
                  numberOfLines={1}
                >
                  {wp.shortLabel}
                </Text>
              </View>
            </React.Fragment>
          );
        })}
      </ScrollView>

      {/* Next milestone + ETA */}
      <View style={styles.footer}>
        <Text style={styles.nextLabel}>
          {next ? `Next: ${next}` : "Delivered 🎉"}
        </Text>
        <Text style={styles.eta}>
          {status === "delivered" ? "Completed" : `Est. ${eta}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: SPACING.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  methodBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  methodText: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
  },
  progressPct: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: COLORS.black,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.gray100,
    overflow: "hidden",
    marginBottom: SPACING.md,
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: SPACING.xs,
  },
  waypoint: {
    alignItems: "center",
    width: 56,
  },
  dot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: COLORS.gray200,
    backgroundColor: COLORS.gray50,
    alignItems: "center",
    justifyContent: "center",
  },
  dotCurrent: {
    borderWidth: 3,
    backgroundColor: COLORS.white,
  },
  dotIcon: {
    fontSize: 16,
  },
  label: {
    fontSize: 9,
    fontFamily: FONTS.medium,
    color: COLORS.textMuted,
    marginTop: 4,
    textAlign: "center",
  },
  labelDone: {
    color: COLORS.black,
    fontFamily: FONTS.semibold,
  },
  connector: {
    width: 20,
    height: 2,
    alignSelf: "center",
    marginTop: -16,
    backgroundColor: COLORS.gray200,
  },
  connectorPending: {
    backgroundColor: COLORS.gray200,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  nextLabel: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
    color: COLORS.primary,
    flex: 1,
  },
  eta: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: COLORS.textSecondary,
  },
});
