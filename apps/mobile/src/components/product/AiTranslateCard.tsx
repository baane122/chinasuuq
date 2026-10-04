/**
 * AI Translate card — on-product translation to English + Somali.
 * Goes through the ai-translate edge function (server-side provider, paid
 * cache, JWT-gated). On failure — logged out, offline, server refused — it
 * shows a friendly retry message and nothing else. No direct-key fallback and
 * no third-party translate endpoint. Never crashes the screen.
 */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { Sparkles, Languages, RefreshCw, AlertCircle } from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { aiTranslateProduct } from "@/lib/ai";

interface Props {
  title: string;
  description?: string | null;
  /**
   * When given, a finished translation survives the screen unmount: reopening
   * the same product shows it instantly and never asks the AI again.
   */
  productId?: string;
}

// Module-level map keyed by product id — lives as long as the JS bundle, so
// the second (and later) visit to a product costs zero work. Bounded: oldest
// entries drop first (Map preserves insertion order).
const productTranslationCache = new Map<string, { en: string; so: string }>();
const MAX_CACHE_ENTRIES = 60;

function rememberTranslation(id: string, value: { en: string; so: string }): void {
  productTranslationCache.delete(id);
  productTranslationCache.set(id, value);
  while (productTranslationCache.size > MAX_CACHE_ENTRIES) {
    const oldest = productTranslationCache.keys().next();
    if (oldest.done) break;
    productTranslationCache.delete(oldest.value);
  }
}

export default function AiTranslateCard({ title, description, productId }: Props) {
  // Hydrate from the per-product cache on mount, so a cached product renders
  // its Translation card straight away instead of showing the Translate CTA.
  const [result, setResult] = useState<{ en: string; so: string } | null>(() =>
    productId ? productTranslationCache.get(productId) ?? null : null
  );
  const [lang, setLang] = useState<"en" | "so">("en");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = async () => {
    if (loading) return;
    setLoading(true);
    setFailed(false);
    const r = await aiTranslateProduct(title, description ?? undefined);
    if (!mountedRef.current) return;
    if (r) {
      setResult(r);
      if (productId) rememberTranslation(productId, r);
    } else setFailed(true);
    setLoading(false);
  };

  if (!result && !loading && !failed) {
    return (
      <TouchableOpacity style={styles.cta} onPress={run} activeOpacity={0.8}>
        <View style={styles.ctaIcon}>
          <Sparkles size={16} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.ctaTitle}>Translate</Text>
          <Text style={styles.ctaSub}>Original Chinese → English & Somali</Text>
        </View>
        <Languages size={18} color={COLORS.primary} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.badge}>
          <Languages size={14} color={COLORS.primary} />
        </View>
        <Text style={styles.cardTitle}>Translation</Text>
        <View style={styles.langSwitch}>
          {(["en", "so"] as const).map((l) => (
            <TouchableOpacity
              key={l}
              onPress={() => setLang(l)}
              style={[styles.langBtn, lang === l && styles.langBtnActive]}
            >
              <Text style={[styles.langText, lang === l && styles.langTextActive]}>
                {l.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading && (
        <View style={styles.centerRow}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.loadingText}>Translating…</Text>
        </View>
      )}

      {failed && !result && (
        <View style={styles.centerRow}>
          <AlertCircle size={14} color="#d97706" />
          <Text style={styles.failText}>Translation unavailable — try again</Text>
          <TouchableOpacity onPress={run} style={styles.retryBtn}>
            <RefreshCw size={12} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      )}

      {result && (
        <Text style={styles.translatedText}>{lang === "en" ? result.en : result.so}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.primary + "40",
    backgroundColor: COLORS.primary + "0D",
    borderStyle: "dashed",
  },
  ctaIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.primary + "1A",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaTitle: { fontSize: 14, fontWeight: "700", color: COLORS.black },
  ctaSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  card: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.primary + "33",
    backgroundColor: COLORS.primary + "08",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeText: { fontSize: 9, fontWeight: "800", color: COLORS.white, letterSpacing: 0.5 },
  cardTitle: { flex: 1, fontSize: 13, fontWeight: "700", color: COLORS.black },
  langSwitch: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: COLORS.primary + "55",
    borderRadius: 8,
    overflow: "hidden",
  },
  langBtn: { paddingHorizontal: 10, paddingVertical: 3 },
  langBtnActive: { backgroundColor: COLORS.primary },
  langText: { fontSize: 10, fontWeight: "700", color: COLORS.primary },
  langTextActive: { color: COLORS.white },
  translatedText: { fontSize: 13, lineHeight: 20, color: COLORS.black },
  centerRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  loadingText: { fontSize: 12, color: COLORS.textSecondary },
  failText: { fontSize: 12, color: COLORS.textSecondary, flex: 1 },
  retryBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.primary + "55",
    alignItems: "center",
    justifyContent: "center",
  },
});
