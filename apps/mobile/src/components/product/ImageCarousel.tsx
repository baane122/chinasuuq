import React, { useCallback, useMemo, useRef, useState } from "react";
import { type ComponentRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Linking,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Image } from "expo-image";
import { Play, Maximize, Package } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import GalleryZoomModal from "./GalleryZoomModal";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const IMAGE_SIZE = SCREEN_WIDTH - SPACING.lg * 2;

/**
 * A scraped listing can carry 30+ full-size photos. Only the page you are on and
 * this many pages either side actually decode an <Image>; the rest keep the same
 * box (paging geometry unchanged) with a gray fill that swaps in from the
 * memory/disk cache as you swipe toward it.
 */
const RENDER_WINDOW = 2;
/** Past this many images a thumbnail strip replaces the dots for a row of ~. */
const THUMB_STRIP_MIN = 4;

const PLACEHOLDER = require("../../../assets/images/placeholder.png");

/** RN core StyleSheet has no absoluteFillObject in this typings version. */
const FILL = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

interface ImageCarouselProps {
  images: string[];
  /** Optional marketplace product video. Shown as a first tile that opens the
   *  clip with the system handler (no inline video player dependency added). */
  videoUrl?: string | null;
}

export default function ImageCarousel({ images, videoUrl }: ImageCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  // Which pages failed to load — a dead CDN URL shows the bundled placeholder,
  // never a blank box.
  const [failedPages, setFailedPages] = useState<Set<number>>(new Set());
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(0);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const hasVideo = Boolean(videoUrl);
  // The video occupies page 0 when present, shifting image pages by one so the
  // zoom viewer only ever receives real photo URLs.
  const imageOffset = hasVideo ? 1 : 0;
  const totalPages = images.length + (hasVideo ? 1 : 0);

  // A page count that never changes identity keeps the pager from thrashing.
  const showStrip = images.length >= THUMB_STRIP_MIN;

  const openZoom = useCallback(
    (page: number) => {
      if (hasVideo && page === 0) {
        // Video: hand the raw clip to the OS handler rather than a fake frame.
        void (async () => {
          try {
            if (await Linking.canOpenURL(videoUrl as string)) {
              await Linking.openURL(videoUrl as string);
            }
          } catch {
            /* no handler — the badge already told them it is a video */
          }
        })();
        return;
      }
      const imgIdx = page - imageOffset;
      if (imgIdx < 0 || imgIdx >= images.length) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setZoomIndex(imgIdx);
      setZoomOpen(true);
    },
    [hasVideo, videoUrl, imageOffset, images.length]
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      // Recompute the page only when it actually changes; scrolling fires every
      // frame and a setState per frame re-rendered the whole gallery.
      const idx = Math.round(e.nativeEvent.contentOffset.x / IMAGE_SIZE);
      setActiveIndex((prev) => (prev === idx ? prev : Math.min(Math.max(idx, 0), totalPages - 1)));
    },
    [totalPages]
  );

  const markFailed = useCallback((page: number) => {
    setFailedPages((prev) => {
      if (prev.has(page)) return prev;
      const next = new Set(prev);
      next.add(page);
      return next;
    });
  }, []);

  const scrollToPage = useCallback((page: number) => {
    scrollRef.current?.scrollTo({ x: page * IMAGE_SIZE, animated: true });
  }, []);

  const pages = useMemo(() => {
    const list: Array<{ key: string; kind: "video" | "image"; uri?: string }> = [];
    if (hasVideo) list.push({ key: "video", kind: "video" });
    images.forEach((uri, i) => list.push({ key: `img-${i}`, kind: "image", uri }));
    return list;
  }, [hasVideo, images]);

  if (totalPages === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyBox}>
          <Image source={PLACEHOLDER} style={styles.image} contentFit="cover" transition={120} />
          <View style={styles.emptyOverlay}>
            <Package size={26} color={COLORS.gray400} strokeWidth={1.6} />
            <Text style={styles.emptyText}>No photo yet</Text>
          </View>
        </View>
      </View>
    );
  }

  const photoIndexForZoom = activeIndex - imageOffset;

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
      >
        {pages.map((page, i) => {
          const near = Math.abs(i - activeIndex) <= RENDER_WINDOW;
          if (page.kind === "video") {
            const poster = images[0];
            return (
              <TouchableOpacity
                key={page.key}
                style={styles.imageWrapper}
                activeOpacity={0.9}
                onPress={() => openZoom(i)}
              >
                {poster ? (
                  <Image
                    source={{ uri: poster }}
                    style={styles.image}
                    contentFit="cover"
                    transition={150}
                    cachePolicy="memory-disk"
                    recyclingKey={poster}
                    placeholder={COLORS.gray100}
                  />
                ) : (
                  <Image source={PLACEHOLDER} style={styles.image} contentFit="cover" />
                )}
                <View style={styles.videoBadge}>
                  <Play size={16} color={COLORS.white} fill={COLORS.white} />
                  <Text style={styles.videoBadgeText}>Video</Text>
                </View>
                <View style={styles.playCenter}>
                  <View style={styles.playCircle}>
                    <Play size={26} color={COLORS.white} fill={COLORS.white} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              key={page.key}
              style={styles.imageWrapper}
              activeOpacity={0.9}
              onPress={() => openZoom(i)}
              accessibilityRole="button"
              accessibilityLabel={`View photo ${i - imageOffset + 1} full screen`}
            >
              {near && page.uri && !failedPages.has(i) ? (
                <Image
                  source={{ uri: page.uri }}
                  style={styles.image}
                  contentFit="cover"
                  transition={150}
                  cachePolicy="memory-disk"
                  recyclingKey={page.uri}
                  placeholder={COLORS.gray100}
                  onError={() => markFailed(i)}
                />
              ) : failedPages.has(i) ? (
                <View style={styles.imageFallback}>
                  <Image source={PLACEHOLDER} style={styles.fallbackImg} contentFit="cover" />
                  <Text style={styles.fallbackText}>Photo unavailable</Text>
                </View>
              ) : (
                <View style={styles.imagePlaceholder} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Page counter — "3/8". Video page counts as a page, photo label as idx. */}
      <View style={styles.counter}>
        <Maximize size={12} color={COLORS.white} />
        <Text style={styles.counterText}>
          {photoIndexForZoom >= 0 ? photoIndexForZoom + 1 : 0}/{images.length}
        </Text>
      </View>

      {showStrip ? (
        // Thumbnail strip for many-photo listings: tap to jump the pager.
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbRow}
        >
          {images.map((uri, i) => {
            const page = i + imageOffset;
            const active = page === activeIndex;
            return (
              <TouchableOpacity
                key={`thumb-${uri}-${i}`}
                onPress={() => scrollToPage(page)}
                activeOpacity={0.8}
                style={[styles.thumbBox, active && styles.thumbBoxActive]}
                accessibilityRole="button"
                accessibilityLabel={`Photo ${i + 1}`}
              >
                <Image
                  source={{ uri }}
                  style={styles.thumbImage}
                  contentFit="cover"
                  transition={120}
                  cachePolicy="memory-disk"
                  recyclingKey={uri}
                  placeholder={COLORS.gray100}
                  onError={() => markFailed(page)}
                />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.dotsRow}>
          {pages.map((_, i) => (
            <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
          ))}
        </View>
      )}

      <GalleryZoomModal
        visible={zoomOpen}
        images={images}
        initialIndex={zoomIndex}
        onClose={() => setZoomOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: COLORS.white, padding: SPACING.lg },
  imageWrapper: { width: IMAGE_SIZE, height: IMAGE_SIZE },
  image: { width: "100%", height: "100%", borderRadius: RADIUS.xl },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.gray100,
  },
  imageFallback: {
    flex: 1,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.gray100,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
  },
  fallbackImg: { width: "60%", height: "60%", borderRadius: RADIUS.md, opacity: 0.5 },
  fallbackText: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.textMuted },
  emptyBox: { width: IMAGE_SIZE, height: IMAGE_SIZE, borderRadius: RADIUS.xl, overflow: "hidden" },
  emptyOverlay: {
    ...FILL,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.softOrange,
    gap: SPACING.xs,
  },
  emptyText: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.textMuted },
  videoBadge: {
    position: "absolute",
    top: SPACING.md,
    left: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary,
  },
  videoBadgeText: { fontSize: 10, fontFamily: FONTS.semibold, color: COLORS.white },
  playCenter: { ...FILL, alignItems: "center", justifyContent: "center" },
  playCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  counter: {
    position: "absolute",
    top: SPACING.xl,
    right: SPACING.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  counterText: { fontSize: 12, fontFamily: FONTS.semibold, color: COLORS.white },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: SPACING.md,
    gap: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.gray300 },
  dotActive: { width: 24, backgroundColor: COLORS.primary },
  thumbRow: { gap: SPACING.sm, marginTop: SPACING.md, paddingVertical: 2 },
  thumbBox: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.md,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  thumbBoxActive: { borderColor: COLORS.primary },
  thumbImage: { width: "100%", height: "100%", backgroundColor: COLORS.gray100 },
});
