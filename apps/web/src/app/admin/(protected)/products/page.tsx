"use client";

import { Suspense, useEffect, useState, useMemo, useCallback } from "react";
import { supabase, edgeFetch } from "@/lib/supabase";
import { cn, formatCNY, formatUSD, formatDate } from "@/lib/utils";
import {
  Package, Loader2, ExternalLink, Edit3, Trash2, Plus,
  Download, ArrowUpDown, CheckSquare, Square, Check, Image as ImageIcon,
  Filter, X, ChevronDown, AlertTriangle, TrendingUp, RotateCcw
} from "lucide-react";
import type { Product } from "@/types";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { useToast } from "@/components/admin/Toast";
import FormInput from "@/components/admin/FormInput";
import {
  PageHeader, StatCard, PageGrid, SearchInput, FilterChips, TableShell,
  SidePanel, SkeletonTable, EMPTY_IMAGES,
} from "@/components/admin/ui";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { TableControls } from "@/components/admin/TableControls";
import { useUrlFilters, useDebouncedFilterValue } from "@/components/admin/useUrlFilters";
import { useTablePrefs } from "@/components/admin/useTablePrefs";
import { useLiveVersion } from "@/lib/admin/live-store";
import { isMissingColumnError } from "@/lib/admin/supabase-data";
import { motion, AnimatePresence } from "framer-motion";

/* ── Constants ─────────────────────────────────────────────────── */

const marketplaceFilters = ["All", "1688", "Taobao", "Yiwugo", "Alibaba", "ChinaGoods", "JD", "ChinaSuuq"] as const;
const marketplaces = ["1688", "taobao", "yiwugo", "alibaba", "chinagoods", "jd", "chinasuuq"] as const;
const stockStatusOptions = ["in_stock", "low_stock", "out_of_stock"] as const;
const statusOptions = ["active", "draft", "archived"] as const;

/**
 * The supplier's own product id, read out of the listing URL: 1688, Taobao and
 * JD all carry a long digit run in the path or query. No digit run means a
 * hand-added product, which genuinely has no source id — that is why
 * 202609250004 made the column nullable rather than letting this screen invent
 * one, since a fabricated id would collide with a real offer on the next import.
 */
function deriveSourceId(url: string): string | null {
  return url.match(/\d{6,}/)?.[0] ?? null;
}

/**
 * Chips are built only from what globals.css @theme already declares — the
 * brand/dark scales plus the semantic tokens (success / error) the admin shell
 * uses for its own badges. No raw Tailwind palette hue (emerald, red, blue,
 * yellow, rose) and no new colour: the dashboard's MARKETPLACE_STYLE map already
 * paints every Chinese source warm (#FF5A0A, #FF6A00, #F97316 → brand-500/400),
 * so the entries below differ by brand tint, and the pairs that share a hex there
 * share a class string here.
 */
const statusColors: Record<string, string> = {
  active: "bg-success/10 text-success border-success/20",
  draft: "bg-dark-100 text-dark-600 border-dark-200",
  archived: "bg-error/10 text-error border-error/20",
};

const marketplaceColors: Record<string, string> = {
  "1688": "bg-brand-50 text-brand-700 border-brand-200",
  taobao: "bg-brand-100 text-brand-700 border-brand-200",
  yiwugo: "bg-brand-100 text-brand-600 border-brand-300",
  alibaba: "bg-brand-100 text-brand-600 border-brand-300",
  chinagoods: "bg-brand-50 text-brand-700 border-brand-200",
  jd: "bg-brand-100 text-brand-700 border-brand-200",
  chinasuuq: "bg-brand-50 text-brand-600 border-brand-200",
};

/* ── Form types ────────────────────────────────────────────────── */

interface ProductFormData {
  title_english: string;
  title_somali: string;
  title_original: string;
  category: string;
  marketplace: string;
  price_cny_min: string;
  price_cny_max: string;
  price_usd_estimated: string;
  moq: string;
  stock_status: string;
  status: string;
  supplier_rating: string;
  sales_count: string;
  source_url: string;
  description_english: string;
  images: string;
}

const emptyFormData: ProductFormData = {
  title_english: "",
  title_somali: "",
  title_original: "",
  category: "",
  marketplace: "1688",
  price_cny_min: "",
  price_cny_max: "",
  price_usd_estimated: "",
  moq: "",
  stock_status: "in_stock",
  status: "active",
  supplier_rating: "",
  sales_count: "",
  source_url: "",
  description_english: "",
  images: "",
};

/* ── Sort types ────────────────────────────────────────────────── */

type SortKey = "title_english" | "price_cny_min" | "price_cny_max" | "sales_count" | "created_at" | "marketplace" | "stock_status";
type SortDir = "asc" | "desc";

/* ── URL-backed filters ─────────────────────────────────────────
 * Module scope so the defaults object identity is stable and the hook's
 * effects do not loop. Nothing is read server-side: apps/web is a static
 * export, so the query string is applied in the browser after hydration.
 *   q      title/category text   app    marketplace of the listing
 *   stock  stock_status          from/to added-on window
 *   pmin/pmax CNY price bracket  sort/dir column ordering
 * Every previous filter is still here — it just lives in the URL now, so a
 * filtered view can be reloaded, bookmarked or pasted to a colleague.
 */
const FILTER_DEFAULTS = {
  q: "", app: "All", stock: "All", from: "", to: "", pmin: "", pmax: "",
  sort: "created_at", dir: "desc",
};

const PRODUCT_COLUMNS: { key: string; label: string }[] = [
  { key: "product", label: "Product" },
  { key: "marketplace", label: "Marketplace" },
  { key: "price", label: "Price" },
  { key: "moq", label: "MOQ" },
  { key: "stock_status", label: "Stock" },
  { key: "sales_count", label: "Sales" },
  { key: "created_at", label: "Added" },
  { key: "actions", label: "Actions" },
];

/* ── Component ─────────────────────────────────────────────────── */

/** `source_products` rows carry created_at (the table's select("*") returns it),
 *  but the shared Product type predates the column. Read it through one helper
 *  instead of casting at every call site. */
function createdAtOf(product: Product): string | null {
  const raw = (product as unknown as Record<string, unknown>).created_at;
  return typeof raw === "string" ? raw : null;
}

export default function ProductsPage() {
  // useSearchParams() must sit under <Suspense> in a statically prerendered
  // route, otherwise the prerenderer bails the page to full client render.
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-dark-900/[0.06] bg-white shadow-sm">
          <SkeletonTable />
        </div>
      }
    >
      <ProductsPageContent />
    </Suspense>
  );
}

function ProductsPageContent() {
  const { success, error: toastError } = useToast();

  const { values, set, setMany, reset, isFiltered } = useUrlFilters(FILTER_DEFAULTS);
  const tablePrefs = useTablePrefs("products");
  // Only catalog writes matter here. The unfiltered version moved on every
  // order, payment and notification, re-pulling the whole product list for
  // unrelated traffic.
  const liveVersion = useLiveVersion(["source_products"]);

  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters — all from the URL
  const marketplaceFilter = values.app;
  const stockFilter = values.stock;
  const dateFrom = values.from;
  const dateTo = values.to;
  const priceMin = values.pmin;
  const priceMax = values.pmax;
  const sortKey = values.sort as SortKey;
  const sortDir = values.dir === "asc" ? "asc" : "desc";
  const [showFilters, setShowFilters] = useState(false);

  // Drafted locally, committed to the URL debounced
  const commitSearch = useCallback((v: string) => set("q", v), [set]);
  const [search, setSearch] = useDebouncedFilterValue(values.q, commitSearch);

  // Selection / Bulk
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkStatusValue, setBulkStatusValue] = useState("active");
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Create/Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(emptyFormData);
  const [aiExtractUrl, setAiExtractUrl] = useState("");
  const [aiExtractBusy, setAiExtractBusy] = useState(false);
  const [aiExtractMsg, setAiExtractMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Delete
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Image preview
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  /* ── Data fetching ──────────────────────────────────────────── */

  const fetchProducts = async () => {
    try {
      setIsLoading(true);
      // Explicit projection, not `*`: this list is unbounded and every extra
      // column is paid for on every row, on every realtime burst. The edit
      // modal reads exactly these fields.
      const { data, error: fetchError } = await supabase
        .from("source_products")
        .select(
          "id, marketplace, source_product_id, source_url, title_original, title_english, title_somali, images, category, price_cny_min, price_cny_max, price_usd_estimated, moq, stock_status, status, supplier_rating, sales_count, domestic_shipping_cny, description_english, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(1000);

      if (fetchError) throw fetchError;
      setProducts((data as Product[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    // liveVersion bumps on the realtime channel in the admin layout: a product
    // saved on another device refreshes this list without a manual reload.
  }, [liveVersion]);

  /* ── Filtering + sorting ────────────────────────────────────── */

  const filteredProducts = useMemo(() => {
    let result = products.filter((product) => {
      const matchesSearch =
        search === "" ||
        product.title_english?.toLowerCase().includes(search.toLowerCase()) ||
        product.title_original?.toLowerCase().includes(search.toLowerCase()) ||
        product.title_somali?.toLowerCase().includes(search.toLowerCase()) ||
        product.category?.toLowerCase().includes(search.toLowerCase());

      const matchesMarketplace =
        marketplaceFilter === "All" ||
        product.marketplace?.toLowerCase() === marketplaceFilter.toLowerCase();

      const matchesStock =
        stockFilter === "All" || product.stock_status === stockFilter;

      const price = product.price_cny_min || 0;
      const matchesPriceMin = priceMin === "" || price >= Number(priceMin);
      const matchesPriceMax = priceMax === "" || price <= Number(priceMax);

      const day = createdAtOf(product)?.slice(0, 10) ?? "";
      const matchesFrom = !dateFrom || (!!day && day >= dateFrom);
      const matchesTo = !dateTo || (!!day && day <= dateTo);

      return (
        matchesSearch &&
        matchesMarketplace &&
        matchesStock &&
        matchesPriceMin &&
        matchesPriceMax &&
        matchesFrom &&
        matchesTo
      );
    });

    result.sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortKey];
      const bv = (b as unknown as Record<string, unknown>)[sortKey];
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [
    products, search, marketplaceFilter, stockFilter, priceMin, priceMax,
    dateFrom, dateTo, sortKey, sortDir,
  ]);

  /* ── Selection helpers ──────────────────────────────────────── */

  const allVisibleSelected = filteredProducts.length > 0 && filteredProducts.every((p) => selectedIds.has(p.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map((p) => p.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* ── Sort toggle ────────────────────────────────────────────── */

  const toggleSort = (key: SortKey) => {
    // Sorting is part of the shared view, so it belongs in the URL too.
    if (sortKey === key) {
      set("dir", sortDir === "asc" ? "desc" : "asc");
    } else {
      setMany({ sort: key, dir: "asc" });
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => (
    <span className={cn("ml-1 inline-flex", sortKey === col ? "text-brand-500" : "text-dark-300")}>
      <ArrowUpDown className="h-3 w-3" />
    </span>
  );

  /* ── Modal helpers ──────────────────────────────────────────── */

  const openAddModal = () => {
    setEditingProduct(null);
    setFormData(emptyFormData);
    setAiExtractMsg(null);
    setModalOpen(true);
  };

  // AI Extract: pull product fields out of a marketplace URL / listing text
  // through the ai-extraction edge function (staff-gated, schema-validated).
  const handleAiExtract = async () => {
    const content = aiExtractUrl.trim();
    if (!content) {
      setAiExtractMsg({ ok: false, text: "Paste a marketplace URL or listing text first." });
      return;
    }
    setAiExtractBusy(true);
    setAiExtractMsg(null);
    try {
      const res = await edgeFetch<{
        ok: boolean;
        data?: Record<string, string | number | null>;
        missing?: string[];
        error?: string;
        blocked?: boolean;
        reason?: string;
      }>("ai-extraction", {
        method: "POST",
        body: {
          content,
          schema: {
            title_english: "string",
            title_original: "string",
            category: "string",
            price_cny_min: "number",
            price_cny_max: "number",
            moq: "number",
            description_english: "string",
          },
        },
      });
      if (!res.ok || !res.data) {
        const why = res.reason
          ? `Blocked: ${res.reason}`
          : res.error === "ai_provider_not_configured"
            ? "AI provider not configured — set it up in Settings → AI Provider."
            : (res.error || "Extraction failed");
        setAiExtractMsg({ ok: false, text: why });
        return;
      }
      const d = res.data;
      const url = content.startsWith("http") ? content : "";
      const domain = url.toLowerCase();
      const marketplace =
        domain.includes("1688") ? "1688" :
        domain.includes("taobao") ? "taobao" :
        domain.includes("yiwugo") ? "yiwugo" :
        domain.includes("alibaba") ? "alibaba" :
        domain.includes("chinagoods") ? "chinagoods" :
        domain.includes("jd.") ? "jd" : null;
      setFormData((prev) => ({
        ...prev,
        title_english: (d.title_english as string) || prev.title_english,
        title_original: (d.title_original as string) || prev.title_original,
        category: (d.category as string) || prev.category,
        price_cny_min: d.price_cny_min != null ? String(d.price_cny_min) : prev.price_cny_min,
        price_cny_max: d.price_cny_max != null ? String(d.price_cny_max) : prev.price_cny_max,
        moq: d.moq != null ? String(d.moq) : prev.moq,
        description_english: (d.description_english as string) || prev.description_english,
        source_url: url || prev.source_url,
        marketplace: marketplace ?? prev.marketplace,
      }));
      const missing = res.missing?.length ? ` (not found: ${res.missing.join(", ")})` : "";
      setAiExtractMsg({ ok: true, text: `Extracted into the form${missing}. Review and save.` });
    } catch (e) {
      setAiExtractMsg({ ok: false, text: `Extraction failed: ${(e as Error).message}` });
    } finally {
      setAiExtractBusy(false);
    }
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      title_english: product.title_english || "",
      title_somali: product.title_somali || "",
      title_original: product.title_original || "",
      category: product.category || "",
      marketplace: product.marketplace || "1688",
      price_cny_min: product.price_cny_min?.toString() || "",
      price_cny_max: product.price_cny_max?.toString() || "",
      price_usd_estimated: product.price_usd_estimated?.toString() || "",
      moq: product.moq?.toString() || "",
      stock_status: product.stock_status || "in_stock",
      status: (product as any).status || "active",
      supplier_rating: product.supplier_rating?.toString() || "",
      sales_count: product.sales_count?.toString() || "",
      source_url: product.source_url || "",
      description_english: (product as any).description_english || "",
      images: product.images?.join("\n") || "",
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingProduct(null);
    setFormData(emptyFormData);
  };

  const handleFormChange = (field: keyof ProductFormData) => (value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.title_english.trim()) {
      toastError("Title (English) is required");
      return;
    }

    setModalLoading(true);
    try {
      const imageUrls = formData.images
        .split("\n")
        .map((u) => u.trim())
        .filter((u) => u.length > 0);

      const englishTitle = formData.title_english.trim();
      const originalTitle = formData.title_original.trim();
      const priceCny = formData.price_cny_min ? Number(formData.price_cny_min) : null;
      const priceCnyMax = formData.price_cny_max ? Number(formData.price_cny_max) : null;
      const sourceId = deriveSourceId(formData.source_url);

      // Three vocabularies, because source_products has been written three ways
      // and PostgREST rejects the WHOLE insert for one unknown column (42703):
      //   originals  — 202408010004's importer shape (source_title, source_price,
      //                in_stock, source_id),
      //   curated    — what both apps display, added by 202609250004,
      //   required   — the NOT NULL columns the LIVE project's table declares and
      //                the other two generations do not: source_product_id and
      //                title_original. Without them a live insert dies with 23502
      //                on a column name this form never used to send.
      // The save tries wide → live → importer, so a catalog that has not been
      // migrated yet still saves, and production saves today.
      const originals = {
        marketplace: formData.marketplace,
        source_url: formData.source_url.trim(),
        source_title: originalTitle || englishTitle,
        source_description: formData.description_english.trim() || null,
        source_images: imageUrls,
        source_price: priceCny,
        source_id: sourceId,
        moq: Number(formData.moq) > 0 ? Number(formData.moq) : 1,
        status: formData.status,
        in_stock: formData.stock_status !== "out_of_stock",
        updated_at: new Date().toISOString(),
      };

      // Curated on top: these exist only from 202609250004 on, and the stock
      // trigger derives in_stock from stock_status when both are sent.
      const curated = {
        title_english: englishTitle,
        title_somali: formData.title_somali.trim(),
        title_original: originalTitle,
        category: formData.category.trim(),
        price_cny_min: priceCny,
        price_cny_max: priceCnyMax,
        price_usd_estimated: formData.price_usd_estimated ? Number(formData.price_usd_estimated) : null,
        stock_status: formData.stock_status,
        supplier_rating: formData.supplier_rating ? Number(formData.supplier_rating) : null,
        sales_count: formData.sales_count ? Number(formData.sales_count) : 0,
        description_english: formData.description_english.trim(),
        images: imageUrls,
      };

      // Live's price columns are NOT NULL DEFAULT 0, so an absent price is 0
      // rather than NULL — 0 is also what the mobile reader treats as
      // "no price captured", so nothing invents a number here.
      const liveShape = {
        ...curated,
        title_original: originalTitle || englishTitle,
        price_cny_min: priceCny ?? 0,
        price_cny_max: priceCnyMax ?? priceCny ?? 0,
        source_product_id: sourceId ?? `manual-${Date.now()}`,
        source_url: formData.source_url.trim(),
        marketplace: formData.marketplace,
        moq: Number(formData.moq) > 0 ? Number(formData.moq) : 1,
        status: formData.status,
        updated_at: new Date().toISOString(),
      };

      const write = (payload: Record<string, unknown>) =>
        editingProduct
          ? supabase.from("source_products").update(payload).eq("id", editingProduct.id).select().single()
          : supabase
              .from("source_products")
              .insert({ ...payload, created_at: new Date().toISOString() })
              .select()
              .single();

      const attempts = [
        { ...originals, ...curated }, // fully migrated importer catalog
        liveShape, // the live project's curated-only table
        originals, // importer catalog that has not been migrated yet
      ];

      let data: Product | null = null;
      let error: { message: string } | null = null;
      for (const payload of attempts) {
        ({ data, error } = await write(payload));
        if (!error || !isMissingColumnError(error)) break;
      }
      if (error) throw error;

      if (editingProduct) {
        setProducts((prev) =>
          prev.map((p) => (p.id === editingProduct.id ? ({ ...p, ...curated, ...data } as Product) : p))
        );
        success("Product updated successfully");
      } else {
        if (data) setProducts((prev) => [data as Product, ...prev]);
        success("Product created successfully");
      }
      closeModal();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setModalLoading(false);
    }
  };

  /* ── Delete helpers ─────────────────────────────────────────── */

  const openDeleteDialog = (product: Product) => {
    setDeletingProduct(product);
    setDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setDeletingProduct(null);
  };

  const handleDelete = async () => {
    if (!deletingProduct) return;
    setDeleteLoading(true);
    try {
      const { error: deleteError } = await supabase
        .from("source_products")
        .delete()
        .eq("id", deletingProduct.id);
      if (deleteError) throw deleteError;
      setProducts((prev) => prev.filter((p) => p.id !== deletingProduct.id));
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(deletingProduct.id); return n; });
      success("Product deleted successfully");
      closeDeleteDialog();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to delete product");
    } finally {
      setDeleteLoading(false);
    }
  };

  /* ── Bulk actions ───────────────────────────────────────────── */

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from("source_products").delete().in("id", ids);
      if (error) throw error;
      setProducts((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      success(`${ids.length} product${ids.length > 1 ? "s" : ""} deleted`);
      setSelectedIds(new Set());
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to delete products");
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleBulkStatusUpdate = async () => {
    if (selectedIds.size === 0) return;
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase
        .from("source_products")
        .update({ status: bulkStatusValue, updated_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
      setProducts((prev) =>
        prev.map((p) => selectedIds.has(p.id) ? { ...p, status: bulkStatusValue } as Product : p)
      );
      success(`${ids.length} product${ids.length > 1 ? "s" : ""} updated to ${bulkStatusValue}`);
      setSelectedIds(new Set());
      setBulkStatusOpen(false);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  /* ── CSV Export ─────────────────────────────────────────────── */

  const handleExportCSV = () => {
    const headers = ["Title", "Category", "Marketplace", "Price (CNY)", "Price (USD)", "MOQ", "Stock", "Status", "Sales", "Rating", "URL"];
    const rows = filteredProducts.map((p) => [
      p.title_english || p.title_original || "",
      p.category || "",
      p.marketplace || "",
      p.price_cny_min?.toString() || "",
      p.price_usd_estimated?.toString() || "",
      p.moq?.toString() || "",
      p.stock_status || "",
      (p as any).status || "",
      p.sales_count?.toString() || "0",
      p.supplier_rating?.toString() || "",
      p.source_url || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `products-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    success(`Exported ${filteredProducts.length} products to CSV`);
  };

  /* ── Stats ──────────────────────────────────────────────────── */

  const stats = useMemo(() => ({
    total: products.length,
    active: products.filter((p) => (p as any).status === "active" || !(p as any).status).length,
    lowStock: products.filter((p) => p.stock_status === "low_stock").length,
    outOfStock: products.filter((p) => p.stock_status === "out_of_stock").length,
    avgPrice: products.length ? products.reduce((s, p) => s + (p.price_cny_min || 0), 0) / products.length : 0,
  }), [products]);

  /* ── Filter chip counts ─────────────────────────────────────── */

  const marketplaceCounts = useMemo(() => {
    const counts: Record<string, number> = { All: products.length };
    for (const f of marketplaceFilters) {
      if (f === "All") continue;
      counts[f] = products.filter((p) => (p.marketplace || "").toLowerCase() === f.toLowerCase()).length;
    }
    return counts;
  }, [products]);

  const stockCounts = useMemo(() => ({
    All: products.length,
    in_stock: products.filter((p) => p.stock_status === "in_stock").length,
    low_stock: products.filter((p) => p.stock_status === "low_stock").length,
    out_of_stock: products.filter((p) => p.stock_status === "out_of_stock").length,
  }), [products]);

  const filtersActive = isFiltered || search !== "";

  /* ── Render ─────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <PageHeader
        title="Products"
        subtitle="Catalog synced from Chinese marketplaces"
        actions={
          <>
            <TableControls columns={PRODUCT_COLUMNS} prefs={tablePrefs} />
            {isFiltered && (
              <button
                onClick={() => {
                  reset();
                  setSearch("");
                }}
                className="flex items-center gap-1.5 rounded-xl border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100"
                title="Clears every filter and the query string"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset filters
              </button>
            )}
            <button onClick={handleExportCSV} className="admin-btn-outline">
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button onClick={openAddModal} className="admin-btn-primary">
              <Plus className="h-4 w-4" />
              Add Product
            </button>
          </>
        }
      />

      {/* ── KPI Stats ── */}
      <PageGrid className="sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total" value={stats.total} icon={Package} tone="brand" delay={0} />
        <StatCard label="Active" value={stats.active} icon={Check} tone="success" delay={1} />
        <StatCard label="Low Stock" value={stats.lowStock} icon={AlertTriangle} tone="warning" delay={2} />
        <StatCard label="Out of Stock" value={stats.outOfStock} icon={X} tone="error" delay={3} />
        <StatCard label="Avg Price" value={formatCNY(stats.avgPrice).slice(0, -3)} icon={TrendingUp} tone="info" delay={4} />
      </PageGrid>

      {/* ── Search + Filters ── */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search products by title, category..."
            className="w-full max-w-md"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "admin-btn-outline",
                showFilters && "border-brand-500 bg-brand-50 text-brand-700 hover:text-brand-700"
              )}
            >
              <Filter className="h-4 w-4" />
              Filters
              {(stockFilter !== "All" || priceMin || priceMax || dateFrom || dateTo) && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-[10px] font-bold text-white">
                  {
                    (stockFilter !== "All" ? 1 : 0) +
                    (priceMin ? 1 : 0) +
                    (priceMax ? 1 : 0) +
                    (dateFrom || dateTo ? 1 : 0)
                  }
                </span>
              )}
            </button>
            <span className="flex items-center gap-1.5 text-sm text-dark-400">
              <Package className="h-4 w-4" />
              {filteredProducts.length} product{filteredProducts.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Marketplace chips — which app this listing came from */}
        <FilterChips<string>
          options={marketplaceFilters.map((f) => ({ value: f, label: f, count: marketplaceCounts[f] }))}
          value={marketplaceFilter}
          onChange={(v) => set("app", v)}
        />

        {/* Expanded filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-dark-900/[0.06] bg-white p-4 shadow-sm">
                <div className="space-y-1.5">
                  <label className="admin-label">Stock Status</label>
                  <FilterChips<string>
                    options={[
                      { value: "All", label: "All", count: stockCounts.All },
                      ...stockStatusOptions.map((s) => ({ value: s, label: s.replace(/_/g, " "), count: stockCounts[s] })),
                    ]}
                    value={stockFilter}
                    onChange={(v) => set("stock", v)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="admin-label">Price Range (CNY)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      value={priceMin}
                      onChange={(e) => set("pmin", e.target.value)}
                      className="admin-input w-24"
                      min={0}
                    />
                    <span className="text-dark-300">—</span>
                    <input
                      type="number"
                      placeholder="Max"
                      value={priceMax}
                      onChange={(e) => set("pmax", e.target.value)}
                      className="admin-input w-24"
                      min={0}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="admin-label">Added Between</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => set("from", e.target.value)}
                      className="h-10 rounded-xl border border-dark-900/10 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none"
                      aria-label="Added from"
                    />
                    <span className="text-dark-300 text-xs">to</span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => set("to", e.target.value)}
                      className="h-10 rounded-xl border border-dark-900/10 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none"
                      aria-label="Added to"
                    />
                  </div>
                </div>
                {(stockFilter !== "All" || priceMin || priceMax || dateFrom || dateTo) && (
                  <button
                    onClick={() => {
                      setMany({ stock: "", pmin: "", pmax: "", from: "", to: "" });
                    }}
                    className="rounded-lg bg-dark-50 px-3 py-1.5 text-xs font-medium text-dark-500 hover:bg-dark-100"
                  >
                    Clear these filters
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bulk Actions Bar ── */}
      <AnimatePresence>
        {someSelected && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 shadow-sm"
          >
            <CheckSquare className="h-5 w-5 text-brand-500" />
            <span className="text-sm font-semibold text-brand-700">
              {selectedIds.size} selected
            </span>
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <button
                  onClick={() => setBulkStatusOpen(!bulkStatusOpen)}
                  className="flex items-center gap-1.5 rounded-lg border border-brand-300 bg-white px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
                >
                  Set Status <ChevronDown className="h-3 w-3" />
                </button>
                {bulkStatusOpen && (
                  <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-xl border border-dark-100 bg-white py-1 shadow-lg">
                    {statusOptions.map((s) => (
                      <button
                        key={s}
                        onClick={() => { setBulkStatusValue(s); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-dark-600 hover:bg-dark-50"
                      >
                        {bulkStatusValue === s && <Check className="h-3 w-3 text-brand-500" />}
                        <span className={bulkStatusValue === s ? "font-semibold" : ""}>{s}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={handleBulkStatusUpdate}
                className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
              >
                Apply
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {bulkDeleting && <Loader2 className="h-3 w-3 animate-spin" />}
                Delete
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="rounded-lg p-1.5 text-dark-400 hover:bg-dark-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Products Table ── */}
      <TableShell
        isLoading={isLoading}
        error={error}
        errorRetry={() => window.location.reload()}
        hasData={filteredProducts.length > 0}
        filtered={filtersActive}
        emptyImage={EMPTY_IMAGES.products}
        emptyTitle="No products yet"
        emptySubtitle="Synced products from 1688, Taobao, YiwuGo and more will appear here."
        emptyAction={
          <button onClick={openAddModal} className="admin-btn-primary">
            Add your first product
          </button>
        }
      >
        <div className="overflow-hidden rounded-2xl border border-dark-900/[0.06] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table
              className={cn(
                "admin-table w-full",
                tablePrefs.className,
                tablePrefs.tableClassName
              )}
            >
              <thead>
                <tr>
                  <th className="w-10">
                    <button onClick={toggleSelectAll} className="flex items-center justify-center">
                      {allVisibleSelected ? (
                        <CheckSquare className="h-4 w-4 text-brand-500" />
                      ) : (
                        <Square className="h-4 w-4 text-dark-300" />
                      )}
                    </button>
                  </th>
                  {!tablePrefs.isHidden("product") && (
                    <th onClick={() => toggleSort("title_english")} className="cursor-pointer select-none hover:text-dark-900/70">
                      <span className="inline-flex items-center gap-1">Product <SortIcon col="title_english" /></span>
                    </th>
                  )}
                  {!tablePrefs.isHidden("marketplace") && (
                    <th onClick={() => toggleSort("marketplace")} className="cursor-pointer select-none hover:text-dark-900/70">
                      <span className="inline-flex items-center gap-1">Marketplace <SortIcon col="marketplace" /></span>
                    </th>
                  )}
                  {!tablePrefs.isHidden("price") && (
                    <th onClick={() => toggleSort("price_cny_min")} className="cursor-pointer select-none hover:text-dark-900/70">
                      <span className="inline-flex items-center gap-1">Price <SortIcon col="price_cny_min" /></span>
                    </th>
                  )}
                  {!tablePrefs.isHidden("moq") && <th>MOQ</th>}
                  {!tablePrefs.isHidden("stock_status") && (
                    <th onClick={() => toggleSort("stock_status")} className="cursor-pointer select-none hover:text-dark-900/70">
                      <span className="inline-flex items-center gap-1">Status <SortIcon col="stock_status" /></span>
                    </th>
                  )}
                  {!tablePrefs.isHidden("sales_count") && (
                    <th onClick={() => toggleSort("sales_count")} className="cursor-pointer select-none hover:text-dark-900/70">
                      <span className="inline-flex items-center gap-1">Sales <SortIcon col="sales_count" /></span>
                    </th>
                  )}
                  {!tablePrefs.isHidden("created_at") && (
                    <th onClick={() => toggleSort("created_at")} className="cursor-pointer select-none hover:text-dark-900/70">
                      <span className="inline-flex items-center gap-1">Added <SortIcon col="created_at" /></span>
                    </th>
                  )}
                  {!tablePrefs.isHidden("actions") && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                <tr
                  key={product.id}
                  className={cn(selectedIds.has(product.id) && "bg-brand-50/50")}
                >
                  <td>
                    <button onClick={() => toggleSelect(product.id)} className="flex items-center justify-center">
                      {selectedIds.has(product.id) ? (
                        <CheckSquare className="h-4 w-4 text-brand-500" />
                      ) : (
                        <Square className="h-4 w-4 text-dark-300 hover:text-dark-500" />
                      )}
                    </button>
                  </td>
                  {!tablePrefs.isHidden("product") && (
                    <td>
                      <div className="flex items-center gap-3">
                        {product.images && product.images.length > 0 ? (
                          <button
                            onClick={() => setPreviewImage(product.images[0])}
                            className="shrink-0"
                          >
                            <img
                              src={product.images[0]}
                              alt={product.title_english}
                              className="h-11 w-11 rounded-lg object-cover ring-1 ring-dark-900/5 hover:ring-2 hover:ring-brand-500/30 transition-all"
                            />
                          </button>
                        ) : (
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-dark-100 ring-1 ring-dark-900/5">
                            <ImageIcon className="h-5 w-5 text-dark-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-dark-900 truncate max-w-[220px]">
                            {product.title_english || product.title_original || "Untitled"}
                          </p>
                          <p className="text-xs text-dark-400 truncate max-w-[220px]">
                            {product.category}
                          </p>
                          {product.images && product.images.length > 1 && (
                            <span className="text-[10px] text-dark-300">+{product.images.length - 1} images</span>
                          )}
                        </div>
                      </div>
                    </td>
                  )}
                  {!tablePrefs.isHidden("marketplace") && (
                    <td>
                      <span className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                        marketplaceColors[product.marketplace] || "bg-dark-50 text-dark-500 border-dark-200"
                      )}>
                        {product.marketplace}
                      </span>
                    </td>
                  )}
                  {!tablePrefs.isHidden("price") && (
                    <td>
                      <div>
                        <p className="text-sm font-semibold text-dark-900">{formatCNY(product.price_cny_min)}</p>
                        {product.price_cny_max > product.price_cny_min && (
                          <p className="text-xs text-dark-400">– {formatCNY(product.price_cny_max)}</p>
                        )}
                        {product.price_usd_estimated > 0 && (
                          <p className="text-[10px] text-dark-300">~{formatUSD(product.price_usd_estimated)}</p>
                        )}
                      </div>
                    </td>
                  )}
                  {!tablePrefs.isHidden("moq") && (
                    <td>
                      <span className="text-dark-600">{product.moq?.toLocaleString() || "—"}</span>
                    </td>
                  )}
                  {!tablePrefs.isHidden("stock_status") && (
                    <td>
                      <StatusBadge status={product.stock_status || "unknown"} />
                    </td>
                  )}
                  {!tablePrefs.isHidden("sales_count") && (
                    <td>
                      <span className="text-dark-600">{product.sales_count?.toLocaleString() || "0"}</span>
                    </td>
                  )}
                  {!tablePrefs.isHidden("created_at") && (
                    <td>
                      <span className="text-xs text-dark-900/50">
                        {createdAtOf(product) ? formatDate(createdAtOf(product) as string) : "—"}
                      </span>
                    </td>
                  )}
                  {!tablePrefs.isHidden("actions") && (
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        {product.source_url && (
                          <a
                            href={product.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="admin-btn-ghost h-8 w-8 px-0 hover:text-brand-500"
                            title="Open source URL"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                        <button
                          onClick={() => openEditModal(product)}
                          className="admin-btn-ghost h-8 w-8 px-0 hover:text-brand-500"
                          title="Edit product"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openDeleteDialog(product)}
                          className="admin-btn-ghost h-8 w-8 px-0 hover:text-error"
                          title="Delete product"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Table footer */}
        {filteredProducts.length > 0 && (
          <div className="border-t border-dark-900/[0.06] px-4 py-2.5 text-xs text-dark-400">
            Showing {filteredProducts.length} of {products.length} products
            {someSelected && ` · ${selectedIds.size} selected`}
          </div>
        )}
      </div>
      </TableShell>

      {/* ── Image Preview Modal ── */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
            onClick={() => setPreviewImage(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="relative max-w-2xl max-h-[80vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={previewImage}
                alt="Preview"
                className="max-h-[80vh] rounded-2xl object-contain shadow-2xl"
              />
              <button
                onClick={() => setPreviewImage(null)}
                className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-lg text-dark-500 hover:text-dark-900"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Add / Edit Side Panel ── */}
      <SidePanel
        open={modalOpen}
        onClose={closeModal}
        title={editingProduct ? "Edit Product" : "Add Product"}
        subtitle={editingProduct ? "Update catalog details" : "New catalog product"}
        width="max-w-2xl"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button onClick={closeModal} disabled={modalLoading} className="admin-btn-ghost">
              Cancel
            </button>
            <button onClick={handleSave} disabled={modalLoading} className="admin-btn-primary">
              {modalLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingProduct ? "Update" : "Create"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* AI Extract — marketplace listing → form fields (staff-gated) */}
          {!editingProduct && (
            <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-brand-700">
                <TrendingUp className="h-4 w-4" />
                AI Extract from listing
              </div>
              <p className="text-xs text-dark-500">
                Paste a marketplace product URL (or the listing text) — AI fills the fields below for review.
              </p>
              <div className="flex gap-2">
                <input
                  value={aiExtractUrl}
                  onChange={(e) => setAiExtractUrl(e.target.value)}
                  placeholder="https://detail.1688.com/offer/..."
                  className="admin-input flex-1"
                  disabled={aiExtractBusy}
                />
                <button
                  onClick={handleAiExtract}
                  disabled={aiExtractBusy || !aiExtractUrl.trim()}
                  className="admin-btn-primary whitespace-nowrap"
                >
                  {aiExtractBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Extract
                </button>
              </div>
              {aiExtractMsg && (
                <p className={cn("text-xs", aiExtractMsg.ok ? "text-emerald-600" : "text-red-600")}>
                  {aiExtractMsg.text}
                </p>
              )}
            </div>
          )}

          {/* Titles section */}
          <div className="rounded-xl bg-dark-50/50 p-4 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-dark-400">Product Titles</p>
            <FormInput
              label="Title (English)"
              name="title_english"
              value={formData.title_english}
              onChange={handleFormChange("title_english")}
              placeholder="Product name in English"
              required
            />
            <div className="grid grid-cols-2 gap-4">
              <FormInput
                label="Title (Original)"
                name="title_original"
                value={formData.title_original}
                onChange={handleFormChange("title_original")}
                placeholder="Original language title"
              />
              <FormInput
                label="Title (Somali)"
                name="title_somali"
                value={formData.title_somali}
                onChange={handleFormChange("title_somali")}
                placeholder="Product name in Somali"
              />
            </div>
          </div>

          {/* Classification */}
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Category"
              name="category"
              value={formData.category}
              onChange={handleFormChange("category")}
              placeholder="e.g. Electronics, Clothing"
            />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-dark-700">Marketplace</label>
              <select
                value={formData.marketplace}
                onChange={(e) => handleFormChange("marketplace")(e.target.value)}
                className="w-full rounded-xl border border-dark-200 bg-white px-3.5 py-2.5 text-sm text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
              >
                {marketplaces.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Pricing */}
          <div className="rounded-xl bg-dark-50/50 p-4 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-dark-400">Pricing</p>
            <div className="grid grid-cols-3 gap-4">
              <FormInput
                label="Price (CNY Min)"
                name="price_cny_min"
                type="number"
                value={formData.price_cny_min}
                onChange={handleFormChange("price_cny_min")}
                placeholder="0.00"
                min={0}
                step={0.01}
              />
              <FormInput
                label="Price (CNY Max)"
                name="price_cny_max"
                type="number"
                value={formData.price_cny_max}
                onChange={handleFormChange("price_cny_max")}
                placeholder="0.00"
                min={0}
                step={0.01}
              />
              <FormInput
                label="Price (USD Est.)"
                name="price_usd_estimated"
                type="number"
                value={formData.price_usd_estimated}
                onChange={handleFormChange("price_usd_estimated")}
                placeholder="0.00"
                min={0}
                step={0.01}
              />
            </div>
          </div>

          {/* Stock & Status */}
          <div className="grid grid-cols-3 gap-4">
            <FormInput
              label="MOQ"
              name="moq"
              type="number"
              value={formData.moq}
              onChange={handleFormChange("moq")}
              placeholder="1"
              min={0}
            />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-dark-700">Stock Status</label>
              <select
                value={formData.stock_status}
                onChange={(e) => handleFormChange("stock_status")(e.target.value)}
                className="w-full rounded-xl border border-dark-200 bg-white px-3.5 py-2.5 text-sm text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
              >
                {stockStatusOptions.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-dark-700">Status</label>
              <select
                value={formData.status}
                onChange={(e) => handleFormChange("status")(e.target.value)}
                className="w-full rounded-xl border border-dark-200 bg-white px-3.5 py-2.5 text-sm text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Additional info */}
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Supplier Rating"
              name="supplier_rating"
              type="number"
              value={formData.supplier_rating}
              onChange={handleFormChange("supplier_rating")}
              placeholder="5.0"
              min={0}
              step={0.1}
            />
            <FormInput
              label="Sales Count"
              name="sales_count"
              type="number"
              value={formData.sales_count}
              onChange={handleFormChange("sales_count")}
              placeholder="0"
              min={0}
            />
          </div>

          <FormInput
            label="Source URL"
            name="source_url"
            type="url"
            value={formData.source_url}
            onChange={handleFormChange("source_url")}
            placeholder="https://..."
          />

          <FormInput
            label="Description"
            name="description_english"
            value={formData.description_english}
            onChange={handleFormChange("description_english")}
            placeholder="Product description..."
            textarea
            rows={3}
          />

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-dark-700">
              Image URLs <span className="text-dark-400 font-normal">(one per line)</span>
            </label>
            <textarea
              value={formData.images}
              onChange={(e) => handleFormChange("images")(e.target.value)}
              placeholder={"https://example.com/image1.jpg\nhttps://example.com/image2.jpg"}
              rows={3}
              className="w-full rounded-xl border border-dark-200 bg-white px-3.5 py-2.5 text-sm text-dark-900 placeholder:text-dark-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all resize-none font-mono text-xs"
            />
            {formData.images.trim() && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {formData.images.split("\n").filter((u) => u.trim()).map((url, i) => (
                  <img
                    key={i}
                    src={url.trim()}
                    alt={`Preview ${i + 1}`}
                    className="h-12 w-12 rounded-lg object-cover border border-dark-100"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </SidePanel>

      {/* ── Delete Confirmation ── */}
      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete Product"
        message={`Are you sure you want to delete "${deletingProduct?.title_english || deletingProduct?.title_original || "this product"}"? This action cannot be undone.`}
        onCancel={closeDeleteDialog}
        onConfirm={handleDelete}
        confirmText="Delete"
        loading={deleteLoading}
        danger
      />
    </div>
  );
}
