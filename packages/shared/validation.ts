// ============================================================
// @chinasuuq/shared/validation
// Zod schemas for shared types — run-time validation.
// ============================================================

import { z } from "zod";

// ── Base Primitives ─────────────────────────────────────────

/** UUID v4 string. */
export const uuidSchema = z.string().uuid();

/** ISO-8601 datetime string. */
export const isoDateSchema = z.string().datetime();

/** Non-empty trimmed string. */
export const nonEmptyString = z.string().trim().min(1, "Required");

/** Positive integer. */
export const positiveInt = z.number().int().positive();

/** Non-negative number. */
export const nonNegativeNumber = z.number().min(0);

// ── Enums ───────────────────────────────────────────────────

export const marketplaceSchema = z.enum(["1688", "taobao", "yiwugo", "chinasuuq"]);
export const localeSchema = z.enum(["en", "so"]);
export const shippingMethodSchema = z.enum(["air", "sea", "land"]);
export const paymentStatusSchema = z.enum(["pending", "confirmed", "failed", "refunded"]);
export const stockStatusSchema = z.enum(["in_stock", "low_stock", "out_of_stock"]);
export const customerTypeSchema = z.enum(["individual", "business"]);

export const orderStatusSchema = z.enum([
  "pending", "confirmed", "purchasing", "purchased",
  "in_transit_china", "warehouse", "inspection", "consolidated",
  "shipped", "in_transit", "arrived_somalia", "customs",
  "ready_for_pickup", "out_for_delivery", "delivered", "cancelled",
]);

export const paymentMethodSchema = z.enum([
  "zaad", "edahab", "premier", "evc_plus",
  "sahal", "bank_transfer", "manual",
]);

export const staffRoleSchema = z.enum([
  "super_admin", "operations_director", "finance_manager",
  "sourcing_manager", "sourcing_agent", "purchasing_officer",
  "warehouse_manager", "warehouse_operator", "quality_inspector",
  "logistics_manager", "support_manager", "support_agent",
  "content_manager",
]);

export const permissionSchema = z.enum([
  "view", "create", "edit", "approve", "verify_payment",
  "refund", "pay_supplier", "manage_exchange_rate", "export",
  "manage_roles", "view_finance", "view_sensitive_customer_data",
  "archive",
]);

// ── Object Schemas ──────────────────────────────────────────

/** ProductVariant validation. */
export const productVariantSchema = z.object({
  id: uuidSchema,
  name: nonEmptyString,
  options: z.array(
    z.object({
      label: nonEmptyString,
      value: nonEmptyString,
      image: z.string().url().optional(),
    }),
  ),
  price_cny: nonNegativeNumber.optional(),
  stock: nonNegativeNumber,
});

/** Product validation. */
export const productSchema = z.object({
  id: uuidSchema,
  marketplace: marketplaceSchema,
  source_product_id: nonEmptyString,
  source_url: z.string().url(),
  title_original: nonEmptyString,
  title_english: nonEmptyString,
  title_somali: nonEmptyString,
  description_original: z.string().optional(),
  description_english: z.string().optional(),
  description_somali: z.string().optional(),
  images: z.array(z.string().url()).min(1, "At least one image required"),
  video: z.string().url().optional(),
  category: nonEmptyString,
  attributes: z.record(z.string(), z.string()).default({}),
  variants: z.array(productVariantSchema).default([]),
  moq: positiveInt.default(1),
  price_cny_min: nonNegativeNumber,
  price_cny_max: nonNegativeNumber,
  price_usd_estimated: nonNegativeNumber,
  domestic_shipping_cny: nonNegativeNumber,
  stock_status: stockStatusSchema,
  supplier_rating: z.number().min(0).max(5).default(0),
  sales_count: nonNegativeNumber.default(0),
  last_synced_at: isoDateSchema,
  created_at: isoDateSchema,
});

/** CartItem validation. */
export const cartItemSchema = z.object({
  id: uuidSchema,
  product_id: uuidSchema,
  product: productSchema,
  variant: productVariantSchema.optional(),
  selected_options: z.record(z.string(), z.string()).default({}),
  quantity: positiveInt,
  price_cny_snapshot: nonNegativeNumber,
  price_usd_estimated: nonNegativeNumber,
  exchange_rate: positiveInt.default(7),
  added_at: isoDateSchema,
});

/** OrderItem validation. */
export const orderItemSchema = z.object({
  id: uuidSchema,
  product_name: nonEmptyString,
  quantity: positiveInt,
  price_usd: nonNegativeNumber,
});

/** TrackingEvent validation. */
export const trackingEventSchema = z.object({
  id: uuidSchema.optional(),
  status: nonEmptyString,
  location: nonEmptyString,
  message: nonEmptyString,
  timestamp: isoDateSchema,
  evidence_url: z.string().url().optional(),
  done: z.boolean().optional(),
});

/** Order validation. */
export const orderSchema = z.object({
  id: uuidSchema,
  reference: nonEmptyString,
  status: orderStatusSchema,
  items: z.array(orderItemSchema),
  total_usd: nonNegativeNumber,
  currency: nonEmptyString.default("USD"),
  shipping_method: shippingMethodSchema,
  payment_status: paymentStatusSchema,
  tracking_events: z.array(trackingEventSchema),
  created_at: isoDateSchema,
  updated_at: isoDateSchema,
});

/** Customer validation. */
export const customerSchema = z.object({
  id: uuidSchema,
  full_name: nonEmptyString,
  phone: nonEmptyString,
  email: z.string().email().optional(),
  city: nonEmptyString,
  language: localeSchema,
  customer_type: customerTypeSchema,
  business_name: z.string().optional(),
  created_at: isoDateSchema.optional(),
});

/** Payment validation. */
export const paymentSchema = z.object({
  id: uuidSchema,
  order_id: uuidSchema,
  amount: nonNegativeNumber,
  currency: nonEmptyString,
  method: paymentMethodSchema,
  status: paymentStatusSchema,
  reference: nonEmptyString,
  verified_by: uuidSchema.optional(),
  verified_at: isoDateSchema.optional(),
  created_at: isoDateSchema,
});

// ── Form Validation Schemas ─────────────────────────────────

/** Login form. */
export const loginFormSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

/** Sign-up form. */
export const signupFormSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[0-9]/, "Must contain a number"),
  full_name: z.string().trim().min(2, "Name must be at least 2 characters"),
  phone: z
    .string()
    .trim()
    .min(8, "Invalid phone number")
    .max(20, "Invalid phone number"),
  city: nonEmptyString,
  language: localeSchema.default("en"),
});

/** Contact / order form for WhatsApp checkout. */
export const whatsappOrderFormSchema = z.object({
  full_name: z.string().trim().min(2),
  phone: z.string().trim().min(8),
  city: nonEmptyString,
  product_name: z.string().trim().optional(),
  quantity: positiveInt.default(1),
  color_size: z.string().trim().optional(),
  shipping: shippingMethodSchema.default("sea"),
  notes: z.string().trim().optional(),
});

/** Sourcing request form. */
export const sourcingRequestFormSchema = z.object({
  marketplace: marketplaceSchema,
  product_url: z.string().url().optional(),
  product_description: z.string().trim().min(10, "Please describe the product in more detail"),
  quantity: positiveInt,
  destination_city: nonEmptyString,
  target_price_cny: nonNegativeNumber.optional(),
  notes: z.string().trim().optional(),
});

// ── API Response Schemas ────────────────────────────────────

/** Generic API success response. */
export function apiResponseSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    data: dataSchema.nullable(),
    error: z.string().nullable(),
    status: z.number(),
  });
}

/** Paginated response wrapper. */
export function paginatedResponseSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    total: nonNegativeNumber,
    page: positiveInt,
    page_size: positiveInt,
    has_more: z.boolean(),
  });
}

// ── Exports ─────────────────────────────────────────────────

export type LoginFormData = z.infer<typeof loginFormSchema>;
export type SignupFormData = z.infer<typeof signupFormSchema>;
export type WhatsAppOrderFormData = z.infer<typeof whatsappOrderFormSchema>;
export type SourcingRequestFormData = z.infer<typeof sourcingRequestFormSchema>;
