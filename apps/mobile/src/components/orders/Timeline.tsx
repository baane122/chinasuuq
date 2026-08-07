import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { COLORS, SPACING, RADIUS } from "@/lib/theme";

export interface TimelineEvent {
  status: string;
  location: string;
  timestamp: string;
  done: boolean;
}

interface TimelineProps {
  events: TimelineEvent[];
  currentStatus?: string;
}

export function Timeline({ events, currentStatus }: TimelineProps) {
  return (
    <View style={styles.container}>
      {events.map((event, index) => {
        const isLast = index === events.length - 1;
        const isCurrent = event.status === currentStatus;
        const isDone = event.done;

        return (
          <View key={index} style={styles.eventContainer}>
            <View style={styles.dotContainer}>
              <View
                style={[
                  styles.dot,
                  isDone ? styles.dotDone : styles.dotPending,
                  isCurrent && styles.dotCurrent,
                ]}
              >
                {isDone && <View style={styles.dotInner} />}
              </View>
              {!isLast && (
                <View
                  style={[
                    styles.line,
                    isDone ? styles.lineDone : styles.linePending,
                  ]}
                />
              )}
            </View>

            <View
              style={[styles.content, isCurrent && styles.contentCurrent]}
            >
              <Text
                style={[
                  styles.status,
                  isDone ? styles.statusDone : styles.statusPending,
                  isCurrent && styles.statusCurrent,
                ]}
              >
                {event.status}
              </Text>
              {event.location ? (
                <Text style={styles.location}>{event.location}</Text>
              ) : null}
              <Text style={styles.timestamp}>{event.timestamp}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingLeft: SPACING.sm,
  },
  eventContainer: {
    flexDirection: "row",
    minHeight: 64,
  },
  dotContainer: {
    width: 24,
    alignItems: "center",
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  dotDone: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dotPending: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.gray300,
  },
  dotCurrent: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primaryLight,
    borderWidth: 3,
  },
  dotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.white,
  },
  line: {
    width: 2,
    flex: 1,
    minHeight: 20,
  },
  lineDone: {
    backgroundColor: COLORS.primary,
  },
  linePending: {
    backgroundColor: COLORS.gray200,
  },
  content: {
    flex: 1,
    paddingLeft: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  contentCurrent: {
    backgroundColor: COLORS.softOrange,
    marginLeft: -SPACING.sm,
    paddingLeft: SPACING.xl,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  status: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
  },
  statusDone: {
    color: COLORS.black,
    fontWeight: "500",
  },
  statusPending: {
    color: COLORS.textMuted,
    fontWeight: "400",
  },
  statusCurrent: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  location: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontFamily: "Inter-Regular",
  },
  timestamp: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
    fontFamily: "Inter-Regular",
  },
});
