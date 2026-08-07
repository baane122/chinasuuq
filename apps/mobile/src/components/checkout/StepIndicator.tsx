import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Check } from "lucide-react-native";
import { COLORS, SPACING, FONTS } from "@/lib/theme";

interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
}

export default function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <View style={styles.container}>
      {steps.map((label, i) => {
        const isCompleted = i < currentStep;
        const isActive = i === currentStep;

        return (
          <React.Fragment key={i}>
            <View style={styles.stepWrapper}>
              <View
                style={[
                  styles.circle,
                  isCompleted && styles.circleCompleted,
                  isActive && styles.circleActive,
                ]}
              >
                {isCompleted ? (
                  <Check size={14} color={COLORS.white} strokeWidth={3} />
                ) : (
                  <Text
                    style={[
                      styles.stepNum,
                      (isActive || isCompleted) && styles.stepNumActive,
                    ]}
                  >
                    {i + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.label,
                  isCompleted && styles.labelCompleted,
                  isActive && styles.labelActive,
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
            {i < steps.length - 1 && (
              <View
                style={[
                  styles.connector,
                  isCompleted && styles.connectorCompleted,
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.white,
  },
  stepWrapper: {
    alignItems: "center",
    flex: 1,
  },
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.gray100,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: COLORS.gray200,
  },
  circleCompleted: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  circleActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  stepNum: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
    color: COLORS.gray500,
  },
  stepNumActive: {
    color: COLORS.white,
  },
  label: {
    fontSize: 11,
    fontFamily: FONTS.medium,
    color: COLORS.gray400,
    marginTop: SPACING.xs,
    textAlign: "center",
  },
  labelCompleted: {
    color: COLORS.primary,
  },
  labelActive: {
    color: COLORS.primary,
    fontFamily: FONTS.semibold,
  },
  connector: {
    flex: 0.5,
    height: 2,
    backgroundColor: COLORS.gray200,
    marginTop: 15,
    marginHorizontal: SPACING.xs,
  },
  connectorCompleted: {
    backgroundColor: COLORS.primary,
  },
});
