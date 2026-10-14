import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { AlertTriangle } from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";

interface Props {
  children: React.ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  /** Label of the recovery button. Says what the button now actually does. */
  retryLabel?: string;
  /**
   * Recovery path run after the error state is cleared.
   *
   * Clearing state on its own re-renders the tree that just threw, so the
   * button looked live and did nothing. A wrapped ROUTE passes a reset that
   * leaves the route; the root and auth boundaries keep the old clear-only
   * behaviour because for them the crashing tree IS the whole app.
   */
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  handleReset = () => {
    const { onReset } = this.props;
    this.setState({ hasError: false, error: null });
    if (!onReset) return;
    try {
      onReset();
    } catch (e) {
      // A throwing reset (no navigation context yet) must not take the app
      // down on top of the crash that got us here.
      console.error("ErrorBoundary reset failed:", e);
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.iconWrap}>
            <AlertTriangle size={48} color={COLORS.warning} />
          </View>
          <Text style={styles.title}>
            {this.props.fallbackTitle || "Something went wrong"}
          </Text>
          <Text style={styles.message}>
            {this.props.fallbackMessage || this.state.error?.message || "An unexpected error occurred."}
          </Text>
          <TouchableOpacity style={styles.button} onPress={this.handleReset} activeOpacity={0.8}>
            <Text style={styles.buttonText}>{this.props.retryLabel || "Try Again"}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

/**
 * Route-level boundary.
 *
 * A crash inside `product/[id]`, `cart/`, `orders/[id]` or `search/` used to
 * unwind to the single boundary in app/_layout.tsx, which replaced the whole
 * app — tab bar included. This wrapper gives those routes their own boundary
 * and, more importantly, a way out: a route that throws on a piece of data it
 * will keep receiving (a bad product row, a corrupt cart line) does not get
 * better by re-rendering, so the button leaves it.
 *
 * Class components cannot use hooks, so the router and the language are
 * grabbed here and handed to the boundary as props.
 */
export function RouteErrorBoundary({
  children,
  fallbackTitle,
  fallbackMessage,
}: {
  children: React.ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const tt = (en: string, so: string) => (locale === "en" ? en : so);

  return (
    <ErrorBoundary
      // Same string the class already shows in English, but localized: the
      // i18n catalogue has it (common.error) so nothing new is invented here.
      fallbackTitle={fallbackTitle ?? t("common.error")}
      fallbackMessage={fallbackMessage}
      retryLabel={tt("Go to home", "U gudbo Bogga Hore")}
      onReset={() => {
        // replace, not push: the crashed route must not stay under the tab
        // bar waiting to be re-rendered by a back gesture.
        router.replace("/(tabs)/home");
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.warmWhite,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xxxl,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#FEF3C7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: 18,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    marginBottom: SPACING.sm,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    minHeight: 48,
    justifyContent: "center",
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 16,
    fontFamily: FONTS.bold,
  },
});
