"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { cn, formatDate } from "@/lib/utils";
import { Search, Warehouse, Loader2, Package, CheckCircle2, AlertCircle, Plus, Pencil, Trash2 } from "lucide-react";
import type { WarehousePackage } from "@/types";
import Modal from "@/components/admin/Modal";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { useToast } from "@/components/admin/Toast";
import FormInput from "@/components/admin/FormInput";

const statusTabs = ["All", "Received", "Inspected", "Consolidated"] as const;

const statusOptions: WarehousePackage["status"][] = [
  "received",
  "inspected",
  "consolidated",
  "shipped",
];

const statusColors: Record<string, string> = {
  received: "bg-blue-50 text-blue-600",
  inspected: "bg-amber-50 text-amber-600",
  consolidated: "bg-green-50 text-green-600",
  shipped: "bg-purple-50 text-purple-600",
};

const statusIcons: Record<string, React.ElementType> = {
  received: Package,
  inspected: CheckCircle2,
  consolidated: CheckCircle2,
  shipped: Package,
};

interface PackageFormState {
  barcode: string;
  order_id: string;
  weight_kg: string;
  inspection_notes: string;
}

const emptyForm: PackageFormState = {
  barcode: "",
  order_id: "",
  weight_kg: "",
  inspection_notes: "",
};

export default function WarehousePage() {
  const [packages, setPackages] = useState<WarehousePackage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<string>("All");

  const { success, error: toastError } = useToast();

  // Receive modal
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveForm, setReceiveForm] = useState<PackageFormState>(emptyForm);
  const [receiveLoading, setReceiveLoading] = useState(false);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<PackageFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  // Status update loading per row
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<WarehousePackage | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchPackages = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from("warehouse_packages")
        .select("*")
        .order("received_at", { ascending: false });

      if (fetchError) throw fetchError;
      setPackages((data as WarehousePackage[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load warehouse data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPackages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredPackages = useMemo(() => {
    return packages.filter((pkg) => {
      const matchesSearch =
        search === "" ||
        pkg.barcode.toLowerCase().includes(search.toLowerCase()) ||
        pkg.id.toLowerCase().includes(search.toLowerCase()) ||
        (pkg.order_id ?? "").toLowerCase().includes(search.toLowerCase());

      const matchesTab =
        activeTab === "All" || pkg.status === activeTab.toLowerCase();

      return matchesSearch && matchesTab;
    });
  }, [packages, search, activeTab]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { All: packages.length };
    packages.forEach((pkg) => {
      const key = pkg.status.charAt(0).toUpperCase() + pkg.status.slice(1);
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [packages]);

  const handleReceive = async () => {
    if (!receiveForm.barcode.trim() || !receiveForm.weight_kg) {
      toastError("Barcode and weight are required");
      return;
    }
    setReceiveLoading(true);
    try {
      const payload = {
        barcode: receiveForm.barcode.trim(),
        order_id: receiveForm.order_id.trim() || null,
        weight_kg: parseFloat(receiveForm.weight_kg) || 0,
        inspection_notes: receiveForm.inspection_notes.trim() || null,
        // Default dimensions object for the schema
        dimensions: { length: 0, width: 0, height: 0 },
        photos: [],
        status: "received" as const,
        received_at: new Date().toISOString(),
      };

      const { error: insertError } = await supabase
        .from("warehouse_packages")
        .insert(payload);

      if (insertError) throw insertError;

      success("Package received");
      setReceiveOpen(false);
      setReceiveForm(emptyForm);
      await fetchPackages();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to receive package");
    } finally {
      setReceiveLoading(false);
    }
  };

  const handleStatusChange = async (pkg: WarehousePackage, status: WarehousePackage["status"]) => {
    if (status === pkg.status) return;
    setStatusUpdatingId(pkg.id);
    try {
      const { error: updateError } = await supabase
        .from("warehouse_packages")
        .update({ status })
        .eq("id", pkg.id);

      if (updateError) throw updateError;

      setPackages((prev) =>
        prev.map((p) => (p.id === pkg.id ? { ...p, status } : p))
      );
      success(`Status updated to ${status}`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const openEdit = (pkg: WarehousePackage) => {
    setEditingId(pkg.id);
    setEditForm({
      barcode: pkg.barcode,
      order_id: pkg.order_id ?? "",
      weight_kg: String(pkg.weight_kg ?? ""),
      inspection_notes: pkg.inspection_notes ?? "",
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editingId) return;
    if (!editForm.barcode.trim() || !editForm.weight_kg) {
      toastError("Barcode and weight are required");
      return;
    }
    setEditLoading(true);
    try {
      const payload = {
        barcode: editForm.barcode.trim(),
        order_id: editForm.order_id.trim() || null,
        weight_kg: parseFloat(editForm.weight_kg) || 0,
        inspection_notes: editForm.inspection_notes.trim() || null,
      };

      const { error: updateError } = await supabase
        .from("warehouse_packages")
        .update(payload)
        .eq("id", editingId);

      if (updateError) throw updateError;

      success("Package updated");
      setEditOpen(false);
      setEditingId(null);
      await fetchPackages();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to update package");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const { error: deleteError } = await supabase
        .from("warehouse_packages")
        .delete()
        .eq("id", deleteTarget.id);

      if (deleteError) throw deleteError;

      success("Package deleted");
      setDeleteTarget(null);
      setPackages((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to delete package");
    } finally {
      setDeleteLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-sm text-dark-400">Loading warehouse data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={fetchPackages} className="mt-3 text-sm font-medium text-brand-500 hover:underline">
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
          <h1 className="text-2xl font-bold text-dark-900">Warehouse</h1>
          <p className="text-sm text-dark-400">Manage package intake, inspection, and consolidation</p>
        </div>
        <button
          onClick={() => setReceiveOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Receive Package
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-white border border-dark-100/50 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-dark-900">{tabCounts["Received"] || 0}</p>
              <p className="text-xs text-dark-400">Pending Inspection</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-dark-100/50 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-dark-900">{tabCounts["Inspected"] || 0}</p>
              <p className="text-xs text-dark-400">Inspection Queue</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-dark-100/50 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-dark-900">{tabCounts["Consolidated"] || 0}</p>
              <p className="text-xs text-dark-400">Ready to Ship</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-400" />
        <input
          type="text"
          placeholder="Search by barcode, ID, or order..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-full rounded-xl border border-dark-100 bg-white pl-10 pr-4 text-sm text-dark-900 placeholder:text-dark-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
        />
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 rounded-xl bg-dark-50 p-1 overflow-x-auto">
        {statusTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all",
              activeTab === tab
                ? "bg-white text-dark-900 shadow-sm"
                : "text-dark-400 hover:text-dark-600"
            )}
          >
            {tab}
            <span className={cn(
              "ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs",
              activeTab === tab ? "bg-brand-500 text-white" : "bg-dark-200/50 text-dark-500"
            )}>
              {tabCounts[tab] || 0}
            </span>
          </button>
        ))}
      </div>

      {/* Packages table */}
      <div className="rounded-2xl bg-white border border-dark-100/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-50 bg-dark-50/50">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Barcode
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Weight
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Dimensions
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Photos
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Received
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Notes
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-dark-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-50">
              {filteredPackages.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <Warehouse className="mx-auto h-10 w-10 text-dark-300" />
                    <p className="mt-2 text-sm font-medium text-dark-400">
                      {search || activeTab !== "All" ? "No packages match your filters" : "No packages in warehouse yet"}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredPackages.map((pkg) => {
                  const StatusIcon = statusIcons[pkg.status] || Package;
                  return (
                    <tr key={pkg.id} className="hover:bg-dark-50/50 transition-colors">
                      <td className="px-6 py-3.5">
                        <span className="text-sm font-mono font-medium text-dark-900">{pkg.barcode}</span>
                      </td>
                      <td className="px-6 py-3.5">
                        {statusUpdatingId === pkg.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
                        ) : (
                          <select
                            value={pkg.status}
                            onChange={(e) =>
                              handleStatusChange(pkg, e.target.value as WarehousePackage["status"])
                            }
                            className={cn(
                              "rounded-full cursor-pointer border-0 py-0.5 pl-2 pr-7 text-xs font-medium capitalize outline-none focus:ring-2 focus:ring-brand-500/30 transition-colors",
                              statusColors[pkg.status] || "bg-dark-50 text-dark-500"
                            )}
                          >
                            {statusOptions.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="text-sm text-dark-600">{pkg.weight_kg} kg</span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="text-sm text-dark-500">
                          {pkg.dimensions.length}×{pkg.dimensions.width}×{pkg.dimensions.height} cm
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="text-sm text-dark-500">
                          {pkg.photos.length} photo{pkg.photos.length !== 1 ? "s" : ""}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="text-sm text-dark-400">{formatDate(pkg.received_at ?? new Date().toISOString())}</span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="text-sm text-dark-400 truncate max-w-[150px] block">
                          {pkg.inspection_notes || "—"}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEdit(pkg)}
                            className="rounded-lg p-1.5 text-dark-400 hover:bg-dark-50 hover:text-dark-700 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(pkg)}
                            className="rounded-lg p-1.5 text-dark-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receive package modal */}
      <Modal
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        title="Receive Package"
        confirmText="Receive"
        confirmLoading={receiveLoading}
        onConfirm={handleReceive}
      >
        <div className="space-y-4">
          <FormInput
            label="Barcode"
            name="barcode"
            value={receiveForm.barcode}
            onChange={(v) => setReceiveForm((f) => ({ ...f, barcode: v }))}
            placeholder="Scan or enter barcode"
            required
          />
          <FormInput
            label="Order ID"
            name="order_id"
            value={receiveForm.order_id}
            onChange={(v) => setReceiveForm((f) => ({ ...f, order_id: v }))}
            placeholder="Associated order ID (optional)"
          />
          <FormInput
            label="Weight (kg)"
            name="weight_kg"
            type="number"
            min={0}
            step={0.01}
            value={receiveForm.weight_kg}
            onChange={(v) => setReceiveForm((f) => ({ ...f, weight_kg: v }))}
            placeholder="0.00"
            required
          />
          <FormInput
            label="Inspection Notes"
            name="inspection_notes"
            textarea
            rows={4}
            value={receiveForm.inspection_notes}
            onChange={(v) => setReceiveForm((f) => ({ ...f, inspection_notes: v }))}
            placeholder="Condition at intake, any damage, quantity check..."
          />
        </div>
      </Modal>

      {/* Edit package modal */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Package"
        confirmText="Save"
        confirmLoading={editLoading}
        onConfirm={handleEdit}
      >
        <div className="space-y-4">
          <FormInput
            label="Barcode"
            name="barcode"
            value={editForm.barcode}
            onChange={(v) => setEditForm((f) => ({ ...f, barcode: v }))}
            placeholder="Barcode"
            required
          />
          <FormInput
            label="Order ID"
            name="order_id"
            value={editForm.order_id}
            onChange={(v) => setEditForm((f) => ({ ...f, order_id: v }))}
            placeholder="Associated order ID (optional)"
          />
          <FormInput
            label="Weight (kg)"
            name="weight_kg"
            type="number"
            min={0}
            step={0.01}
            value={editForm.weight_kg}
            onChange={(v) => setEditForm((f) => ({ ...f, weight_kg: v }))}
            placeholder="0.00"
            required
          />
          <FormInput
            label="Inspection Notes"
            name="inspection_notes"
            textarea
            rows={4}
            value={editForm.inspection_notes}
            onChange={(v) => setEditForm((f) => ({ ...f, inspection_notes: v }))}
            placeholder="Inspection notes..."
          />
        </div>
      </Modal>

      {/* Delete confirm dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Package"
        message={
          deleteTarget
            ? `Are you sure you want to delete package "${deleteTarget.barcode}"? This action cannot be undone.`
            : ""
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleteLoading}
        confirmText="Delete"
      />
    </div>
  );
}
