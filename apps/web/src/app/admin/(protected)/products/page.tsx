"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { cn, formatCNY, formatUSD } from "@/lib/utils";
import { Search, Package, Loader2, ExternalLink, Edit3, Trash2, Plus } from "lucide-react";
import type { Product } from "@/types";
import Modal from "@/components/admin/Modal";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { useToast } from "@/components/admin/Toast";
import FormInput from "@/components/admin/FormInput";

const marketplaceFilters = ["All", "1688", "Taobao", "Yiwugo", "Alibaba", "ChinaGoods", "JD", "ChinaSuuq"] as const;

const marketplaces = ["1688", "taobao", "yiwugo", "alibaba", "chinagoods", "jd", "chinasuuq"] as const;

const stockStatusOptions = ["in_stock", "low_stock", "out_of_stock"] as const;

const stockStatusColors: Record<string, string> = {
  in_stock: "bg-green-50 text-green-600",
  low_stock: "bg-amber-50 text-amber-600",
  out_of_stock: "bg-red-50 text-red-600",
};

const marketplaceColors: Record<string, string> = {
  "1688": "bg-orange-50 text-orange-600",
  taobao: "bg-red-50 text-red-600",
  yiwugo: "bg-blue-50 text-blue-600",
  alibaba: "bg-yellow-50 text-yellow-600",
  chinagoods: "bg-rose-50 text-rose-600",
  jd: "bg-red-50 text-red-700",
  chinasuuq: "bg-brand-50 text-brand-500",
};

interface ProductFormData {
  title_english: string;
  title_somali: string;
  category: string;
  marketplace: string;
  price_cny_min: string;
  price_cny_max: string;
  price_usd_estimated: string;
  moq: string;
  stock_status: string;
  supplier_rating: string;
  sales_count: string;
  source_url: string;
}

const emptyFormData: ProductFormData = {
  title_english: "",
  title_somali: "",
  category: "",
  marketplace: "1688",
  price_cny_min: "",
  price_cny_max: "",
  price_usd_estimated: "",
  moq: "",
  stock_status: "in_stock",
  supplier_rating: "",
  sales_count: "",
  source_url: "",
};

export default function ProductsPage() {
  const { success, error: toastError } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>("All");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(emptyFormData);

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

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

  useEffect(() => {
    fetchProducts();
  }, []);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        search === "" ||
        product.title_english?.toLowerCase().includes(search.toLowerCase()) ||
        product.title_original?.toLowerCase().includes(search.toLowerCase()) ||
        product.category?.toLowerCase().includes(search.toLowerCase());

      const matchesMarketplace =
        marketplaceFilter === "All" ||
        product.marketplace?.toLowerCase() === marketplaceFilter.toLowerCase();

      return matchesSearch && matchesMarketplace;
    });
  }, [products, search, marketplaceFilter]);

  // ---- Modal helpers ----

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
      category: product.category || "",
      marketplace: product.marketplace || "1688",
      price_cny_min: product.price_cny_min?.toString() || "",
      price_cny_max: product.price_cny_max?.toString() || "",
      price_usd_estimated: product.price_usd_estimated?.toString() || "",
      moq: product.moq?.toString() || "",
      stock_status: product.stock_status || "in_stock",
      supplier_rating: product.supplier_rating?.toString() || "",
      sales_count: product.sales_count?.toString() || "",
      source_url: product.source_url || "",
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
      const payload = {
        title_english: formData.title_english.trim(),
        title_somali: formData.title_somali.trim(),
        category: formData.category.trim(),
        marketplace: formData.marketplace,
        price_cny_min: formData.price_cny_min ? Number(formData.price_cny_min) : null,
        price_cny_max: formData.price_cny_max ? Number(formData.price_cny_max) : null,
        price_usd_estimated: formData.price_usd_estimated ? Number(formData.price_usd_estimated) : null,
        moq: formData.moq ? Number(formData.moq) : 0,
        stock_status: formData.stock_status,
        supplier_rating: formData.supplier_rating ? Number(formData.supplier_rating) : null,
        sales_count: formData.sales_count ? Number(formData.sales_count) : 0,
        source_url: formData.source_url.trim(),
      };

      if (editingProduct) {
        // UPDATE
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
        // CREATE
        const { data, error: insertError } = await supabase
          .from("source_products")
          .insert(payload)
          .select()
          .single();

        if (insertError) throw insertError;

        if (data) {
          setProducts((prev) => [data as Product, ...prev]);
        }
        success("Product created successfully");
      }

      closeModal();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setModalLoading(false);
    }
  };

  // ---- Delete helpers ----

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
      success("Product deleted successfully");
      closeDeleteDialog();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to delete product");
    } finally {
      setDeleteLoading(false);
    }
  };

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

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-900">Products</h1>
          <p className="text-sm text-dark-400">Browse and manage product catalog</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-dark-400">
            <Package className="h-4 w-4" />
            <span>{filteredProducts.length} product{filteredProducts.length !== 1 ? "s" : ""}</span>
          </div>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Product
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-400" />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-dark-100 bg-white pl-10 pr-4 text-sm text-dark-900 placeholder:text-dark-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
          />
        </div>

        {/* Marketplace filter tabs */}
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

      {/* Products table */}
      <div className="rounded-2xl bg-white border border-dark-100/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-50 bg-dark-50/50">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Product
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Marketplace
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Sales
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-dark-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-50">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <Package className="mx-auto h-10 w-10 text-dark-300" />
                    <p className="mt-2 text-sm font-medium text-dark-400">
                      {search || marketplaceFilter !== "All" ? "No products match your filters" : "No products yet"}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-dark-50/50 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        {product.images && product.images.length > 0 ? (
                          <img
                            src={product.images[0]}
                            alt={product.title_english}
                            className="h-10 w-10 rounded-lg object-cover border border-dark-100"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dark-100">
                            <Package className="h-5 w-5 text-dark-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-dark-900 truncate max-w-[200px]">
                            {product.title_english || product.title_original}
                          </p>
                          <p className="text-xs text-dark-400 truncate max-w-[200px]">
                            {product.category}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                          marketplaceColors[product.marketplace] || "bg-dark-50 text-dark-500"
                        )}
                      >
                        {product.marketplace}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <div>
                        <p className="text-sm font-medium text-dark-900">{formatCNY(product.price_cny_min)}</p>
                        {product.price_cny_max > product.price_cny_min && (
                          <p className="text-xs text-dark-400">
                            – {formatCNY(product.price_cny_max)}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                          stockStatusColors[product.stock_status] || "bg-dark-50 text-dark-500"
                        )}
                      >
                        {product.stock_status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm text-dark-600">{product.sales_count?.toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        {product.source_url && (
                          <a
                            href={product.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg p-1.5 text-dark-400 hover:bg-dark-50 hover:text-brand-500 transition-all"
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
      </div>

      {/* Add / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingProduct ? "Edit Product" : "Add Product"}
        onConfirm={handleSave}
        confirmText={editingProduct ? "Update" : "Create"}
        confirmLoading={modalLoading}
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          <FormInput
            label="Title (English)"
            name="title_english"
            value={formData.title_english}
            onChange={handleFormChange("title_english")}
            placeholder="Product name in English"
            required
          />
          <FormInput
            label="Title (Somali)"
            name="title_somali"
            value={formData.title_somali}
            onChange={handleFormChange("title_somali")}
            placeholder="Product name in Somali"
          />
          <FormInput
            label="Category"
            name="category"
            value={formData.category}
            onChange={handleFormChange("category")}
            placeholder="e.g. Electronics, Clothing"
          />
          {/* Marketplace selector */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-dark-700">
              Marketplace
            </label>
            <select
              name="marketplace"
              value={formData.marketplace}
              onChange={(e) => handleFormChange("marketplace")(e.target.value)}
              className="w-full rounded-xl border border-dark-200 bg-white px-3.5 py-2.5 text-sm text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            >
              {marketplaces.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
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
          </div>
          <FormInput
            label="Price (USD Estimated)"
            name="price_usd_estimated"
            type="number"
            value={formData.price_usd_estimated}
            onChange={handleFormChange("price_usd_estimated")}
            placeholder="0.00"
            min={0}
            step={0.01}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="MOQ"
              name="moq"
              type="number"
              value={formData.moq}
              onChange={handleFormChange("moq")}
              placeholder="1"
              min={0}
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
          {/* Stock status selector */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-dark-700">
              Stock Status
            </label>
            <select
              name="stock_status"
              value={formData.stock_status}
              onChange={(e) => handleFormChange("stock_status")(e.target.value)}
              className="w-full rounded-xl border border-dark-200 bg-white px-3.5 py-2.5 text-sm text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            >
              {stockStatusOptions.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
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
              label="Source URL"
              name="source_url"
              type="url"
              value={formData.source_url}
              onChange={handleFormChange("source_url")}
              placeholder="https://..."
            />
          </div>
        </div>
      </Modal>

      {/* Delete confirmation dialog */}
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