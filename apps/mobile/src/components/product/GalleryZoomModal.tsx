import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  PanResponder,
  Animated,
  TouchableOpacity,
  Dimensions,
  Easing,
  AccessibilityInfo,
} from "react-native";
import { Image } from "expo-image";
import { X, ChevronLeft, ChevronRight } from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";

const { width: SW, height: SH } = Dimensions.get("window");

interface GalleryZoomModalProps {
  visible: boolean;
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;

function clampScale(v: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));
}

/** Keep the panned image inside its zoomed bounds so it can't be dragged off. */
function clampOffset(offset: number, scale: number, span: number): number {
  const max = Math.max(0, ((scale - 1) * span) / 2);
  return Math.min(max, Math.max(-max, offset));
}

/**
 * Tap-to-zoom full-screen viewer built on RN core `Modal` + `Animated` +
 * `PanResponder` (no gesture/image-picker dependency added). Pinch scales, a
 * zoomed image can be dragged, double-tap toggles 1x/2.5x, and at 1x a horizontal
 * drag pages between photos. Every frame the same `expo-image` settings as the
 * grid use (transition, memory-disk cache, onError fallback), so a photo that
 * loaded in the strip still loads here and a broken URL shows a message, never a
 * black void.
 */
export default function GalleryZoomModal({
  visible,
  images,
  initialIndex,
  onClose,
}: GalleryZoomModalProps) {
  const [index, setIndex] = useState(initialIndex);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [failed, setFailed] = useState(false);

  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const scaleRef = useRef(1);
  const xRef = useRef(0);
  const yRef = useRef(0);
  scale.addListener(({ value }) => (scaleRef.current = value));

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => mounted && setReduceMotion(v));
    return () => {
      mounted = false;
    };
  }, []);

  // Fresh state on every open / page change.
  useEffect(() => {
    if (visible) {
      setIndex(initialIndex);
    }
  }, [visible, initialIndex]);

  const resetTransform = useCallback(
    (animate: boolean) => {
      xRef.current = 0;
      yRef.current = 0;
      if (animate && !reduceMotion) {
        scaleRef.current = 1;
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(translateX, { toValue: 0, duration: 180, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }),
        ]).start();
      } else {
        scaleRef.current = 1;
        scale.setValue(1);
        translateX.setValue(0);
        translateY.setValue(0);
      }
    },
    [reduceMotion, scale, translateX, translateY]
  );

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.min(images.length - 1, Math.max(0, next));
      if (clamped === index) return;
      resetTransform(false);
      setFailed(false);
      setIndex(clamped);
    },
    [images.length, index, resetTransform]
  );

  // Gesture bookkeeping lives in refs so PanResponder stays a stable object.
  const gesture = useRef({ pointers: 0, startDist: 0, startScale: 1, startX: 0, startY: 0, startTx: 0, startTy: 0, moved: false });

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4 || scaleRef.current > 1,
        onPanResponderGrant: (evt) => {
          const touches = evt.nativeEvent.touches;
          gesture.current.pointers = touches.length;
          gesture.current.moved = false;
          gesture.current.startTx = xRef.current;
          gesture.current.startTy = yRef.current;
          if (touches.length >= 2) {
            const dx = touches[0].locationX - touches[1].locationX;
            const dy = touches[0].locationY - touches[1].locationY;
            gesture.current.startDist = Math.hypot(dx, dy) || 1;
            gesture.current.startScale = scaleRef.current;
            gesture.current.startX = (touches[0].locationX + touches[1].locationX) / 2;
            gesture.current.startY = (touches[0].locationY + touches[1].locationY) / 2;
          } else {
            gesture.current.startX = evt.nativeEvent.locationX;
            gesture.current.startY = evt.nativeEvent.locationY;
          }
        },
        onPanResponderMove: (evt, g) => {
          if (gesture.current.pointers >= 2) {
            // Pinch: distance comes from the live two touches on the event, the
            // gesture state only carries single-pointer deltas.
            const touches = evt.nativeEvent.touches;
            if (touches.length < 2) return;
            const dx = touches[0].locationX - touches[1].locationX;
            const dy = touches[0].locationY - touches[1].locationY;
            const dist = Math.hypot(dx, dy) || 1;
            const next = clampScale((dist / gesture.current.startDist) * gesture.current.startScale);
            scaleRef.current = next;
            scale.setValue(next);
          } else if (scaleRef.current > 1) {
            // Pan while zoomed.
            xRef.current = clampOffset(gesture.current.startTx + g.dx, scaleRef.current, SW);
            yRef.current = clampOffset(gesture.current.startTy + g.dy, scaleRef.current, SH);
            translateX.setValue(xRef.current);
            translateY.setValue(yRef.current);
            gesture.current.moved = true;
          } else {
            // At rest: horizontal drag only, to page.
            gesture.current.moved = true;
            translateX.setValue(g.dx * 0.6);
          }
        },
        onPanResponderRelease: (_, g) => {
          translateX.flattenOffset();
          translateY.flattenOffset();
          if (gesture.current.pointers >= 2) {
            gesture.current.pointers = 0;
            return;
          }
          const swiped = !gesture.current.moved ? false : Math.abs(g.dx);
          if (scaleRef.current > 1) {
            return; // pan ended, keep zoom
          }
          if (swiped && swiped > 60) {
            goTo(g.dx < 0 ? index + 1 : index - 1);
          } else {
            Animated.timing(translateX, { toValue: 0, duration: reduceMotion ? 0 : 140, useNativeDriver: true }).start();
          }
        },
      }),
    [goTo, index, reduceMotion, scale, translateX, translateY]
  );

  const toggleZoom = useCallback(() => {
    if (scaleRef.current > 1.05) resetTransform(true);
    else {
      const target = reduceMotion ? 2.5 : 2.5;
      scaleRef.current = target;
      Animated.spring(scale, { toValue: target, useNativeDriver: true, speed: 60, bounciness: 4 }).start(() => {});
      xRef.current = clampOffset(0, target, SW);
      yRef.current = clampOffset(0, target, SH);
      Animated.parallel([
        Animated.timing(translateX, { toValue: 0, duration: reduceMotion ? 0 : 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: reduceMotion ? 0 : 180, useNativeDriver: true }),
      ]).start();
    }
  }, [reduceMotion, resetTransform, scale, translateX, translateY]);

  const uri = images[index];
  const showImage = Boolean(uri) && !failed;

  return (
    <Modal
      visible={visible}
      animationType={reduceMotion ? "none" : "fade"}
      transparent={false}
      onRequestClose={() => {
        resetTransform(false);
        onClose();
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.topBar}>
          <Text style={styles.counter}>{images.length ? index + 1 : 0}/{images.length}</Text>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => {
              resetTransform(false);
              onClose();
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X size={24} color={COLORS.white} />
          </TouchableOpacity>
        </View>

        <Animated.View style={[styles.stage, { transform: [{ translateX }, { translateY }, { scale }] }]} {...panResponder.panHandlers}>
          {showImage ? (
            <Image
              key={uri}
              source={{ uri }}
              style={styles.image}
              contentFit="contain"
              transition={reduceMotion ? 0 : 150}
              cachePolicy="memory-disk"
              recyclingKey={uri}
              placeholder={COLORS.black}
              onError={() => setFailed(true)}
            />
          ) : (
            <View style={styles.imageFallback}>
              <Text style={styles.imageFallbackText}>
                {failed ? "This image could not be loaded" : "No image"}
              </Text>
            </View>
          )}
          {/* Double-tap layer keeps gestures on the image itself. */}
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={toggleZoom}
            accessibilityRole="button"
            accessibilityLabel="Toggle zoom"
          />
        </Animated.View>

        {index > 0 && (
          <TouchableOpacity style={[styles.nav, styles.navLeft]} onPress={() => goTo(index - 1)} activeOpacity={0.7}>
            <ChevronLeft size={30} color={COLORS.white} />
          </TouchableOpacity>
        )}
        {index < images.length - 1 && (
          <TouchableOpacity style={[styles.nav, styles.navRight]} onPress={() => goTo(index + 1)} activeOpacity={0.7}>
            <ChevronRight size={30} color={COLORS.white} />
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000" },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: SPACING.xl + 20,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  counter: { color: COLORS.white, fontFamily: FONTS.semibold, fontSize: 15 },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  stage: { flex: 1, alignItems: "center", justifyContent: "center" },
  image: { width: SW, height: SH * 0.8 },
  imageFallback: { alignItems: "center", justifyContent: "center", padding: SPACING.xxl },
  imageFallbackText: { color: COLORS.gray300, fontFamily: FONTS.medium, fontSize: 14 },
  nav: {
    position: "absolute",
    top: SH * 0.45,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  navLeft: { left: SPACING.md },
  navRight: { right: SPACING.md },
});
