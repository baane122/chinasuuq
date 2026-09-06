"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { cn, formatCNY, formatUSD, formatDate } from "@/lib/utils";
import {
  Search, Package, Loader2, ExternalLink, Edit3, Trash2, Plus,
  Download, ArrowUpDown, CheckSquare, Square, Check, Image as ImageIcon,
  Filter, X, ChevronDown
} from "lucide-react";
import type { Product } from "@/types";
import Modal from "@/components/admin/Modal";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { useToast } from "@/components/admin/Toast";
import FormInput from "@/components/admin/FormInput";
import { motion, AnimatePresence } from "framer-motion";

/* ── Constants ─────────────────────────────────────────────────── */

const marketplaceFilters = ["All", "1688", "Taobao", "Yiwugo", "Alibaba", "ChinaGoods", "JD", "ChinaSuuq"] as const;
const marketplaces = ["1688", "taobao", "yiwugo", "alibaba", "chinagoods", "jd", "chinasuuq"] as const;
const stockStatusOptions = ["in_stock", "low_stock", "out_of_stock"] as const;
const statusOptions = ["active", "draft", "archived"] as const;

const stockStatusColors: Record<string, string> = {
  in_stock: "bg-green-50 text-green-700 border-green-200",
  low_stock: "bg-amber-50 text-amber-700 border-amber-200",
  out_of_stock: "bg-red-50 text-red-700 border-red-200",
};

const statusColors: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  draft: "bg-gray-100 text-gray-600 border-gray-200",
  archived: "bg-red-50 text-red-600 border-red-200",
};

const marketplaceColors: Record<string, string> = {
  "1688": "bg-orange-50 text-orange-700 border-orange-200",
  taobao: "bg-red-50 text-red-700 border-red-200",
  yiwugo: "bg-blue-50 text-blue-700 border-blue-200",
  alibaba: "bg-yellow-50 text-yellow-700 border-yellow-200",
  chinagoods: "bg-rose-50 text-rose-700 border-rose-200",
  jd: "bg-red-50 text-red-700 border-red-200",
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

/* ── Component ─────────────────────────────────────────────────── */

export default function ProductsPage() {
  const { success, error: toastError } = useToast();

  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>("All");
  const [stockFilter, setStockFilter] = useState<string>("All");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showFilters, setShowFilters] = useState(false);

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
      const { data, error: fetchError } = await supabase
        .from("source_products")
        .select("*")
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setProducts((data as Product[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchProducts(); }, []);

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

      return matchesSearch && matchesMarketplace && matchesStock && matchesPriceMin && matchesPriceMax;
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
  }, [products, search, marketplaceFilter, stockFilter, priceMin, priceMax, sortKey, sortDir]);

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
    if (sortKey === key) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
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
    setModalOpen(true);
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

      const payload = {
        title_english: formData.title_english.trim(),
        title_somali: formData.title_somali.trim(),
        title_original: formData.title_original.trim(),
        category: formData.category.trim(),
        marketplace: formData.marketplace,
        price_cny_min: formData.price_cny_min ? Number(formData.price_cny_min) : null,
        price_cny_max: formData.price_cny_max ? Number(formData.price_cny_max) : null,
        price_usd_estimated: formData.price_usd_estimated ? Number(formData.price_usd_estimated) : null,
        moq: formData.moq ? Number(formData.moq) : 0,
        stock_status: formData.stock_status,
        status: formData.status,
        supplier_rating: formData.supplier_rating ? Number(formData.supplier_rating) : null,
        sales_count: formData.sales_count ? Number(formData.sales_count) : 0,
        source_url: formData.source_url.trim(),
        description_english: formData.description_english.trim(),
        images: imageUrls,
        updated_at: new Date().toISOString(),
      };

      if (editingProduct) {
        const { error: updateError } = await supabase
          .from("source_products")
          .update(payload)
          .eq("id", editingProduct.id);
        if (updateError) throw updateError;
        setProducts((prev) =>
          prev.map((p) => (p.id === editingProduct.id ? { ...p, ...payload } as Product : p))
        );
        success("Product updated successfully");
      } else {
        const { data, error: insertError } = await supabase
          .from("source_products")
          .insert({ ...payload, created_at: new Date().toISOString() })
          .select()
          .single();
        if (insertError) throw insertError;
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

  /* ── Loading / Error ────────────────────────────────────────── */

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-sm text-dark-400">Loading products...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={() => window.location.reload()} className="mt-3 text-sm font-medium text-brand-500 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  /* ── Render ─────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-900">Products</h1>
          <p className="text-sm text-dark-400">Manage product catalog across marketplaces</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 rounded-xl border border-dark-100 bg-white px-4 py-2.5 text-sm font-medium text-dark-600 hover:bg-dark-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Product
          </button>
        </div>
      </div>

      {/* ── KPI Stats ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "Total", value: stats.total, color: "text-dark-900" },
          { label: "Active", value: stats.active, color: "text-emerald-600" },
          { label: "Low Stock", value: stats.lowStock, color: "text-amber-600" },
          { label: "Out of Stock", value: stats.outOfStock, color: "text-red-600" },
          { label: "Avg Price", value: `${formatCNY(stats.avgPrice).slice(0, -3)}`, color: "text-brand-600" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-dark-100/50 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium text-dark-400">{kpi.label}</p>
            <p className={cn("mt-1 text-xl font-bold", kpi.color)}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* ── Search + Filters ── */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-400" />
            <input
              type="text"
              placeholder="Search products by title, category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-xl border border-dark-100 bg-white pl-10 pr-4 text-sm text-dark-900 placeholder:text-dark-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-300 hover:text-dark-500">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                showFilters ? "border-brand-500 bg-brand-50 text-brand-600" : "border-dark-100 bg-white text-dark-500 hover:bg-dark-50"
              )}
            >
              <Filter className="h-4 w-4" />
              Filters
              {(stockFilter !== "All" || priceMin || priceMax) && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-[10px] font-bold text-white">
                  {1 + (priceMin ? 1 : 0) + (priceMax ? 1 : 0)}
                </span>
              )}
            </button>
            <span className="flex items-center gap-1.5 text-sm text-dark-400">
              <Package className="h-4 w-4" />
              {filteredProducts.length} product{filteredProducts.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Expanded filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap items-end gap-4 rounded-xl border border-dark-100 bg-white p-4 shadow-sm">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-dark-400">Stock Status</label>
                  <div className="flex flex-wrap gap-1.5">
                    {["All", ...stockStatusOptions].map((s) => (
                      <button
                        key={s}
                        onClick={() => setStockFilter(s)}
                        className={cn(
                          "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                          stockFilter === s
                            ? "bg-brand-500 text-white"
                            : "bg-dark-50 text-dark-500 hover:bg-dark-100"
                        )}
                      >
                        {s === "All" ? "All" : s.replace(/_/g, " ")}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-dark-400">Price Range (CNY)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      value={priceMin}
                      onChange={(e) => setPriceMin(e.target.value)}
                      className="h-9 w-24 rounded-lg border border-dark-100 px-3 text-sm focus:border-brand-500 focus:outline-none"
                      min={0}
                    />
                    <span className="text-dark-300">—</span>
                    <input
                      type="number"
                      placeholder="Max"
                      value={priceMax}
                      onChange={(e) => setPriceMax(e.target.value)}
                      className="h-9 w-24 rounded-lg border border-dark-100 px-3 text-sm focus:border-brand-500 focus:outline-none"
                      min={0}
                    />
                  </div>
                </div>
                {(stockFilter !== "All" || priceMin || priceMax) && (
                  <button
                    onClick={() => { setStockFilter("All"); setPriceMin(""); setPriceMax(""); }}
                    className="rounded-lg bg-dark-50 px-3 py-1.5 text-xs font-medium text-dark-500 hover:bg-dark-100"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Marketplace tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-dark-50 p-1 overflow-x-auto">
          {marketplaceFilters.map((filter) => (
            <button
              key={filter}
              onClick={() => setMarketplaceFilter(filter)}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                marketplaceFilter === filter
                  ? "bg-white text-dark-900 shadow-sm"
                  : "text-dark-400 hover:text-dark-600"
              )}
            >
              {filter}
            </button>
          ))}
        </div>
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
      <div className="rounded-2xl bg-white border border-dark-100/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-50 bg-dark-50/50">
                <th className="w-10 px-4 py-3">
                  <button onClick={toggleSelectAll} className="flex items-center justify-center">
                    {allVisibleSelected ? (
                      <CheckSquare className="h-4 w-4 text-brand-500" />
                    ) : (
                      <Square className="h-4 w-4 text-dark-300" />
                    )}
                  </button>
                </th>
                <th
                  onClick={() => toggleSort("title_english")}
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400 cursor-pointer hover:text-dark-600"
                >
                  <span className="inline-flex items-center gap-1">Product <SortIcon col="title_english" /></span>
                </th>
                <th
                  onClick={() => toggleSort("marketplace")}
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400 cursor-pointer hover:text-dark-600"
                >
                  <span className="inline-flex items-center gap-1">Marketplace <SortIcon col="marketplace" /></span>
                </th>
                <th
                  onClick={() => toggleSort("price_cny_min")}
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400 cursor-pointer hover:text-dark-600"
                >
                  <span className="inline-flex items-center gap-1">Price <SortIcon col="price_cny_min" /></span>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">MOQ</th>
                <th
                  onClick={() => toggleSort("stock_status")}
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400 cursor-pointer hover:text-dark-600"
                >
                  <span className="inline-flex items-center gap-1">Status <SortIcon col="stock_status" /></span>
                </th>
                <th
                  onClick={() => toggleSort("sales_count")}
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400 cursor-pointer hover:text-dark-600"
                >
                  <span className="inline-flex items-center gap-1">Sales <SortIcon col="sales_count" /></span>
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-dark-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-50">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <Package className="mx-auto h-10 w-10 text-dark-300" />
                    <p className="mt-2 text-sm font-medium text-dark-400">
                      {search || marketplaceFilter !== "All" || stockFilter !== "All"
                        ? "No products match your filters"
                        : "No products yet"}
                    </p>
                    {!search && marketplaceFilter === "All" && (
                      <button onClick={openAddModal} className="mt-3 text-sm font-medium text-brand-500 hover:underline">
                        Add your first product
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr
                    key={product.id}
                    className={cn(
                      "transition-colors",
                      selectedIds.has(product.id)
                        ? "bg-brand-50/50"
                        : "hover:bg-dark-50/50"
                    )}
                  >
                    <td className="px-4 py-3">
                      <button onClick={() => toggleSelect(product.id)} className="flex items-center justify-center">
                        {selectedIds.has(product.id) ? (
                          <CheckSquare className="h-4 w-4 text-brand-500" />
                        ) : (
                          <Square className="h-4 w-4 text-dark-300 hover:text-dark-500" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        {product.images && product.images.length > 0 ? (
                          <button
                            onClick={() => setPreviewImage(product.images[0])}
                            className="shrink-0"
                          >
                            <img
                              src={product.images[0]}
                              alt={product.title_english}
                              className="h-10 w-10 rounded-lg object-cover border border-dark-100 hover:ring-2 hover:ring-brand-500/30 transition-all"
                            />
                          </button>
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-dark-100">
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
                    <td className="px-4 py-3.5">
                      <span className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                        marketplaceColors[product.marketplace] || "bg-dark-50 text-dark-500 border-dark-200"
                      )}>
                        {product.marketplace}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
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
                    <td className="px-4 py-3.5">
                      <span className="text-sm text-dark-600">{product.moq?.toLocaleString() || "—"}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                        stockStatusColors[product.stock_status] || "bg-dark-50 text-dark-500 border-dark-200"
                      )}>
                        {product.stock_status?.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm text-dark-600">{product.sales_count?.toLocaleString() || "0"}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        {product.source_url && (
                          <a
                            href={product.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg p-1.5 text-dark-400 hover:bg-dark-50 hover:text-brand-500 transition-all"
                            title="Open source URL"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                        <button
                          onClick={() => openEditModal(product)}
                          className="rounded-lg p-1.5 text-dark-400 hover:bg-dark-50 hover:text-brand-500 transition-all"
                          title="Edit product"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openDeleteDialog(product)}
                          className="rounded-lg p-1.5 text-dark-400 hover:bg-dark-50 hover:text-red-500 transition-all"
                          title="Delete product"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Table footer */}
        {filteredProducts.length > 0 && (
          <div className="border-t border-dark-50 px-4 py-2.5 text-xs text-dark-400">
            Showing {filteredProducts.length} of {products.length} products
            {someSelected && ` · ${selectedIds.size} selected`}
          </div>
        )}
      </div>

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

      {/* ── Add / Edit Modal ── */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingProduct ? "Edit Product" : "Add Product"}
        onConfirm={handleSave}
        confirmText={editingProduct ? "Update" : "Create"}
        confirmLoading={modalLoading}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
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
      </Modal>

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
