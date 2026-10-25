import React, { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";

interface ScreenRevealProps {
  children: ReactNode;
  /** Stagger in ms; keeps sections from all popping at once. */
  delay?: number;
  distance?: number;
  style?: object;
}

/**
 * Entrance transition for the product screen. Reanimated is already a
 * dependency and drives transform/opacity on the UI thread, which is smoother
 * and simpler than threading several legacy Animated.Values through this tree.
 * When the OS reports Reduce Motion the content is shown immediately, un-animated.
 */
export default function ScreenReveal({ children, delay = 0, distance = 12, style }: ScreenRevealProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateY = useSharedValue(reduceMotion ? 0 : distance);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => mounted && setReduceMotion(v));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => setReduceMotion(v));
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    const easing = Easing.out(Easing.cubic);
    opacity.value = withDelay(delay, withTiming(1, { duration: 300, easing }));
    translateY.value = withDelay(delay, withTiming(0, { duration: 300, easing }));
  }, [delay, reduceMotion, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (reduceMotion) return <View style={style}>{children}</View>;
  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
