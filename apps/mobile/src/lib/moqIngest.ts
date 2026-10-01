// MOQ ingestion — the ONE place MOQ is read out of captured marketplace text.
//
// WHY THIS FILE EXISTS: 1688 puts the minimum order quantity in whatever shape
// it likes — "2件起批", "起订量: 5", "100件起批", "≥50", "MOQ 10 Pieces", or a
// price ladder like "2-19件 ¥12 / 20-99件 ¥10 / ≥100件 ¥8". When the capture
// screen missed it the cart silently defaulted to 1, and staff discovered the
// real rule at purchase time. Parsing therefore lives here, once, as pure
// functions: no screen may carry its own MOQ regex.
//
// Order of operations for a capture: this zero-cost local pass first, then the
// paid AI fallback (apps/web/supabase/functions/product-enrich) only when the
// local confidence is too low to trust. Both feed record_moq_candidate(), which
// keeps the best-evidenced value; `confidence` is the currency it compares.
//
// Deliberately dependency-free, deterministic and total: every path returns a
// verdict, an unreadable page yields { moq: null, confidence: 0 } rather than a
// guess, because a stated "unknown" is reviewable and a wrong number is not.

export type MoqSource = "manual" | "regex" | "ai";

export interface MoqExtraction {
  /** The minimum quantity a single buyer can order, or null when unstated. */
  moq: number | null;
  /** 0..1 — how much this reading should be trusted. */
  confidence: number;
  /** Verbatim snippet the number came from, so a human can audit the reading. */
  raw: string | null;
  /** Other quantities on the page at similar strength: the reading is ambiguous. */
  alternatives: number[];
}

export interface MoqProductLike {
  moq?: number | null;
  moq_source?: MoqSource | string | null;
  moq_confidence?: number | null;
  moq_raw_text?: string | null;
}

export interface ResolvedMoq extends MoqExtraction {
  source: MoqSource | "none";
  /** Value the cart must show; never below 1, so quantity maths stays sound. */
  displayMoq: number;
  /** No human has confirmed this MOQ — surface it for confirmation. */
  needsReview: boolean;
  /** Refuse an add-to-cart on this reading. Below it, warn but allow. */
  enforce: boolean;
  /** What the supplier field itself stated (0 when it is the unset default 1). */
  statedMinimum: number;
  /** A reading worth showing that is NOT the floor in force (weak, or beaten by
   *  a stated minimum). Lets the cart say "appears to be 50" without blocking. */
  suggestedMinimum: number | null;
}

const MIN_MOQ = 1;
const MAX_MOQ = 100000; // a carton/box quantity above this is a misread
const MAX_RAW_CHARS = 200;

/**
 * Confidence needed before a machine reading may BLOCK a customer's cart.
 * Below this the number is worth showing ("minimum appears to be 50") but not
 * worth refusing a sale over, because the weak parser rules fire on review
 * text, spec tables and bare template cells.
 */
export const ENFORCE_CONFIDENCE = 0.8;

/** Confidence when the page offers a second, equally strong answer. */
const AMBIGUOUS_CONFIDENCE = 0.7;

// 1688 counts in 件/个/只/条/包/箱/台/套; "手" means one whole lot.
const UNIT = "件个只条包箱台套批手";
// Arabic digits, or a run of Chinese numeral characters (一件起批). toNumber()
// reads both and returns 0 for anything it cannot resolve.
const NUM = String.raw`(?:\d+|[一二两三四五六七八九十]+)`;

const CN_DIGITS: Record<string, number> = {
  "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5,
  "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
};

/** Arabic or Chinese numeral to number; 0 when unreadable. */
function toNumber(token: string): number {
  const t = token.trim();
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  // Handles 十, 十一, 二十, 二十三 — the range a MOQ ever appears in.
  const tens = t.indexOf("十");
  if (tens < 0) return CN_DIGITS[t] ?? 0;
  const hi = tens === 0 ? 1 : CN_DIGITS[t[tens - 1]] ?? 0;
  const tail = t.slice(tens + 1);
  const lo = tail ? CN_DIGITS[tail] ?? 0 : 0;
  return hi * 10 + lo;
}

function plausible(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_MOQ && n <= MAX_MOQ;
}

function clip(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > MAX_RAW_CHARS ? t.slice(0, MAX_RAW_CHARS) : t;
}

type Rule = {
  re: RegExp;
  confidence: number;
  /** Capture group holding the quantity. */
  group: number;
  /**
   * "lowest" takes the smallest quantity the rule finds — which is what makes a
   * price ladder read correctly, since a single customer can order the bottom
   * tier. "first" takes the earliest hit, used where position carries more
   * meaning than size (a bare number in a template cell).
   */
  pick: "first" | "lowest";
};

// Checked in order of descending confidence; the first rule that yields a
// plausible number wins, so the most explicit wording must come first.
//
// Label rules connect with [ \t] and never \s: "10件起批" on one line followed
// by a price ladder on the next is two statements about one product, and a
// connector that crossed the newline read "起批 2" out of it and threw away the
// real 10. A label whose number sits on its own line is still caught, by the
// bare-number rule at the bottom, at the confidence an unlabelled number earns.
const RULES: Rule[] = [
  // "起订量: 5" / "最小起订量 5 件" / "起批 50" — a label, then the number.
  { re: new RegExp(`(?:最小)?起[订批](?:量|数)?[ \\t]*[:：=]?[ \\t]*(${NUM})`, "g"), confidence: 0.95, group: 1, pick: "lowest" },
  // "2件起批" / "100 件起批" — the 1688 native form, number then unit then 起.
  { re: new RegExp(`(${NUM})[ \\t]*[${UNIT}]?[ \\t]*起[ \\t]*[批售]?`, "g"), confidence: 0.95, group: 1, pick: "lowest" },
  // "MOQ: 10" / "moq=100" / "最小购买量 20".
  { re: /(?:moq|最小购买量|最低购买量)[ \t]*[:：=]?[ \t]*(\d+)/gi, confidence: 0.9, group: 1, pick: "lowest" },
  // "Min. order: 20 Pieces" / "Minimum Order Quantity 30 units" — common
  // YiwuGo/1688 spellings; the period belongs to the abbreviation.
  { re: /\bmin(?:imum)?\.?[ \t]*(?:(?:order|purchase|quantity|qty)[ \t]*){1,2}[:：=]?[ \t]*(\d+)/gi, confidence: 0.9, group: 1, pick: "lowest" },
  // Price ladder "2-19件 ¥12 / 20-99件 ¥10 / ≥100件 ¥8": group 1 is each tier's
  // lower bound, and the lowest of them is the quantity one buyer may order.
  { re: new RegExp(`(\\d+)[ \\t]*[-~—–][ \\t]*\\d+[ \\t]*[${UNIT}]`, "g"), confidence: 0.9, group: 1, pick: "lowest" },
  // "50件以上" — an explicit floor in Chinese.
  { re: new RegExp(`(${NUM})[ \\t]*[${UNIT}][ \\t]*以上`, "g"), confidence: 0.85, group: 1, pick: "lowest" },
  // "≥50" / ">= 50" — a floor, but the same glyph appears in size specs, so it
  // only runs after the ladder has had its turn.
  { re: /(?:≥|>=|不小于)[ \t]*(\d+)/g, confidence: 0.6, group: 1, pick: "lowest" },
  // "10 Pieces" / "200pcs" — often a pack size rather than a minimum.
  { re: /(\d+)[ \t]*(?:pcs|pieces?|units?|sets?|pairs?|boxes?|cartons?)\b/gi, confidence: 0.45, group: 1, pick: "lowest" },
  // "100件" with no 起批 marker: weak evidence, which is why it stays reviewable.
  { re: new RegExp(`(\\d+)[ \\t]*[${UNIT}]`, "g"), confidence: 0.3, group: 1, pick: "first" },
  // A bare "100" on its own line — how some 1688 templates render MOQ.
  { re: /(?:^|\n)[ \t]*(\d{1,6})[ \t]*(?:$|\n)/g, confidence: 0.15, group: 1, pick: "first" },
];

/**
 * Zero-cost first pass over captured page text. Deterministic: same text in,
 * same verdict out, no network, no locale, no `Date`.
 *
 * Rules are ordered by confidence and the first one that yields a plausible
 * number wins; the rivals at a similar strength are kept as `alternatives`
 * rather than dropped, because a page that reads "起订量 5" and "起订量 50"
 * describes two SKUs and must not be presented as one firm answer.
 */
export function extractMoqLocal(text: string | null | undefined): MoqExtraction {
  const none: MoqExtraction = { moq: null, confidence: 0, raw: null, alternatives: [] };
  if (typeof text !== "string") return none;
  const body = text;
  if (!body.trim()) return none;

  const found: MoqExtraction[] = [];
  for (const rule of RULES) {
    const hit = applyRule(rule, body);
    if (hit) found.push(hit);
  }
  if (found.length === 0) return none;

  const best = found[0];
  // A price ladder's other floors are tiers, not rival answers, and the weak
  // rules list every quantity on the page — neither belongs in "also shows".
  const tierFloors = new Set(extractOrderStructure(body).tiers.map((t) => t.minQty));
  const rivals = new Set<number>();
  for (const hit of found) {
    if (hit.confidence < best.confidence - 0.1) continue;
    for (const v of [hit.moq, ...hit.alternatives]) {
      if (v !== null && v !== best.moq && !tierFloors.has(v)) rivals.add(v);
    }
  }
  const alternatives = [...rivals].sort((a, b) => a - b).slice(0, 3);
  const ambiguous = alternatives.length > 0;
  return {
    moq: best.moq,
    // A same-strength rival reading is disagreement, not confirmation. The cap
    // is a literal so it cannot arrive as 0.7000000000000001.
    confidence: ambiguous ? Math.min(best.confidence, AMBIGUOUS_CONFIDENCE) : best.confidence,
    raw: ambiguous && best.raw ? best.raw + " (also " + alternatives.join(", ") + ")" : best.raw,
    alternatives,
  };
}

function applyRule(rule: Rule, body: string): MoqExtraction | null {
  const re = new RegExp(rule.re.source, rule.re.flags.includes("g") ? rule.re.flags : rule.re.flags + "g");
  let best: { value: number; raw: string } | null = null;
  const others = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (!m[0]) { re.lastIndex++; continue; } // zero-width guard
    const value = toNumber(m[rule.group] ?? "");
    if (!plausible(value)) continue;
    if (!best) { best = { value, raw: clip(m[0]) }; others.add(value); continue; }
    others.add(value);
    if (rule.pick === "lowest" && value < best.value) best = { value, raw: clip(m[0]) };
  }
  if (!best) return null;
  return {
    moq: best.value,
    confidence: rule.confidence,
    raw: best.raw,
    // Two hits of the same strength from one rule ("起订量 5" and "起订量 50")
    // is a multi-SKU page, which no single number may claim to answer.
    alternatives: [...others].filter((v) => v !== best.value).sort((a, b) => a - b),
  };
}

function storedCandidate(product: MoqProductLike): MoqExtraction | null {
  const value = product.moq;
  if (typeof value !== "number" || !plausible(value)) return null;
  const conf = typeof product.moq_confidence === "number" ? clamp01(product.moq_confidence) : 0;
  return {
    moq: value,
    confidence: conf,
    raw: typeof product.moq_raw_text === "string" && product.moq_raw_text ? product.moq_raw_text : null,
    alternatives: [],
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * What the cart shows for a product, given the text currently in hand.
 *
 * Three rules, in order:
 *   1. a human-confirmed value ends the discussion (mirrors
 *      record_moq_candidate()'s `blocked_manual`);
 *   2. only a reading at or above ENFORCE_CONFIDENCE may move the floor — the
 *      weak parser rules fire on review text and spec tables, so a 0.3 hit
 *      informs the customer instead of blocking them;
 *   3. a confident reading never *lowers* a stated supplier minimum.
 *
 * Rule 3 is a deliberate business choice. A floor that is too high is visible
 * and recoverable (the customer sees "minimum 200", staff confirm it in the
 * review queue, and on 1688 the 200 is usually genuine). A floor that is too
 * low is invisible until the order is already paid for and unpurchasable.
 */
export function resolveMoq(
  product: MoqProductLike | null | undefined,
  capturedText?: string | null
): ResolvedMoq {
  const p: MoqProductLike = product ?? {};
  const onRow = storedCandidate(p);
  // `1` is this column's DEFAULT, so a bare 1 is the absence of an answer.
  const stated = onRow && onRow.moq !== null && onRow.moq > 1 ? onRow.moq : 0;

  if (p.moq_source === "manual" && stated > 0) {
    return {
      moq: stated,
      confidence: 1,
      raw: onRow?.raw ?? null,
      alternatives: [],
      source: "manual",
      displayMoq: stated,
      needsReview: false,
      enforce: true,
      statedMinimum: stated,
      suggestedMinimum: null,
    };
  }

  const stored = p.moq_source === "ai" || p.moq_source === "regex" ? onRow : null;
  const local = extractMoqLocal(capturedText);
  const readings = [stored, local.moq !== null ? local : null].filter(
    (c): c is MoqExtraction => c !== null && c.moq !== null
  );
  const eligible = readings.filter((r) => r.confidence >= ENFORCE_CONFIDENCE);
  const winner = eligible.sort((a, b) => b.confidence - a.confidence)[0] ?? null;
  const others = readings.filter((r) => r !== winner).flatMap((r) => [r.moq as number, ...r.alternatives]);

  if (winner && winner.moq !== null) {
    const value = Math.max(winner.moq, stated);
    return {
      moq: value,
      confidence: winner.confidence,
      raw: winner.raw,
      alternatives: [...new Set(others.filter((n) => n !== value))].sort((a, b) => a - b),
      source: winner === stored ? (p.moq_source as MoqSource) : "regex",
      displayMoq: value,
      needsReview: true, // nothing here was confirmed by a human
      enforce: true,
      statedMinimum: stated,
      suggestedMinimum: value === stated && winner.moq < stated ? winner.moq : null,
    };
  }

  // Nothing confident: fall back to whatever the row states, and keep the weak
  // reading as a suggestion instead of silently discarding it.
  const weak = readings.sort((a, b) => b.confidence - a.confidence)[0] ?? null;
  const value = stated || 1;
  return {
    moq: stated > 0 ? stated : null,
    confidence: stated > 0 ? 0 : weak?.confidence ?? 0,
    raw: stated > 0 ? (onRow?.raw ?? null) : weak?.raw ?? null,
    alternatives: [...new Set(readings.flatMap((r) => [r.moq as number, ...r.alternatives]).filter((n) => n !== value))]
      .sort((a, b) => a - b),
    source: "none",
    displayMoq: value,
    needsReview: true,
    // A published supplier field is trusted to block; a guess is not.
    enforce: stated > 0,
    statedMinimum: stated,
    suggestedMinimum: weak && weak.moq !== null && weak.moq !== value ? weak.moq : null,
  };
}

/* ─── Beyond the floor: cartons, price ladders and mix rules ──────
 * MOQ alone cannot validate a cart. On 1688 the indivisible unit is often a
 * carton (48件/箱), the price depends on which tier you cross, and 混批 decides
 * whether variants may be combined. These three readings turn the page into the
 * OrderRules that moq.ts's validateMOQ/calculateTierPrice already consume —
 * which is why this section, unlike the parser above, imports from it.
 */

import type { MoqLocale, OrderRules, PriceTier } from "@/lib/moq";
import { createDefaultRules } from "@/lib/moq";
import type { Product } from "@/types";

const PRICE = "(\\d+(?:\\.\\d+)?)";

// "2-19件 ¥12" / "≥100件 ¥8" — each row is one tier boundary.
const LADDER_RANGE = new RegExp(
  "(\\d+)\\s*[-~—–]\\s*(\\d+)\\s*(?:件|个|只|条|包|箱|台|套)?\\s*[¥￥]\\s*" + PRICE,
  "g"
);
const LADDER_FLOOR = new RegExp(
  "(?:≥|>=|>)\\s*(\\d+)\\s*(?:件|个|只|条|包|箱|台|套)?\\s*[¥￥]\\s*" + PRICE,
  "g"
);
// "每箱48件" / "48件/箱" / "24 pcs per carton".
const PACK_RE = new RegExp(
  "(?:每箱|一箱)\\s*(\\d+)\\s*(?:件|个|只|条|支)|" +
    "(\\d+)\\s*(?:件|个|只|条|支|pcs|pieces?)\\s*/\\s*(?:箱|box|carton)|" +
    "(\\d+)\\s*(?:pcs|pieces?)\\s+per\\s+(?:box|carton)",
  "i"
);
// "支持混批" allows variant mixing; "10件起混批" adds a total to reach.
const MIXED_RE = /混批/i;
const MIXED_TOTAL_RE = new RegExp(
  "(\\d+)\\s*(?:件|个|只|套)\\s*(?:起)?混批|混批[^\\n]{0,24}?(\\d+)\\s*(?:件|个|只|套)",
  "i"
);

function positiveInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw.replace(/,/g, ""), 10);
  return Number.isFinite(n) && n >= MIN_MOQ && n <= MAX_MOQ ? n : null;
}

/**
 * Price tiers, carton size and mixing rules. Deliberately separate from
 * extractMoqLocal: a ladder prices the order, it does not only floor it.
 */
export function extractOrderStructure(text: string | null | undefined): {
  tiers: PriceTier[];
  packSize: number | null;
  mixed: boolean;
  mixedMinimum: number | null;
} {
  const none = {
    tiers: [] as PriceTier[],
    packSize: null,
    mixed: false,
    mixedMinimum: null,
  };
  if (typeof text !== "string" || !text.trim()) return none;

  const tiers: PriceTier[] = [];
  const seen = new Set<number>();
  for (const re of [LADDER_RANGE, LADDER_FLOOR]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (!m[0]) { re.lastIndex++; continue; }
      const minQty = positiveInt(m[1]);
      const price = Number.parseFloat(m[m.length - 1]);
      if (minQty === null || !Number.isFinite(price) || price <= 0) continue;
      if (seen.has(minQty)) continue;
      const upper = positiveInt(m[2]);
      seen.add(minQty);
      tiers.push({
        minQty,
        maxQty: re === LADDER_RANGE && upper !== null && upper >= minQty ? upper : null,
        priceCny: price,
      });
    }
  }
  tiers.sort((a, b) => a.minQty - b.minQty);

  const pack = PACK_RE.exec(text);
  const packRaw = pack ? pack[1] ?? pack[2] ?? pack[3] : null;
  const packSize = positiveInt(packRaw ?? undefined);
  const mixed = MIXED_RE.test(text);
  const total = mixed ? MIXED_TOTAL_RE.exec(text) : null;

  return {
    tiers,
    packSize: packSize !== null && packSize > 1 ? packSize : null,
    mixed,
    mixedMinimum: total ? positiveInt(total[1] ?? total[2] ?? undefined) : null,
  };
}

/**
 * The cart-ready rule set for a product: the MOQ floor, the ladder's prices,
 * whole cartons and mixing, all in the shape moq.ts validates against.
 */
export function moqOrderRules(
  product: Product & Partial<MoqProductLike>,
  capturedText?: string | null
): { rules: OrderRules; resolution: ResolvedMoq; structure: ReturnType<typeof extractOrderStructure> } {
  const structure = extractOrderStructure(capturedText);
  const resolution = resolveMoq(product, capturedText);
  const rules = createDefaultRules(product);
  const floor = Math.max(1, resolution.displayMoq);
  rules.productMoq = floor;

  if (structure.tiers.length > 0) {
    const ladder = structure.tiers.map((t) => ({ ...t }));
    if (ladder[0].minQty > floor) {
      ladder.unshift({
        minQty: floor,
        maxQty: ladder[0].minQty - 1,
        priceCny: product.price_cny_min > 0 ? product.price_cny_min : ladder[0].priceCny,
        label: "Standard",
      });
    } else {
      ladder[0].minQty = floor;
    }
    for (let i = 0; i < ladder.length - 1; i++) {
      if (ladder[i].maxQty === null || ladder[i].maxQty! > ladder[i + 1].minQty - 1) {
        ladder[i].maxQty = ladder[i + 1].minQty - 1;
      }
    }
    ladder[ladder.length - 1].maxQty = null;
    rules.tiers = ladder;
  } else {
    for (const tier of rules.tiers) {
      if (tier.minQty < floor) tier.minQty = floor;
    }
  }

  if (structure.packSize) {
    rules.packs = [{ piecesPerPack: structure.packSize, packLabel: "carton" }];
  }
  if (structure.mixed) {
    rules.mixedVariant = {
      totalMinQty: structure.mixedMinimum ?? floor,
      allowMix: true,
    };
  }
  // An unconfirmed floor must not silently cap what a customer can order.
  if (!resolution.enforce && rules.maxQty) rules.maxQty = undefined;

  return { rules, resolution, structure };
}

/**
 * One honest sentence for the MOQ chip. Used by the product sheet, the cart row
 * and the snackbar so the same uncertainty is worded the same way everywhere.
 */
export function describeMoq(resolution: ResolvedMoq, locale: MoqLocale = "en"): string {
  const so = locale === "so";
  const pieces = so ? "xabbo" : "pieces";
  const n = resolution.displayMoq;

  if (resolution.source === "manual") {
    return so ? `Dalabka ugu yar: ${n} ${pieces}` : `Minimum order: ${n} ${pieces}`;
  }
  if (resolution.confidence >= ENFORCE_CONFIDENCE) {
    const base = so ? `Dalabka ugu yar: ${n} ${pieces}` : `Minimum order: ${n} ${pieces}`;
    return resolution.alternatives.length > 0
      ? base + (so
          ? ` (bogga: ${resolution.alternatives.slice(0, 3).join(", ")} oo kale)`
          : ` (the page also shows ${resolution.alternatives.slice(0, 3).join(", ")})`)
      : base;
  }
  if (resolution.suggestedMinimum !== null) {
    return so
      ? `Waa la moodaa in dalabka ugu yar yahay ${resolution.suggestedMinimum} ${pieces}`
      : `Minimum order appears to be ${resolution.suggestedMinimum} ${pieces}`;
  }
  return so
    ? `Dalabka ugu yar lama xaqiijin — ${n} ${pieces} ayaa la ogol yahay`
    : `Minimum order unconfirmed — ${n} ${pieces} allowed`;
}

/**
 * Trim a page to MOQ-relevant lines before it is sent to the paid model.
 * Cheaper, and the smaller the quoted passage the less room a listing has to
 * smuggle instructions into a server-side prompt.
 */
export function selectMoqEvidence(text: string | null | undefined, budgetChars = 4000): string {
  if (typeof text !== "string" || !text.trim()) return "";
  const keyword = /起批|起订|最小|moq|min\.?\s*order|minimum\s*order|每箱|混批|[≥>]\s*\d|件以上|[¥￥]/i;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.length < 200 && keyword.test(l));
  const unique = [...new Set(lines)];
  const joined = unique.join("\n");
  if (joined) return joined.slice(0, budgetChars);
  return text.replace(/\s+/g, " ").trim().slice(0, budgetChars);
}

export interface MoqCapture {
  product_id: string;
  evidence: string;
  /** What the offline pass already decided, for the server's logs only. */
  local: { moq: number | null; confidence: number; raw: string | null };
}

/** Body for apps/web/supabase/functions/product-enrich. */
export function buildMoqCapture(
  productId: string,
  capturedText: string | null | undefined
): MoqCapture {
  const local = extractMoqLocal(capturedText);
  return {
    product_id: productId,
    evidence: selectMoqEvidence(capturedText),
    local: { moq: local.moq, confidence: local.confidence, raw: local.raw },
  };
}
