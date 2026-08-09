import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";

const { width: SCREEN_W } = Dimensions.get("window");

// Real brand logo
const LOGO = require("../assets/images/logo.jpg");

const SLIDES = [
  {
    id: "1",
    title_en: "Shop China with one tap",
    title_so: "Ka Dalbo Shiinaha Hal Tuq",
    subtitle_en: "Order from 1688, Taobao and YiwuGo, delivered to Somalia",
    subtitle_so: "Ka dalbo 1688, Taobao iyo YiwuGo, laguugu keeno Soomaaliya",
    image: require("../assets/onboarding/slide1.png"),
  },
  {
    id: "2",
    title_en: "We source, inspect & ship",
    title_so: "Waxaan raadinaa, hubinnaa oo dirnaa",
    subtitle_en: "We find suppliers, check quality, and handle all logistics from China",
    subtitle_so: "Waxaan helaynaa iibiyeyaal, hubinnaa tayada, oo maamulnaa dhammaan logistics-ka Shiinaha",
    image: require("../assets/onboarding/slide2.png"),
  },
  {
    id: "3",
    title_en: "Delivered to your door",
    title_so: "Waxaa laguu geeyaa albaabkaaga",
    subtitle_en: "Fast delivery across Somalia — Hargeisa, Mogadishu, Bosaso & more",
    subtitle_so: "Degdeg looma geeyo dhammaan Soomaaliya — Hargeysa, Muqdisho, Boosaaso & kale",
    image: require("../assets/onboarding/slide3.png"),
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { locale } = useI18n();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const handleNext = () => {
    if (index < SLIDES.length - 1) {
      const next = index + 1;
      setIndex(next);
      scrollRef.current?.scrollTo({ x: next * SCREEN_W, animated: true });
    } else {
      router.replace("/(tabs)/home");
    }
  };

  const handleSkip = () => {
    router.replace("/(tabs)/home");
  };

  const slide = SLIDES[index];

  return (
    <SafeAreaView style={styles.container}>
      {/* Top bar with logo and skip */}
      <View style={styles.topBar}>
        <Image source={LOGO} style={styles.topLogo} resizeMode="contain" />
        <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
          <Text style={styles.skipText}>
            {locale === "en" ? "Skip" : "Ka bood"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
          setIndex(i);
        }}
      >
        {SLIDES.map((s) => (
          <View key={s.id} style={[styles.slide, { width: SCREEN_W }]}>
            {/* Illustration */}
            <View style={styles.illustrationWrap}>
              <Image source={s.image} style={styles.illustrationImg} resizeMode="contain" />
            </View>

            {/* Text */}
            <Text style={styles.title}>
              {locale === "en" ? s.title_en : s.title_so}
            </Text>
            <Text style={styles.subtitle}>
              {locale === "en" ? s.subtitle_en : s.subtitle_so}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* Dots */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === index && styles.dotActive]}
          />
        ))}
      </View>

      {/* CTA Button */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.primaryBtn} onPress={handleNext} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>
            {index === SLIDES.length - 1
              ? locale === "en" ? "Get Started" : "Bilow"
              : locale === "en" ? "Continue" : "Sii wad"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  topBar: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 12,
  },
  topLogo: { width: 120, height: 40 },
  skipBtn: { padding: 8 },
  skipText: { fontSize: 15, fontFamily: FONTS.semibold, color: COLORS.textSecondary },

  slide: {
    flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32,
  },
  illustrationWrap: { marginBottom: 40 },
  illustrationImg: { width: 240, height: 240 },

  title: {
    fontSize: 28, fontFamily: FONTS.bold, color: COLORS.black, textAlign: "center",
    letterSpacing: -0.6, marginBottom: 12,
  },
  subtitle: {
    fontSize: 15, color: COLORS.textSecondary, textAlign: "center", lineHeight: 22, maxWidth: 320,
  },

  dots: {
    flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 24,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.gray300,
  },
  dotActive: {
    width: 24, backgroundColor: COLORS.primary,
  },

  actions: { paddingHorizontal: 24, paddingBottom: 32 },
  primaryBtn: {
    backgroundColor: COLORS.primary, paddingVertical: 16, borderRadius: RADIUS.lg,
    alignItems: "center", shadowColor: COLORS.primary, shadowOpacity: 0.35,
    shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  primaryBtnText: {
    color: COLORS.white, fontSize: 17, fontFamily: FONTS.semibold, letterSpacing: 0.3,
  },
});
