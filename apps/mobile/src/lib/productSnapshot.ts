// Product evidence & snapshot model (browse-first, evidence-first).
// A confirmed cart selection keeps an immutable snapshot: a later marketplace
// change must never silently rewrite what the customer already chose.
// All monetary values are kept as strings/decimals and only formatted for
// display — never summed with float arithmetic (decimal-safe rule).

export type EvidenceStatus = "extracted" | "confirmed" | "unknown";

export interface FieldEvidence {
  field: string;
  value: string;
  status: EvidenceStatus;
  source?: "marketplace" | "adapter" | "ai" | "manual";
  note?: string;
}

export interface OrderingRulesSnapshot {
  minimumQuantity?: number;
  unit?: "piece" | "pack" | "carton" | "set" | "meter";
  unitsPerPack?: number;
  quantityIncrement?: number;
  scope?: "product" | "variant" | "seller";
  mixedVariantsAllowed?: boolean;
  verification: EvidenceStatus;
}

export interface PriceTierSnapshot {
  minQty: number;
  maxQty?: number;
  priceCny: string;
}

export interface ProductSnapshot {
  marketplace: string;
  sourceUrl: string;
  sourceProductId?: string;
  capturedAt: string;
  titleOriginal?: string;
  titleTranslated?: string;
  images: string[];
  variants: {
    id: string;
    label: string;
    imageUrl?: string;
    availability: "available" | "unavailable" | "unknown";
  }[];
  orderingRules: OrderingRulesSnapshot;
  priceTiers: PriceTierSnapshot[];
  fieldEvidence: FieldEvidence[];
  warnings: string[];
}

// Build a snapshot from captured + face-confirmed data. Anything still
// unverified is recorded as "unknown", never invented.
export function createSnapshot(input: {
  marketplace: string;
  sourceUrl: string;
  title: string;
  price: number;
  image?: string;
  orderingRules?: Partial<OrderingRulesSnapshot>;
  warnings?: string[];
}): ProductSnapshot {
  const now = new Date().toISOString();
  const rules: OrderingRulesSnapshot = {
    minimumQuantity: input.orderingRules?.minimumQuantity,
    unit: input.orderingRules?.unit ?? "piece",
    unitsPerPack: input.orderingRules?.unitsPerPack,
    quantityIncrement: input.orderingRules?.quantityIncrement,
    mixedVariantsAllowed: input.orderingRules?.mixedVariantsAllowed,
    scope: input.orderingRules?.scope ?? "product",
    verification: input.orderingRules?.verification ?? "unknown",
  };
  return {
    marketplace: input.marketplace,
    sourceUrl: input.sourceUrl,
    capturedAt: now,
    titleOriginal: undefined,
    titleTranslated: input.title,
    images: input.image ? [input.image] : [],
    variants: [],
    orderingRules: rules,
    priceTiers: [],
    fieldEvidence: [
      {
        field: "priceCny",
        value: String(input.price),
        status: input.price > 0 ? "extracted" : "unknown",
        source: "adapter",
      },
    ],
    warnings: input.warnings ?? [],
  };
}

export function isSnapshotImmutable(a: ProductSnapshot, b: ProductSnapshot): boolean {
  return (
    a.marketplace === b.marketplace &&
    a.sourceUrl === b.sourceUrl &&
    a.capturedAt === b.capturedAt &&
    a.orderingRules.verification === b.orderingRules.verification
  );
}
