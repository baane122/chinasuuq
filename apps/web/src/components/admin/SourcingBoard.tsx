"use client";

/**
 * Sourcing board — every order LINE through the five steps the team actually
 * performs, click-to-advance.
 *
 * WHAT IS REAL HERE
 *  - The rows come from `admin_order_items_view`, the security-invoker view
 *    (migration 202609240004) over `order_items`, so RLS decides visibility and
 *    each line carries the app it was bought in, the CNY price and the FX rate
 *    pinned at purchase time.
 *  - A line's column is derived from the four stored booleans on `order_items`
 *    (is_sourced / is_purchased / is_received / is_inspected). Nothing else is
 *    inferred: a line whose flags disagree (e.g. received without sourced, which
 *    legacy data does contain) sits in its highest achieved stage and shows the
 *    missing steps as unticked, rather than being silently re-normalised.
 *  - Advancing writes exactly one boolean plus `updated_at` to `order_items`.
 *    `sync_order_items()` — the trigger that rebuilds lines from the order JSON —
 *    refreshes product/price/provenance columns on conflict but never touches
 *    these four flags, so a manual advance survives a re-sync.
 *
 * WHAT IS NOT AVAILABLE, AND IS SAID SO
 *  - There is no supplier note: production's `order_items` has no supplier_status
 *    column, so nothing on this board can show what a supplier replied.
 *  - The view exposes no order status, so a line belonging to a cancelled order
 *    can appear. The card carries the order reference to check it on the Orders
 *    page; the board does not guess.
 *  - There is no drag-and-drop library in this app (and nothing can be
 *    installed — the build is offline), so moving a card means pressing its
 *    advance button. That is deliberate: click-to-advance also works on a
 *    tablet in the warehouse, which HTML5 drag does not.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, ArrowLeft, ExternalLink, ImageOff, Loader2, RefreshCw,
  ShoppingCart, PackageSearch, CircleDollarSign, Link2Off, Info,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/admin/Toast";
import { useLiveVersion } from "@/lib/admin/live-store";
import { EmptyState, ErrorState } from "@/components/admin/ui";

/** Newest N open lines. Stated in the header so the count is never mistaken
 *  for "everything". */
const LINE_WINDOW = 500;

type StageKey = "pending" | "sourced" | "purchased" | "received" | "inspected";

const STAGES: {
  key: StageKey;
  label: string;
  /** The flag that is set when a line LEAVES this column, i.e. its next step. */
  sets?: "is_sourced" | "is_purchased" | "is_received" | "is_inspected";
  /** The flag that is cleared when a line moves back into this column. */
  owns?: "is_sourced" | "is_purchased" | "is_received" | "is_inspected";
  meaning: string;
}[] = [
  { key: "pending", label: "To source", sets: "is_sourced", meaning: "No supplier chosen yet" },
  {
    key: "sourced",
    label: "Sourced",
    sets: "is_purchased",
    owns: "is_sourced",
    meaning: "Supplier + link found, not yet paid",
  },
  {
    key: "purchased",
    label: "Purchased",
    sets: "is_received",
    owns: "is_purchased",
    meaning: "Bought from the marketplace",
  },
  {
    key: "received",
    label: "Received",
    sets: "is_inspected",
    owns: "is_received",
    meaning: "In the Guangzhou warehouse",
  },
  {
    key: "inspected",
    label: "Inspected",
    owns: "is_inspected",
    meaning: "Checked — ready to consolidate",
  },
];

interface Line {
  id: string;
  order_id: string;
  order_ref: string | null;
  created_at: string | null;
  product_name: string | null;
  image_url: string | null;
  quantity: number | null;
  unit_price: number | null;
  cost_price: number | null;
  total_price: number | null;
  unit_price_cny: number | null;
  exchange_rate: number | null;
  source_url: string | null;
  marketplace_key: string;
  marketplace_name: string;
  customer_name: string | null;
  is_sourced: boolean;
  is_purchased: boolean;
  is_received: boolean;
  is_inspected: boolean;
}

const LINE_COLUMNS =
  "id, order_id, order_ref, created_at, product_name, image_url, quantity, unit_price, cost_price, total_price, unit_price_cny, exchange_rate, source_url, marketplace_key, marketplace_name, customer_name, is_sourced, is_purchased, is_received, is_inspected";

/** A line still owes every flag it has not set; an inspected line has no work
 *  left on this board. */
const OPEN_FLAG_FILTER =
  "is_sourced.eq.false,is_purchased.eq.false,is_received.eq.false,is_inspected.eq.false";

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Highest stage the stored flags actually reach. */
function stageOf(line: Line): StageKey {
  if (line.is_inspected) return "inspected";
  if (line.is_received) return "received";
  if (line.is_purchased) return "purchased";
  if (line.is_sourced) return "sourced";
  return "pending";
}

export default function SourcingBoard({
  appFilter,
  search,
  dateFrom,
  dateTo,
}: {
  /** marketplace_key from the URL (`?app=`), "" for any. */
  appFilter: string;
  /** free text matched against product / order ref / customer. */
  search: string;
  dateFrom: string;
  dateTo: string;
}) {
  const { success, error: toastError } = useToast();
  const liveVersion = useLiveVersion();

  const [lines, setLines] = useState<Line[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Only lines still missing at least one flag.
      const { data, error: fetchError } = await supabase
        .from("admin_order_items_view")
        .select(LINE_COLUMNS)
        .or(OPEN_FLAG_FILTER)
        .order("created_at", { ascending: false })
        .limit(LINE_WINDOW);
      if (fetchError) throw fetchError;
      const rows = (data as Line[]) || [];
      setLines(rows);
      setTruncated(rows.length >= LINE_WINDOW);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, liveVersion]);

  /* ── Columns ─────────────────────────────────────────────────── */

  const byStage = useMemo(() => {
    const q = search.trim().toLowerCase();
    const buckets: Record<StageKey, Line[]> = {
      pending: [], sourced: [], purchased: [], received: [], inspected: [],
    };
    for (const line of lines) {
      if (appFilter && (line.marketplace_key || "") !== appFilter) continue;
      const day = line.created_at ? String(line.created_at).slice(0, 10) : "";
      if (dateFrom && (!day || day < dateFrom)) continue;
      if (dateTo && (!day || day > dateTo)) continue;
      if (
        q &&
        !`${line.product_name ?? ""} ${line.order_ref ?? ""} ${line.customer_name ?? ""}`
          .toLowerCase()
          .includes(q)
      )
        continue;
      buckets[stageOf(line)].push(line);
    }
    return buckets;
  }, [lines, appFilter, search, dateFrom, dateTo]);

  const shown = useMemo(
    () => Object.values(byStage).reduce((n, list) => n + list.length, 0),
    [byStage]
  );

  const appOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const line of lines) {
      map.set(line.marketplace_key || "unknown", line.marketplace_name || "Unknown app");
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [lines]);

  /* ── Moves ───────────────────────────────────────────────────── */

  // Cards are memoized, so the handlers handed to them must never change
  // identity. Two things would otherwise break that: the toast context rebuilds
  // `success`/`error` on every notification, and the handlers need the row the
  // click belongs to. Hence both pinned behind refs — one toast, or one reload,
  // no longer re-renders all 500 cards.
  const notify = useRef({ success, toastError });
  useEffect(() => {
    notify.current = { success, toastError };
  }, [success, toastError]);

  const linesRef = useRef<Line[]>(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  const writeFlags = useCallback(
    async (
      lineId: string,
      patch: Partial<Pick<Line, "is_sourced" | "is_purchased" | "is_received" | "is_inspected">>,
      label: string
    ) => {
      setBusy(lineId);
      try {
        // The write is read back rather than trusted: `.select()` after
        // `.update()` returns only the rows this role may actually see, so an
        // RLS rejection that PostgREST reports as success (zero rows affected)
        // shows up here instead of as a card that moved on its own.
        const { data: written, error: updateError } = await supabase
          .from("order_items")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("id", lineId)
          .select("id, is_sourced, is_purchased, is_received, is_inspected");
        if (updateError) throw updateError;
        type WrittenLine = Pick<
          Line,
          "id" | "is_sourced" | "is_purchased" | "is_received" | "is_inspected"
        >;
        const row = (written as WrittenLine[] | null)?.[0];
        if (!row) {
          // Nothing was written that we can see: say so instead of pretending.
          notify.current.toastError("The line was not changed — reload and check your access");
          return;
        }
        setLines((prev) => prev.map((l) => (l.id === row.id ? { ...l, ...row } : l)));
        notify.current.success(label);
      } catch (e) {
        notify.current.toastError(e instanceof Error ? e.message : "Could not update the line");
      } finally {
        setBusy(null);
      }
    },
    []
  );

  const advance = useCallback(
    (lineId: string) => {
      const line = linesRef.current.find((l) => l.id === lineId);
      if (!line) return;
      const stage = STAGES.find((s) => s.key === stageOf(line));
      if (!stage?.sets) return;
      void writeFlags(lineId, { [stage.sets]: true } as Partial<Line>, `Moved to ${
        STAGES[STAGES.findIndex((s) => s.key === stage.key) + 1].label
      }`);
    },
    [writeFlags]
  );

  const stepBack = useCallback(
    (lineId: string) => {
      const line = linesRef.current.find((l) => l.id === lineId);
      if (!line) return;
      const idx = STAGES.findIndex((s) => s.key === stageOf(line));
      const current = STAGES[idx];
      if (!current?.owns) return;
      void writeFlags(lineId, { [current.owns]: false } as Partial<Line>, `Moved back to ${STAGES[idx - 1].label}`);
    },
    [writeFlags]
  );

  /* ── Render ──────────────────────────────────────────────────── */

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-dark-900/[0.06] bg-white p-6 text-sm text-dark-900/50">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading open line items…
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (lines.length === 0) {
    return (
      <div className="rounded-2xl border border-dark-900/[0.06] bg-white">
        <EmptyState
          title="Nothing open"
          subtitle="Every line item in the database has all four sourcing flags set, or there are no line items yet."
          action={
            <button onClick={load} className="admin-btn-outline">
              <RefreshCw className="h-4 w-4" /> Reload
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-dark-900/50">
        <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          <strong className="font-semibold text-dark-900/70">Click-to-advance, not drag.</strong>{" "}
          Nothing is dragged — each card carries its own next-step button, which also
          works on a warehouse tablet.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-dark-900/50">
        <span>
          {shown} of {lines.length} open lines
          {appFilter ? ` in ${appOptions.find(([k]) => k === appFilter)?.[1] ?? appFilter}` : ""}
          {truncated ? ` · window: the newest ${LINE_WINDOW} open lines only` : ""}
        </span>
        <button
          onClick={load}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-dark-900/10 bg-white px-2.5 py-1 font-semibold text-dark-900/60 transition-colors hover:text-dark-900"
        >
          <RefreshCw className="h-3 w-3" /> Reload
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {STAGES.map((stage) => {
          const list = byStage[stage.key];
          return (
            <section
              key={stage.key}
              className="flex w-[280px] shrink-0 flex-col rounded-2xl border border-dark-900/[0.06] bg-white"
              aria-label={`${stage.label} column`}
            >
              <header className="border-b border-dark-900/[0.06] px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[13px] font-bold text-dark-900">{stage.label}</h3>
                  <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[11px] font-bold text-brand-700 tabular-nums">
                    {list.length}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[10px] text-dark-900/45">{stage.meaning}</p>
              </header>

              <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: "70vh" }}>
                {list.length === 0 && (
                  <p className="px-2 py-6 text-center text-[11px] text-dark-900/30">
                    No lines here
                  </p>
                )}
                {list.map((line) => (
                  <LineCard
                    key={line.id}
                    line={line}
                    busy={busy === line.id}
                    isLast={stage.key === "inspected"}
                    onAdvance={advance}
                    onBack={stepBack}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <p className="text-[11px] text-dark-900/40">
        Columns are the four stored flags on <code className="font-mono">order_items</code>{" "}
        (is_sourced, is_purchased, is_received, is_inspected) as exposed by{" "}
        <code className="font-mono">admin_order_items_view</code>. Prices, the CNY unit cost and the
        FX rate are the values pinned to the line when it was bought — they are never reconverted
        here. The board cannot see an order&rsquo;s status, so check the order reference on the
        Orders page before buying anything for a line that may belong to a cancelled order.
      </p>
    </div>
  );
}

/**
 * Memoized: a keystroke in the search box, a toast, or one line's flags must not
 * re-render the other 499 cards. Shallow comparison is enough because the board
 * hands over the row object (only the written row gets a new one) and callbacks
 * whose identity never changes.
 */
const LineCard = memo(function LineCard({
  line,
  busy,
  isLast,
  onAdvance,
  onBack,
}: {
  line: Line;
  busy: boolean;
  isLast: boolean;
  onAdvance: (lineId: string) => void;
  onBack: (lineId: string) => void;
}) {
  const stage = stageOf(line);
  const idx = STAGES.findIndex((s) => s.key === stage);
  const next = STAGES[idx + 1];
  const [imgFailed, setImgFailed] = useState(false);

  const cny = num(line.unit_price_cny);
  const rate = num(line.exchange_rate);
  const cost = num(line.cost_price);

  return (
    <article className="rounded-xl border border-dark-900/[0.06] bg-warm-50 p-2.5 shadow-sm">
      <div className="flex gap-2">
        <div className="shrink-0">
          {line.image_url && !imgFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={line.image_url}
              alt=""
              className="h-11 w-11 rounded-lg object-cover ring-1 ring-dark-900/5"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-dark-100 ring-1 ring-dark-900/5">
              <ImageOff className="h-4 w-4 text-dark-400" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-xs font-semibold leading-snug text-dark-900">
            {line.product_name || "Unnamed item"}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-dark-900/50">
            {line.order_ref || line.order_id.slice(0, 8)}
            {line.customer_name ? ` · ${line.customer_name}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
            line.marketplace_key === "unknown"
              ? "bg-dark-900/[0.06] text-dark-900/45"
              : "bg-brand-500/10 text-brand-700"
          )}
          title={
            line.marketplace_key === "unknown"
              ? "This line never recorded which app it came from"
              : "Bought in this app"
          }
        >
          {line.marketplace_key === "unknown" ? <Link2Off className="h-2.5 w-2.5" /> : <ShoppingCart className="h-2.5 w-2.5" />}
          {line.marketplace_key === "unknown" ? "app not recorded" : line.marketplace_name}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-medium text-dark-900/60 ring-1 ring-dark-900/[0.06]">
          <PackageSearch className="h-2.5 w-2.5" />
          {num(line.quantity) ?? 0} × {cost !== null ? `$${cost.toFixed(2)} cost` : "no cost recorded"}
        </span>
      </div>

      <p className="mt-1.5 flex items-center gap-1 text-[10px] text-dark-900/50 tabular-nums">
        <CircleDollarSign className="h-2.5 w-2.5 shrink-0" />
        {cny !== null && rate !== null
          ? `¥${cny.toFixed(2)} @ ${rate} ¥/$ (rate pinned on the line)`
          : cny !== null
            ? `¥${cny.toFixed(2)} (no rate pinned on the line)`
            : "No CNY cost pinned on this line"}
      </p>

      <div className="mt-2 flex items-center gap-1.5">
        {line.source_url ? (
          <a
            href={line.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-dark-900/45 transition-colors hover:bg-white hover:text-brand-600"
            title="Open the listing"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : (
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-dark-900/25"
            title="No source URL stored on this line"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </span>
        )}
        {idx > 0 && (
          <button
            onClick={() => onBack(line.id)}
            disabled={busy}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-dark-900/45 transition-colors hover:bg-white hover:text-dark-900 disabled:opacity-40"
            title="Move back one step (clears this step's flag)"
            aria-label="Move back one step"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
        )}
        {!isLast && next && (
          <button
            onClick={() => onAdvance(line.id)}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
            title={`Mark this line and move it to ${next.label}`}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
            {next.label}
          </button>
        )}
      </div>
    </article>
  );
});
