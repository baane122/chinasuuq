"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { cn, formatDate } from "@/lib/utils";
import { Package, CheckCircle2, AlertCircle, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import type { WarehousePackage } from "@/types";
import {
  PageHeader,
  PageGrid,
  StatCard,
  SearchInput,
  FilterChips,
  TableShell,
  SidePanel,
  EMPTY_IMAGES,
} from "@/components/admin/ui";
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

/* Aligned with the shared StatusBadge palette */
const statusColors: Record<string, string> = {
  received: "bg-violet-50 text-violet-700",
  inspected: "bg-amber-50 text-amber-700",
  consolidated: "bg-sky-50 text-sky-700",
  shipped: "bg-sky-50 text-sky-700",
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

  // Receive panel
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveForm, setReceiveForm] = useState<PackageFormState>(emptyForm);
  const [receiveLoading, setReceiveLoading] = useState(false);

  // Edit panel
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

  const filtersActive = search !== "" || activeTab !== "All";

  return (
    <div>
      <PageHeader
        title="Warehouse"
        subtitle="Intake, inspection and consolidation at the Guangzhou hub"
        actions={
          <button onClick={() => setReceiveOpen(true)} className="admin-btn-primary">
            <Plus className="h-4 w-4" />
            Receive Package
          </button>
        }
      />

      {!isLoading && !error && (
        <PageGrid>
          <StatCard
            label="Pending Inspection"
            value={tabCounts["Received"] || 0}
            icon={Package}
            tone="violet"
            delay={0}
          />
          <StatCard
            label="Inspection Queue"
            value={tabCounts["Inspected"] || 0}
            icon={AlertCircle}
            tone="info"
            delay={1}
          />
          <StatCard
            label="Ready to Ship"
            value={tabCounts["Consolidated"] || 0}
            icon={CheckCircle2}
            tone="success"
            delay={2}
          />
        </PageGrid>
      )}

      <div className="space-y-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by barcode, ID, or order…"
          className="w-full sm:max-w-sm"
        />

        <FilterChips<string>
          options={statusTabs.map((tab) => ({
            value: tab as string,
            label: tab,
            count: tabCounts[tab],
          }))}
          value={activeTab}
          onChange={setActiveTab}
        />

        <TableShell
          isLoading={isLoading}
          error={error}
          hasData={filteredPackages.length > 0}
          filtered={filtersActive}
          emptyImage={EMPTY_IMAGES.orders}
          emptyTitle="Warehouse is clear"
          emptySubtitle="Packages arrive here after purchase."
          emptyAction={
            <button onClick={() => setReceiveOpen(true)} className="admin-btn-primary">
              <Plus className="h-4 w-4" />
              Receive Package
            </button>
          }
          errorRetry={fetchPackages}
        >
          <div className="overflow-hidden rounded-2xl border border-dark-900/[0.06] bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="admin-table w-full">
                <thead>
                  <tr>
                    <th>Barcode</th>
                    <th>Status</th>
                    <th>Weight</th>
                    <th>Dimensions</th>
                    <th>Photos</th>
                    <th>Received</th>
                    <th>Notes</th>
                    <th className="text-right!">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPackages.map((pkg) => (
                    <tr key={pkg.id}>
                      <td>
                        <span className="font-mono text-[13px] font-semibold text-dark-900">
                          {pkg.barcode}
                        </span>
                      </td>
                      <td>
                        {statusUpdatingId === pkg.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
                        ) : (
                          <select
                            value={pkg.status}
                            onChange={(e) =>
                              handleStatusChange(pkg, e.target.value as WarehousePackage["status"])
                            }
                            className={cn(
                              "cursor-pointer rounded-full border-0 py-0.5 pl-2 pr-7 text-xs font-medium capitalize outline-none focus:ring-2 focus:ring-brand-500/30 transition-colors",
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
                      <td>
                        <span className="text-dark-600">{pkg.weight_kg} kg</span>
                      </td>
                      <td>
                        <span className="text-dark-500">
                          {pkg.dimensions.length}×{pkg.dimensions.width}×{pkg.dimensions.height} cm
                        </span>
                      </td>
                      <td>
                        <span className="text-dark-500">
                          {pkg.photos.length} photo{pkg.photos.length !== 1 ? "s" : ""}
                        </span>
                      </td>
                      <td>
                        <span className="text-dark-900/45">
                          {formatDate(pkg.received_at ?? new Date().toISOString())}
                        </span>
                      </td>
                      <td>
                        <span className="block max-w-[150px] truncate text-dark-900/45">
                          {pkg.inspection_notes || "—"}
                        </span>
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(pkg)}
                            className="rounded-lg p-1.5 text-dark-900/40 transition-all hover:bg-dark-900/5 hover:text-brand-600"
                            aria-label="Edit package"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(pkg)}
                            className="rounded-lg p-1.5 text-dark-900/40 transition-all hover:bg-error/10 hover:text-error"
                            aria-label="Delete package"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredPackages.length > 0 && (
              <div className="border-t border-dark-900/[0.06] px-4 py-2.5 text-xs text-dark-900/40">
                Showing {filteredPackages.length} of {packages.length} packages
              </div>
            )}
          </div>
        </TableShell>
      </div>

      {/* Receive package panel */}
      <SidePanel
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        title="Receive Package"
        subtitle="Register a package at intake"
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setReceiveOpen(false)} className="admin-btn-ghost">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReceive}
              disabled={receiveLoading}
              className="admin-btn-primary"
            >
              {receiveLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Receive
            </button>
          </div>
        }
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
      </SidePanel>

      {/* Edit package panel */}
      <SidePanel
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Package"
        subtitle={editingId ? `Package ${editForm.barcode || editingId}` : undefined}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setEditOpen(false)} className="admin-btn-ghost">
              Cancel
            </button>
            <button type="button" onClick={handleEdit} disabled={editLoading} className="admin-btn-primary">
              {editLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        }
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
      </SidePanel>

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
