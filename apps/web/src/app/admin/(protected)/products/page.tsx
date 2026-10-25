"use client";

/**
 * Products — Mission Control product console.
 *
 * WHAT REPLACED THE OLD SCREEN
 * The previous page did `.limit(1000)` + a client-side `.filter()`, so its "Total"
 * KPI reported the loaded page (not the catalogue), a filtered view could never
 * show a 1001st product, and editing wrote one of THREE payload shapes until one
 * was accepted. This console:
 *   - runs EVERY filter, search, sort and page through `fetchAdminProducts` (server
 *     side, PostgREST `count:exact`) — it never slices a loaded page client-side;
 *   - reads real catalogue-wide KPIs from `fetchCatalogKpis` (head counts, never the
 *     page), so a null count renders as "—" not 0;
 *   - edits through the one-shape `ProductFormPanel` (buildProductPayload sends only
 *     changed columns) in a right drawer; the row updates in place on save.
 *
 * HONESTY (the law this whole console obeys)
 *   - A FAILED READ is not an empty result. `ok:false` renders the `reason`; we never
 *     paint a dead query as "no products" or as skeletons.
 *   - Empty search results are "these filters matched nothing", not "the catalogue is
 *     broken".
 *   - Bulk writes name the failed groups and the RLS-refused rows (`bulkWriteNotice`
 *     verbatim); we never pretend a partial write fully succeeded.
 *   - The USD on a row is either the STORED estimate or a number explicitly labelled
 *     as converted at the current rate — never a silent derivation.
 *
 * PERMISSIONS
 * The admin layout already gates this route to staff (RLS `is_staff_or_admin()`).
 * There is no catalog-write key in `PERMISSIONS`, so write affordances additionally
 * require the permission read to have ANSWERED without failing: while it is loading
 * or failed, this screen is browse-only with an explanation (deny-on-unknown). The
 * real boundary is still the database's RLS.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownUp,
  Check,
  CheckSquare,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Grid3x3,
  ImageOff,
  LayoutList,
  Loader2,
  Package,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  RotateCcw,
  Rows3,
  Square,
  Link2,
  Trash2,
  Pencil,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn, formatCNY, formatUSD } from "@/lib/utils";
import { useFx, roundCents, usdFromCny } from "@/lib/fx";
import {
  fetchCategories,
  syncProductCategoryIds,
  writeTrendingCuration,
  type CatalogPage,
  type CatalogProduct,
  type CategoryRow,
  type CategorySyncResult,
} from "@/lib/catalog";
import {
  MARKETPLACE_CODES,
  PRODUCT_STATUSES,
  STOCK_STATUSES,
  UNCATEGORISED,
  fetchAdminProducts,
  fetchCatalogKpis,
  fetchCategoryCounts,
  duplicateProduct,
  quickSetStatus,
  bulkWrite,
  bulkWriteNotice,
  bulkSetFeature,
  type AdminProductSort,
  type CatalogKpis,
} from "@/lib/admin/productWrites";
import {
  EMPTY_IMAGES,
  FilterChips,
  PageGrid,
  PageHeader,
  SearchInput,
  SectionCard,
  SkeletonBlock,
  SkeletonTable,
  StatCard,
  TableShell,
} from "@/components/admin/ui";
import ProductFormPanel from "@/components/admin/products/ProductFormPanel";
import { useToast } from "@/components/admin/Toast";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import Modal from "@/components/admin/Modal";
import { PartialJoinNotice } from "@/components/admin/PartialJoinNotice";
import { TrendingThumb } from "@/components/admin/trending/bits";
import { formatNumber, timeAgo, titlePair } from "@/components/admin/trending/helpers";
import { useUrlFilters, useDebouncedFilterValue } from "@/components/admin/useUrlFilters";
import { useLiveVersion } from "@/lib/admin/live-store";
import {
  permissionCheckFailureNotice,
  useAdminPermissions,
} from "@/lib/admin/permissions";
import { motion, AnimatePresence } from "framer-motion";

/* ── Constants ─────────────────────────────────────────────────── */

const PAGE_SIZES = [12, 24, 48, 96] as const;

const SORT_OPTIONS: { value: AdminProductSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "sales", label: "Most sales" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

const STATUS_OPTIONS = ["All", ...PRODUCT_STATUSES] as const;
const STOCK_OPTIONS = ["All", ...STOCK_STATUSES] as const;

/** module scope keeps useUrlFilters' identity stable (else its effect loops). */
const FILTER_DEFAULTS: Record<string, string> = {
  q: "",
  status: "All",
  stock: "All",
  app: "All",
  cat: "All",
  sort: "newest",
  size: "24",
  view: "table",
  page: "1",
};

/** Which filter the "restricted" notice explains on this screen. */
const READ_ONLY_BANNER =
  "You can browse the catalogue. Add, edit, duplicate, re-status, feature and delete are hidden until the staff-permission check completes successfully.";

/** Marketplace chip tone — the dashboard paints every Chinese source warm. */
const MARKETPLACE_TINT: Record<string, string> = {
  "1688": "bg-brand-50 text-brand-700 border-brand-200",
  taobao: "bg-brand-100 text-brand-700 border-brand-200",
  yiwugo: "bg-brand-100 text-brand-600 border-brand-300",
  chinagoods: "bg-brand-50 text-brand-700 border-brand-200",
  chinasuuq: "bg-success/10 text-success border-success/25",
};

type ViewMode = "table" | "grid";

/* ── Small pure readers ────────────────────────────────────────── */

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(n, max));
}

function pickSize(raw: string): number {
  return (PAGE_SIZES as readonly number[]).includes(Number(raw)) ? Number(raw) : 24;
}

function pickSort(raw: string): AdminProductSort {
  return SORT_OPTIONS.some((s) => s.value === raw) ? (raw as AdminProductSort) : "newest";
}

function pickView(raw: string): ViewMode {
  return raw === "grid" ? "grid" : "table";
}

/**
 * The row's money, labelled for what it actually is.
 *  - CNY (the supplier price) is the real stored number.
 *  - USD is shown ONLY as (a) the stored `price_usd_estimated`, tagged "est.", or
 *    (b) a conversion at the current rate, tagged "converted". We never print a
 *    dollar figure that silently changes depending on a live rate with no label.
 */
function priceView(p: CatalogProduct, fx: { cnyPerUsd: number }): { cny: string; usd: string | null; usdKind: "stored" | "converted" | null } {
  const cny = p.priceCnyMin !== null ? formatCNY(p.priceCnyMin) : "No CNY price";
  if (p.priceUsd !== null) return { cny, usd: formatUSD(p.priceUsd), usdKind: "stored" };
  if (p.priceCnyMin !== null && p.priceCnyMin > 0 && fx.cnyPerUsd > 0) {
    return { cny, usd: formatUSD(roundCents(usdFromCny(p.priceCnyMin, fx.cnyPerUsd))), usdKind: "converted" };
  }
  return { cny, usd: null, usdKind: null };
}

function marketplaceLabel(code: string): string {
  const found = MARKETPLACE_CODES.find((m) => m === code);
  if (found) return found;
  return code || "unknown";
}

/**
 * Honest single-row delete. `bulkWrite` exists for multi-select, but a one-row
 * delete needs its own crisp verdict (deleted / blocked-by-RLS / request-failed),
 * so this mirrors that same three-way outcome for one id.
 */
async function deleteOneProduct(id: string): Promise<{ deleted: boolean; reason: string | null }> {
  const { data, error } = await supabase.from("source_products").delete().eq("id", id).select("id");
  if (error) return { deleted: false, reason: error.message };
  const gone = (data as Array<{ id: string }> | null) ?? [];
  if (gone.length === 0) {
    return { deleted: false, reason: "Nothing was deleted — your role's row-level security refused it, or the product was already gone." };
  }
  return { deleted: true, reason: null };
}

/* ── Page ──────────────────────────────────────────────────────── */

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <SkeletonBlock className="h-12 w-64" />
          <PageGrid className="sm:grid-cols-2 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-28" />
            ))}
          </PageGrid>
          <SkeletonBlock className="h-16" />
          <SkeletonTable />
        </div>
      }
    >
      <ProductsConsole />
    </Suspense>
  );
}

function ProductsConsole() {
  const toast = useToast();
  const fx = useFx();
  const perms = useAdminPermissions();
  const { values, set, setMany, reset, isFiltered } = useUrlFilters(FILTER_DEFAULTS);
  const liveVersion = useLiveVersion(["source_products"]);

  // RBAC: deny writes while the check is loading or failed (browse-only otherwise).
  const canEdit = !perms.loading && !perms.checksFailed;
  const restrictedNotice = permissionCheckFailureNotice(perms);

  /* ── Derived, clamped filter values ── */
  const status = STATUS_OPTIONS.some((s) => s === values.status) ? values.status : "All";
  const stock = STOCK_OPTIONS.some((s) => s === values.stock) ? values.stock : "All";
  const app = MARKETPLACE_CODES.some((m) => m === values.app) ? values.app : "All";
  const category = values.cat || "All";
  const sort = pickSort(values.sort);
  const size = pickSize(values.size);
  const view = pickView(values.view);
  const page = clampInt(values.page, 1, 100000, 1);

  const commitSearch = useCallback((v: string) => setMany({ q: v, page: "" }), [setMany]);
  const [searchDraft, setSearchDraft] = useDebouncedFilterValue(values.q, commitSearch);

  /* ── Reads ── */
  const [pageData, setPageData] = useState<CatalogPage | null>(null);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [rowsError, setRowsError] = useState<string | null>(null);

  const [kpis, setKpis] = useState<CatalogKpis | null>(null);
  const [kpiLoading, setKpiLoading] = useState(true);

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number | null>>({});
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  const [reloadToken, setReloadToken] = useState(0);
  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  /* ── Selection / bulk ── */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<null | string>(null);
  const [bulkNotice, setBulkNotice] = useState<string[]>([]);

  /* ── Panel (add / edit drawer) ── */
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelProduct, setPanelProduct] = useState<CatalogProduct | null>(null);
  const [panelNonce, setPanelNonce] = useState(0);

  /* ── Delete confirm ── */
  const [deleteTarget, setDeleteTarget] = useState<CatalogProduct | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ── Category sync dialog ── */
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncPreview, setSyncPreview] = useState<CategorySyncResult | null>(null);
  const [syncApplied, setSyncApplied] = useState<CategorySyncResult | null>(null);

  /* ── pinnedBy for curation writes ── */
  const [pinnedBy, setPinnedBy] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const u = data.session?.user;
      setPinnedBy(u?.email ?? u?.id ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);

  /* ── Esc closes the drawer ── */
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen]);

  /* ── Page read (server-side; NEVER client-side filtered) ── */
  useEffect(() => {
    let alive = true;
    setRowsLoading(true);
    setRowsError(null);
    fetchAdminProducts({
      status,
      stock,
      marketplace: app,
      category,
      search: values.q,
      sort,
      page,
      pageSize: size,
    }).then((res) => {
      if (!alive) return;
      if (res.ok) {
        setPageData(res.data);
      } else {
        setPageData(null);
        setRowsError(res.reason);
      }
      setRowsLoading(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, stock, app, category, values.q, sort, page, size, liveVersion, reloadToken]);

  /* ── KPI read (whole catalogue) ── */
  useEffect(() => {
    let alive = true;
    setKpiLoading(true);
    fetchCatalogKpis().then((k) => {
      if (alive) {
        setKpis(k);
        setKpiLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [liveVersion, reloadToken]);

  /* ── Categories + per-category counts ── */
  const loadCategories = useCallback(() => {
    fetchCategories({ includeInactive: true }).then(async (res) => {
      if (!res.ok) {
        setCategoriesError(res.reason);
        return;
      }
      // A successful read (even a partial one) clears any earlier failure message.
      setCategoriesError(null);
      setCategories(res.data);
      const counts = await fetchCategoryCounts(res.data);
      setCategoryCounts(counts);
    });
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories, liveVersion, reloadToken]);

  /* ── Selection helpers ── */
  const currentRows = pageData?.products ?? [];
  const allOnPageSelected = currentRows.length > 0 && currentRows.every((p) => selected.has(p.id));
  const selectedCount = selected.size;

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectAll = () =>
    setSelected((prev) => {
      if (allOnPageSelected) {
        const next = new Set(prev);
        currentRows.forEach((p) => next.delete(p.id));
        return next;
      }
      const next = new Set(prev);
      currentRows.forEach((p) => next.add(p.id));
      return next;
    });

  const clearSelection = () => setSelected(new Set());

  /* ── In-place row mutation helpers ── */
  const patchRow = useCallback((id: string, patch: Partial<CatalogProduct>) => {
    setPageData((prev) =>
      prev ? { ...prev, products: prev.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) } : prev
    );
  }, []);

  const removeRow = useCallback((id: string) => {
    setPageData((prev) =>
      prev ? { ...prev, products: prev.products.filter((p) => p.id !== id), total: Math.max(0, prev.total - 1) } : prev
    );
  }, []);

  /* ── Panel open/close ── */
  const openAdd = () => {
    setPanelProduct(null);
    setPanelNonce((n) => n + 1);
    setPanelOpen(true);
  };
  const openEdit = (p: CatalogProduct) => {
    setPanelProduct(p);
    setPanelNonce((n) => n + 1);
    setPanelOpen(true);
  };
  const closePanel = () => {
    setPanelOpen(false);
    setPanelProduct(null);
  };

  /* ── onSaved: refresh the row in place ── */
  const handleSaved = useCallback(
    (saved: CatalogProduct, isNew: boolean) => {
      if (!isNew) {
        patchRow(saved.id, saved);
        toast.success("Product updated");
        refresh(); // KPIs + counts may have moved (status / category)
        closePanel();
        return;
      }
      // Create: the new row may sort into any page or match the current filters
      // differently, so re-run the read rather than guessing where it lands.
      toast.success("Product created");
      loadCategories();
      refresh();
      if (panelOpen) {
        // Keep the drawer open on a fresh empty form ("add another").
        setPanelNonce((n) => n + 1);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patchRow, toast, refresh, loadCategories, panelOpen]
  );

  /* ── Row actions ── */
  const handleDuplicate = async (p: CatalogProduct) => {
    const res = await duplicateProduct(p);
    if (!res.ok) {
      toast.error(res.reason);
      return;
    }
    toast.success("Duplicated as a draft");
    refresh();
    openEdit(res.data);
  };

  const handleQuickStatus = async (p: CatalogProduct) => {
    // active ⇄ draft; archived is reached from the edit panel / bulk menu.
    const next = p.status === "active" ? "draft" : "active";
    const res = await quickSetStatus(p.id, next);
    if (!res.ok) {
      toast.error(res.reason);
      return;
    }
    patchRow(p.id, { status: next });
    toast.success(next === "active" ? "Published (active)" : "Moved to draft");
  };

  const handleFeature = async (p: CatalogProduct) => {
    const turningOn = !p.curation.featured;
    const res = await writeTrendingCuration(p.id, { featured: turningOn }, pinnedBy);
    if (!res.ok) {
      toast.error(res.reason);
      return;
    }
    patchRow(p.id, { curation: { ...p.curation, ...res.data } });
    toast.success(turningOn ? "Added to Trending as a staff pick" : "Removed from Trending");
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await deleteOneProduct(deleteTarget.id);
    setDeleting(false);
    if (!res.deleted) {
      toast.error(res.reason ?? "Delete failed");
      return;
    }
    removeRow(deleteTarget.id);
    setSelected((prev) => {
      const n = new Set(prev);
      n.delete(deleteTarget.id);
      return n;
    });
    toast.success("Product deleted");
    setDeleteTarget(null);
    refresh();
  };

  /* ── Bulk actions ── */
  const ids = useMemo(() => Array.from(selected), [selected]);

  const runBulkStatus = async (next: string) => {
    if (!ids.length) return;
    setBulkBusy("status");
    setBulkNotice([]);
    try {
      const res = await bulkWrite(
        ids,
        `status→${next}`,
        (batch) =>
          supabase
            .from("source_products")
            .update({ status: next, updated_at: new Date().toISOString() })
            .in("id", batch)
            .select("id")
      );
      const written = new Set(res.affected);
      if (written.size) {
        setPageData((prev) =>
          prev ? { ...prev, products: prev.products.map((p) => (written.has(p.id) ? { ...p, status: next } : p)) } : prev
        );
      }
      setSelected(new Set(res.failed)); // keep only the retryable ones selected
      const notice = bulkWriteNotice("updated", res);
      setBulkNotice(notice);
      if (res.affected.length) toast.success(`${formatNumber(res.affected.length)} updated to ${next}`);
      else if (res.failed.length) toast.error(notice[0]);
      else toast.error("Blocked by permissions — nothing was updated");
      refresh();
    } finally {
      setBulkBusy(null);
    }
  };

  const runBulkFeature = async (featured: boolean) => {
    if (!ids.length) return;
    setBulkBusy("feature");
    setBulkNotice([]);
    try {
      const res = await bulkSetFeature(ids, featured, pinnedBy);
      const done = new Set(res.changed);
      if (done.size) refresh();
      if (res.failures.length) {
        setBulkNotice([
          `${formatNumber(res.failures.length)} of ${formatNumber(ids.length)} product${ids.length === 1 ? "" : "s"} could not be ${featured ? "featured" : "un-featured"} — that is a failed write, not "already done". Reasons: ${res.failures
            .slice(0, 3)
            .map((f) => f.reason)
            .join("; ")}${res.failures.length > 3 ? " (+ more)" : ""}`,
        ]);
        toast.error(`${formatNumber(res.failures.length)} not ${featured ? "featured" : "un-featured"}`);
      } else {
        toast.success(`${formatNumber(res.changed.length)} ${featured ? "added to Trending" : "removed from Trending"}`);
      }
      clearSelection();
    } finally {
      setBulkBusy(null);
    }
  };

  const runBulkDelete = async () => {
    if (!ids.length) return;
    setBulkBusy("delete");
    setBulkNotice([]);
    try {
      const res = await bulkWrite(
        ids,
        "delete",
        (batch) => supabase.from("source_products").delete().in("id", batch).select("id")
      );
      const gone = new Set(res.affected);
      if (gone.size) {
        setPageData((prev) =>
          prev
            ? { ...prev, products: prev.products.filter((p) => !gone.has(p.id)), total: Math.max(0, prev.total - gone.size) }
            : prev
        );
      }
      setSelected(new Set(res.failed));
      const notice = bulkWriteNotice("deleted", res);
      setBulkNotice(notice);
      if (res.affected.length) toast.success(`${formatNumber(res.affected.length)} deleted`);
      else if (res.failed.length) toast.error(notice[0]);
      else toast.error("Blocked by permissions — nothing was deleted");
      refresh();
    } finally {
      setBulkBusy(null);
    }
  };

  /* ── Category sync (dry-run first, apply only on a deliberate click) ── */
  const openSync = async () => {
    setSyncOpen(true);
    setSyncPreview(null);
    setSyncApplied(null);
    setSyncError(null);
    setSyncBusy(true);
    const res = await syncProductCategoryIds({ dryRun: true });
    setSyncBusy(false);
    if (!res.ok) {
      setSyncError(res.reason);
      return;
    }
    setSyncPreview(res.data);
  };

  const applySync = async () => {
    setSyncBusy(true);
    setSyncError(null);
    const res = await syncProductCategoryIds({ dryRun: false });
    setSyncBusy(false);
    if (!res.ok) {
      setSyncError(res.reason);
      return;
    }
    setSyncApplied(res.data);
    loadCategories();
    refresh();
  };

  /* ── CSV export of the CURRENT server page (never the hidden whole table) ── */
  const exportCsv = () => {
    if (!currentRows.length) {
      toast.info("Nothing to export on this page");
      return;
    }
    const headers = ["Title", "Category", "Marketplace", "Price (CNY)", "Stored USD est.", "MOQ", "Stock", "Status", "Sales", "Updated", "Source URL"];
    const rows = currentRows.map((p) => {
      const { usd } = priceView(p, fx);
      return [
        p.title || p.title_original || "",
        p.categoryName ?? "",
        p.marketplace ?? "",
        p.priceCnyMin !== null ? String(p.priceCnyMin) : "",
        usd ?? "",
        p.moq !== null && p.moq !== undefined ? String(p.moq) : "",
        p.stock_status ?? "",
        p.status ?? "",
        String(p.sales_count ?? 0),
        p.updated_at ?? "",
        p.source_url ?? "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
    });
    const csv = [headers.map((h) => `"${h}"`), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `products-page-${page}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${currentRows.length} products (this page)`);
  };

  /* ── Active-filter summary + reset ── */
  const filtersActive = isFiltered;
  const clearFilters = () => {
    reset();
    setSearchDraft("");
  };

  const totalPages = pageData ? Math.max(1, Math.ceil(pageData.total / pageData.pageSize)) : 1;
  const goPage = (n: number) => set("page", n <= 1 ? "" : String(n));

  const kpiErrorLine = kpis && kpis.errors.length ? kpis.errors : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        subtitle="Every product synced from the Chinese marketplaces. All filtering runs server-side — this list is a page, not the whole catalogue."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={refresh}
              className="admin-btn-ghost h-9 px-3 text-xs"
              title="Re-read the catalogue counts and this page"
            >
              <RefreshCw className={cn("h-4 w-4", rowsLoading || kpiLoading ? "animate-spin" : undefined)} />
              Refresh
            </button>
            <button onClick={exportCsv} className="admin-btn-outline h-9 px-3 text-xs">
              <Download className="h-4 w-4" />
              Export page
            </button>
            {canEdit && (
              <button onClick={openSync} className="admin-btn-outline h-9 px-3 text-xs" title="Preview, then optionally apply, the category_id backfill">
                <Link2 className="h-4 w-4" />
                Wire categories
              </button>
            )}
            {canEdit && (
              <button onClick={openAdd} className="admin-btn-primary h-9 px-3.5 text-xs">
                <Plus className="h-4 w-4" />
                Add product
              </button>
            )}
          </div>
        }
      />

      {/* Browse-only banner when writes are gated off */}
      {!canEdit && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Browse-only</p>
            <p className="mt-0.5 text-[13px] leading-relaxed">
              {restrictedNotice ?? READ_ONLY_BANNER}
            </p>
          </div>
          <button onClick={perms.reload} className="admin-btn-outline h-8 shrink-0 px-3 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            Check again
          </button>
        </div>
      )}

      {/* ── KPI strip: real catalogue-wide counts (null = "—", never 0) ── */}
      <PageGrid className="grid-cols-2 lg:grid-cols-6">
        <StatCard label="Total products" value={kpiCell(kpis?.total, kpiLoading)} icon={Package} tone="brand" delay={0} />
        <StatCard label="Active" value={kpiCell(kpis?.active, kpiLoading)} icon={Check} tone="success" delay={1} />
        <StatCard label="Draft" value={kpiCell(kpis?.draft, kpiLoading)} icon={Pencil} tone="info" delay={2} />
        <StatCard label="Archived" value={kpiCell(kpis?.archived, kpiLoading)} icon={Eye} tone="violet" delay={3} />
        <StatCard label="Low stock" value={kpiCell(kpis?.lowStock, kpiLoading)} icon={AlertTriangle} tone="warning" delay={4} />
        <StatCard label="Out of stock" value={kpiCell(kpis?.outOfStock, kpiLoading)} icon={ImageOff} tone="error" delay={5} />
      </PageGrid>

      {kpiErrorLine && (
        <p className="-mt-3 flex items-start gap-1.5 text-[11px] text-dark-900/50 dark:text-neutral-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          Some counts did not load ({kpiErrorLine.join("; ")}). A dash above is an unknown number, not zero.
        </p>
      )}

      {/* ── Toolbar: search + server-side filters + view/paging ── */}
      <SectionCard bodyClassName="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            value={searchDraft}
            onChange={(v) => setSearchDraft(v)}
            placeholder="Search title or category…"
            className="w-full sm:max-w-xs"
          />

          <div className="flex flex-wrap items-center gap-2">
            {/* view toggle */}
            <div className="flex items-center gap-0.5 rounded-xl border border-dark-900/10 bg-white p-0.5 dark:border-white/10 dark:bg-dark-900">
              <button
                onClick={() => set("view", "table")}
                aria-pressed={view === "table"}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition-colors",
                  view === "table" ? "bg-brand-500 text-white" : "text-dark-900/55 hover:text-dark-900 dark:text-neutral-400"
                )}
              >
                <LayoutList className="h-3.5 w-3.5" /> Table
              </button>
              <button
                onClick={() => set("view", "grid")}
                aria-pressed={view === "grid"}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition-colors",
                  view === "grid" ? "bg-brand-500 text-white" : "text-dark-900/55 hover:text-dark-900 dark:text-neutral-400"
                )}
              >
                <Grid3x3 className="h-3.5 w-3.5" /> Grid
              </button>
            </div>

            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-dark-900/50 dark:text-neutral-400">
              <ArrowDownUp className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only">Sort</span>
              <select
                value={sort}
                onChange={(e) => setMany({ sort: e.target.value === FILTER_DEFAULTS.sort ? "" : e.target.value, page: "" })}
                className="admin-input h-9 py-0 text-xs"
                aria-label="Sort products"
              >
                {SORT_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-dark-900/50 dark:text-neutral-400">
              <Rows3 className="h-3.5 w-3.5" />
              <select
                value={String(size)}
                onChange={(e) => setMany({ size: e.target.value === FILTER_DEFAULTS.size ? "" : e.target.value, page: "" })}
                className="admin-input h-9 py-0 text-xs"
                aria-label="Rows per page"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* status + stock chips */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-dark-900/40 dark:text-neutral-500">Lifecycle status</p>
            <FilterChips<string>
              options={STATUS_OPTIONS.map((s) => ({
                value: s,
                label: s === "All" ? "All statuses" : s,
              }))}
              value={status}
              onChange={(v) => setMany({ status: v === "All" ? "" : v, page: "" })}
            />
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-dark-900/40 dark:text-neutral-500">Stock</p>
            <FilterChips<string>
              options={STOCK_OPTIONS.map((s) => ({
                value: s,
                label: s === "All" ? "All stock" : s.replace(/_/g, " "),
              }))}
              value={stock}
              onChange={(v) => setMany({ stock: v === "All" ? "" : v, page: "" })}
            />
          </div>
        </div>

        {/* marketplace + category selects */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-dark-900/40 dark:text-neutral-500">Marketplace</span>
            <select
              value={app}
              onChange={(e) => setMany({ app: e.target.value === "All" ? "" : e.target.value, page: "" })}
              className="admin-input"
            >
              <option value="All">All marketplaces</option>
              {MARKETPLACE_CODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-dark-900/40 dark:text-neutral-500">Category</span>
            <select
              value={category}
              onChange={(e) => setMany({ cat: e.target.value === "All" ? "" : e.target.value, page: "" })}
              className="admin-input"
              disabled={!!categoriesError}
            >
              <option value="All">All categories</option>
              <option value={UNCATEGORISED}>
                {`Uncategorised${categoryCounts[UNCATEGORISED] != null ? ` (${formatNumber(categoryCounts[UNCATEGORISED])})` : ""}`}
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {`${c.name_en ?? c.name_so ?? "Unnamed"}${categoryCounts[c.id] != null ? ` (${formatNumber(categoryCounts[c.id])})` : ""}`}
                </option>
              ))}
            </select>
            {categoriesError && (
              <p className="text-[11px] text-warning">
                Categories could not be loaded ({categoriesError}). The category filter is unavailable until this read succeeds — that is a failed read, not "no categories".
              </p>
            )}
          </label>
        </div>

        {/* count line + reset */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dark-900/[0.06] pt-3 text-xs text-dark-900/55 dark:border-white/[0.08] dark:text-neutral-400">
          <span>
            {pageData ? (
              <>
                <span className="font-semibold text-dark-900 dark:text-neutral-200">{formatNumber(pageData.total)}</span> product
                {pageData.total === 1 ? "" : "s"} match these filters
                {pageData.capped ? " · more pages available" : ""}
              </>
            ) : rowsLoading ? (
              "Loading…"
            ) : (
              "—"
            )}
          </span>
          {filtersActive && (
            <button onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-2.5 py-1 font-semibold text-brand-700 hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">
              <RotateCcw className="h-3.5 w-3.5" />
              Clear filters
            </button>
          )}
        </div>
      </SectionCard>

      {/* ── Bulk bar ── */}
      <AnimatePresence>
        {canEdit && selectedCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-wrap items-center gap-2 rounded-2xl border border-brand-500/25 bg-brand-500/[0.04] px-4 py-3"
          >
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
              <CheckSquare className="h-4 w-4" />
              {formatNumber(selectedCount)} selected
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select
                value=""
                disabled={!!bulkBusy}
                onChange={(e) => {
                  if (e.target.value) runBulkStatus(e.target.value);
                }}
                className="admin-input h-8 py-0 text-xs"
                aria-label="Bulk set status"
              >
                <option value="" disabled>
                  Set status…
                </option>
                {PRODUCT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                onClick={() => runBulkFeature(true)}
                disabled={!!bulkBusy}
                className="admin-btn-outline h-8 px-3 text-xs disabled:opacity-50"
              >
                <Pin className="h-3.5 w-3.5" /> Feature
              </button>
              <button
                onClick={() => runBulkFeature(false)}
                disabled={!!bulkBusy}
                className="admin-btn-outline h-8 px-3 text-xs disabled:opacity-50"
              >
                <PinOff className="h-3.5 w-3.5" /> Un-feature
              </button>
              <button
                onClick={runBulkDelete}
                disabled={!!bulkBusy}
                className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-error/30 bg-white px-3 text-xs font-semibold text-error hover:bg-error/5 disabled:opacity-50 dark:bg-dark-900"
              >
                {bulkBusy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Delete
              </button>
              <button onClick={clearSelection} className="rounded-lg p-1.5 text-dark-900/45 hover:bg-dark-900/5 dark:text-neutral-500" aria-label="Clear selection">
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bulk write outcome (verbatim) ── */}
      {bulkNotice.length > 0 && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <PartialJoinNotice messages={bulkNotice} />
          </div>
          <button onClick={() => setBulkNotice([])} className="rounded-lg p-1.5 text-dark-900/40 hover:bg-dark-900/5 dark:text-neutral-500" aria-label="Dismiss bulk result">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── List ── */}
      <TableShell
        isLoading={rowsLoading}
        error={rowsError}
        errorRetry={refresh}
        hasData={currentRows.length > 0}
        filtered={pageData ? pageData.total > 0 || isFiltered : isFiltered}
        emptyImage={EMPTY_IMAGES.products}
        emptyTitle="No products in the catalogue yet"
        emptySubtitle="Products synced from 1688, Taobao and the other marketplaces, or added by hand, appear here."
        emptyAction={
          canEdit ? (
            <button onClick={openAdd} className="admin-btn-primary">
              <Plus className="h-4 w-4" /> Add your first product
            </button>
          ) : (
            <span className="text-xs text-dark-900/45 dark:text-neutral-500">Only staff with catalog write access can add a product.</span>
          )
        }
      >
        {view === "table" ? (
          <div className="overflow-x-auto rounded-2xl border border-dark-900/[0.06] bg-white dark:border-white/[0.08] dark:bg-dark-900">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-dark-900/[0.06] text-[11px] uppercase tracking-wider text-dark-900/45 dark:border-white/[0.08] dark:text-neutral-500">
                  {canEdit && (
                    <th className="w-10 px-4 py-3">
                      <button onClick={toggleSelectAll} className="text-dark-900/40 hover:text-brand-500 dark:text-neutral-500" aria-label="Select all on this page">
                        {allOnPageSelected ? <CheckSquare className="h-4 w-4 text-brand-500" /> : <Square className="h-4 w-4" />}
                      </button>
                    </th>
                  )}
                  <th className="px-4 py-3 font-bold">Product</th>
                  <th className="px-4 py-3 font-bold">Price</th>
                  <th className="px-4 py-3 font-bold">Stock</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">Category</th>
                  <th className="px-4 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-900/[0.05] dark:divide-white/[0.06]">
                {currentRows.map((p) => {
                  const { primary, secondary } = titlePair(p);
                  const money = priceView(p, fx);
                  const isSelected = selected.has(p.id);
                  return (
                    <tr key={p.id} className={cn("hover:bg-warm-50 dark:hover:bg-white/[0.02]", isSelected && "bg-brand-500/[0.04]")}>
                      {canEdit && (
                        <td className="px-4 py-3 align-top">
                          <button onClick={() => toggleSelect(p.id)} className="text-dark-900/40 hover:text-brand-500 dark:text-neutral-500" aria-label={`Select ${primary}`}>
                            {isSelected ? <CheckSquare className="h-4 w-4 text-brand-500" /> : <Square className="h-4 w-4" />}
                          </button>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <div className="relative shrink-0">
                            <TrendingThumb product={p} className="h-12 w-12" rounded="rounded-lg" alt={primary} />
                            {p.curation.featured && (
                              <span title="Staff pick on Trending" className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-white ring-2 ring-white dark:ring-dark-900">
                                <Pin className="h-2.5 w-2.5" />
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-dark-900 dark:text-neutral-100 max-w-[240px]">{primary}</p>
                            {secondary && <p className="truncate text-xs text-dark-900/45 dark:text-neutral-500 max-w-[240px]">{secondary}</p>}
                            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-dark-900/40 dark:text-neutral-500">
                              <span className={cn("rounded-full border px-1.5 py-px font-semibold", MARKETPLACE_TINT[p.marketplace ?? ""] ?? "border-dark-900/10 bg-dark-50 text-dark-900/55 dark:bg-white/5 dark:text-neutral-400")}>
                                {marketplaceLabel(p.marketplace ?? "")}
                              </span>
                              {p.updated_at ? `· updated ${timeAgo(p.updated_at)}` : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="font-semibold text-dark-900 dark:text-neutral-100">{money.cny}</p>
                        {money.usd && (
                          <p className="text-[11px] text-dark-900/50 dark:text-neutral-400">
                            {money.usd} <span className="font-medium">{money.usdKind === "stored" ? "est." : "converted"}</span>
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <StatusChip value={p.stock_status ?? "unknown"} />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <StatusChip value={p.status ?? "unknown"} lifecycle />
                      </td>
                      <td className="px-4 py-3 align-top text-dark-900/60 dark:text-neutral-400">
                        {p.categoryName ?? <span className="text-dark-900/35 italic dark:text-neutral-600">uncategorised</span>}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <RowActions
                          product={p}
                          canEdit={canEdit}
                          onEdit={() => openEdit(p)}
                          onDuplicate={() => handleDuplicate(p)}
                          onQuickStatus={() => handleQuickStatus(p)}
                          onFeature={() => handleFeature(p)}
                          onDelete={() => setDeleteTarget(p)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {currentRows.map((p) => {
              const { primary, secondary } = titlePair(p);
              const money = priceView(p, fx);
              const isSelected = selected.has(p.id);
              return (
                <motion.div
                  layout
                  key={p.id}
                  className={cn(
                    "relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-dark-900",
                    isSelected ? "border-brand-500/50" : "border-dark-900/[0.06] dark:border-white/[0.08]"
                  )}
                >
                  <div className="flex items-start gap-3 p-3">
                    {canEdit && (
                      <button onClick={() => toggleSelect(p.id)} className="mt-1 shrink-0 text-dark-900/40 hover:text-brand-500 dark:text-neutral-500" aria-label={`Select ${primary}`}>
                        {isSelected ? <CheckSquare className="h-4 w-4 text-brand-500" /> : <Square className="h-4 w-4" />}
                      </button>
                    )}
                    <TrendingThumb product={p} className="h-16 w-16 shrink-0" rounded="rounded-xl" alt={primary} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate font-semibold text-dark-900 dark:text-neutral-100">{primary}</p>
                        {p.curation.featured && (
                          <span title="Staff pick on Trending" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 dark:text-brand-300">
                            <Pin className="h-2.5 w-2.5" /> Pick
                          </span>
                        )}
                      </div>
                      {secondary && <p className="truncate text-xs text-dark-900/45 dark:text-neutral-500">{secondary}</p>}
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-dark-900/45 dark:text-neutral-500">
                        <span className={cn("rounded-full border px-1.5 py-px font-semibold", MARKETPLACE_TINT[p.marketplace ?? ""] ?? "border-dark-900/10 bg-dark-50 text-dark-900/55 dark:bg-white/5 dark:text-neutral-400")}>
                          {marketplaceLabel(p.marketplace ?? "")}
                        </span>
                        <span>{p.categoryName ?? "uncategorised"}</span>
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 px-3 pb-2 text-[11px]">
                    <div>
                      <p className="text-dark-900/40 dark:text-neutral-500">Price</p>
                      <p className="truncate font-semibold text-dark-900 dark:text-neutral-100">{money.cny}</p>
                      {money.usd && <p className="truncate text-dark-900/45 dark:text-neutral-500">{money.usd} {money.usdKind === "stored" ? "est." : "conv."}</p>}
                    </div>
                    <div>
                      <p className="text-dark-900/40 dark:text-neutral-500">Stock</p>
                      <StatusChip value={p.stock_status ?? "unknown"} />
                    </div>
                    <div>
                      <p className="text-dark-900/40 dark:text-neutral-500">Status</p>
                      <StatusChip value={p.status ?? "unknown"} lifecycle />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-dark-900/[0.05] px-3 py-2 dark:border-white/[0.06]">
                    <span className="truncate text-[11px] text-dark-900/40 dark:text-neutral-500">
                      {p.updated_at ? `Updated ${timeAgo(p.updated_at)}` : `Sales ${formatNumber(p.sales_count ?? 0)}`}
                    </span>
                    <RowActions
                      compact
                      product={p}
                      canEdit={canEdit}
                      onEdit={() => openEdit(p)}
                      onDuplicate={() => handleDuplicate(p)}
                      onQuickStatus={() => handleQuickStatus(p)}
                      onFeature={() => handleFeature(p)}
                      onDelete={() => setDeleteTarget(p)}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* footer + pagination */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-dark-900/55 dark:text-neutral-400">
          <span>
            {pageData ? (
              <>
                Page <span className="font-semibold text-dark-900 dark:text-neutral-200">{pageData.page}</span> of {totalPages} · {formatNumber(currentRows.length)} shown of {formatNumber(pageData.total)}
              </>
            ) : (
              "—"
            )}
          </span>
          <div className="flex items-center gap-1.5">
            <button onClick={() => goPage(page - 1)} disabled={page <= 1 || rowsLoading} className="admin-btn-outline h-8 px-2.5 text-xs disabled:opacity-40">
              Prev
            </button>
            <button onClick={() => goPage(page + 1)} disabled={page >= totalPages || rowsLoading} className="admin-btn-outline h-8 px-2.5 text-xs disabled:opacity-40">
              Next
            </button>
          </div>
        </div>
      </TableShell>

      {/* ── Add / Edit drawer (remounts per product via key) ── */}
      {panelOpen && (
        <ProductFormPanel
          key={panelNonce}
          product={panelProduct}
          categories={categories}
          categoryCounts={categoryCounts}
          categoriesError={categoriesError}
          canEdit={canEdit}
          restrictedNotice={restrictedNotice}
          onClose={closePanel}
          onSaved={handleSaved}
        />
      )}

      {/* ── Delete confirm ── */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete product"
        message={
          deleteTarget
            ? `Permanently delete "${titlePair(deleteTarget).primary}"? This removes the row from the catalogue and cannot be undone.`
            : ""
        }
        confirmText="Delete"
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />

      {/* ── Category wiring dialog ── */}
      <CategorySyncDialog
        open={syncOpen}
        busy={syncBusy}
        error={syncError}
        preview={syncPreview}
        applied={syncApplied}
        onClose={() => setSyncOpen(false)}
        onApply={applySync}
      />
    </div>
  );
}

/* ── KPI cell: null / loading → "—", never a fake 0 ───────────── */
function kpiCell(value: number | null | undefined, loading: boolean): string {
  if (loading) return "…";
  if (value === null || value === undefined) return "—";
  return formatNumber(value);
}

/* ── Status chip (lifecycle vs stock tones) ────────────────────── */
function StatusChip({ value, lifecycle = false }: { value: string; lifecycle?: boolean }) {
  const label = value.replace(/_/g, " ");
  let tone = "border-dark-900/10 bg-dark-50 text-dark-900/60 dark:bg-white/5 dark:text-neutral-400";
  if (lifecycle) {
    if (value === "active") tone = "border-success/25 bg-success/10 text-success";
    else if (value === "draft") tone = "border-info/25 bg-info/10 text-info";
    else if (value === "archived") tone = "border-dark-900/15 bg-dark-900/5 text-dark-900/50 dark:bg-white/10 dark:text-neutral-500";
  } else {
    if (value === "in_stock") tone = "border-success/25 bg-success/10 text-success";
    else if (value === "low_stock") tone = "border-warning/30 bg-warning/10 text-warning";
    else if (value === "out_of_stock") tone = "border-error/25 bg-error/10 text-error";
  }
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize", tone)}>{label}</span>;
}

/* ── Row action buttons ────────────────────────────────────────── */
function RowActions({
  product,
  canEdit,
  compact = false,
  onEdit,
  onDuplicate,
  onQuickStatus,
  onFeature,
  onDelete,
}: {
  product: CatalogProduct;
  canEdit: boolean;
  compact?: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onQuickStatus: () => void;
  onFeature: () => void;
  onDelete: () => void;
}) {
  const featured = product.curation.featured;
  const btn = "inline-flex h-8 w-8 items-center justify-center rounded-lg text-dark-900/45 transition-colors hover:bg-dark-900/5 hover:text-dark-900 dark:text-neutral-500 dark:hover:bg-white/10 dark:hover:text-neutral-200";
  return (
    <div className={cn("flex shrink-0 items-center", compact ? "gap-0.5" : "justify-end gap-0.5")}>
      {product.source_url ? (
        <a href={product.source_url} target="_blank" rel="noopener noreferrer" className={btn} title="Open the source listing">
          <ExternalLink className="h-4 w-4" />
        </a>
      ) : (
        <button onClick={onEdit} className={btn} title="No source URL — open the editor">
          <ExternalLink className="h-4 w-4 opacity-30" />
        </button>
      )}
      {canEdit && (
        <>
          <button onClick={onEdit} className={btn} title="Edit product">
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={onQuickStatus}
            className={btn}
            title={product.status === "active" ? "Move to draft" : "Publish (set active)"}
          >
            {product.status === "active" ? <Eye className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            onClick={onFeature}
            className={cn(btn, featured && "text-brand-500 hover:text-brand-600 dark:text-brand-400")}
            title={featured ? "Remove from Trending" : "Pin to Trending as a staff pick"}
          >
            {featured ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </button>
          <button onClick={onDuplicate} className={btn} title="Duplicate as a draft">
            <Copy className="h-4 w-4" />
          </button>
          <button onClick={onDelete} className={cn(btn, "hover:text-error dark:hover:text-error")} title="Delete product">
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}

/* ── Category wiring dialog ────────────────────────────────────── */
function CategorySyncDialog({
  open,
  busy,
  error,
  preview,
  applied,
  onClose,
  onApply,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  preview: CategorySyncResult | null;
  applied: CategorySyncResult | null;
  onClose: () => void;
  onApply: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Wire product categories" maxWidth="max-w-lg">
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-dark-900/60 dark:text-neutral-400">
          <code className="rounded bg-dark-900/5 px-1 dark:bg-white/10">category_id</code> is almost empty in production, so category pages fall back to the
          legacy text name. This matches each product&rsquo;s text to a real category and writes the FK. It runs a preview first; nothing is written until you apply.
        </p>

        {busy && !preview && (
          <p className="flex items-center gap-2 text-sm text-dark-900/50 dark:text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Previewing (dry run)…
          </p>
        )}

        {error && (
          <div className="rounded-xl border border-error/30 bg-error/5 px-3 py-2.5 text-sm text-error">
            {error}
          </div>
        )}

        {preview && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <SyncStat label="Would link" value={formatNumber(preview.linked)} tone="success" />
              <SyncStat label="Already linked" value={formatNumber(preview.alreadyLinked)} tone="info" />
              <SyncStat label="Unmatched" value={formatNumber(preview.unmatched.length)} tone="warning" />
            </div>
            <p className="text-xs text-dark-900/50 dark:text-neutral-400">Scanned {formatNumber(preview.products)} products across {formatNumber(preview.categories)} categories.</p>

            {preview.unmatched.length > 0 && (
              <div className="rounded-xl border border-dark-900/[0.06] bg-warm-50 p-3 dark:border-white/[0.06] dark:bg-dark-800/50">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-dark-900/45 dark:text-neutral-500">
                  Text that matches no category ({formatNumber(preview.unmatched.length)})
                </p>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-dark-900/70 dark:text-neutral-400">
                  {preview.unmatched.map((u, i) => (
                    <li key={i} className="truncate">
                      <span className="font-semibold">“{u.text}”</span> — {u.product}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {applied ? (
              <div className="rounded-xl border border-success/30 bg-success/5 px-3 py-2.5 text-sm text-success">
                Applied — {formatNumber(applied.linked)} product{applied.linked === 1 ? "" : "s"} linked now. {applied.unmatched.length ? `${formatNumber(applied.unmatched.length)} still unmatched.` : "Nothing left unmatched."}
              </div>
            ) : preview.linked > 0 ? (
              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-xs text-dark-900/50 dark:text-neutral-400">This will write {formatNumber(preview.linked)} row{preview.linked === 1 ? "" : "s"}.</span>
                <button onClick={onApply} disabled={busy} className="admin-btn-primary h-9 px-4 text-xs disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Apply wiring
                </button>
              </div>
            ) : (
              <p className="rounded-xl bg-dark-900/[0.03] px-3 py-2 text-xs text-dark-900/55 dark:bg-white/[0.04] dark:text-neutral-400">
                Nothing to link — every product already has a matching category or no usable text. No write is needed.
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button onClick={onClose} className="admin-btn-ghost h-9 px-4 text-xs">
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SyncStat({ label, value, tone }: { label: string; value: string; tone: "success" | "info" | "warning" }) {
  const map = {
    success: "text-success",
    info: "text-info",
    warning: "text-warning",
  } as const;
  return (
    <div className="rounded-xl border border-dark-900/[0.06] bg-white p-2.5 dark:border-white/[0.08] dark:bg-dark-900">
      <p className={cn("text-xl font-bold", map[tone])}>{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-dark-900/45 dark:text-neutral-500">{label}</p>
    </div>
  );
}
