"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { cn, formatDateTime } from "@/lib/utils";
import { ArrowLeftRight, Clock, Globe, Info, Lock, Settings2 } from "lucide-react";
import {
  PageHeader,
  PageGrid,
  StatCard,
  SectionCard,
  SearchInput,
  TableShell,
  EMPTY_IMAGES,
} from "@/components/admin/ui";
import { RowCapNotice } from "@/components/admin/RowCapNotice";
import {
  CNY_PER_USD_MAX,
  CNY_PER_USD_MIN,
  SOS_PER_USD_MAX,
  SOS_PER_USD_MIN,
  normalizeCnyPerUsd,
  normalizeSosPerUsd,
} from "@/lib/fx";

/* HISTORY, READ-ONLY. This table is the audit trail of `exchange_rates`; the one
 * place a rate is edited is Settings → Currency, which writes a new active row
 * per pair (the DB retires the previous one and keeps exactly one active). A
 * create/edit/delete form here used to be a second write path, and the two
 * disagreed about what `rate` means — see the reading below.
 *
 * `rate` answers "how many units of from_currency equal ONE unit of
 * to_currency", so a CNY→USD row of 6.68 means 1 CNY = 15 US cents.
 */
interface ExchangeRate {
  id: string;
  from_currency: string;
  to_currency: string;
  rate: number | string | null;
  reason: string | null;
  is_active: boolean;
  effective_from: string;
  effective_until: string | null;
  created_at: string;
}

// Normalizes a raw `rate` value to a finite number, or null when absent/invalid.
const rateValue = (raw: number | string | null | undefined): number | null => {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

const formatRate = (raw: number | string | null | undefined) => {
  const n = rateValue(raw);
  return n === null ? "—" : String(n);
};

const SYMBOL: Record<string, string> = { USD: "$", CNY: "¥" };
const symbolOf = (code: string) => SYMBOL[code] ?? `${code} `;

/** The two pairs the app runs on, with the plausibility band fx.ts reads them through. */
const CANONICAL: Record<string, { normalize: (n: number) => number | null; band: string }> = {
  CNY: { normalize: normalizeCnyPerUsd, band: `${CNY_PER_USD_MIN} and ${CNY_PER_USD_MAX} CNY per $1` },
  SOS: { normalize: normalizeSosPerUsd, band: `${SOS_PER_USD_MIN} and ${SOS_PER_USD_MAX} SOS per $1` },
};

/**
 * Per-row human reading plus an upside-down flag.
 *
 * A canonical pair-to-USD row stores "how many <from> buy $1", so anything below
 * 1 was typed the other way round (0.15 where 6.68 belongs). Older rows can
 * still carry that shape — the auto-flip lives in the insert trigger, which only
 * guards new writes — so the badge is a reading aid, not a claim about live data.
 *
 * `display` is the number every other screen actually bills with: the stored
 * value run through fx.ts's normalizer, which flips a backwards row and rejects
 * an implausible one (null). Reading columns derive from it, so this history view
 * can never disagree with sourcing, quotes or checkout.
 */
function rowReading(row: ExchangeRate): { reading: string; warning: string | null; display: number | null } {
  const from = String(row.from_currency ?? "").toUpperCase();
  const to = String(row.to_currency ?? "").toUpperCase();
  const rate = rateValue(row.rate);

  if (rate === null || rate <= 0) {
    return { reading: "no usable rate stored", warning: "Row has no usable rate", display: null };
  }

  const canonical = to === "USD" ? CANONICAL[from] : undefined;

  if (canonical) {
    const readable = canonical.normalize(rate);
    if (readable === null) {
      return {
        reading: `${rate} · 1 ${from} = ${symbolOf(to)}${(1 / rate).toFixed(4)}`,
        warning: `Outside the plausible band (${canonical.band}); every other screen ignores this row.`,
        display: null,
      };
    }
    const flipped = readable !== rate;
    return {
      reading: `${readable} · 1 ${from} = ${symbolOf(to)}${(1 / readable).toFixed(4)} · 1 ${to} = ${readable} ${from}`,
      warning: flipped
        ? `Stored ${rate}, typed the other way round — this pair keeps ${from} per $1, so the number belongs above 1 (${canonical.band}). Shown as the app reads it.`
        : null,
      display: readable,
    };
  }

  // Any other pair: state both directions and let the reader judge, since there
  // is no band to check it against.
  return {
    reading: `${rate} · 1 ${to} = ${rate} ${from} · 1 ${from} = ${(1 / rate).toFixed(4)} ${to}`,
    warning: rate < 1 ? `Less than 1 ${from} per 1 ${to} — check the direction this was entered in.` : null,
    display: rate,
  };
}

/** The live row per pair: is_active first, newest effective_from as the tiebreak
 * the DB constraint already guarantees. RAW stored number — for audit, not for
 * display; see activeLiveRate for what the app bills with. */
const activeRateFor = (rates: ExchangeRate[], from: string): number | null => {
  const rows = rates.filter(
    (r) => r.from_currency.toUpperCase() === from && r.to_currency.toUpperCase() === "USD"
  );
  // Only an ACTIVE row counts as live. Falling back to `rows[0]` would print a
  // retired rate under "Live" the moment the DB had no active row, while every
  // other screen (fx.ts, fx_rates()) was pricing on the fallback default — the
  // admin would see one number and the app another.
  const row = rows.find((r) => r.is_active);
  return row ? rateValue(row.rate) : null;
};

/**
 * The live pair as every other screen reads it: the stored number run through
 * fx.ts's normalizer (a backwards row is flipped, an implausible one is null),
 * so the stat cards cannot disagree with sourcing, quotes or checkout.
 */
const activeLiveRate = (
  rates: ExchangeRate[],
  from: "CNY" | "SOS"
): { display: number | null; stored: number | null } => {
  const stored = activeRateFor(rates, from);
  return { display: stored === null ? null : CANONICAL[from].normalize(stored), stored };
};

export default function RatesPage() {
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Set when a fetch returned a full 1000-row page — the read cap hides older rows.
  const [rowCapHit, setRowCapHit] = useState(false);

  const fetchRates = async () => {
    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from("exchange_rates")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (fetchError) throw fetchError;
      const rows = (data as ExchangeRate[]) || [];
      setRates(rows);
      setRowCapHit(rows.length >= 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load exchange rates");
    } finally {
      setIsLoading(false);
    }
  };

  // One read on mount: this is a history view and Settings is the only writer,
  // so there is nothing here to keep live.
  useEffect(() => {
    fetchRates();
  }, []);

  const filteredRates = useMemo(() => {
    if (!search) return rates;
    const q = search.toLowerCase();
    return rates.filter(
      (r) =>
        r.from_currency.toLowerCase().includes(q) ||
        r.to_currency.toLowerCase().includes(q) ||
        (r.reason && r.reason.toLowerCase().includes(q))
    );
  }, [rates, search]);

  /* Both cards read the live row through fx.ts's normalizers, so the number here
   * is the number sourcing, quotes and checkout bill with — a legacy row stored
   * upside-down shows the flipped value, with what the table literally holds as a
   * footnote so the audit trail stays visible. */
  const cnyLive = useMemo(() => activeLiveRate(rates, "CNY"), [rates]);
  const sosLive = useMemo(() => activeLiveRate(rates, "SOS"), [rates]);
  const lastUpdated = useMemo(
    () => (rates.length > 0 ? formatDateTime(rates[0].created_at) : "—"),
    [rates]
  );
  const flagged = useMemo(() => rates.filter((r) => rowReading(r).warning).length, [rates]);

  const liveCardValue = (live: { display: number | null; stored: number | null }) =>
    live.display === null ? "—" : String(live.display);
  const liveCardNote = (live: { display: number | null; stored: number | null }) =>
    live.stored === null
      ? "No row recorded for this pair yet"
      : live.display === null
        ? `Stored ${live.stored} is outside the plausible band, so nothing reads it`
        : live.display !== live.stored
          ? `Reads the stored ${live.stored} as the flipped value`
          : undefined;

  return (
    <div>
      <PageHeader
        title="Exchange Rates"
        subtitle="History of every rate the admin has used — editing happens in Settings"
        actions={
          <Link href="/admin/settings?tab=currency" className="admin-btn-outline">
            <Settings2 className="h-4 w-4" />
            Rates are set in Settings
          </Link>
        }
      />

      {rowCapHit && <RowCapNotice noun="rate entries" />}

      {/* Stats */}
      <PageGrid>
        <StatCard
          label="CNY per $1 (live)"
          value={liveCardValue(cnyLive)}
          deltaLabel={liveCardNote(cnyLive)}
          icon={ArrowLeftRight}
          tone="brand"
          delay={0}
        />
        <StatCard
          label="SOS per $1 (live)"
          value={liveCardValue(sosLive)}
          deltaLabel={liveCardNote(sosLive)}
          icon={Globe}
          tone="info"
          delay={1}
        />
        <StatCard label="Rows Recorded" value={rates.length} icon={Clock} tone="violet" delay={2} />
        <StatCard label="Last Recorded" value={lastUpdated} icon={Info} tone="success" delay={3} />
      </PageGrid>

      {flagged > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning/5 px-4 py-3 text-sm text-dark-900/70">
          <AlertGlyph className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>
            <strong className="font-semibold text-dark-900">
              {flagged} row{flagged === 1 ? "" : "s"} below
            </strong>{" "}
            store a rate the way round the app cannot use (a CNY or SOS → USD row should be the number of
            yuan/shillings one dollar buys, never the fraction back). Old rows are kept for audit; the live
            conversion flips them, and any new save is flipped by the database trigger.
          </p>
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by currency or reason…"
          className="max-w-md"
        />
      </div>

      {/* Rates table */}
      <TableShell
        isLoading={isLoading}
        error={error}
        errorRetry={fetchRates}
        hasData={filteredRates.length > 0}
        filtered={!!search}
        emptyImage={EMPTY_IMAGES.generic}
        emptyTitle="No rates recorded yet"
        emptySubtitle="Save a rate in Settings → Currency and its history starts here."
        emptyAction={
          <Link href="/admin/settings?tab=currency" className="admin-btn-primary">
            <Settings2 className="h-4 w-4" /> Set a rate in Settings
          </Link>
        }
      >
        <SectionCard bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="admin-table w-full">
              <thead>
                <tr>
                  <th>Pair</th>
                  <th>Rate</th>
                  <th>Reads as</th>
                  <th>Effective</th>
                  <th>Status</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {filteredRates.map((rate) => {
                  const { reading, warning, display } = rowReading(rate);
                  const stored = rateValue(rate.rate);
                  // History stays auditable: the cell shows what the app reads and
                  // keeps the literal stored number beside it when they differ.
                  const differsFromStored =
                    display !== null && stored !== null && display !== stored;
                  return (
                    <tr key={rate.id}>
                      <td>
                        <span className="text-sm font-semibold text-dark-900">
                          {rate.from_currency} → {rate.to_currency}
                        </span>
                      </td>
                      <td>
                        <span className="text-sm font-bold text-brand-500">
                          {display === null ? formatRate(rate.rate) : String(display)}
                        </span>
                        {differsFromStored && (
                          <span className="ml-1.5 text-[11px] font-normal text-dark-900/40 tabular-nums">
                            (stored {stored})
                          </span>
                        )}
                        {warning && (
                          <span
                            className="ml-2 inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning"
                            title={warning}
                          >
                            <AlertGlyph />
                            Check direction
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className={cn(
                            "inline-block max-w-[320px] text-sm tabular-nums",
                            warning && "text-warning"
                          )}
                          title={warning ?? undefined}
                        >
                          {reading}
                        </span>
                      </td>
                      <td>
                        <span className="text-sm text-dark-900/50">{formatDateTime(rate.effective_from)}</span>
                      </td>
                      <td>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            rate.is_active ? "bg-green-50 text-green-700" : "bg-dark-100 text-dark-500"
                          )}
                        >
                          {rate.is_active ? "Active" : "Retired"}
                        </span>
                      </td>
                      <td>
                        <span className="inline-block max-w-[240px] truncate text-sm text-dark-900/55">
                          {rate.reason || "-"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-dark-900/[0.06] px-5 py-2.5 text-xs text-dark-900/45">
            Showing {filteredRates.length} of {rates.length} rates · last recorded {lastUpdated}
          </div>
        </SectionCard>
      </TableShell>

      {/* How rates are used */}
      <SectionCard className="mt-6" bodyClassName="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Lock className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-dark-900">Read-only history</p>
            <p className="mt-0.5 text-sm text-dark-900/50">
              A row is saved as &ldquo;how many <span className="font-medium">from</span> equal one{" "}
              <span className="font-medium">to</span>&rdquo;, so a CNY → USD row of 6.68 prices one yuan at
              about fifteen US cents and a ¥1,000 cart by dividing, at $149.70. Sourcing, quotes and checkout
              all read the live row through <span className="font-mono text-xs">src/lib/fx.ts</span>; to
              change a number go to{" "}
              <Link href="/admin/settings?tab=currency" className="font-semibold text-brand-600 hover:underline">
                Settings → Currency
              </Link>
              , which retires the previous row and keeps every old one here for audit.
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function AlertGlyph({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden="true">
      <path
        d="M6 1.2 11 10.4H1L6 1.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M6 4.6v2.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="6" cy="8.7" r="0.6" fill="currentColor" />
    </svg>
  );
}
