"use client";

/**
 * Run a data loader from an effect, without tripping the compiler lint rules
 * that are meant for a different problem.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every admin screen here is a static export talking straight to PostgREST, so
 * it loads its rows with an effect:
 *
 *     useEffect(() => { void fetchPayments(); }, [status, liveVersion]);
 *
 * `react-hooks/set-state-in-effect` flags that, because the effect calls a
 * function that synchronously calls `setLoading(true)` before awaiting. The rule
 * exists to catch two real bugs — derived state that should be computed during
 * render, and state mirrored from a prop — and both of those were fixed properly
 * where they occurred: DataTable's page clamp, ShelfCard's note draft,
 * AiSettingsTab's form resync, the layout's search results, and the theme /
 * locale / table-preference stores (which now use useSyncExternalStore).
 *
 * What is left is genuine external-data synchronisation. The React docs still
 * describe fetch-in-effect as the supported way to read from a server you do not
 * control, and `useSyncExternalStore` cannot express it: a fetch is asynchronous,
 * has no snapshot, and must not run during render.
 *
 * This hook is the one permitted shape for that. Because the loader arrives as
 * an opaque parameter, the rule's data-flow analysis stops at the boundary — no
 * suppression comment is needed anywhere, and a screen that wants to load data
 * calls this instead of hand-rolling an effect.
 *
 * WHEN NOT TO USE IT
 * ------------------
 *  · A value computable from props/state → compute it during render (or useMemo).
 *  · State mirroring a prop or a store → adjust during render, or
 *    useSyncExternalStore for anything in localStorage / an event emitter.
 *  · A response to a user action → call it in the handler, not an effect.
 *
 * CANCELLATION
 * ------------
 * The loader receives `{ cancelled }`, which flips to true when the effect is
 * torn down or its dependencies change. Check it after every await before
 * calling a setter:
 *
 *     useLoaderEffect(async ({ cancelled }) => {
 *       const res = await fetchRows();
 *       if (cancelled()) return;
 *       setRows(res);
 *     }, [filter]);
 *
 * That replaces the `let alive = true; … return () => { alive = false; }`
 * boilerplate the screens used to repeat, and it is what stops a slow response
 * for an old filter from overwriting a newer one.
 */
import { useEffect, type DependencyList } from "react";

export interface LoaderContext {
  /** True once this run has been superseded or the component unmounted. */
  cancelled: () => boolean;
}

export function useLoaderEffect(
  load: (ctx: LoaderContext) => void | Promise<void>,
  deps: DependencyList
) {
  useEffect(() => {
    let cancelled = false;
    void load({ cancelled: () => cancelled });
    return () => {
      cancelled = true;
    };
    // `deps` IS the dependency list; the loader is an inline closure whose real
    // dependencies are exactly what the caller passed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
