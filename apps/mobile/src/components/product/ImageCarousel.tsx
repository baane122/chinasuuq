import React, { useState, useRef } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { Heart } from "lucide-react-native";
import { COLORS, SPACING, RADIUS } from "@/lib/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const IMAGE_SIZE = SCREEN_WIDTH - SPACING.lg * 2;

/**
 * A scraped listing can carry 30+ full-size photos. Decoding every one at
 * mount is what made product open feel slow, so only the page you are on and
 * this many pages either side actually render an <Image>; the rest keep the
 * same box (paging geometry is unchanged) with a gray placeholder that fills
 * in from the memory/disk cache as you swipe toward it.
 */
const RENDER_WINDOW = 2;

interface ImageCarouselProps {
  images: string[];
}

export default function ImageCarousel({ images }: ImageCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [liked, setLiked] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / IMAGE_SIZE);
    setActiveIndex(index);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {images.map((uri, i) => {
          const near = Math.abs(i - activeIndex) <= RENDER_WINDOW;
          return (
            <View key={i} style={styles.imageWrapper}>
              {near ? (
                <Image
                  source={{ uri }}
                  style={styles.image}
                  contentFit="cover"
                  transition={150}
                  cachePolicy="memory-disk"
                  recyclingKey={uri}
                  placeholder={COLORS.gray100}
                />
              ) : (
                <View style={styles.imagePlaceholder} />
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Heart / Favorite overlay */}
      <TouchableOpacity
        style={styles.heartBtn}
        activeOpacity={0.7}
        onPress={() => setLiked(!liked)}
      >
        <Heart
          size={22}
          color={liked ? COLORS.error : COLORS.black}
          fill={liked ? COLORS.error : "transparent"}
        />
      </TouchableOpacity>

      {/* Pagination dots */}
      <View style={styles.dotsRow}>
        {images.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === activeIndex && styles.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    padding: SPACING.lg,
  },
  imageWrapper: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
  },
  image: {
    width: "100%",
    height: "100%",
    borderRadius: RADIUS.xl,
  },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.gray100,
  },
  heartBtn: {
    position: "absolute",
    top: SPACING.xl,
    right: SPACING.xl,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: SPACING.md,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.gray300,
  },
  dotActive: {
    width: 24,
    backgroundColor: COLORS.primary,
  },
});
