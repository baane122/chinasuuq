import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Plus, Package, ShoppingCart, Sparkles, Flame, TrendingUp } from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useCartStore } from "@/store/cart";
import { describeMoq } from "@/lib/moqIngest";
import { getMOQText } from "@/lib/shipping";
import { formatCNY, formatUSD } from "@/lib/utils";
import { trackById } from "@/api/browseEvents";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";
import type { TrendingItem } from "@/api/trending";

const { width: SCREEN_W } = Dimensions.get("window");

// Image-forward card: tall photo, title over the scrim, price, one-tap add.
const CARD_W = 176;
const PHOTO_H = 208;
const GAP = SPACING.md;
const PITCH = CARD_W + GAP;

/** How many cards are fully across the viewport at once (conservative). */
const WINDOW = Math.max(1, Math.floor(SCREEN_W / PITCH) - 1);

interface TrendingRowProps {
  items: TrendingItem[];
  /**
   * False until the section is actually on screen. A view event for a card the
   * customer never scrolled to would be invented demand, and the ranking in
   * fn_trending_products would treat it as real.
   */
  active?: boolean;
  /** The list came from the local cache, not from this call to the backend. */
  stale?: boolean;
}

export function TrendingRow({ items, active = true, stale = false }: TrendingRowProps) {
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);
  const { locale } = useI18n();

  const seenRef = useRef<Set<string>>(new Set());
  const noteAnim = useRef(new Animated.Value(0)).current;
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
    };
  }, []);

  const markSeen = useCallback(
    (from: number, to: number) => {
      for (let i = from; i <= to; i++) {
        const item = items[i];
        if (!item || seenRef.current.has(item.productId)) continue;
        seenRef.current.add(item.productId);
        // Fire and forget. trackById wraps recordProductEvent, which catches
        // its own failures, and the RPC throttles a repeat within 60s — so
        // this can neither block nor throw.
        trackById(item.productId, "view", item.marketplace);
      }
    },
    [items]
  );

  // The first cards count as seen only once the home screen has scrolled the
  // section into view; the rest arrive with the horizontal scroll below.
  useEffect(() => {
    if (active && items.length > 0) markSeen(0, WINDOW);
  }, [active, items.length, markSeen]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const first = Math.max(0, Math.floor(e.nativeEvent.contentOffset.x / PITCH));
      markSeen(first, first + WINDOW);
    },
    [markSeen]
  );

  const openProduct = useCallback(
    (item: TrendingItem) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push({ pathname: "/product/[id]", params: { id: item.productId } });
    },
    [router]
  );

  const showNote = useCallback(
    (text: string) => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
      setNote(text);
      noteAnim.setValue(0);
      Animated.timing(noteAnim, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      noteTimer.current = setTimeout(() => {
        Animated.timing(noteAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(
          ({ finished }) => {
            if (finished) setNote(null);
          }
        );
      }, 4200);
    },
    [noteAnim]
  );

  const handleAdd = useCallback(
    (item: TrendingItem) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      // Without the catalog row we have no source url, no CNY price and no MOQ
      // provenance, so a cart line would be a guess staff cannot purchase.
      // Open the product instead of adding something unbuyable.
      if (!item.canAddDirectly || !item.product) {
        openProduct(item);
        return;
      }
      const qty = item.quantity;
      addItem(item.product, qty);
      trackById(item.productId, "add_to_cart", item.marketplace);
      const added =
        locale === "so"
          ? `Waxaa lagu daray ${qty} xabbadood`
          : `Added ${qty} ${qty === 1 ? "pc" : "pcs"} to your cart`;
      // Say out loud when a one-tap add carried a minimum with it.
      const floor =
        qty > 1 ? ` · ${describeMoq(item.moq, locale)}` : "";
      showNote(added + floor);
    },
    [addItem, locale, openProduct, showNote]
  );

  if (items.length === 0) return null;

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={64}
        onScroll={handleScroll}
        contentContainerStyle={styles.row}
      >
        {items.map((item, index) => (
          <TrendingCard
            key={item.productId}
            item={item}
            rank={index + 1}
            locale={locale}
            onOpen={() => openProduct(item)}
            onAdd={() => handleAdd(item)}
          />
        ))}
      </ScrollView>

      {stale && (
        <Text style={styles.staleNote}>
          {locale === "so"
            ? "Waa liiskii la keydiyay — soo cusboonaysii"
            : "From the last saved list — pull to refresh"}
        </Text>
      )}

      {note && (
        <Animated.View style={[styles.noteWrap, { opacity: noteAnim }]}>
          <ShoppingCart size={14} color={COLORS.primary} strokeWidth={2.2} />
          <Text style={styles.noteText} numberOfLines={2}>
            {note}
          </Text>
          <TouchableOpacity
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/cart");
            }}
          >
            <Text style={styles.noteAction}>
              {locale === "so" ? "Eeg Karada" : "Go to cart"}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

// ─── One card ────────────────────────────────────────
interface TrendingCardProps {
  item: TrendingItem;
  rank: number;
  locale: "en" | "so";
  onOpen: () => void;
  onAdd: () => void;
}

const TrendingCard = React.memo(
  function TrendingCard({
    item,
    rank,
    locale,
    onOpen,
    onAdd,
  }: TrendingCardProps) {
  // A product with no scraped photo, or a photo whose CDN refused the request,
  // gets the same quiet placeholder rather than an empty grey box.
  const [loadFailed, setLoadFailed] = useState(false);
  const showPhoto = Boolean(item.imageUrl) && !loadFailed;

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onOpen}>
      <View style={styles.photoBox}>
        {showPhoto ? (
          <Image
            source={{ uri: item.imageUrl! }}
            style={styles.photo}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            recyclingKey={item.imageUrl!}
            placeholder={COLORS.gray100}
            onError={() => setLoadFailed(true)}
          />
        ) : (
          <View style={styles.photoFallback}>
            <Package size={26} color={COLORS.gray400} strokeWidth={1.6} />
            <Text style={styles.photoFallbackText} numberOfLines={2}>
              {locale === "so" ? "Sawir ma jiro" : "No photo yet"}
            </Text>
          </View>
        )}

        {/* Scrim so the rank/price overlay stays readable on any photo. */}
        {showPhoto && (
          <LinearGradient
            colors={["rgba(0,0,0,0.35)", "transparent", "rgba(0,0,0,0.62)"]}
            locations={[0, 0.42, 1]}
            style={styles.photoScrim}
            pointerEvents="none"
          />
        )}

        <View style={styles.marketBadge}>
          <Text style={styles.marketBadgeText}>{item.marketplace}</Text>
        </View>
        {/* The badge states HOW this card earned its slot. A "#3" on a staff pick
            would claim a popularity ranking nobody measured, and a pick hidden
            among numbered cards is indistinguishable from organic demand. */}
        {item.source === "pinned" ? (
          <View style={styles.pickBadge}>
            <Sparkles size={9} color={COLORS.primary} strokeWidth={2.4} />
            <Text style={styles.pickBadgeText}>
              {locale === "so" ? "La soo xulay" : "Our pick"}
            </Text>
          </View>
        ) : item.source === "bestseller" ? (
          <View style={styles.pickBadge}>
            <Text style={styles.pickBadgeText}>
              {locale === "so"
                ? `${item.salesCount ?? 0} la iibiyay`
                : `${item.salesCount ?? 0} sold`}
            </Text>
          </View>
        ) : (
          <View style={styles.rankBadge}>
            <Text style={styles.rankBadgeText}>#{rank}</Text>
          </View>
        )}

        {/* Title over the photo — the card carries more picture and less text
            below, which is what makes a trending shelf feel like a shelf. */}
        <Text style={styles.photoTitle} numberOfLines={2}>
          {item.name}
        </Text>
      </View>

      {/* A USD price and a wholesale CNY price are different facts, so the card
          prints whichever it has with the matching symbol rather than dressing
          ¥12.50 up as $12.50. */}
      <View style={styles.priceRow}>
        <Text style={styles.price}>
          {item.priceUsd !== null && item.priceUsd > 0
            ? formatUSD(item.priceUsd)
            : item.priceCny !== null && item.priceCny > 0
              ? formatCNY(item.priceCny)
              : locale === "so"
                ? "Waydii qiimaha"
                : "Price on request"}
        </Text>
        {item.source === "behaviour" && item.eventCount > 0 && (
          <View style={styles.heatChip}>
            <TrendingUp size={10} color={COLORS.primary} />
            <Text style={styles.heatChipText}>{item.eventCount}</Text>
          </View>
        )}
      </View>

      {item.quantity > 1 && (
        <Text style={styles.moq} numberOfLines={1}>
          {getMOQText(item.quantity, locale)}
        </Text>
      )}

      <TouchableOpacity
        style={[styles.addButton, !item.canAddDirectly && styles.viewButton]}
        activeOpacity={0.75}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        onPress={onAdd}
      >
        {item.canAddDirectly ? (
          <Plus size={14} color={COLORS.white} strokeWidth={2.6} />
        ) : null}
        <Text style={[styles.addButtonText, !item.canAddDirectly && styles.viewButtonText]}>
          {item.canAddDirectly
            ? locale === "so"
              ? "Dar"
              : "Add"
            : locale === "so"
              ? "Eeg"
              : "View"}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
  },
  // The row hands every card a fresh inline `onOpen`/`onAdd` closure on each
  // parent render, which defeats the default shallow compare. Those closures
  // only ever read `item`, `locale`, and store/router callbacks that are
  // stable, so identity of the item + locale + rank is the real input.
  (prev, next) =>
    prev.item === next.item && prev.rank === next.rank && prev.locale === next.locale
);

// ─── Loading state ───────────────────────────────────
export function TrendingRowSkeleton() {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.card}>
          <SkeletonLoader width={CARD_W} height={PHOTO_H} borderRadius={RADIUS.md} />
          <View style={{ width: CARD_W }}>
            <SkeletonLoader width="90%" height={13} style={{ marginTop: SPACING.sm }} />
            <SkeletonLoader width="45%" height={16} style={{ marginTop: SPACING.xs }} />
            <SkeletonLoader width={72} height={28} borderRadius={RADIUS.pill} style={{ marginTop: SPACING.sm }} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: SPACING.lg,
    gap: GAP,
  },
  card: {
    width: CARD_W,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.sm,
    paddingBottom: SPACING.sm + 2,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  photoBox: {
    width: CARD_W - SPACING.sm * 2,
    height: PHOTO_H - SPACING.sm,
    borderRadius: RADIUS.md,
    overflow: "hidden",
    backgroundColor: COLORS.gray100,
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  photoScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  photoTitle: {
    position: "absolute",
    left: SPACING.sm,
    right: SPACING.sm,
    bottom: SPACING.sm,
    fontSize: 12,
    fontFamily: FONTS.semibold,
    color: COLORS.white,
    lineHeight: 16,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  photoFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.softOrange,
    paddingHorizontal: SPACING.sm,
    gap: SPACING.xs,
  },
  photoFallbackText: {
    fontSize: 11,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
    textAlign: "center",
  },
  marketBadge: {
    position: "absolute",
    top: SPACING.sm,
    left: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
  },
  marketBadgeText: {
    fontSize: 10,
    fontFamily: FONTS.semibold,
    color: COLORS.white,
    textTransform: "uppercase",
  },
  rankBadge: {
    position: "absolute",
    top: SPACING.sm,
    right: SPACING.sm,
    minWidth: 28,
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.white,
  },
  rankBadgeText: {
    fontSize: 10,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
  },
  pickBadge: {
    position: "absolute",
    top: SPACING.sm,
    right: SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    maxWidth: CARD_W - SPACING.sm * 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.white,
  },
  pickBadgeText: {
    fontSize: 10,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
    marginTop: SPACING.sm,
  },
  price: {
    flexShrink: 1,
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
    letterSpacing: -0.3,
  },
  heatChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: COLORS.softOrange,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  heatChipText: {
    fontSize: 9,
    fontFamily: FONTS.bold,
    color: COLORS.primaryDark,
  },
  moq: {
    fontSize: 10,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    alignSelf: "stretch",
    minHeight: 34,
    marginTop: SPACING.sm,
    marginBottom: 2,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
  },
  viewButton: {
    backgroundColor: COLORS.gray100,
  },
  addButtonText: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
    color: COLORS.white,
  },
  viewButtonText: {
    color: COLORS.black,
  },
  staleNote: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    fontSize: 11,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
  },
  noteWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: COLORS.black,
  },
  noteAction: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
    color: COLORS.primary,
  },
});
