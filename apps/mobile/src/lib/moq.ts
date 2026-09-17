// MOQ (Minimum Order Quantity) Engine for ChinaSuuq
// First-class support for pack sizes, carton quantities, variant mixing, tier pricing,
// order increments, sample options and honest validation messages in English and Somali.

import type { Product } from "@/types";

/**
 * UI locale for engine-emitted messages. Components read it from useI18n()
 * and pass it down (hooks cannot live inside a pure lib).
 */
export type MoqLocale = "en" | "so";

/**
 * Price tier with quantity thresholds
 */
export interface PriceTier {
  /** Minimum quantity for this tier */
  minQty: number;
  /** Maximum quantity (null = unlimited) */
  maxQty: number | null;
  /** Unit price in CNY for this tier */
  priceCny: number;
  /** Optional label (e.g. "Standard", "Wholesale", "Bulk") */
  label?: string;
}

/**
 * Pack / carton definition
 */
export interface PackDefinition {
  /** Pieces per pack (e.g. 24 pieces per carton) */
  piecesPerPack: number;
  /** Label for the pack unit (e.g. "carton", "pack", "box") */
  packLabel: string;
  /** Optional: packs per larger unit (e.g. 6 packs per carton) */
  packsPerUnit?: number;
  /** Label for the larger unit */
  unitLabel?: string;
}

/**
 * Variant-specific MOQ rule
 */
export interface VariantMOQ {
  variantId: string;
  minQty: number;
  priceCny?: number;
}

/**
 * Mixed-variant MOQ rules
 */
export interface MixedVariantRule {
  /** Minimum total quantity across all selected variants */
  totalMinQty: number;
  /** Minimum quantity per individual variant (optional) */
  perVariantMinQty?: number;
  /** Allow mixing different variants in one order */
  allowMix: boolean;
}

/**
 * Sample / small-order options
 */
export interface SampleOption {
  enabled: boolean;
  samplePriceCny?: number;
  maxSampleQty?: number;
  shippingNote?: string;
}

/**
 * Complete order rules for a product
 */
export interface OrderRules {
  /** Product-level MOQ */
  productMoq: number;
  /** Price tiers sorted by minQty ascending */
  tiers: PriceTier[];
  /** Pack / carton definitions (optional) */
  packs?: PackDefinition[];
  /** Order increment (order in multiples of N) */
  orderIncrement?: number;
  /** Variant-specific MOQs */
  variantMoqs?: VariantMOQ[];
  /** Mixed-variant rules */
  mixedVariant?: MixedVariantRule;
  /** Sample ordering options */
  sample?: SampleOption;
  /** Maximum order quantity (0/undefined = no limit) */
  maxQty?: number;
}

/**
 * Validation result
 */
export interface MOQValidationResult {
  valid: boolean;
  message: string;
  /** The minimum that was violated (when invalid) */
  suggestedMin?: number;
  /** A quantity that satisfies every structural rule (when invalid) */
  suggestedQty?: number;
}

/**
 * Pack display breakdown
 */
export interface PackDisplay {
  /** e.g. "5 cartons × 24 pieces = 120 pieces total" */
  displayText: string;
  totalPieces: number;
  packCount: number;
}

/**
 * Pluralize a simple unit label: "carton" -> "cartons", "box" -> "boxes"
 */
function pluralizeUnit(label: string, count: number): string {
  if (count === 1) return label;
  if (/(s|x|sh|ch|z)$/.test(label)) return label + "es";
  return label + "s";
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Inline bilingual picker — same pattern as the components */
function msg(locale: MoqLocale, en: string, so: string): string {
  return locale === "so" ? so : en;
}

/** Somali unit names for known pack labels; unknown labels fall back to English pluralization */
const SO_UNITS: Record<string, { one: string; many: string }> = {
  carton: { one: "sanduuq", many: "sanduuqyo" },
  pack: { one: "baakad", many: "baakado" },
  box: { one: "sanduuq", many: "sanduuqyo" },
};

function unitLocalized(label: string, count: number, locale: MoqLocale): string {
  if (locale === "so") {
    const u = SO_UNITS[label.toLowerCase()];
    if (u) return count === 1 ? u.one : u.many;
  }
  return pluralizeUnit(label, count);
}

/**
 * Smallest quantity >= from that satisfies EVERY structural constraint
 * (product MOQ, pack multiples, order increment). Used for one-tap fixes
 * so a suggestion never trades one violation for another.
 */
export function nextValidQuantity(rules: OrderRules, from: number): number {
  const packSize =
    rules.packs && rules.packs.length > 0 && rules.packs[0].piecesPerPack > 1
      ? rules.packs[0].piecesPerPack
      : 1;
  const increment =
    rules.orderIncrement && rules.orderIncrement > 1 ? rules.orderIncrement : 1;
  const stride = (packSize * increment) / gcd(packSize, increment);
  let q = Math.max(from, rules.productMoq);
  const rem = q % stride;
  if (rem !== 0) q += stride - rem;
  if (rules.maxQty && rules.maxQty > 0 && q > rules.maxQty) {
    const capped = Math.floor(rules.maxQty / stride) * stride;
    if (capped >= rules.productMoq) q = capped;
  }
  return q;
}

/**
 * Validate a quantity against the rules.
 * Order of checks: MOQ floor -> cap -> mixed variants -> pack multiples -> increment.
 * Messages are emitted in the requested locale (default English).
 */
export function validateMOQ(
  rules: OrderRules,
  quantity: number,
  selectedVariants?: string[],
  locale: MoqLocale = "en"
): MOQValidationResult {
  // 1. Product MOQ floor
  if (quantity < rules.productMoq) {
    return {
      valid: false,
      message: msg(
        locale,
        "Minimum order is " + rules.productMoq + " pieces",
        "Dalabka ugu yar waa " + rules.productMoq + " xabbo",
      ),
      suggestedMin: rules.productMoq,
      suggestedQty: nextValidQuantity(rules, rules.productMoq),
    };
  }

  // 2. Upper cap
  if (rules.maxQty && rules.maxQty > 0 && quantity > rules.maxQty) {
    return {
      valid: false,
      message: msg(
        locale,
        "Maximum order is " + rules.maxQty + " pieces",
        "Dalabka ugu badan waa " + rules.maxQty + " xabbo",
      ),
      suggestedMin: rules.productMoq,
      suggestedQty: nextValidQuantity(rules, rules.maxQty),
    };
  }

  // 3. Mixed-variant rules
  if (rules.mixedVariant && selectedVariants && selectedVariants.length > 1) {
    if (!rules.mixedVariant.allowMix) {
      return {
        valid: false,
        message: msg(
          locale,
          "Cannot mix variants in one order. Please order each variant separately.",
          "Lama ogola isku-darka doorashooyinka hal dalab gudihiis. Fadlan dalbo kasta gooni."
        ),
        suggestedMin: rules.productMoq,
      };
    }
    if (rules.mixedVariant.totalMinQty && quantity < rules.mixedVariant.totalMinQty) {
      return {
        valid: false,
        message: msg(
          locale,
          "Mixed orders require minimum " + rules.mixedVariant.totalMinQty + " pieces total",
          "Dalabka isku-daran wuxuu u baahan yahay ugu yaraan " + rules.mixedVariant.totalMinQty + " xabbo"
        ),
        suggestedMin: rules.mixedVariant.totalMinQty,
        suggestedQty: nextValidQuantity(rules, rules.mixedVariant.totalMinQty),
      };
    }
  }

  // 4. Pack multiples (indivisible cartons)
  if (rules.packs && rules.packs.length > 0) {
    const primaryPack = rules.packs[0];
    if (primaryPack.piecesPerPack > 1 && quantity % primaryPack.piecesPerPack !== 0) {
      const nextValid = nextValidQuantity(rules, quantity);
      return {
        valid: false,
        message: msg(
          locale,
          "Must order in multiples of " + primaryPack.piecesPerPack + " " +
            pluralizeUnit(primaryPack.packLabel, 2) + ". Try " + nextValid + " pieces",
          "Waa in lagu dalbo dhan " + primaryPack.piecesPerPack + " " +
            unitLocalized(primaryPack.packLabel, 2, locale) + ". Isku day " + nextValid + " xabbo"
        ),
        suggestedMin: primaryPack.piecesPerPack,
        suggestedQty: nextValid,
      };
    }
  }

  // 5. Order increment
  if (rules.orderIncrement && rules.orderIncrement > 1 && quantity % rules.orderIncrement !== 0) {
    const nextValid = nextValidQuantity(rules, quantity);
    return {
      valid: false,
      message: msg(
        locale,
        "Must order in multiples of " + rules.orderIncrement + ". Try " + nextValid + " pieces",
        "Waa in lagu dalbo tiro la isku dhuftay " + rules.orderIncrement + ". Isku day " + nextValid + " xabbo"
      ),
      suggestedMin: rules.productMoq,
      suggestedQty: nextValid,
    };
  }

  return {
    valid: true,
    message: msg(locale, "Quantity meets all requirements", "Tirada waxay buuxinaysaa dhammaan shuruudaha"),
  };
}

/**
 * Applicable price tier for a quantity (highest tier whose range contains qty).
 * Tier boundaries are inclusive on minQty, exclusive above maxQty.
 */
export function calculateTierPrice(rules: OrderRules, quantity: number): PriceTier | null {
  if (!rules.tiers || rules.tiers.length === 0) return null;
  let applicable: PriceTier | null = null;
  for (const tier of rules.tiers) {
    if (quantity >= tier.minQty && (tier.maxQty === null || quantity <= tier.maxQty)) {
      applicable = tier;
    }
  }
  return applicable;
}

/**
 * Smart quick-buy amounts: MOQ, pack multiples and every tier boundary.
 */
export function getSuggestedQuantities(rules: OrderRules): number[] {
  const set = new Set<number>();
  set.add(rules.productMoq);
  if (rules.packs && rules.packs.length > 0) {
    const packSize = rules.packs[0].piecesPerPack;
    for (const m of [1, 2, 5, 10]) {
      const q = packSize * m;
      if (q >= rules.productMoq) set.add(q);
    }
  } else {
    for (const q of [rules.productMoq * 2, rules.productMoq * 5, rules.productMoq * 10]) {
      set.add(q);
    }
  }
  for (const tier of rules.tiers ?? []) set.add(tier.minQty);
  return Array.from(set).sort((a, b) => a - b).slice(0, 6);
}

/**
 * Single suggested quantity >= target (falls back to the largest suggestion).
 */
export function getSuggestedQuantity(rules: OrderRules, targetQty?: number): number {
  const qty = targetQty ?? rules.productMoq;
  const suggestions = getSuggestedQuantities(rules);
  const match = suggestions.find((s) => s >= qty);
  return match ?? suggestions[suggestions.length - 1] ?? rules.productMoq;
}

/**
 * Pack/carton math for display, e.g. "5 cartons × 24 pieces = 120 pieces total".
 * Multi-level packs render as "2 cartons × 6 packs × 24 pieces = 288 pieces total".
 * Somali locale renders as "5 sanduuqyo × 24 xabbo = 120 xabbo wadarta".
 */
export function formatPackDisplay(
  rules: OrderRules,
  quantity: number,
  locale: MoqLocale = "en"
): PackDisplay | null {
  if (!rules.packs || rules.packs.length === 0) return null;
  const primaryPack = rules.packs[0];
  if (primaryPack.piecesPerPack <= 0 || quantity <= 0) return null;

  const packCount = Math.floor(quantity / primaryPack.piecesPerPack);
  const remainder = quantity % primaryPack.piecesPerPack;
  const piecesW = locale === "so" ? "xabbo" : "pieces";
  const totalW = locale === "so" ? "xabbo wadarta" : "pieces total";
  let displayText: string;

  if (primaryPack.packsPerUnit && primaryPack.unitLabel && packCount >= primaryPack.packsPerUnit) {
    const unitCount = Math.floor(packCount / primaryPack.packsPerUnit);
    const remainingPacks = packCount % primaryPack.packsPerUnit;
    const unitLabel = unitLocalized(primaryPack.unitLabel, unitCount, locale);
    const packLabel = unitLocalized(primaryPack.packLabel, primaryPack.packsPerUnit, locale);
    if (remainingPacks > 0) {
      const extraLabel = unitLocalized(primaryPack.packLabel, remainingPacks, locale);
      displayText =
        unitCount + " " + unitLabel + " × " + primaryPack.packsPerUnit + " " + packLabel +
        " × " + primaryPack.piecesPerPack + " " + piecesW + " + " + remainingPacks + " " + extraLabel +
        " = " + quantity + " " + totalW;
    } else {
      displayText =
        unitCount + " " + unitLabel + " × " + primaryPack.packsPerUnit + " " + packLabel +
        " × " + primaryPack.piecesPerPack + " " + piecesW + " = " + quantity + " " + totalW;
    }
  } else {
    displayText =
      packCount + " " + unitLocalized(primaryPack.packLabel, packCount, locale) +
      " × " + primaryPack.piecesPerPack + " " + piecesW + " = " + quantity + " " + totalW;
  }

  return { displayText, totalPieces: quantity, packCount };
}

/**
 * Derive sensible default rules from a product when no supplier rules exist:
 * standard tier at the product’s min price, plus a bulk tier when a price range exists.
 */
export function createDefaultRules(product: Product): OrderRules {
  const moq = Math.max(1, Math.floor(product.moq || 1));
  const tiers: PriceTier[] = [];
  if (product.price_cny_min > 0) {
    tiers.push({ minQty: moq, maxQty: null, priceCny: product.price_cny_min, label: "Standard" });
    if (product.price_cny_max > 0 && product.price_cny_max < product.price_cny_min) {
      // A lower max price reads as the bulk price: unlock it at 10x MOQ (min 100)
      const bulkQty = Math.max(moq * 10, 100);
      tiers.push({ minQty: bulkQty, maxQty: null, priceCny: product.price_cny_max, label: "Bulk" });
      tiers[0].maxQty = bulkQty - 1;
    }
  }
  return {
    productMoq: moq,
    tiers,
    sample: { enabled: moq <= 5, maxSampleQty: Math.min(moq, 5) },
  };
}

/**
 * Variant-aware price: variant override wins over the tier/base price.
 */
export function getVariantPrice(rules: OrderRules, variantId: string, basePriceCny: number): number {
  const variantRule = rules.variantMoqs?.find((r) => r.variantId === variantId);
  return variantRule?.priceCny ?? basePriceCny;
}

/**
 * Is the current quantity exactly at a tier boundary? Returns the next tier for nudges.
 */
export function isAtTierBoundary(
  rules: OrderRules,
  quantity: number
): { isBoundary: boolean; nextTier?: PriceTier } {
  for (let i = 0; i < (rules.tiers?.length ?? 0); i++) {
    if (rules.tiers[i].minQty === quantity) {
      return { isBoundary: true, nextTier: rules.tiers[i + 1] };
    }
  }
  return { isBoundary: false };
}
