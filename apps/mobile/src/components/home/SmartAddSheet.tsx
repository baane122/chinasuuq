// SmartAddSheet — the native (outside any WebView) entry into the EXISTING
// smart product pipeline.
//
// What it reuses rather than rebuilds:
//  * `SmartProductForm` (@/components/marketplace/SmartProductForm) — the same
//    review + MOQ + sourcing-capture sheet the marketplace browser opens after
//    a CAPTURE, fed here with a CapturedListing derived from the pasted URL.
//  * `aiVisionScanListing` — not re-implemented here; that path needs the
//    in-app WebView's page DOM/screenshot, so when the platform is browsable
//    the sheet routes to /marketplace/[id] where PRODUCT_CAPTURE_SCRIPT and
//    the AI Scan button already live. Deep-linking straight to the product
//    page is a boundary: [marketplace].tsx reads only the `marketplace` route
//    param today and owns its own `entryUrl` state, so this sheet cannot hand
//    it a product URL without editing a file outside this task's ownership.
//    The customer still gets there in one tap plus one paste of the title.
//
// BOUNDARIES (deliberate, reported not hidden):
//  * expo-clipboard / expo-sharing are not dependencies — detection reads the
//    text the customer pastes into the search field.
//  * A url-only listing has no title/price/image until the customer (or the
//    browser capture path) supplies them; the form already renders that
//    "enter price if detection missed it" state.

import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Globe, ClipboardList, X } from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { BottomSheet } from "@/components/BottomSheet";
import SmartProductForm, { type CapturedListing } from "@/components/marketplace/SmartProductForm";
import type { DetectedProductLink } from "@/lib/productLink";

interface SmartAddSheetProps {
  visible: boolean;
  link: DetectedProductLink | null;
  onClose: () => void;
}

export function SmartAddSheet({ visible, link, onClose }: SmartAddSheetProps) {
  const router = useRouter();
  const { locale } = useI18n();
  const tt = (en: string, so: string) => (locale === "so" ? so : en);
  // "form" = the review sheet for this link; "browser" = the in-app marketplace
  // where the full scraper + AI vision run against the real page.
  const [mode, setMode] = useState<"choose" | "form">("choose");

  const listing = useMemo<CapturedListing | null>(() => {
    if (!link) return null;
    // The ONLY fields a pasted URL truly proves: its platform, its listing id,
    // itself. Everything else the form lets the customer fill — exactly like a
    // partial DOM capture does.
    return {
      title: tt(`${link.label} listing ${link.sourceId}`, `${link.label} alaab ${link.sourceId}`),
      price: 0,
      image: "",
      url: link.url,
      brand: "",
      platform: link.platform,
      sourceId: link.sourceId,
      moqText: "",
    };
  }, [link, locale]);

  const openBrowser = useCallback(() => {
    if (!link?.marketplaceId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    router.push({
      pathname: "/marketplace/[marketplace]",
      params: { marketplace: link.marketplaceId },
    });
  }, [link, onClose, router]);

  if (!link) return null;

  return (
    <>
      <BottomSheet visible={visible && mode === "choose"} onClose={onClose} height={330}>
        <View style={styles.body}>
          <View style={styles.detectRow}>
            <View style={styles.detectBadge}>
              <ClipboardList size={18} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.detectTitle}>
                {tt(`${link.label} product link detected`, `Waa la helay link ${link.label}`)}
              </Text>
              <Text style={styles.detectUrl} numberOfLines={1}>
                {link.url}
              </Text>
            </View>
            <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={onClose}>
              <X size={18} color={COLORS.gray400} />
            </TouchableOpacity>
          </View>

          {link.browsable && (
            <TouchableOpacity style={styles.actionPrimary} activeOpacity={0.8} onPress={openBrowser}>
              <Globe size={17} color={COLORS.white} />
              <View style={{ flex: 1 }}>
                <Text style={styles.actionPrimaryText}>
                  {tt(`Open ${link.label} in ChinaSuuq browser`, `Ka fur ${link.label} abka gudihiisa`)}
                </Text>
                <Text style={styles.actionPrimarySub}>
                  {tt(
                    "Then tap AI Scan / + Add on the product page — full photo, price and MOQ capture",
                    "Kadib taabo AI Scan / + Add bogga alaabta — sawir, qiimo iyo MOQ buuxa"
                  )}
                </Text>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.actionSecondary, !link.browsable && styles.actionPrimary]}
            activeOpacity={0.8}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setMode("form");
            }}
          >
            <ClipboardList
              size={17}
              color={link.browsable ? COLORS.primary : COLORS.white}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.actionSecondaryText,
                  !link.browsable && styles.actionPrimaryText,
                ]}
              >
                {tt(
                  "Add this link myself (type price & quantity)",
                  "Anigoo laftayda ku dar (qor qiimaha iyo tirada)"
                )}
              </Text>
              <Text
                style={[
                  styles.actionSecondarySub,
                  !link.browsable && styles.actionPrimarySub,
                ]}
              >
                {tt(
                  "Sends the URL to sourcing plus a MOQ-checked cart line",
                  "Waxay u dirtaa URL-ka sourcing + saf karada oo MOQ la xaqiijiyay"
                )}
              </Text>
            </View>
          </TouchableOpacity>

          {!link.browsable && (
            <Text style={styles.footnote}>
              {tt(
                `${link.label} has no in-app browser yet — staff source it from the link you paste.`,
                `${link.label} browser gaar ah ma laha wali — shaqaalaha ayaa ka soo dalbaya linkiga aad soo dhigtay.`
              )}
            </Text>
          )}
        </View>
      </BottomSheet>

      {/* The EXISTING review sheet — one pipeline, not two. */}
      <SmartProductForm
        visible={visible && mode === "form"}
        listing={listing}
        onClose={() => {
          setMode("choose");
          onClose();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
  },
  detectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: COLORS.gray50,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  detectBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.softOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  detectTitle: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
  },
  detectUrl: {
    fontSize: 11,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
  },
  actionPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  actionPrimaryText: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.white,
  },
  actionPrimarySub: {
    fontSize: 11,
    fontFamily: FONTS.regular,
    color: "rgba(255,255,255,0.85)",
    marginTop: 2,
  },
  actionSecondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  actionSecondaryText: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.primary,
  },
  actionSecondarySub: {
    fontSize: 11,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  footnote: {
    fontSize: 11,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
    textAlign: "center",
  },
});
