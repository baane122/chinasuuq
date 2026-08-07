// ============================================================
// @chinasuuq/shared/utils
// Cross-platform utility functions (pure — no DOM/RN deps).
// ============================================================

import type { Locale } from "./types";
import { WHATSAPP_NUMBER } from "./constants";

// ── Currency Formatting ─────────────────────────────────────

/**
 * Format a number as USD currency string.
 * @example formatUSD(12.5) → "$12.50"
 */
export function formatUSD(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a number as CNY currency string.
 * @example formatCNY(88.5) → "¥88.50"
 */
export function formatCNY(amount: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(amount);
}

// ── Date Formatting ─────────────────────────────────────────

/**
 * Format a date string or Date object as a short date.
 * @example formatDate("2025-06-15") → "Jun 15, 2025"
 */
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

/**
 * Format a date as a date-time string.
 * @example formatDateTime("2025-06-15T10:30:00Z") → "Jun 15, 2025, 10:30 AM"
 */
export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

// ── Order Reference ─────────────────────────────────────────

/**
 * Generate a unique order reference like `CS-2025-00341`.
 * Format: CS-{YEAR}-{5-digit-random}
 */
export function generateOrderRef(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 99999)
    .toString()
    .padStart(5, "0");
  return `CS-${year}-${random}`;
}

// ── Text Utilities ──────────────────────────────────────────

/**
 * Convert a string to a URL-friendly slug.
 * @example slugify("Home & Kitchen") → "home-kitchen"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Truncate a string to `len` characters, appending "…" if truncated.
 * @example truncate("Hello World", 5) → "Hello…"
 */
export function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len) + "…";
}

// ── Classname Helpers ───────────────────────────────────────

/**
 * Merge class names, filtering out falsy values.
 * For web apps using Tailwind, prefer the `cn()` from `clsx` + `tailwind-merge`.
 * This lightweight version works on React Native too.
 *
 * @example cn("btn", isActive && "btn--active", undefined) → "btn btn--active"
 */
export function cn(
  ...classes: (string | boolean | undefined | null | 0)[]
): string {
  return classes.filter(Boolean).join(" ");
}

// ── WhatsApp Links ──────────────────────────────────────────

/**
 * Build a WhatsApp order link with a pre-filled message.
 * @param product - Optional product name to pre-fill in the message.
 * @returns Full `wa.me` URL with encoded message.
 */
export function whatsappOrderLink(product?: string): string {
  const msg = product
    ? `Hello ChinaSuuq, I want to order: ${product}\n\nQuantity:\nColor/size:\nDestination city:\nPreferred shipping: Air/Sea`
    : "Hello ChinaSuuq, I want to order products from China.\n\nProduct link:\nQuantity:\nColor/size:\nDestination city:\nPreferred shipping: Air/Sea";
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
}

// ── Number Helpers ──────────────────────────────────────────

/**
 * Clamp a number between `min` and `max`.
 * @example clamp(15, 0, 10) → 10
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Round a number to `decimals` decimal places.
 * @example roundTo(3.14159, 2) → 3.14
 */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// ── Async Helpers ───────────────────────────────────────────

/**
 * Sleep for `ms` milliseconds. Useful for retry delays.
 * @example await sleep(1000)
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async function with exponential backoff.
 * @param fn - The async function to retry.
 * @param maxAttempts - Maximum number of attempts (default: 3).
 * @param baseDelay - Initial delay in ms (default: 1000).
 * @returns The result of `fn` on success, or throws after all attempts.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await sleep(baseDelay * 2 ** (attempt - 1));
      }
    }
  }
  throw lastError;
}

// ── Localization Helper ─────────────────────────────────────

/**
 * Get the localized value for a given locale.
 * @param obj - An object with `en` and `so` keys.
 * @param locale - The current locale.
 * @returns The localized string.
 *
 * @example
 * ```ts
 * const label = getLocalized({ en: "Electronics", so: "Elektiroonigga" }, "so");
 * // → "Elektiroonigga"
 * ```
 */
export function getLocalized(
  obj: { en: string; so: string },
  locale: Locale,
): string {
  return obj[locale] ?? obj.en;
}
