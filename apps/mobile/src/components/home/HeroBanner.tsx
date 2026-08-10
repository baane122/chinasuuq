import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Dimensions, Image } from "react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";

const { width: SCREEN_W } = Dimensions.get("window");

const HERO_BANNERS = [
  {
    id: "1",
    title_en: "Order from China\nto Somalia",
    title_so: "Ka Dalbo Shiinaha\nilaa Soomaaliya",
    subtitle_en: "1688 · Taobao · YiwuGo",
    subtitle_so: "1688 · Taobao · YiwuGo",
    // Use placeholder gradient when no image asset available
    useImage: false,
  },
  {
    id: "2",
    title_en: "Shop the Whole App\nBattle, Compare, Order",
    title_so: "Iibso Abka Oo Dhan\nTixgeli, Barbar dhig, Dalbo",
    subtitle_en: "Real browsing, in-app",
    subtitle_so: "Dhabtii ka dalbo, abka gudihiisa",
    useImage: false,
  },
  {
    id: "3",
    title_en: "Pay with Zaad, EVC & more",
    title_so: "Ku bixi Zaad, EVC & kale",
    subtitle_en: "Across every Somali city",
    subtitle_so: "Magaalo kasta oo Soomaali",
    useImage: false,
  },
];

export function HeroBanner() {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const { locale } = useI18n();

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % HERO_BANNERS.length;
        scrollRef.current?.scrollTo({ x: next * (SCREEN_W - 40), animated: true });
        return next;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / (SCREEN_W - 40));
          setActiveIndex(idx);
        }}
      >
        {HERO_BANNERS.map((b) => (
          <View key={b.id} style={[styles.slide, { width: SCREEN_W - 40 }]}>
            {/* Background gradient */}
            <View style={styles.slideBg} />
            {/* Content */}
            <View style={styles.content}>
              <Text style={styles.title} numberOfLines={2}>
                {locale === "en" ? b.title_en : b.title_so}
              </Text>
              <Text style={styles.subtitle}>
                {locale === "en" ? b.subtitle_en : b.subtitle_so}
              </Text>
            </View>
            {/* Decorative elements */}
            <View style={styles.decorCircle1} />
            <View style={styles.decorCircle2} />
          </View>
        ))}
      </ScrollView>
      {/* Dots */}
      <View style={styles.dots}>
        {HERO_BANNERS.map((_, i) => (
          <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: SPACING.xl },
  slide: {
    height: 170,
    borderRadius: RADIUS.xl,
    overflow: "hidden",
    position: "relative",
  },
  slideBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.xl,
  },
  content: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    padding: SPACING.lg,
    zIndex: 2,
  },
  title: {
    fontSize: 17,
    fontFamily: FONTS.bold,
    color: COLORS.white,
    lineHeight: 22,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
    color: "rgba(255,255,255,0.85)",
  },
  decorCircle1: {
    position: "absolute",
    top: 10,
    right: 16,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  decorCircle2: {
    position: "absolute",
    top: 40,
    right: 60,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 10,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,90,10,0.25)",
  },
  dotActive: {
    width: 20,
    backgroundColor: COLORS.primary,
  },
});
