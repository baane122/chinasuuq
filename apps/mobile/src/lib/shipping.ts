// Smart shipping cost calculator for ChinaSuuq
// Auto-calculates shipping based on weight, dimensions, and method

export interface ShippingEstimate {
  method: "air" | "sea";
  costUSD: number;
  costCNY: number;
  days: string;
  label: string;
}

export interface ProductShipping {
  weight_kg: number;
  dimensions_cm?: { l: number; w: number; h: number };
  domestic_shipping_cny: number;
  marketplace: string;
}

// Exchange rates (should be updated from API in production)
const CNY_TO_USD = 0.14; // ~7.14 CNY per USD
const USD_TO_SOS = 570; // ~570 SOS per USD

// Air freight rates (per kg) - China to Somalia
const AIR_RATE_PER_KG = 8.50; // USD per kg for air freight
const AIR_MIN_CHARGE = 15; // minimum charge for air

// Sea freight rates (per kg) - China to Somalia
const SEA_RATE_PER_KG = 2.20; // USD per kg for sea freight
const SEA_MIN_CHARGE = 25; // minimum charge for sea
const SEA_MIN_WEIGHT = 10; // minimum chargeable weight

/**
 * Calculate shipping cost for a product (China to Somalia only)
 * Note: Domestic shipping within China is handled by the seller/marketplace
 * Customer pays international shipping when goods arrive in Somalia
 */
export function calculateShipping(
  product: ProductShipping,
  quantity: number,
  method: "air" | "sea"
): ShippingEstimate {
  // Calculate total weight
  const totalWeight = Math.max(product.weight_kg * quantity, 0.5); // minimum 0.5kg

  // International shipping only (China → Somalia)
  let costUSD: number;
  let days: string;
  let label: string;

  if (method === "air") {
    // Air freight calculation
    const freightCost = Math.max(totalWeight * AIR_RATE_PER_KG, AIR_MIN_CHARGE);
    costUSD = Math.round(freightCost * 100) / 100;
    days = "7-14";
    label = "Air Freight";
  } else {
    // Sea freight calculation
    const chargeableWeight = Math.max(totalWeight, SEA_MIN_WEIGHT);
    const freightCost = Math.max(chargeableWeight * SEA_RATE_PER_KG, SEA_MIN_CHARGE);
    costUSD = Math.round(freightCost * 100) / 100;
    days = "25-35";
    label = "Sea Freight";
  }

  const costCNY = Math.round(costUSD / CNY_TO_USD);

  return {
    method,
    costUSD,
    costCNY,
    days,
    label,
  };
}

/**
 * Get shipping estimates for both methods
 */
export function getShippingEstimates(
  product: ProductShipping,
  quantity: number
): ShippingEstimate[] {
  return [
    calculateShipping(product, quantity, "air"),
    calculateShipping(product, quantity, "sea"),
  ];
}

/**
 * Parse weight from product attributes or description
 * Common patterns: "500g", "1.5kg", "重量: 2kg", "weight: 500g"
 */
export function parseWeight(attributes: Record<string, string>, description?: string): number {
  // Try attributes first
  const weightFields = ["weight", "重量", "毛重", "净重", "gross_weight", "net_weight"];
  for (const field of weightFields) {
    const value = attributes[field];
    if (value) {
      const parsed = parseWeightString(value);
      if (parsed > 0) return parsed;
    }
  }

  // Try description
  if (description) {
    const weightMatch = description.match(/(\d+\.?\d*)\s*(kg|g|千克|克|公斤)/i);
    if (weightMatch) {
      const num = parseFloat(weightMatch[1]);
      const unit = weightMatch[2].toLowerCase();
      if (unit === "kg" || unit === "千克" || unit === "公斤") return num;
      if (unit === "g" || unit === "克") return num / 1000;
    }
  }

  // Default estimate based on marketplace
  return 0.5; // default 500g
}

function parseWeightString(value: string): number {
  const match = value.match(/(\d+\.?\d*)\s*(kg|g|千克|克|公斤)?/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = (match[2] || "g").toLowerCase();
  if (unit === "kg" || unit === "千克" || unit === "公斤") return num;
  return num / 1000;
}

/**
 * Parse MOQ from product attributes, title, or description
 * Smart parsing for Chinese e-commerce patterns
 *
 * Examples:
 *   - "500个" → 500
 *   - "MOQ: 10" → 10
 *   - "最小起订量: 300" → 300
 *   - "10件起批" → 10
 *   - "2件起售" → 2
 *   - "500pcs" → 500
 */
export function parseMOQ(
  moq: number,
  attributes: Record<string, string>,
  title?: string,
  description?: string
): number {
  // 1. Use explicit MOQ if provided and reasonable
  if (moq > 0 && moq < 100000) return moq;

  // 2. Try attributes (most reliable source)
  const moqFields = [
    "moq", "minimum_order", "最小起订量", "起订量", "min_order",
    "minOrderQty", "minOrder", "起批", "批发", "wholesale_moq"
  ];
  for (const field of moqFields) {
    const value = attributes[field];
    if (value) {
      const num = parseInt(value.replace(/[^0-9]/g, ""));
      if (num > 0 && num < 100000) return num;
    }
  }

  // 3. Try title - Chinese patterns
  if (title) {
    // "500个" "10件" "200条" "30台" "5套"
    const moqMatch = title.match(/(\d+)\s*[个件只条包箱台套批]/);
    if (moqMatch) {
      const num = parseInt(moqMatch[1]);
      if (num > 0 && num < 100000) return num;
    }

    // "起批10" "起订50"
    const startBatch = title.match(/起[批订]\s*(\d+)/);
    if (startBatch) {
      const num = parseInt(startBatch[1]);
      if (num > 0 && num < 100000) return num;
    }

    // "MOQ: 100" "MOQ100" "moq=50"
    const moqText = title.match(/moq\s*[:=]?\s*(\d+)/i);
    if (moqText) {
      const num = parseInt(moqText[1]);
      if (num > 0 && num < 100000) return num;
    }

    // "500pcs" "100piece" "200units"
    const pcsMatch = title.match(/(\d+)\s*(pcs?|pieces?|units?|items?)/i);
    if (pcsMatch) {
      const num = parseInt(pcsMatch[1]);
      if (num > 0 && num < 100000) return num;
    }
  }

  // 4. Try description
  if (description) {
    // Same patterns but in description
    const descMoq = description.match(/moq\s*[:=]?\s*(\d+)/i);
    if (descMoq) {
      const num = parseInt(descMoq[1]);
      if (num > 0 && num < 100000) return num;
    }

    const descStart = description.match(/起[批订]\s*(\d+)/);
    if (descStart) {
      const num = parseInt(descStart[1]);
      if (num > 0 && num < 100000) return num;
    }
  }

  // 5. Smart default based on product type/category
  // High-value items = lower MOQ, cheap items = higher MOQ
  return 1; // safest default: 1 piece
}

/**
 * Get smart MOQ display text
 */
export function getMOQText(moq: number, locale: "en" | "so" = "en"): string {
  if (moq <= 1) return locale === "en" ? "1 piece minimum" : "1 piece ugu yar";
  if (moq < 10) return locale === "en" ? `${moq} pieces minimum` : `${moq} pieces ugu yar`;
  if (moq < 100) return locale === "en" ? `${moq} pcs min` : `${moq} pcs ugu yar`;
  return locale === "en" ? `MOQ: ${moq} pcs` : `MOQ: ${moq} pcs`;
}

/**
 * Get suggested quantities for quick selection
 */
export function getSuggestedQuantities(moq: number): number[] {
  if (moq <= 1) return [1, 2, 5, 10];
  if (moq <= 5) return [moq, moq * 2, moq * 5, moq * 10];
  if (moq <= 20) return [moq, moq * 2, moq * 5];
  if (moq <= 100) return [moq, moq * 2, moq * 3];
  if (moq <= 500) return [moq, moq + 100, moq + 200];
  return [moq, moq + 500, moq + 1000];
}

/**
 * Format price with currency
 */
export function formatPrice(amount: number, currency: "USD" | "CNY" | "SOS" = "USD"): string {
  switch (currency) {
    case "USD":
      return `$${amount.toFixed(2)}`;
    case "CNY":
      return `¥${amount.toFixed(2)}`;
    case "SOS":
      return `${amount.toLocaleString()} SOS`;
    default:
      return `$${amount.toFixed(2)}`;
  }
}

/**
 * Convert between currencies
 */
export function convertCurrency(
  amount: number,
  from: "USD" | "CNY" | "SOS",
  to: "USD" | "CNY" | "SOS"
): number {
  // Convert to USD first
  let usd: number;
  switch (from) {
    case "USD":
      usd = amount;
      break;
    case "CNY":
      usd = amount * CNY_TO_USD;
      break;
    case "SOS":
      usd = amount / USD_TO_SOS;
      break;
  }

  // Convert from USD to target
  switch (to) {
    case "USD":
      return usd;
    case "CNY":
      return usd / CNY_TO_USD;
    case "SOS":
      return usd * USD_TO_SOS;
    default:
      return usd;
  }
}
