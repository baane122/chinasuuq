import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { formatUSD, formatCNY } from "@/lib/utils";
import type { PriceTier } from "@/lib/moq";

interface PriceTableProps {
  /** Supplier price ladder from moqOrderRules(); may be empty. */
  tiers: PriceTier[];
  /** Base wholesale unit price when no ladder was read from the listing. */
  fallbackUnitCny: number;
  /** The quantity currently selected — its row is highlighted. */
  qty: number;
  /** Live CNY per 1 USD from useFx(); used only to derive estimates. */
  cnyPerUsd: number;
  locale: "en" | "so";
}

/**
 * MOQ, the price ladder and the running total in one table — the piece a B2B
 * buyer actually decides from. The yuan column is the listing's own wholesale
 * price (the fact); every dollar column is derived from it at the live FX rate
 * and printed with a leading "≈" plus a footnote, so an estimate is never dressed
 * up as an official USD price (the project's honesty rule).
 */
export default function PriceTable({
  tiers,
  fallbackUnitCny,
  qty,
  cnyPerUsd,
  locale,
}: PriceTableProps) {
  // Same sane band the FX store uses: a flipped/stale rate can't render ¥1 as $10k.
  const rate = Math.min(Math.max(Number(cnyPerUsd) || 7, 2), 20);

  const rows = useMemo(() => {
    const list = tiers.length > 0 ? tiers : fallbackUnitCny > 0
      ? [{ minQty: 1, maxQty: null, priceCny: fallbackUnitCny, label: "Standard" } as PriceTier]
      : [];
    return list;
  }, [tiers, fallbackUnitCny]);

  const applicable = useMemo(() => {
    if (rows.length === 0) return null;
    let match = rows[0];
    for (const t of rows) {
      if (qty >= t.minQty && (t.maxQty === null || qty <= t.maxQty)) match = t;
    }
    if (qty < rows[0].minQty) return null;
    return match;
  }, [rows, qty]);

  const so = locale === "so";

  if (rows.length === 0) return null;

  const unitUsd = (cny: number) => cny / rate;
  const totalCny = applicable ? applicable.priceCny * qty : 0;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={[styles.head, styles.qtyCol]}>
          {so ? "Tirada" : "Quantity"}
        </Text>
        <Text style={[styles.head, styles.unitCol]}>
          {so ? "Qiimaha keligii" : "Unit price"}
        </Text>
        <Text style={[styles.head, styles.totalCol]}>
          {so ? "Wadar" : "Total"}
        </Text>
      </View>

      {rows.map((t, i) => {
        const isCurrent = applicable === t;
        const breakLabel = t.maxQty ? `${t.minQty}–${t.maxQty}` : `${t.minQty}+`;
        return (
          <View
            key={`${t.minQty}-${i}`}
            style={[styles.row, i === rows.length - 1 && styles.rowLast, isCurrent && styles.rowCurrent]}
          >
            <View style={styles.qtyCol}>
              <Text style={[styles.qtyText, isCurrent && styles.qtyTextCurrent]}>
                {breakLabel} {so ? "xidh." : "pcs"}
              </Text>
            </View>
            <View style={styles.unitCol}>
              <Text style={[styles.cnyText, isCurrent && styles.cnyTextCurrent]}>
                {formatCNY(t.priceCny)}
              </Text>
              <Text style={styles.usdText}>≈ {formatUSD(unitUsd(t.priceCny))}</Text>
            </View>
            <View style={[styles.totalCol, styles.alignRight]}>
              {isCurrent ? (
                <>
                  <Text style={styles.totalCny}>{formatCNY(totalCny)}</Text>
                  <Text style={styles.usdText}>≈ {formatUSD(totalCny / rate)}</Text>
                </>
              ) : (
                <Text style={styles.dim}>—</Text>
              )}
            </View>
          </View>
        );
      })}

      <Text style={styles.footnote}>
        {so
          ? "Qiimaha dhabta waa ¥ (yuan). $-ku waa qiyaas sicirka maanta — ma aha qiime rasmi ah."
          : "Wholesale price is in ¥ (CNY). The $ figures are estimates at today's rate, not an official price."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.gray50,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.softOrange,
  },
  head: { fontSize: 11, fontFamily: FONTS.bold, color: COLORS.primaryDark, textTransform: "uppercase" },
  qtyCol: { flex: 1.1 },
  unitCol: { flex: 1.3 },
  totalCol: { flex: 1.1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowCurrent: { backgroundColor: COLORS.primaryBg },
  qtyText: { fontSize: 13, fontFamily: FONTS.medium, color: COLORS.black },
  qtyTextCurrent: { fontFamily: FONTS.bold, color: COLORS.primary },
  cnyText: { fontSize: 13, fontFamily: FONTS.semibold, color: COLORS.black },
  cnyTextCurrent: { color: COLORS.primary },
  usdText: { fontSize: 11, fontFamily: FONTS.regular, color: COLORS.textMuted },
  alignRight: { alignItems: "flex-end" },
  totalCny: { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.primary },
  dim: { fontSize: 13, color: COLORS.gray300 },
  footnote: {
    fontSize: 11,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    lineHeight: 15,
  },
});
