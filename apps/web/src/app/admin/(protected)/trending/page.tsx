"use client";

/**
 * Trending — Mission Control.
 *
 * WHAT THIS SCREEN IS
 * The customer home shelf is built by `fetchTrendingFeed()` in `src/lib/catalog.ts`
 * in one fixed order: staff pins (rank order) → the behaviour ranking from
 * `fn_trending_products` → and only if both are empty, products ordered by
 * `sales_count`. This screen is the only place where a human can affect the first
 * of those three buckets, see the second, and read the third for what it actually
 * is. Four panels, one truth:
 *
 *   1. SHELF     — the exact ordered list customers see. Reorder with the arrows
 *                  (or drag), pin/unpin, edit the internal note. Writes through
 *                  `reorderPinnedProducts` / `writeTrendingCuration`, which store
 *                  `{featured, rank, note, pinned_by, pinned_at}` in
 *                  `source_products.attributes._curation` (no column exists and no
 *                  DDL is available — see the header of lib/catalog.ts).
 *   2. BEHAVIOUR — the real ranking over `product_events`, with the scoring formula
 *                  written out instead of an opaque number.
 *   3. LEDGER    — the raw `admin_product_events_view` rows behind that score.
 *   4. PREVIEW   — the same `fetchTrendingFeed()` call the home page makes, so the
 *                  owner sees the served shelf before closing the tab.
 *
 * HONESTY RULES THIS PAGE IS BUILT AROUND
 *  - A failed read and an empty shelf are different sentences. `fetchPinnedProducts()`
 *    cannot tell them apart (it returns [] on error), so this page asks the same
 *    table a question that CAN answer — a head-count whose error it can see — and
 *    only shows "no pins yet" when the read actually succeeded.
 *  - A pin is a human choice. Every pinned card, badge and KPI says "Staff pick";
 *    nothing here renders a pin as organic popularity.
 *  - `sales_count` (the best-seller fallback) is a number copied off 1688/Taobao
 *    meaning "sold on THAT marketplace", not ChinaSuuq demand. Labelled that way
 *    everywhere it appears.
 *  - A partial save is not a save. If any rank write fails, the shelf lists which
 *    products did not move instead of reporting success.
 *
 * REALTIME
 * `product_events` is deliberately NOT added to the shell's LIVE_TABLES: the
 * dashboard subscribes to every unfiltered burst, so each customer view would
 * refetch the whole dashboard every 1.5 s. Pins do arrive live, because
 * `source_products` is already a live table (`useLiveVersion(["source_products"])`).
 * Everything else refreshes through the explicit buttons.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Eye,
  Flame,
  Info,
  ListChecks,
  Loader2,
  Pin,
  Plus,
  RefreshCw,
  Store,
  Tag,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  fetchBehaviourTrending,
  fetchPinnedProducts,
  fetchProductById,
  fetchTrendingFeed,
  reorderPinnedProducts,
  writeTrendingCuration,
  type CatalogProduct,
  type Locale,
  type TrendingFeed,
  type TrendingItem,
} from "@/lib/catalog";
import {
  FilterChips,
  PageGrid,
  PageHeader,
  SectionCard,
  SkeletonBlock,
  StatCard,
} from "@/components/admin/ui";
import { useToast } from "@/components/admin/Toast";
import Modal from "@/components/admin/Modal";
import { useUrlFilters } from "@/components/admin/useUrlFilters";
import { useLiveVersion } from "@/lib/admin/live-store";
import { cn } from "@/lib/utils";
import { SourceBadge, TrendingThumb } from "@/components/admin/trending/bits";
import {
  WINDOWS,
  formatNumber,
  formatScore,
  pickDisplayTitle,
  pinnerLabel,
  priceLabel,
  timeAgo,
  windowCaption,
  windowStartIso,
} from "@/components/admin/trending/helpers";
import TrendingShelf from "@/components/admin/trending/TrendingShelf";
import PinPicker from "@/components/admin/trending/PinPicker";
import BehaviourLeaderboard from "@/components/admin/trending/BehaviourLeaderboard";
import EventLedger from "@/components/admin/trending/EventLedger";
import PublishPreview from "@/components/admin/trending/PublishPreview";

type Tab = "shelf" | "behaviour" | "ledger" | "preview";

/** Module scope keeps `useUrlFilters` from re-parsing on every render. */
const FILTER_DEFAULTS: Record<string, string> = {
  tab: "shelf",
  window: "7",
  limit: "12",
  lang: "en",
};

/** The home section's own settings — the preview states when it differs. */
const HOME_LIMIT = 12;

const TABS: { value: Tab; label: string; icon: typeof Pin; hint: string }[] = [
  { value: "shelf", label: "Shelf", icon: Pin, hint: "The ordered staff-picked list customers see first" },
  { value: "behaviour", label: "Behaviour", icon: Flame, hint: "The live ranking over product_events" },
  { value: "ledger", label: "Event ledger", icon: ListChecks, hint: "Raw recorded customer actions" },
  { value: "preview", label: "Publish preview", icon: Eye, hint: "Exactly what the home page renders now" },
];

function clampDays(raw: string): number {
  const n = Number(raw);
  return WINDOWS.some((w) => w.days === n) ? n : 7;
}

function clampLimit(raw: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return HOME_LIMIT;
  return Math.max(1, Math.min(n, 60));
}

/** The short customer-facing line a pinned card carries on the home shelf. */
function homeLabel(item: TrendingItem): string {
  if (item.source === "pinned") return "Selected for you";
  if (item.source === "bestseller") {
    const market = item.product.marketplace ?? "";
    return market && market !== "unknown" ? `Best seller on ${market}` : "Best seller";
  }
  return typeof item.eventCount === "number" && item.eventCount > 0
    ? `Trending · ${formatNumber(item.eventCount)} view${item.eventCount === 1 ? "" : "s"}`
    : "Trending by views";
}

export default function AdminTrendingPage() {
  // useSearchParams() inside a statically prerendered route must sit behind a
  // Suspense boundary, or the prerenderer bails the whole page to full CSR.
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <SkeletonBlock className="h-12 w-72" />
          <PageGrid>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-28" />
            ))}
          </PageGrid>
          <SkeletonBlock className="h-64" />
        </div>
      }
    >
      <TrendingScreen />
    </Suspense>
  );
}

function TrendingScreen() {
  const toast = useToast();
  const { values, set } = useUrlFilters(FILTER_DEFAULTS);

  const tab = (TABS.some((t) => t.value === values.tab) ? values.tab : "shelf") as Tab;
  const days = clampDays(values.window);
  const limit = clampLimit(values.limit);
  const locale: Locale = values.lang === "so" ? "so" : "en";

  /* ─── State ───────────────────────────────────────────────────── */
  const [pins, setPins] = useState<CatalogProduct[]>([]);
  const [pinsLoading, setPinsLoading] = useState(true);
  /** Set only when the shelf read genuinely FAILED. Null means "the answer was:
   *  these pins", including the honest answer of an empty list. */
  const [pinsError, setPinsError] = useState<string | null>(null);
  const [pinnedBy, setPinnedBy] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const [eventsCount, setEventsCount] = useState<number | null>(null);
  const [eventsCountFailed, setEventsCountFailed] = useState(false);

  /** The head of the behaviour ranking, read here so the KPI strip is truthful
   *  even when the Behaviour tab has never been opened. */
  const [behaviourTop, setBehaviourTop] = useState<{ name: string; score: number } | null>(null);
  const [behaviourError, setBehaviourError] = useState<string | null>(null);

  /** The merged feed the home page would serve with these settings. */
  const [feed, setFeed] = useState<TrendingFeed | null>(null);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<TrendingItem | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // source_products is already a realtime table in the admin shell, so a pin
  // written in another tab lands here without any new subscription.
  const liveVersion = useLiveVersion(["source_products"]);

  /* ─── Reads ───────────────────────────────────────────────────── */
  const loadPins = useCallback(async (lang: Locale) => {
    setPinsLoading(true);
    const found = await fetchPinnedProducts(lang);
    // `fetchPinnedProducts` swallows its error and returns [] — which would let a
    // dead read wear the same face as "nobody has pinned anything". Ask the same
    // table a question that can report failure, and only then trust an empty list.
    const probe = await supabase
      .from("source_products")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");
    setPins(found);
    setPinsError(
      probe.error && found.length === 0
        ? `The shelf could not be read (${probe.error.message}). This is a failed read, not an empty shelf — check your connection and retry.`
        : null
    );
    setPinsLoading(false);
  }, []);

  useEffect(() => {
    void loadPins(locale);
  }, [loadPins, locale, refreshKey, liveVersion]);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const user = data.session?.user;
      setPinnedBy(user?.email ?? user?.id ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);

  /* Events in the selected window — a head-count, because the ledger table caps
   * its rows and a cap is not a total. */
  useEffect(() => {
    let alive = true;
    setEventsCount(null);
    setEventsCountFailed(false);
    (async () => {
      const { count, error } = await supabase
        .from("admin_product_events_view")
        .select("id", { count: "exact", head: true })
        .gte("created_at", windowStartIso(days));
      if (!alive) return;
      if (error) {
        setEventsCountFailed(true);
        setEventsCount(null);
      } else {
        setEventsCount(count ?? 0);
      }
    })();
    return () => {
      alive = false;
    };
  }, [days, refreshKey]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetchBehaviourTrending(days, 5);
      if (!alive) return;
      setBehaviourError(res.error);
      const top = res.rows[0];
      setBehaviourTop(top ? { name: top.name, score: top.score } : null);
    })();
    return () => {
      alive = false;
    };
  }, [days, refreshKey]);

  /* The served shelf. Same call, same settings as the home section, so the
   * Publish preview below and the KPI strip cannot disagree with each other. */
  const loadFeed = useCallback(async () => {
    setFeedLoading(true);
    setFeedError(null);
    const res = await fetchTrendingFeed({ days, limit, locale });
    setFeedLoading(false);
    if (!res.ok) {
      setFeed(null);
      setFeedError(res.reason);
      return;
    }
    setFeed(res.data);
  }, [days, limit, locale]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed, refreshKey]);

  /* ─── Writes ──────────────────────────────────────────────────── */
  const pinnedRank = useMemo(() => {
    const map = new Map<string, number>();
    pins.forEach((p, i) => map.set(p.id, p.curation.rank ?? i + 1));
    return map;
  }, [pins]);

  const handlePin = useCallback(
    async (product: CatalogProduct) => {
      const rank = pins.length + 1;
      const res = await writeTrendingCuration(product.id, { featured: true, rank }, pinnedBy);
      if (!res.ok) {
        toast.error(res.reason);
        return false;
      }
      toast.success(`Pinned — position ${rank} on the shelf`);
      await loadPins(locale);
      void loadFeed();
      return true;
    },
    [pins.length, pinnedBy, locale, loadPins, loadFeed, toast]
  );

  /**
   * Pin straight from the behaviour leaderboard — the owner's chosen way to seed
   * the shelf from demand that actually happened. The ledger row carries only an
   * id and a couple of display columns, so the product is re-read through the
   * same catalog helper the shelf uses before it is written; a product that has
   * since been removed or unlisted fails loudly instead of pinning a ghost.
   */
  const handlePinById = useCallback(
    async (productId: string): Promise<boolean> => {
      if (pinnedRank.has(productId)) {
        toast.info("That product is already on the shelf — reorder it on the Shelf tab");
        return false;
      }
      const res = await fetchProductById(productId, locale);
      if (!res.ok) {
        toast.error(res.reason);
        return false;
      }
      if (!res.data) {
        toast.error("That ranked product is no longer in the catalogue, so it cannot be pinned");
        return false;
      }
      return handlePin(res.data);
    },
    [pinnedRank, locale, handlePin, toast]
  );

  const handleUnpin = useCallback(
    async (id: string) => {      const name = pins.find((p) => p.id === id);
      const res = await writeTrendingCuration(id, { featured: false }, pinnedBy);
      if (!res.ok) {
        toast.error(res.reason);
        return false;
      }
      toast.success(
        `${name ? pickDisplayTitle(name, locale) : "Product"} unpinned — you can pin it again from Add picks`
      );
      await loadPins(locale);
      void loadFeed();
      return true;
    },
    [pins, pinnedBy, locale, loadPins, loadFeed, toast]
  );

  const handleSaveNote = useCallback(
    async (id: string, note: string) => {
      const res = await writeTrendingCuration(id, { note: note || null }, pinnedBy);
      if (!res.ok) {
        toast.error(res.reason);
        return false;
      }
      toast.success("Note saved — internal only, customers never see it");
      await loadPins(locale);
      return true;
    },
    [pinnedBy, locale, loadPins, toast]
  );

  /** Resolves to the ids whose rank write FAILED, so the shelf can list them. */
  const handlePersist = useCallback(
    async (orderedIds: string[]): Promise<string[]> => {
      setWorking(true);
      try {
        const res = await reorderPinnedProducts(orderedIds, pinnedBy);
        if (!res.ok) {
          toast.error(res.reason);
          return orderedIds;
        }
        const { written, failed } = res.data;
        if (failed.length > 0) {
          toast.error(`${failed.length} of ${orderedIds.length} positions did not save`);
        } else {
          toast.success(`Shelf order saved — ${written} position${written === 1 ? "" : "s"} written`);
        }
        await loadPins(locale);
        void loadFeed();
        return failed;
      } finally {
        setWorking(false);
      }
    },
    [pinnedBy, locale, loadPins, loadFeed, toast]
  );

  /* ─── Derived honesty flags ───────────────────────────────────── */
  const feedItems = feed?.items ?? [];
  const behaviourCards = feedItems.filter((i) => i.source === "behaviour").length;
  const bestsellerCards = feedItems.filter((i) => i.source === "bestseller").length;
  const shelfEmpty = !pinsLoading && !pinsError && pins.length === 0;
  const shareLabel = feed
    ? `${feed.pinnedCount} / ${Math.max(feedItems.length - feed.pinnedCount, 0)}`
    : "—";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trending"
        subtitle="The customer home shelf: staff picks first, then the live behaviour ranking, then marketplace best sellers. A pin is a human choice and is never shown as organic demand."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setPickerOpen(true);
                if (tab !== "shelf") set("tab", "shelf");
              }}
              className="admin-btn-primary h-9 px-3.5 text-xs"
            >
              <Plus className="h-4 w-4" /> Add picks
            </button>
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              disabled={pinsLoading || feedLoading}
              className="admin-btn-outline h-9 px-3 text-xs"
              title="Re-read the shelf, the ranking, the ledger and the preview"
            >
              <RefreshCw
                className={cn("h-4 w-4", pinsLoading || feedLoading ? "animate-spin" : "")}
              />
              Refresh
            </button>
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="admin-btn-ghost h-9 px-3 text-xs"
              title="Open the customer home in a new tab"
            >
              <ExternalLink className="h-4 w-4" /> Customer home
            </a>
          </div>
        }
      />

      {/* ─── Empty-shelf warning: what the home page will do instead ─── */}
      {shelfEmpty && (
        <div
          role="status"
          className="flex flex-wrap items-start gap-3 rounded-2xl border border-warning/30 bg-warning/5 px-4 py-3.5 text-sm text-warning"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Nothing is pinned — the home shelf falls back.</p>
            <p className="mt-0.5 text-[13px] leading-relaxed">
              {behaviourCards === 0 && bestsellerCards === 0
                ? "No staff picks and no recorded customer activity, so the home page will show its own empty state."
                : bestsellerCards > 0
                  ? `No staff picks, and the behaviour ranking has nothing in ${windowCaption(
                      days
                    )}, so the home page is currently serving ${bestsellerCards} card${
                      bestsellerCards === 1 ? "" : "s"
                    } ordered by sales_count — a number copied from the Chinese marketplace that means "sold there", not ChinaSuuq demand.`
                  : `No staff picks, so the home page is leading with the behaviour ranking for ${windowCaption(
                      days
                    )}. Pins you add go in front of it.`}
            </p>
          </div>
          <button
            onClick={() => {
              setPickerOpen(true);
              set("tab", "shelf");
            }}
            className="admin-btn-outline h-8 shrink-0 px-3 text-xs"
          >
            <Pin className="h-3.5 w-3.5" /> Pin products
          </button>
        </div>
      )}

      {/* A failed shelf read must never wear the empty state's clothes. */}
      {pinsError && (
        <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-error/30 bg-error/5 px-4 py-3.5 text-sm text-error">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="flex-1 leading-relaxed">{pinsError}</p>
          <button
            onClick={() => {
              setRefreshKey((k) => k + 1);
              void loadPins(locale);
            }}
            className="admin-btn-outline h-8 shrink-0 px-3 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {/* ─── KPI strip ────────────────────────────────────────────── */}
      <PageGrid className="grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Pins on the shelf"
          value={pinsError ? "—" : pins.length}
          icon={Pin}
          tone={pins.length > 0 ? "brand" : "warning"}
          delay={0}
        />
        <StatCard
          label="Staff picks / auto-filled"
          value={shareLabel}
          icon={Info}
          tone="info"
          delay={1}
        />
        <StatCard
          label={`Events · ${windowCaption(days).replace("the last ", "last ")}`}
          value={eventsCountFailed ? "—" : formatNumber(eventsCount)}
          icon={ListChecks}
          tone={eventsCount && eventsCount > 0 ? "success" : "violet"}
          delay={2}
        />
        <StatCard
          label="Most engaged"
          value={
            behaviourError
              ? "Read failed"
              : behaviourTop
                ? formatScore(behaviourTop.score)
                : "No activity"
          }
          icon={Flame}
          tone="error"
          delay={3}
        />
      </PageGrid>

      {behaviourTop && (
        <p className="-mt-3 text-[11px] text-dark-900/45 dark:text-neutral-500">
          Most engaged right now:{" "}
          <span className="font-semibold text-dark-900/70 dark:text-neutral-300">{behaviourTop.name}</span>{" "}
          (score {formatScore(behaviourTop.score)}).
        </p>
      )}

      {/* ─── Tabs ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips<Tab>
          options={TABS.map((t) => ({
            value: t.value,
            label: t.label,
            count:
              t.value === "shelf"
                ? pins.length
                : t.value === "behaviour"
                  ? undefined
                  : t.value === "ledger"
                    ? (eventsCount ?? undefined)
                    : feed ? feedItems.length : undefined,
          }))}
          value={tab}
          onChange={(next) => set("tab", next)}
        />
        {behaviourError && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-error">
            <AlertTriangle className="h-3.5 w-3.5" />
            The trending ranking RPC failed to answer — that is a dead read, not zero activity.
          </span>
        )}
      </div>

      {/* ─── SHELF ────────────────────────────────────────────────── */}
      {tab === "shelf" && (
        <SectionCard
          title="The shelf customers see"
          subtitle="Position 1 is the first card on the home page. Order saves in one pass; a pin is stored in the product's internal metadata, never as a product spec."
          actions={
            <button onClick={() => setPickerOpen(true)} className="admin-btn-outline h-8 px-3 text-xs">
              <Plus className="h-3.5 w-3.5" /> Add picks
            </button>
          }
        >
          <TrendingShelf
            items={pins}
            loading={pinsLoading}
            error={pinsError}
            onRetry={() => {
              setRefreshKey((k) => k + 1);
              void loadPins(locale);
            }}
            onPersist={handlePersist}
            onUnpin={handleUnpin}
            onSaveNote={handleSaveNote}
            onPreview={(product) =>
              setPreviewItem({
                product,
                source: "pinned",
                score: null,
                eventCount: null,
                rank: product.curation.rank,
              })
            }
            onAddPicks={() => setPickerOpen(true)}
          />
        </SectionCard>
      )}

      {/* ─── BEHAVIOUR ────────────────────────────────────────────── */}
      {tab === "behaviour" && (
        <SectionCard
          title="Live behaviour ranking"
          subtitle={`fn_trending_products over product_events — ${windowCaption(days)}. Every number here is customer activity, not a staff choice. Pinning a row moves it onto the staff shelf, where it is labelled as a human pick.`}
        >
          <BehaviourLeaderboard
            days={days}
            onChangeDays={(next) => set("window", String(next))}
            refreshKey={refreshKey}
            pinnedRank={pinnedRank}
            onPin={handlePinById}
          />
        </SectionCard>
      )}

      {/* ─── LEDGER ───────────────────────────────────────────────── */}
      {tab === "ledger" && (
        <SectionCard
          title="Event ledger"
          subtitle="One row per recorded customer action, newest first. The website and the app write these through record_product_event (once per product and action per 60 seconds, enforced in the database)."
        >
          <EventLedger
            refreshKey={refreshKey}
            days={days}
            onChangeDays={(next) => set("window", String(next))}
          />
        </SectionCard>
      )}

      {/* ─── PREVIEW ──────────────────────────────────────────────── */}
      {tab === "preview" && (
        <SectionCard
          title="Publish preview"
          subtitle="The same feed call the home section makes, so this order is the order a customer gets."
        >
          <PublishPreview
            days={days}
            onChangeDays={(next) => set("window", String(next))}
            limit={limit}
            onChangeLimit={(next) => set("limit", String(next))}
            locale={locale}
            onChangeLocale={(next) => set("lang", next)}
            feed={feed}
            loading={feedLoading}
            error={feedError}
            onRetry={() => void loadFeed()}
          />
        </SectionCard>
      )}

      {/* ─── What decides the order, said once in plain words ─────── */}
      <div className="grid gap-3 rounded-2xl border border-dark-900/[0.06] bg-white p-4 text-[12px] leading-relaxed text-dark-900/60 shadow-sm sm:grid-cols-3 dark:border-white/[0.08] dark:bg-dark-900 dark:text-neutral-400">
        <p>
          <span className="font-bold text-dark-900 dark:text-neutral-200">Staff picks</span> come first, in
          the rank order you set here. They are a human choice and are labelled &quot;Selected for you&quot;, never
          &quot;trending&quot;.
        </p>
        <p>
          <span className="font-bold text-dark-900 dark:text-neutral-200">Behaviour</span> fills the rest from
          real events: view 1×, search click 2×, add-to-cart 4×, order 8×, each decayed with a 3-day half-life.
        </p>
        <p>
          <span className="font-bold text-dark-900 dark:text-neutral-200">Best sellers</span> appear only when
          both above are empty. That is 1688/Taobao sales counts — market-wide, not our customers.
        </p>
      </div>

      {/* ─── Pin picker (side panel) ──────────────────────────────── */}
      <PinPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        pinnedRank={pinnedRank}
        onPin={handlePin}
      />

      {/* ─── Customer card preview ────────────────────────────────── */}
      <Modal open={previewItem !== null} onClose={() => setPreviewItem(null)} title="How this card reaches the customer" maxWidth="max-w-md">
        {previewItem && (
          <div>
            <div className="mx-auto w-56">
              <div className="relative flex flex-col overflow-hidden rounded-2xl border border-dark-900/[0.06] bg-white shadow-sm dark:border-white/[0.08] dark:bg-dark-900">
                <TrendingThumb
                  product={previewItem.product}
                  className="aspect-[4/5] w-full"
                  rounded="rounded-none"
                />
                <div className="flex flex-1 flex-col p-3">
                  <p className="line-clamp-2 min-h-[2.5em] text-xs font-semibold leading-snug text-dark-900 dark:text-neutral-100">
                    {pickDisplayTitle(previewItem.product, locale)}
                  </p>
                  {(() => {
                    const { text, approx } = priceLabel(previewItem.product);
                    return (
                      <div className="mt-2 flex items-baseline gap-1.5">
                        <span className="text-sm font-bold text-dark-900 dark:text-neutral-100">{text}</span>
                        {approx && <span className="text-[10px] text-dark-900/40">CNY</span>}
                      </div>
                    );
                  })()}
                  <p className="mt-1.5 text-[10px] font-medium text-brand-600 dark:text-brand-400">
                    {homeLabel(previewItem)}
                  </p>
                </div>
              </div>
            </div>

            <dl className="mt-5 space-y-2 text-[13px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-dark-900/45 dark:text-neutral-500">Why it is here</dt>
                <dd>
                  <SourceBadge source={previewItem.source} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-dark-900/45 dark:text-neutral-500">Shelf position</dt>
                <dd className="font-semibold text-dark-900 dark:text-neutral-100">
                  {previewItem.rank ?? "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-dark-900/45 dark:text-neutral-500">Marketplace</dt>
                <dd className="inline-flex items-center gap-1 font-medium text-dark-900 dark:text-neutral-100">
                  <Store className="h-3.5 w-3.5" />
                  {previewItem.product.marketplace || "unknown"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-dark-900/45 dark:text-neutral-500">Category</dt>
                <dd className="inline-flex items-center gap-1 font-medium text-dark-900 dark:text-neutral-100">
                  <Tag className="h-3.5 w-3.5" />
                  {previewItem.product.categoryName ?? "Uncategorised"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-dark-900/45 dark:text-neutral-500">Pinned by</dt>
                <dd className="font-medium text-dark-900 dark:text-neutral-100">
                  {pinnerLabel(previewItem.product.curation.pinned_by)} ·{" "}
                  {timeAgo(previewItem.product.curation.pinned_at)}
                </dd>
              </div>
            </dl>

            {previewItem.product.curation.note && (
              <p className="mt-3 rounded-xl bg-warm-50 px-3 py-2 text-[12px] italic text-dark-900/60 dark:bg-dark-800 dark:text-neutral-400">
                Internal note — “{previewItem.product.curation.note}”. Customers never see this, and it is not
                a product spec.
              </p>
            )}

            {Object.keys(previewItem.product.attributes).length > 0 && (
              <p className="mt-2 flex items-start gap-1.5 text-[11px] text-dark-900/45 dark:text-neutral-500">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Specs a customer would see: {Object.keys(previewItem.product.attributes).join(", ")} — keys
                starting with an underscore are stripped by the data layer and never reach this list.
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <a
                href={`/product/?id=${encodeURIComponent(previewItem.product.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="admin-btn-primary h-9 px-3.5 text-xs"
              >
                <ExternalLink className="h-4 w-4" /> Open the real product page
              </a>
              <Link
                href={`/admin/products?q=${encodeURIComponent(previewItem.product.title || previewItem.product.id)}`}
                className="admin-btn-ghost h-9 px-3 text-xs"
              >
                Edit in Products
              </Link>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-dark-900/45 dark:text-neutral-500">
              Opening the customer page records a real view event, exactly like a customer visit would — that
              is how the behaviour ranking gets its data.
            </p>
          </div>
        )}
      </Modal>

      {/* ─── Loading truth for the tab bar counts ─────────────────── */}
      {pinsLoading && (
        <p className="flex items-center gap-2 text-[11px] text-dark-900/45 dark:text-neutral-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the shelf…
        </p>
      )}

      {/* Saved-but-stale guard: the preview feed and the shelf can never disagree,
          because both come from this one screen's reads. */}
      {feed && feed.servedFrom === "cache" && tab !== "preview" && (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-warning/25 bg-warning/5 px-3 py-2 text-[11px] text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          The trending ranking was unreachable when this page last read it, so the preview numbers come from
          the saved feed, not a live read. Open Publish preview and refresh it.
        </p>
      )}

      {tab === "shelf" && pins.length > 0 && !working && (
        <p className="flex items-center gap-2 text-[11px] text-dark-900/40 dark:text-neutral-500">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          {pins.length} pin{pins.length === 1 ? "" : "s"} currently published to the home shelf.
        </p>
      )}

      {tab === "shelf" && pins.length > 0 && working && (
        <p className="flex items-center gap-2 text-[11px] text-dark-900/40 dark:text-neutral-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving ranks…
        </p>
      )}
    </div>
  );
}
