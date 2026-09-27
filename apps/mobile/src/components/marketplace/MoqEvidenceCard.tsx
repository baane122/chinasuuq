// MoqEvidenceCard — one honest MOQ statement for the capture review flow.
//
// WHY IT EXISTS: the marketplace WebView scrapes the minimum-order wording out
// of the page (PRODUCT_CAPTURE_SCRIPT -> `moqText`), and src/lib/moqIngest.ts
// turns that text into a number with a source and a confidence. Neither is any
// use to the customer until a screen shows it and lets them fix it, so this
// card is where the evidence becomes a decision:
//   · what the minimum is, in words (describeMoq — same sentence everywhere)
//   · where it came from and how far to trust it (source + confidence)
//   · the verbatim listing wording it was read out of, for auditing
//   · accept it, or type a minimum yourself
// A human answer is recorded as moq_source='manual', which is the only value
// record_moq_candidate() never lets a machine overwrite.
//
// Purely presentational about the RULES: it resolves, and reports decisions.
// The parent owns the product object, the rules and the cart add.

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import type { Product } from "@/types";
import { describeMoq, resolveMoq } from "@/lib/moqIngest";
import type { AiMoqAnswer } from "@/db";

interface MoqEvidenceCardProps {
  product: Product | null;
  /** MOQ-related lines scraped from the listing page. */
  capturedText?: string | null;
  /** "compact" for the capture form's quantity block, "full" in the review sheet. */
  variant?: "compact" | "full";
  /** A human accepted or typed a minimum: persist it as manual. */
  onDecision: (moq: number, rawText: string | null) => void;
  /** Paid fallback (product-enrich). Omit to hide the button. */
  askAi?: () => Promise<AiMoqAnswer | null>;
}

/** How the value got here, in words a customer can act on. */
function provenanceLabel(
  source: string,
  ts: (k: string, f: string) => string
): string {
  if (source === "manual") return ts("moqCard.confirmedByYou", "Confirmed by you");
  if (source === "ai") return ts("moqCard.readByAi", "Read from the listing by ChinaSuuq AI");
  if (source === "regex") return ts("moqCard.detected", "Detected from the listing");
  return ts("moqCard.notFound", "No minimum found on the page");
}

export default function MoqEvidenceCard({
  product,
  capturedText,
  variant = "full",
  onDecision,
  askAi,
}: MoqEvidenceCardProps) {
  const { t, locale } = useI18n();
  const ts = (key: string, fallback: string): string => {
    const v = t(key);
    return v === key ? fallback : v;
  };

  const resolution = useMemo(
    () => resolveMoq(product, capturedText),
    [product, capturedText]
  );

  const [overrideText, setOverrideText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<AiMoqAnswer | null>(null);

  const override = Number.parseInt(overrideText.replace(/[^0-9]/g, ""), 10);
  const overrideValid = Number.isFinite(override) && override >= 1 && override <= 100000;

  // The evidence line the number was read out of, straight from the page.
  const evidence = resolution.raw ?? null;
  const detected = resolution.moq !== null && resolution.source !== "manual";
  const canAskAi = !resolution.enforce && !!askAi;

  const decide = (moq: number, raw: string | null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAiAnswer(null);
    setOverrideText("");
    onDecision(moq, raw);
  };

  const runAi = async () => {
    if (!askAi) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAiBusy(true);
    try {
      const res = await askAi();
      setAiAnswer(res);
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <View style={[styles.card, variant === "compact" && styles.cardCompact]}>
      <View style={styles.headRow}>
        <Text style={styles.headline}>{describeMoq(resolution, locale)}</Text>
        <View style={resolution.needsReview ? styles.badgeWarn : styles.badgeOk}>
          <Text style={resolution.needsReview ? styles.badgeTextWarn : styles.badgeTextOk}>
            {resolution.needsReview
              ? ts("moqCard.needsReview", "Needs review")
              : ts("moqCard.confirmed", "Confirmed")}
          </Text>
        </View>
      </View>

      <Text style={styles.provenance}>
        {provenanceLabel(resolution.source, ts)}
        {resolution.confidence > 0
          ? " · " + Math.round(resolution.confidence * 100) + "%"
          : ""}
      </Text>

      {evidence ? (
        <Text style={styles.evidence} numberOfLines={2}>
          {ts("moqCard.listingSaid", "The listing said")}: “{evidence}”
        </Text>
      ) : null}

      {resolution.alternatives.length > 0 && detected && (
        <Text style={styles.alternatives}>
          {ts("moqCard.otherNumbers", "Other quantities on this page")}
          {": "}
          {resolution.alternatives.slice(0, 3).join(", ")}
          {" — " + ts("moqCard.multiSkuNote", "this listing may cover more than one product.")}
        </Text>
      )}

      {detected && (
        <TouchableOpacity
          style={styles.confirmBtn}
          activeOpacity={0.8}
          onPress={() => decide(resolution.displayMoq, evidence)}
        >
          <Text style={styles.confirmText}>
            {ts("moqCard.confirmMinimum", "Confirm minimum")} · {resolution.displayMoq}
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.overrideRow}>
        <TextInput
          style={styles.overrideInput}
          value={overrideText}
          onChangeText={(v) => setOverrideText(v.replace(/[^0-9]/g, ""))}
          placeholder={ts("moqCard.overridePlaceholder", "Set the minimum yourself")}
          placeholderTextColor={COLORS.textMuted}
          keyboardType="number-pad"
          maxLength={6}
        />
        <TouchableOpacity
          style={[styles.overrideBtn, !overrideValid && styles.overrideBtnDisabled]}
          disabled={!overrideValid}
          activeOpacity={0.8}
          onPress={() =>
            decide(
              override,
              evidence
                ? `Manual override ${override} — page showed “${evidence}”`
                : `Manual override ${override}, no minimum stated on the page`
            )
          }
        >
          <Text style={styles.overrideBtnText}>{ts("moqCard.save", "Save")}</Text>
        </TouchableOpacity>
      </View>

      {canAskAi && (
        <TouchableOpacity style={styles.aiBtn} onPress={runAi} disabled={aiBusy} activeOpacity={0.8}>
          {aiBusy ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Text style={styles.aiBtnText}>
              {ts("moqCard.askAi", "Ask ChinaSuuq to read the listing")}
            </Text>
          )}
        </TouchableOpacity>
      )}

      {aiAnswer && (
        <View style={styles.aiResult}>
          <Text style={styles.aiResultText}>
            {ts("moqCard.aiSays", "ChinaSuuq read a minimum of")} {aiAnswer.moq}{" "}
            {"· "}
            {Math.round(aiAnswer.confidence * 100)}%
          </Text>
          <TouchableOpacity
            style={styles.aiUseBtn}
            onPress={() => decide(aiAnswer.moq, aiAnswer.rawText ?? evidence)}
            activeOpacity={0.8}
          >
            <Text style={styles.aiUseText}>{ts("moqCard.useIt", "Use this")}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.gray50,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardCompact: { marginBottom: SPACING.sm },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm },
  headline: { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.black, flex: 1 },
  badgeOk: { backgroundColor: COLORS.successBg, paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: RADIUS.pill },
  badgeWarn: { backgroundColor: COLORS.warningBg, paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: RADIUS.pill },
  badgeTextOk: { fontSize: 10, fontFamily: FONTS.semibold, color: COLORS.success },
  badgeTextWarn: { fontSize: 10, fontFamily: FONTS.semibold, color: COLORS.warning },
  provenance: { fontSize: 11, fontFamily: FONTS.medium, color: COLORS.textSecondary, marginTop: 4 },
  evidence: { fontSize: 11, fontFamily: FONTS.medium, color: COLORS.textMuted, marginTop: 2 },
  alternatives: { fontSize: 11, fontFamily: FONTS.medium, color: COLORS.warning, marginTop: 4 },
  confirmBtn: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    paddingVertical: 8,
    alignItems: "center",
  },
  confirmText: { fontSize: 12, fontFamily: FONTS.bold, color: COLORS.white },
  overrideRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginTop: SPACING.sm },
  overrideInput: {
    flex: 1,
    height: 40,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: COLORS.black,
  },
  overrideBtn: {
    height: 40,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.softOrange,
    justifyContent: "center",
  },
  overrideBtnDisabled: { backgroundColor: COLORS.gray100, opacity: 0.6 },
  overrideBtnText: { fontSize: 12, fontFamily: FONTS.bold, color: COLORS.primary },
  aiBtn: {
    marginTop: SPACING.sm,
    height: 38,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
  },
  aiBtnText: { fontSize: 12, fontFamily: FONTS.semibold, color: COLORS.textSecondary },
  aiResult: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.infoBg,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  aiResultText: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.info, flex: 1 },
  aiUseBtn: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.info,
  },
  aiUseText: { fontSize: 11, fontFamily: FONTS.semibold, color: COLORS.info },
});
