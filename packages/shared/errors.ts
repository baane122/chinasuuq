// ============================================================
// @chinasuuq/shared/errors
// Custom error classes, error codes, and formatting utilities.
// ============================================================

// ── Error Codes ─────────────────────────────────────────────

/** Standardized error codes used across the application. */
export enum ErrorCode {
  // Auth (1xxx)
  AUTH_UNAUTHORIZED = "AUTH_1001",
  AUTH_FORBIDDEN = "AUTH_1002",
  AUTH_SESSION_EXPIRED = "AUTH_1003",
  AUTH_INVALID_CREDENTIALS = "AUTH_1004",
  AUTH_RATE_LIMITED = "AUTH_1005",

  // Validation (2xxx)
  VALIDATION_FAILED = "VAL_2001",
  VALIDATION_MISSING_FIELD = "VAL_2002",
  VALIDATION_INVALID_FORMAT = "VAL_2003",

  // Database (3xxx)
  DB_RECORD_NOT_FOUND = "DB_3001",
  DB_DUPLICATE_KEY = "DB_3002",
  DB_FOREIGN_KEY_VIOLATION = "DB_3003",
  DB_CONSTRAINT_VIOLATION = "DB_3004",
  DB_TIMEOUT = "DB_3005",

  // Network (4xxx)
  NETWORK_REQUEST_FAILED = "NET_4001",
  NETWORK_TIMEOUT = "NET_4002",
  NETWORK_OFFLINE = "NET_4003",

  // Business Logic (5xxx)
  BIZ_INSUFFICIENT_STOCK = "BIZ_5001",
  BIZ_ORDER_CANCELLED = "BIZ_5002",
  BIZ_PAYMENT_FAILED = "BIZ_5003",
  BIZ_QUOTE_EXPIRED = "BIZ_5004",
  BIZ_SHIPPING_UNAVAILABLE = "BIZ_5005",

  // Server (6xxx)
  SERVER_INTERNAL = "SRV_6001",
  SERVER_SERVICE_UNAVAILABLE = "SRV_6002",
}

// ── Custom Error Classes ────────────────────────────────────

/**
 * Base application error. All custom errors extend this.
 */
export class AppError extends Error {
  /** Machine-readable error code. */
  readonly code: ErrorCode;
  /** HTTP status code (if applicable). */
  readonly status: number;
  /** Additional metadata for debugging. */
  readonly meta?: Record<string, unknown>;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.SERVER_INTERNAL,
    status: number = 500,
    meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.meta = meta;
    // Fix prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** Serialize to a plain object (safe for JSON response). */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      status: this.status,
      meta: this.meta,
    };
  }
}

/** Authentication / authorization error. */
export class AuthError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.AUTH_UNAUTHORIZED,
    meta?: Record<string, unknown>,
  ) {
    super(message, code, 401, meta);
    this.name = "AuthError";
  }
}

/** Validation error with field-level details. */
export class ValidationError extends AppError {
  readonly fields: Record<string, string[]>;

  constructor(
    message: string,
    fields: Record<string, string[]> = {},
    meta?: Record<string, unknown>,
  ) {
    super(message, ErrorCode.VALIDATION_FAILED, 400, meta);
    this.name = "ValidationError";
    this.fields = fields;
  }

  override toJSON() {
    return { ...super.toJSON(), fields: this.fields };
  }
}

/** Database operation error. */
export class DatabaseError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.DB_RECORD_NOT_FOUND,
    meta?: Record<string, unknown>,
  ) {
    super(message, code, 500, meta);
    this.name = "DatabaseError";
  }
}

/** Network / connectivity error. */
export class NetworkError extends AppError {
  constructor(
    message: string = "Network request failed. Please check your connection.",
    code: ErrorCode = ErrorCode.NETWORK_REQUEST_FAILED,
    meta?: Record<string, unknown>,
  ) {
    super(message, code, 0, meta);
    this.name = "NetworkError";
  }
}

/** Business logic error. */
export class BusinessError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.SERVER_INTERNAL,
    meta?: Record<string, unknown>,
  ) {
    super(message, code, 422, meta);
    this.name = "BusinessError";
  }
}

// ── Error Formatting ────────────────────────────────────────

/** Formatted error for display in UI. */
export interface FormattedError {
  title: string;
  message: string;
  code: ErrorCode;
  fieldErrors?: Record<string, string>;
}

/**
 * Format an error into a user-friendly shape.
 * Handles AppError subclasses, generic Error, and unknown values.
 */
export function formatError(error: unknown): FormattedError {
  // Already an AppError
  if (error instanceof ValidationError) {
    const fieldErrors: Record<string, string> = {};
    for (const [field, msgs] of Object.entries(error.fields)) {
      fieldErrors[field] = msgs[0] ?? "Invalid";
    }
    return {
      title: "Validation Error",
      message: error.message,
      code: error.code,
      fieldErrors,
    };
  }

  if (error instanceof AppError) {
    return {
      title: error.name,
      message: error.message,
      code: error.code,
    };
  }

  // Native Error
  if (error instanceof Error) {
    return {
      title: "Error",
      message: error.message || "An unexpected error occurred.",
      code: ErrorCode.SERVER_INTERNAL,
    };
  }

  // Unknown
  return {
    title: "Error",
    message: "An unexpected error occurred.",
    code: ErrorCode.SERVER_INTERNAL,
  };
}

// ── Supabase Error Helpers ──────────────────────────────────

/**
 * Raw shape returned by Supabase client errors.
 */
interface SupabaseError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

/**
 * Map a Supabase error to the appropriate AppError subclass.
 */
export function mapSupabaseError(error: SupabaseError): AppError {
  const code = error.code ?? "";

  // Auth errors
  if (code === "401" || error.message.includes("JWT")) {
    return new AuthError(error.message, ErrorCode.AUTH_SESSION_EXPIRED);
  }
  if (code === "403") {
    return new AuthError(error.message, ErrorCode.AUTH_FORBIDDEN);
  }

  // Not found
  if (code === "PGRST116" || code === "404") {
    return new DatabaseError(error.message, ErrorCode.DB_RECORD_NOT_FOUND);
  }

  // Unique constraint
  if (code === "23505") {
    return new DatabaseError("Record already exists", ErrorCode.DB_DUPLICATE_KEY, {
      details: error.details,
    });
  }

  // Foreign key violation
  if (code === "23503") {
    return new DatabaseError("Related record not found", ErrorCode.DB_FOREIGN_KEY_VIOLATION, {
      details: error.details,
    });
  }

  // Generic DB error
  if (code.startsWith("23") || code.startsWith("P0")) {
    return new DatabaseError(error.message, ErrorCode.DB_CONSTRAINT_VIOLATION, {
      details: error.details,
      hint: error.hint,
    });
  }

  // Rate limiting
  if (code === "429" || error.message.includes("rate limit")) {
    return new AppError(
      "Too many requests. Please try again later.",
      ErrorCode.AUTH_RATE_LIMITED,
      429,
    );
  }

  // Fallback
  return new AppError(error.message || "Database operation failed", ErrorCode.SERVER_INTERNAL, 500, {
    code,
    details: error.details,
    hint: error.hint,
  });
}

/**
 * Extract a human-readable message from a Supabase error,
 * falling back to a generic message.
 */
export function getSupabaseErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return (error as { message: string }).message;
  }
  return "An unexpected error occurred. Please try again.";
}
