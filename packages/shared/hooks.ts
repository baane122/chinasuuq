// ============================================================
// @chinasuuq/shared/hooks
// Shared React hooks for Supabase queries, mutations, auth,
// and common UI patterns.
//
// NOTE: These hooks import React — consuming apps must have
// `react` as a dependency (both web and mobile already do).
// ============================================================

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ── Types ───────────────────────────────────────────────────

/** Loading state for async operations. */
export type LoadingState = "idle" | "loading" | "success" | "error";

/** Standard return shape for query hooks. */
export interface UseQueryResult<T> {
  data: T | null;
  error: string | null;
  state: LoadingState;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  refetch: () => Promise<void>;
}

/** Standard return shape for mutation hooks. */
export interface UseMutationResult<TArgs, TResult> {
  execute: (args: TArgs) => Promise<TResult | null>;
  data: TResult | null;
  error: string | null;
  state: LoadingState;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  reset: () => void;
}

/** Auth state for useAuth hook. */
export interface AuthState {
  user: AuthUser | null;
  session: unknown | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
}

/** Simplified user shape returned by useAuth. */
export interface AuthUser {
  id: string;
  email?: string;
  full_name?: string;
  phone?: string;
  city?: string;
}

// ── useSupabaseQuery ────────────────────────────────────────

/**
 * Generic hook for Supabase reads with loading / error / data states.
 *
 * @param queryFn - A function that returns data (e.g. `() => client.from("orders").select("*")`).
 * @param deps - Dependency array that triggers a refetch when changed.
 * @param options - Optional configuration.
 *
 * @example
 * ```tsx
 * const { data, isLoading, error, refetch } = useSupabaseQuery(
 *   () => supabase.from("orders").select("*").eq("status", "pending"),
 *   ["pending-orders"],
 * );
 * ```
 */
export function useSupabaseQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: { message: string } | null }>,
  deps: unknown[] = [],
  options?: { enabled?: boolean },
): UseQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<LoadingState>("idle");
  const mountedRef = useRef(true);

  const enabled = options?.enabled ?? true;

  const execute = useCallback(async () => {
    if (!enabled) {
      setState("idle");
      return;
    }

    setState("loading");
    setError(null);

    try {
      const result = await queryFn();
      if (!mountedRef.current) return;

      if (result.error) {
        setError(result.error.message);
        setState("error");
      } else {
        setData(result.data);
        setState("success");
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(msg);
      setState("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mountedRef.current = true;
    execute();
    return () => {
      mountedRef.current = false;
    };
  }, [execute]);

  return useMemo(
    () => ({
      data,
      error,
      state,
      isLoading: state === "loading",
      isError: state === "error",
      isSuccess: state === "success",
      refetch: execute,
    }),
    [data, error, state, execute],
  );
}

// ── useSupabaseMutation ─────────────────────────────────────

/**
 * Hook for Supabase mutations (insert / update / delete) with
 * optional optimistic update support.
 *
 * @param mutateFn - The mutation function to call with args.
 * @param options - Optional optimistic update callbacks.
 *
 * @example
 * ```tsx
 * const { execute, isLoading } = useSupabaseMutation(
 *   async (item: OrderItem) => {
 *     return supabase.from("orders").insert(item).select().single();
 *   },
 *   {
 *     onOptimistic: (item) => setOrders(prev => [...prev, item]),
 *     onRollback: (prev) => setOrders(prev),
 *   },
 * );
 *
 * // Usage
 * await execute({ status: "confirmed" });
 * ```
 */
export function useSupabaseMutation<TArgs, TResult>(
  mutateFn: (args: TArgs) => Promise<{ data: TResult | null; error: { message: string } | null }>,
  options?: {
    onOptimistic?: (args: TArgs) => void;
    onRollback?: () => void;
    onSuccess?: (data: TResult) => void;
    onError?: (error: string) => void;
  },
): UseMutationResult<TArgs, TResult> {
  const [data, setData] = useState<TResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<LoadingState>("idle");

  const execute = useCallback(
    async (args: TArgs): Promise<TResult | null> => {
      setState("loading");
      setError(null);

      // Optimistic update
      options?.onOptimistic?.(args);

      try {
        const result = await mutateFn(args);

        if (result.error) {
          // Rollback on error
          options?.onRollback?.();
          setError(result.error.message);
          setState("error");
          options?.onError?.(result.error.message);
          return null;
        }

        setData(result.data);
        setState("success");
        options?.onSuccess?.(result.data as TResult);
        return result.data;
      } catch (err) {
        options?.onRollback?.();
        const msg = err instanceof Error ? err.message : "Mutation failed";
        setError(msg);
        setState("error");
        options?.onError?.(msg);
        return null;
      }
    },
    [mutateFn, options],
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setState("idle");
  }, []);

  return useMemo(
    () => ({
      execute,
      data,
      error,
      state,
      isLoading: state === "loading",
      isError: state === "error",
      isSuccess: state === "success",
      reset,
    }),
    [execute, data, error, state, reset],
  );
}

// ── useAuth ─────────────────────────────────────────────────

/**
 * Lightweight auth hook that wraps a Supabase client's auth methods.
 * Use this for simple auth needs; for richer state management,
 * consider using Zustand (as the mobile app already does).
 *
 * @param supabase - A Supabase client instance with `.auth.*` methods.
 *
 * @example
 * ```tsx
 * const { user, isAuthenticated, isLoading } = useAuth(supabase);
 * ```
 */
export function useAuth(supabase: {
  auth: {
    getSession: () => Promise<{ data: { session: unknown | null }; error: { message: string } | null }>;
    onAuthStateChange: (cb: (event: string, session: unknown | null) => void) => { data: { subscription: { unsubscribe: () => void } } };
  };
}): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isAuthenticated: false,
    isLoading: true,
    isInitialized: false,
  });

  useEffect(() => {
    let mounted = true;

    // Initial session check
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      const session = data?.session;
      const user = extractUser(session);
      setState({
        user,
        session,
        isAuthenticated: !!session,
        isLoading: false,
        isInitialized: true,
      });
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
        const user = extractUser(session);
        setState({
          user,
          session,
          isAuthenticated: !!session,
          isLoading: false,
          isInitialized: true,
        });
      },
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  return state;
}

function extractUser(session: unknown): AuthUser | null {
  if (!session || typeof session !== "object") return null;
  const s = session as { user?: { id: string; email?: string; user_metadata?: Record<string, unknown> } };
  if (!s.user) return null;
  return {
    id: s.user.id,
    email: s.user.email,
    full_name: s.user.user_metadata?.full_name as string | undefined,
    phone: s.user.user_metadata?.phone as string | undefined,
    city: s.user.user_metadata?.city as string | undefined,
  };
}

// ── useDebounce ─────────────────────────────────────────────

/**
 * Debounce a value by `delay` milliseconds.
 * Useful for search inputs to avoid firing queries on every keystroke.
 *
 * @param value - The value to debounce.
 * @param delay - Debounce delay in ms (default: 300).
 * @returns The debounced value.
 *
 * @example
 * ```tsx
 * const [search, setSearch] = useState("");
 * const debouncedSearch = useDebounce(search, 300);
 *
 * useEffect(() => {
 *   if (debouncedSearch) fetchResults(debouncedSearch);
 * }, [debouncedSearch]);
 * ```
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// ── useInterval ─────────────────────────────────────────────

/**
 * React-friendly wrapper around `setInterval`.
 * The callback is re-called whenever `delay` changes.
 *
 * @param callback - The function to run on each interval tick.
 * @param delay - Interval in ms. Pass `null` to pause.
 */
export function useInterval(callback: () => void, delay: number | null): void {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

// ── usePrevious ─────────────────────────────────────────────

/**
 * Returns the previous value of the given variable.
 *
 * @example
 * ```tsx
 * const prevCount = usePrevious(count);
 * ```
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}
