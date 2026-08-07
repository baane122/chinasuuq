// ============================================================
// @chinasuuq/shared/api-client
// Supabase client factory with retry, caching, and error
// normalization. Works on both web (Next.js) and mobile (RN).
// ============================================================

import type { QueryOptions, QueryFilter } from "./types";
import {
  NetworkError,
  DatabaseError,
  AuthError,
  ErrorCode,
  mapSupabaseError,
} from "./errors";
import { retry, sleep } from "./utils";

// ── Types ───────────────────────────────────────────────────

/** Result wrapper that always carries either `data` or `error`. */
export type Result<T> =
  | { data: T; error: null }
  | { data: null; error: Error };

/** Cache entry shape. */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// ── In-Memory Cache ─────────────────────────────────────────

const cache = new Map<string, CacheEntry<unknown>>();

/**
 * Get a value from the in-memory cache.
 * Returns `null` if missing or expired.
 */
function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

/** Store a value in the in-memory cache. */
function cacheSet<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/** Clear the entire cache or entries matching a prefix. */
export function clearCache(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

// ── Client Creation ─────────────────────────────────────────

/**
 * Create a Supabase client. Web apps should import this with
 * env vars; mobile apps pass the values directly.
 *
 * @example
 * ```ts
 * // web
 * export const supabase = createSupabaseClient(
 *   process.env.NEXT_PUBLIC_SUPABASE_URL!,
 *   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
 * );
 *
 * // mobile
 * import AsyncStorage from "@react-native-async-storage/async-storage";
 * export const supabase = createSupabaseClient(url, key, { storage: AsyncStorage });
 * ```
 */
export function createSupabaseClient(
  url: string,
  anonKey: string,
  options?: {
    storage?: unknown;
    autoRefreshToken?: boolean;
    persistSession?: boolean;
    detectSessionInUrl?: boolean;
  },
) {
  // Dynamic require — the consuming app must have @supabase/supabase-js installed.
  // @ts-ignore — require exists in Node/bundler environments
  const { createClient } = require("@supabase/supabase-js");

  return createClient(url, anonKey, {
    auth: {
      storage: options?.storage,
      autoRefreshToken: options?.autoRefreshToken ?? true,
      persistSession: options?.persistSession ?? true,
      detectSessionInUrl: options?.detectSessionInUrl ?? true,
    },
  });
}

// ── Query Helper ────────────────────────────────────────────

/**
 * Execute a Supabase query with filters, ordering, and pagination.
 * Returns a `Result<T[]>` that normalizes errors.
 *
 * @param supabase - A Supabase client instance.
 * @param table - The table name to query.
 * @param options - Query options (filters, ordering, limit, etc.).
 * @param cacheTtlMs - Optional cache TTL in milliseconds.
 *
 * @example
 * ```ts
 * const { data, error } = await supaQuery(client, "orders", {
 *   filters: [{ column: "status", operator: "eq", value: "pending" }],
 *   order: [{ column: "created_at", ascending: false }],
 *   limit: 20,
 * });
 * ```
 */
export async function supaQuery<T = Record<string, unknown>>(
  supabase: { from: (table: string) => unknown },
  table: string,
  options: QueryOptions = {},
  cacheTtlMs?: number,
): Promise<Result<T[]>> {
  const cacheKey = `${table}:${JSON.stringify(options)}`;

  // Check cache
  if (cacheTtlMs) {
    const cached = cacheGet<T[]>(cacheKey);
    if (cached) return { data: cached, error: null };
  }

  try {
    let query = (supabase as any).from(table).select(options.select ?? "*");

    // Apply filters
    if (options.filters) {
      for (const filter of options.filters) {
        query = applyFilter(query, filter);
      }
    }

    // Apply ordering
    if (options.order) {
      for (const { column, ascending = false } of options.order) {
        query = query.order(column, { ascending });
      }
    }

    // Apply pagination
    if (options.limit) {
      const from = options.offset ?? 0;
      query = query.range(from, from + options.limit - 1);
    }

    const { data, error } = await query;

    if (error) {
      return { data: null, error: mapSupabaseError(error) };
    }

    // Cache result
    if (cacheTtlMs) {
      cacheSet(cacheKey, data, cacheTtlMs);
    }

    return { data: (data ?? []) as T[], error: null };
  } catch (err) {
    if (err instanceof NetworkError || err instanceof Error) {
      if (err.message.includes("Failed to fetch") || err.message.includes("NetworkError")) {
        return { data: null, error: new NetworkError() };
      }
    }
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

// ── Mutation Helper ─────────────────────────────────────────

/**
 * Execute a Supabase insert, update, or delete.
 * Automatically invalidates relevant cache entries.
 *
 * @example
 * ```ts
 * const { data, error } = await supaMutate(client, "orders", "insert", { status: "pending" });
 * ```
 */
export async function supaMutate<T = Record<string, unknown>>(
  supabase: { from: (table: string) => unknown },
  table: string,
  operation: "insert" | "update" | "upsert" | "delete",
  payload?: Record<string, unknown> | Record<string, unknown>[],
  match?: Record<string, unknown>,
): Promise<Result<T>> {
  try {
    let query = (supabase as any).from(table);

    switch (operation) {
      case "insert":
        query = query.insert(payload);
        break;
      case "update":
        if (match) {
          for (const [col, val] of Object.entries(match)) {
            query = query.eq(col, val);
          }
        }
        query = query.update(payload);
        break;
      case "upsert":
        query = query.upsert(payload);
        break;
      case "delete":
        if (match) {
          for (const [col, val] of Object.entries(match)) {
            query = query.eq(col, val);
          }
        }
        query = query.delete();
        break;
    }

    const { data, error } = await query.select().single();

    if (error) {
      return { data: null, error: mapSupabaseError(error) };
    }

    // Invalidate cache for this table
    clearCache(table);

    return { data: data as T, error: null };
  } catch (err) {
    if (err instanceof Error && err.message.includes("Failed to fetch")) {
      return { data: null, error: new NetworkError() };
    }
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

// ── Auth Helper ─────────────────────────────────────────────

interface SupabaseAuthClient {
  auth: {
    signInWithPassword: (opts: {
      email: string;
      password: string;
    }) => Promise<{
      data: { session: unknown; user: unknown } | null;
      error: { message: string; code?: string } | null;
    }>;
  };
}

/**
 * Sign in with email + password via Supabase.
 * Returns `Result<{ session, user }>` with the authenticated session.
 */
export async function signIn(
  supabase: SupabaseAuthClient,
  email: string,
  password: string,
): Promise<Result<{ session: unknown; user: unknown }>> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      if (error.message.includes("Invalid login")) {
        return {
          data: null,
          error: new AuthError("Invalid email or password", ErrorCode.AUTH_INVALID_CREDENTIALS),
        };
      }
      return { data: null, error: mapSupabaseError(error) };
    }
    return { data: data as { session: unknown; user: unknown }, error: null };
  } catch (err) {
    if (err instanceof Error && err.message.includes("Failed to fetch")) {
      return {
        data: null,
        error: new NetworkError("Unable to connect. Please check your internet."),
      };
    }
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

// ── Internal ────────────────────────────────────────────────

function applyFilter(query: any, filter: QueryFilter): any {
  const { column, operator, value } = filter;

  switch (operator) {
    case "eq":      return query.eq(column, value);
    case "neq":     return query.neq(column, value);
    case "gt":      return query.gt(column, value);
    case "gte":     return query.gte(column, value);
    case "lt":      return query.lt(column, value);
    case "lte":     return query.lte(column, value);
    case "like":    return query.like(column, value);
    case "ilike":   return query.ilike(column, value);
    case "in":      return query.in(column, value as unknown[]);
    case "is":      return query.is(column, value);
    case "contains":       return query.contains(column, value);
    case "contained_by":   return query.containedBy(column, value);
    case "overlaps":       return query.overlaps(column, value);
    default:        return query;
  }
}

// ── Retry Wrapper ───────────────────────────────────────────

/**
 * Execute a Supabase query with automatic retry on transient errors.
 *
 * @param fn - The async function to execute.
 * @param maxAttempts - Max attempts (default: 3).
 *
 * @example
 * ```ts
 * const { data } = await supaQueryWithRetry(client, "orders", { limit: 10 });
 * ```
 */
export async function supaQueryWithRetry<T>(
  fn: () => Promise<Result<T>>,
  maxAttempts: number = 3,
): Promise<Result<T>> {
  return retry(async () => {
    const result = await fn();
    // Don't retry validation or auth errors
    if (result.error instanceof AuthError) throw result.error;
    if (result.error && "fields" in result.error) throw result.error;
    return result;
  }, maxAttempts, 1000);
}
