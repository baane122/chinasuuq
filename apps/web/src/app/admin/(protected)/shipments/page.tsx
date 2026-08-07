"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { cn, formatDate } from "@/lib/utils";
import { Search, Truck, Loader2, Plane, Ship, Package, MapPin, Plus, Pencil, Trash2 } from "lucide-react";
import type { Shipment } from "@/types";
import Modal from "@/components/admin/Modal";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { useToast } from "@/components/admin/Toast";
import FormInput from "@/components/admin/FormInput";

const statusTabs = ["All", "Preparing", "Loaded", "In Transit", "Arrived", "Customs", "Delivered"] as const;

const statusOptions: Shipment["status"][] = [
  "preparing",
  "loaded",
  "in_transit",
  "arrived",
  "customs",
  "delivered",
] as Shipment["status"][];

const statusColors: Record<string, string> = {
  preparing: "bg-blue-50 text-blue-600",
  loaded: "bg-indigo-50 text-indigo-600",
  in_transit: "bg-cyan-50 text-cyan-600",
  arrived: "bg-green-50 text-green-600",
  customs: "bg-amber-50 text-amber-600",
  delivered: "bg-green-50 text-green-600",
};

const methodIcons: Record<string, React.ElementType> = {
  air: Plane,
  sea: Ship,
  land: Truck,
};

interface ShipmentForm {
  reference: string;
  method: "air" | "sea" | "land";
  origin: string;
  destination: string;
  departure_date: string;
  estimated_arrival: string;
  tracking_number: string;
}

const emptyForm: ShipmentForm = {
  reference: "",
  method: "air",
  origin: "",
  destination: "",
  departure_date: "",
  estimated_arrival: "",
  tracking_number: "",
};

export default function ShipmentsPage() {
  const { success, error: toastError } = useToast();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<string>("All");

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ShipmentForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Shipment | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch
  const fetchShipments = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from("shipments")
        .select("*")
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setShipments((data as Shipment[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load shipments");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShipments();
  }, [fetchShipments]);

  // Filter
  const filteredShipments = useMemo(() => {
    return shipments.filter((shipment) => {
      const matchesSearch =
        search === "" ||
        shipment.reference.toLowerCase().includes(search.toLowerCase()) ||
        shipment.tracking_number?.toLowerCase().includes(search.toLowerCase()) ||
        shipment.origin.toLowerCase().includes(search.toLowerCase()) ||
        shipment.destination.toLowerCase().includes(search.toLowerCase());

      const matchesTab =
        activeTab === "All" ||
        shipment.status === activeTab.toLowerCase().replace(/\s+/g, "_");

      return matchesSearch && matchesTab;
    });
  }, [shipments, search, activeTab]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { All: shipments.length };
    shipments.forEach((s) => {
      const key = s.status.charAt(0).toUpperCase() + s.status.slice(1).replace(/_/g, " ");
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [shipments]);

  // Form helpers
  const updateField = useCallback((field: keyof ShipmentForm) => (value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm);
    setIsModalOpen(true);
  }, []);

  const openEdit = useCallback((shipment: Shipment) => {
    setEditingId(shipment.id);
    setForm({
      reference: shipment.reference,
      method: shipment.method,
      origin: shipment.origin,
      destination: shipment.destination,
      departure_date: shipment.departure_date ? shipment.departure_date.slice(0, 10) : "",
      estimated_arrival: shipment.estimated_arrival ? shipment.estimated_arrival.slice(0, 10) : "",
      tracking_number: shipment.tracking_number ?? "",
    });
    setIsModalOpen(true);
  }, []);

  // Save (create or update)
  const handleSave = useCallback(async () => {
    if (!form.reference.trim() || !form.origin.trim() || !form.destination.trim()) {
      toastError("Reference, origin and destination are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        reference: form.reference.trim(),
        method: form.method,
        origin: form.origin.trim(),
        destination: form.destination.trim(),
        departure_date: form.departure_date || null,
        estimated_arrival: form.estimated_arrival || null,
        tracking_number: form.tracking_number.trim() || null,
      };

      if (editingId) {
        const { error: updateError } = await supabase
          .from("shipments")
          .update(payload)
          .eq("id", editingId);
        if (updateError) throw updateError;
        success("Shipment updated");
      } else {
        const { error: insertError } = await supabase
          .from("shipments")
          .insert({
            ...payload,
            status: "preparing",
            packages: [],
            documents: [],
          });
        if (insertError) throw insertError;
        success("Shipment created");
      }

      setIsModalOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      await fetchShipments();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to save shipment");
    } finally {
      setSaving(false);
    }
  }, [form, editingId, fetchShipments, success, toastError]);

  // Inline status update
  const handleStatusChange = useCallback(async (id: string, newStatus: Shipment["status"]) => {
    try {
      const { error: updateError } = await supabase
        .from("shipments")
        .update({ status: newStatus })
        .eq("id", id);
      if (updateError) throw updateError;

      setShipments((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: newStatus } : s))
      );
      success(`Status updated to ${newStatus.replace(/_/g, " ")}`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to update status");
    }
  }, [success, toastError]);

  // Delete
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error: deleteError } = await supabase
        .from("shipments")
        .delete()
        .eq("id", deleteTarget.id);
      if (deleteError) throw deleteError;
      success("Shipment deleted");
      setDeleteTarget(null);
      await fetchShipments();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to delete shipment");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, fetchShipments, success, toastError]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-sm text-dark-400">Loading shipments...</p>
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
          <h1 className="text-2xl font-bold text-dark-900">Shipments</h1>
          <p className="text-sm text-dark-400">Track shipments from China to Somalia</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Shipment
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-400" />
        <input
          type="text"
          placeholder="Search by reference, tracking, or route..."
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
            {tab} {tabCounts[tab] !== undefined && (
              <span className="ml-1 text-xs text-dark-400">({tabCounts[tab]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Shipments table */}
      <div className="rounded-2xl bg-white border border-dark-100/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-50 bg-dark-50/50">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Reference
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Method
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Route
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Packages
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Departure
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Est. Arrival
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Tracking
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-dark-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-50">
              {filteredShipments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
                    <Truck className="mx-auto h-10 w-10 text-dark-300" />
                    <p className="mt-2 text-sm font-medium text-dark-400">
                      {search || activeTab !== "All" ? "No shipments match your filters" : "No shipments yet"}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredShipments.map((shipment) => {
                  const MethodIcon = methodIcons[shipment.method] || Truck;
                  return (
                    <tr key={shipment.id} className="hover:bg-dark-50/50 transition-colors">
                      <td className="px-6 py-3.5">
                        <span className="text-sm font-medium text-brand-500">{shipment.reference}</span>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2">
                          <MethodIcon className={cn(
                            "h-4 w-4",
                            shipment.method === "air" ? "text-blue-500" : shipment.method === "sea" ? "text-cyan-500" : "text-orange-500"
                          )} />
                          <span className="text-sm text-dark-600 capitalize">{shipment.method}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-1.5 text-sm text-dark-500">
                          <MapPin className="h-3.5 w-3.5 text-dark-400" />
                          <span>{shipment.origin}</span>
                          <span className="text-dark-300">→</span>
                          <span>{shipment.destination}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Package className="h-3.5 w-3.5 text-dark-400" />
                          <span className="text-sm text-dark-600">{shipment.packages.length}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <select
                          value={shipment.status}
                          onChange={(e) => handleStatusChange(shipment.id, e.target.value as Shipment["status"])}
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize border-0 focus:ring-2 focus:ring-brand-500/30 cursor-pointer appearance-auto",
                            statusColors[shipment.status] || "bg-dark-50 text-dark-500"
                          )}
                        >
                          {statusOptions.map((s) => (
                            <option key={s} value={s}>
                              {s.replace(/_/g, " ")}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="text-sm text-dark-400">{formatDate(shipment.departure_date ?? new Date().toISOString())}</span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="text-sm text-dark-400">{formatDate(shipment.estimated_arrival ?? new Date().toISOString())}</span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="text-sm font-mono text-dark-500 text-xs">
                          {shipment.tracking_number || "—"}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(shipment)}
                            className="rounded-lg p-1.5 text-dark-400 hover:bg-dark-50 hover:text-brand-500 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(shipment)}
                            className="rounded-lg p-1.5 text-dark-400 hover:bg-red-50 hover:text-red-500 transition-colors"
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

      {/* Create / Edit Modal */}
      <Modal
        open={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingId(null); }}
        title={editingId ? "Edit Shipment" : "Create Shipment"}
        onConfirm={handleSave}
        confirmText={editingId ? "Update" : "Create"}
        confirmLoading={saving}
      >
        <div className="space-y-4">
          <FormInput
            label="Reference"
            name="reference"
            value={form.reference}
            onChange={updateField("reference")}
            placeholder="e.g. SHP-2024-001"
            required
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-dark-700">
              Method <span className="text-red-500">*</span>
            </label>
            <select
              value={form.method}
              onChange={(e) => updateField("method")(e.target.value)}
              className="w-full rounded-xl border border-dark-200 bg-white px-3.5 py-2.5 text-sm text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            >
              <option value="air">Air</option>
              <option value="sea">Sea</option>
              <option value="land">Land</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Origin"
              name="origin"
              value={form.origin}
              onChange={updateField("origin")}
              placeholder="e.g. Guangzhou, China"
              required
            />
            <FormInput
              label="Destination"
              name="destination"
              value={form.destination}
              onChange={updateField("destination")}
              placeholder="e.g. Mogadishu, Somalia"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Departure Date"
              name="departure_date"
              value={form.departure_date}
              onChange={updateField("departure_date")}
              type="text"
              placeholder="YYYY-MM-DD"
            />
            <FormInput
              label="Estimated Arrival"
              name="estimated_arrival"
              value={form.estimated_arrival}
              onChange={updateField("estimated_arrival")}
              type="text"
              placeholder="YYYY-MM-DD"
            />
          </div>
          <FormInput
            label="Tracking Number"
            name="tracking_number"
            value={form.tracking_number}
            onChange={updateField("tracking_number")}
            placeholder="e.g. SF123456789"
          />
        </div>
      </Modal>

      {/* Delete ConfirmDialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Shipment"
        message={`Are you sure you want to delete "${deleteTarget?.reference}"? This action cannot be undone.`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        confirmText="Delete"
        loading={deleting}
        danger
      />
    </div>
  );
}
