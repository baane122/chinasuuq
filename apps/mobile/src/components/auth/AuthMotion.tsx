import { type ReactNode, useEffect } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated";
import { COLORS, RADIUS } from "@/lib/theme";
import { usePrefersReduceMotion } from "@/lib/useReduceMotion";

/**
 * Premium motion kit for the auth flow.
 *
 * Every entrance in the flow is one of these two springs, so the screens read
 * as the same place instead of five different animations:
 *
 *  - `SpringIn`  — content rows: fade + rise into place, no overshoot.
 *  - `SpringPop` — the icon medallion: slight overshoot, a "settling" feel.
 *
 * Both honour the device's reduce-motion flag via `usePrefersReduceMotion()`:
 * the animation starts at the *target* values on the first frame instead of
 * playing, which is the only difference between a premium feel and a
 * vestibular hazard.
 */

interface SpringInProps {
  children: ReactNode;
  /** ms before the spring starts. Stagger 0 / 80 / 160 down the card. */
  delay?: number;
  /** Y offset to start from, in px. */
  fromY?: number;
  style?: StyleProp<ViewStyle>;
}

/** Fade + rise. Runs once on mount; re-renders of children never replay it. */
export function SpringIn({ children, delay = 0, fromY = 16, style }: SpringInProps) {
  const reduce = usePrefersReduceMotion();
  const opacity = useSharedValue(reduce ? 1 : 0);
  const y = useSharedValue(reduce ? 0 : fromY);

  useEffect(() => {
    if (reduce) return;
    opacity.value = withDelay(
      delay,
      withSpring(1, { damping: 20, stiffness: 120, mass: 0.9 })
    );
    y.value = withDelay(
      delay,
      withSpring(0, { damping: 18, stiffness: 160, mass: 0.8 })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }));

  return (
    <Animated.View style={[style, animated]}>{children}</Animated.View>
  );
}

interface SpringPopProps {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}

/** Overshooting scale-settle, for the medallion only. */
export function SpringPop({ children, delay = 0, style }: SpringPopProps) {
  const reduce = usePrefersReduceMotion();
  const scale = useSharedValue(reduce ? 1 : 1.14);
  const opacity = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    if (reduce) return;
    opacity.value = withDelay(delay, withSpring(1, { damping: 18, stiffness: 130 }));
    scale.value = withDelay(
      delay + 40,
      withSpring(1, { damping: 11, stiffness: 260 }) // under-damped: one clean bounce
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

interface SpringPressReturn {
  /** Apply to an Animated.View wrapping the pressable content. */
  style: ReturnType<typeof useAnimatedStyle>;
  onIn: () => void;
  onOut: () => void;
}

/**
 * Spring press-scale for call-to-action buttons: dips to 0.975 while pressed,
 * releases with a touch of overshoot. Skipped entirely under reduce-motion.
 */
export function useSpringPress(): SpringPressReturn {
  const reduce = usePrefersReduceMotion();
  const scale = useSharedValue(1);

  const onIn = () => {
    if (reduce) return;
    scale.value = withSpring(0.975, { damping: 24, stiffness: 400 });
  };
  const onOut = () => {
    if (reduce) return;
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return { style, onIn, onOut };
}

/**
 * The brand medallion that tops every auth screen: a white rounded tile
 * holding the logo or icon, on a soft-orange halo, with an orange glow shadow.
 * The halo is what makes it read "premium" without a single decorative blob
 * elsewhere on the screen — it is confined to this one element.
 */
interface GlowMedallionProps {
  icon: ReactNode;
  /** Tile edge in px. Default 84. */
  size?: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}

export function GlowMedallion({ icon, size = 84, delay = 0, style }: GlowMedallionProps) {
  const radius = Math.round(size * 0.27);
  return (
    <SpringPop delay={delay} style={[styles.medallionWrap, style]}>
      <View style={styles.medallionInner}>
        <View
          style={[
            styles.halo,
            { width: size * 1.42, height: size * 1.42, borderRadius: size * 0.71 },
          ]}
          pointerEvents="none"
        />
        <View
          style={[
            styles.tile,
            {
              width: size,
              height: size,
              borderRadius: radius,
              shadowColor: COLORS.primary,
              shadowOpacity: 0.26,
              shadowRadius: size / 3,
              shadowOffset: { width: 0, height: Math.round(size / 8) },
            },
          ]}
        >
          {icon}
        </View>
      </View>
    </SpringPop>
  );
}

const styles = StyleSheet.create({
  medallionWrap: {
    alignItems: "center",
    marginBottom: RADIUS.xl,
    marginTop: RADIUS.sm,
  },
  medallionInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    backgroundColor: COLORS.softOrange,
    opacity: 0.75,
  },
  tile: {
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    borderWidth: 1,
    borderColor: COLORS.gray100,
  },
});
