import { type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { AlertCircle, ArrowLeft, ShieldCheck } from "lucide-react-native";
import { COLORS, FONTS, RADIUS, SPACING } from "@/lib/theme";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { GlowMedallion, SpringIn } from "@/components/auth/AuthMotion";

const LOGO = require("../../../assets/images/logo.jpg");

interface AuthScreenProps {
  children: ReactNode;
  /** Tagline under the wordmark. Already localized by the caller. */
  tagline?: string;
  showBrand?: boolean;
  /** Optional top-left control, e.g. a back button. */
  headerLeft?: ReactNode;
  /** Optional node rendered below the card (trust footer, links). */
  footer?: ReactNode;
}

/**
 * Single shell shared by every auth screen: warm-white surface, keyboard-safe
 * scrolling, brand medallion on a soft orange halo, one white card as the only
 * focus surface.
 *
 * Premium touches are confined to this shell: a radial orange glow at the top
 * (the single decorative element, deliberately kept to one spot) and a spring
 * entrance on the card. Everything else — cards, fields, buttons — stays clean
 * so the flow does not read as generic-AI gradient soup.
 *
 * Keyboard handling: the Android manifest declares `adjustResize`, so the
 * system already shrinks the window under the keyboard. Adding KeyboardAvoidingView
 * behaviour on Android ("height") subtracts the keyboard a second time and is
 * the squeeze this shell explicitly avoids — only iOS needs JS padding.
 */
export function AuthScreen({
  children,
  tagline,
  showBrand = true,
  headerLeft,
  footer,
}: AuthScreenProps) {
  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.outer} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.keyboardView}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* The one decorative element: a soft orange bloom behind the brand. */}
            <View style={styles.glowLayer} pointerEvents="none">
              <LinearGradient
                colors={["rgba(255,90,10,0.16)", "rgba(255,146,28,0.06)", "rgba(255,255,255,0)"]}
                locations={[0, 0.55, 1]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.glow}
              />
            </View>

            {headerLeft ? <View style={styles.headerRow}>{headerLeft}</View> : null}

            {showBrand ? (
              <SpringIn delay={0} fromY={14} style={styles.brandSection}>
                <GlowMedallion icon={<Image source={LOGO} style={styles.logo} contentFit="cover" transition={150} />} size={88} />
                <Text style={styles.brandName}>ChinaSuuq</Text>
                {tagline ? <Text style={styles.brandTagline}>{tagline}</Text> : null}
              </SpringIn>
            ) : null}

            <SpringIn delay={90} fromY={18} style={styles.cardWrap}>
              <View style={styles.card}>{children}</View>
            </SpringIn>

            {footer ? <SpringIn delay={180} fromY={14} style={styles.footerWrap}>{footer}</SpringIn> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ErrorBoundary>
  );
}

interface AuthHeadingProps {
  title: string;
  subtitle?: string;
}

/** Card heading + one-line helper, consistent size across screens. */
export function AuthHeading({ title, subtitle }: AuthHeadingProps) {
  return (
    <View style={styles.headingWrap}>
      <Text style={styles.headingTitle}>{title}</Text>
      {subtitle ? <Text style={styles.headingSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

/** Screen-level error (failed request). Field-level errors live in AuthField. */
export function AuthErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.errorBanner} accessibilityRole="alert">
      <AlertCircle size={16} color={COLORS.error} style={styles.errorBannerIcon} />
      <Text style={styles.errorBannerText}>{message}</Text>
    </View>
  );
}

/** Small, honest trust line — no fabricated numbers, no emoji. */
export function AuthTrustFooter({ text }: { text: string }) {
  return (
    <View style={styles.trustFooter}>
      <ShieldCheck size={14} color={COLORS.textMuted} />
      <Text style={styles.trustText}>{text}</Text>
    </View>
  );
}

interface AuthBackButtonProps {
  label: string;
  onPress: () => void;
}

/** Icon-only back button with a real 44px hit area and an a11y label. */
export function AuthBackButton({ label, onPress }: AuthBackButtonProps) {
  return (
    <TouchableOpacity
      style={styles.backHit}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.backTile}>
        <ArrowLeft size={20} color={COLORS.gray700} />
      </View>
      <Text style={styles.backLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

interface AuthLinkRowProps {
  question: string;
  action: string;
  onPress: () => void;
  actionLoading?: boolean;
}

/** "Already have an account? Sign in" row, one action, 44px tall. */
export function AuthLinkRow({ question, action, onPress, actionLoading }: AuthLinkRowProps) {
  return (
    <View style={styles.linkRow}>
      <Text style={styles.linkRowQuestion}>{question}</Text>
      <TouchableOpacity
        onPress={onPress}
        disabled={actionLoading}
        activeOpacity={0.7}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={action}
        accessibilityState={{ disabled: !!actionLoading }}
      >
        {actionLoading ? (
          <ActivityIndicator size="small" color={COLORS.primary} />
        ) : (
          <Text style={styles.linkRowAction}>{action}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: COLORS.warmWhite,
  },
  keyboardView: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },
  headerRow: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    marginBottom: SPACING.sm,
  },
  backHit: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    minHeight: 44,
    justifyContent: "center",
    alignSelf: "flex-start",
    paddingRight: SPACING.lg,
  },
  backTile: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  backLabel: {
    fontSize: 15,
    fontFamily: FONTS.medium,
    color: COLORS.textSecondary,
  },

  // Top bloom — the single decorative element.
  glowLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 320,
    justifyContent: "center",
    alignItems: "center",
  },
  glow: {
    width: 420,
    height: 320,
    borderRadius: 240,
  },

  // Brand
  brandSection: {
    alignItems: "center",
    marginBottom: SPACING.xl,
    marginTop: SPACING.md,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.lg,
  },
  brandName: {
    fontSize: 28,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    letterSpacing: -0.6,
    marginTop: SPACING.sm,
  },
  brandTagline: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: "center",
    lineHeight: 20,
  },

  cardWrap: {
    width: "100%",
    alignSelf: "center",
  },

  // Card — the only focus surface on every auth screen.
  card: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xxl,
    padding: SPACING.xxl,
    borderWidth: 1,
    borderColor: COLORS.gray100,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },

  headingWrap: {
    marginBottom: SPACING.xl,
  },
  headingTitle: {
    fontSize: 22,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    marginBottom: SPACING.xs,
    letterSpacing: -0.4,
  },
  headingSubtitle: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.errorBg,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: "rgba(217,45,32,0.14)",
  },
  errorBannerIcon: {
    marginRight: SPACING.sm,
    flexShrink: 0,
  },
  errorBannerText: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: COLORS.error,
    flex: 1,
    lineHeight: 18,
  },

  footerWrap: {
    marginTop: SPACING.xl,
    alignItems: "center",
  },
  trustFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  trustText: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: COLORS.textMuted,
  },

  linkRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 44,
    marginTop: SPACING.md,
  },
  linkRowQuestion: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.gray500,
  },
  linkRowAction: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.primary,
    marginLeft: SPACING.xs,
  },
});
