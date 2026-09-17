"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import {
  Truck, Loader2, Plane, Ship, Package, MapPin, Plus, Pencil, Trash2,
  Calendar, Clock, Check, AlertTriangle, ArrowRight, Navigation, X
} from "lucide-react";
import type { Shipment } from "@/types";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { useToast } from "@/components/admin/Toast";
import FormInput from "@/components/admin/FormInput";
import { PageHeader, StatCard, PageGrid, SectionCard, SearchInput, FilterChips, TableShell, EMPTY_IMAGES, SidePanel } from "@/components/admin/ui";
import { motion, AnimatePresence } from "framer-motion";

/* ── Constants ─────────────────────────────────────────────────── */

const statusTabs = ["All", "Preparing", "Loaded", "In Transit", "Arrived", "Customs", "Delivered"] as const;

const statusOptions: Shipment["status"][] = [
  "preparing", "loaded", "in_transit", "arrived", "customs", "delivered",
];

const statusColors: Record<string, string> = {
  preparing: "bg-blue-50 text-blue-700 border-blue-200",
  loaded: "bg-indigo-50 text-indigo-700 border-indigo-200",
  in_transit: "bg-cyan-50 text-cyan-700 border-cyan-200",
  arrived: "bg-green-50 text-green-700 border-green-200",
  customs: "bg-amber-50 text-amber-700 border-amber-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const methodIcons: Record<string, React.ElementType> = {
  air: Plane,
  sea: Ship,
  land: Truck,
};

const methodColors: Record<string, string> = {
  air: "text-blue-500",
  sea: "text-cyan-600",
  land: "text-orange-500",
};

const statusWorkflow = ["preparing", "loaded", "in_transit", "arrived", "customs", "delivered"];

/* ── Form ──────────────────────────────────────────────────────── */

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
  reference: "", method: "air", origin: "", destination: "",
  departure_date: "", estimated_arrival: "", tracking_number: "",
};

/* ── Component ─────────────────────────────────────────────────── */

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

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Shipment | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Detail view
  const [selected, setSelected] = useState<Shipment | null>(null);

  /* ── Fetch ──────────────────────────────────────────────────── */

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

  useEffect(() => { fetchShipments(); }, [fetchShipments]);

  /* ── Filter ─────────────────────────────────────────────────── */

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

  /* ── KPIs ──────────────────────────────────────────────────── */

  const kpis = useMemo(() => {
    const total = shipments.length;
    const inTransit = shipments.filter((s) => s.status === "in_transit").length;
    const delivered = shipments.filter((s) => s.status === "delivered").length;
    const airCount = shipments.filter((s) => s.method === "air").length;
    const seaCount = shipments.filter((s) => s.method === "sea").length;
    const landCount = shipments.filter((s) => s.method === "land").length;
    const customs = shipments.filter((s) => s.status === "customs").length;

    // Avg transit time estimate
    const now = new Date();
    const upcomingETA = shipments
      .filter((s) => s.estimated_arrival && s.status !== "delivered")
      .sort((a, b) => new Date(a.estimated_arrival).getTime() - new Date(b.estimated_arrival).getTime());

    return { total, inTransit, delivered, airCount, seaCount, landCount, customs, upcomingETA };
  }, [shipments]);

  /* ── Tab counts ─────────────────────────────────────────────── */

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { All: shipments.length };
    shipments.forEach((s) => {
      const key = s.status.charAt(0).toUpperCase() + s.status.slice(1).replace(/_/g, " ");
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [shipments]);

  /* ── Form helpers ───────────────────────────────────────────── */

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

  /* ── Save ───────────────────────────────────────────────────── */

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
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", editingId);
        if (updateError) throw updateError;
        success("Shipment updated");
      } else {
        const { error: insertError } = await supabase
          .from("shipments")
          .insert({ ...payload, status: "preparing", packages: [], documents: [], created_at: new Date().toISOString() });
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

  /* ── Status update ─────────────────────────────────────────── */

  const handleStatusChange = useCallback(async (id: string, newStatus: Shipment["status"]) => {
    try {
      const { error: updateError } = await supabase
        .from("shipments")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (updateError) throw updateError;
      setShipments((prev) => prev.map((s) => s.id === id ? { ...s, status: newStatus } : s));
      if (selected?.id === id) setSelected({ ...selected, status: newStatus });
      success(`Status updated to ${newStatus.replace(/_/g, " ")}`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to update status");
    }
  }, [selected, success, toastError]);

  /* ── Delete ─────────────────────────────────────────────────── */

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
      setSelected(null);
      await fetchShipments();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to delete shipment");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, fetchShipments, success, toastError]);

  /* ── ETA helpers ────────────────────────────────────────────── */

  const getETAText = (shipment: Shipment) => {
    if (shipment.status === "delivered") return "Delivered";
    if (!shipment.estimated_arrival) return "—";
    const eta = new Date(shipment.estimated_arrival);
    const now = new Date();
    const diffDays = Math.ceil((eta.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    return `${diffDays} days`;
  };

  const getETAColor = (shipment: Shipment) => {
    if (shipment.status === "delivered") return "text-emerald-600";
    if (!shipment.estimated_arrival) return "text-dark-400";
    const eta = new Date(shipment.estimated_arrival);
    const now = new Date();
    const diffDays = Math.ceil((eta.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return "text-red-600";
    if (diffDays <= 3) return "text-amber-600";
    return "text-dark-600";
  };

  /* ── Render ─────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <PageHeader
        title="Shipments"
        subtitle="Consolidated freight from Guangzhou to Somalia — air & sea"
        actions={
          <button onClick={openCreate} className="admin-btn-primary">
            <Plus className="h-4 w-4" />
            Create Shipment
          </button>
        }
      />

      {/* ── KPI Stats ── */}
      <PageGrid className="grid-cols-2 sm:grid-cols-4">
        <StatCard label="Total Shipments" value={kpis.total} icon={Package} tone="brand" delay={0} />
        <StatCard label="In Transit" value={kpis.inTransit} icon={Navigation} tone="info" delay={1} />
        <StatCard label="In Customs" value={kpis.customs} icon={AlertTriangle} tone="warning" delay={2} />
        <StatCard label="Delivered" value={kpis.delivered} icon={Check} tone="success" delay={3} />
      </PageGrid>

      {/* ── Transport Breakdown ── */}
      <SectionCard title="Transport Mode Breakdown" subtitle="Current fleet split across air, sea and land">
        <div className="flex items-center gap-6">
          {[
            { label: "Air", count: kpis.airCount, icon: Plane, color: "bg-blue-500" },
            { label: "Sea", count: kpis.seaCount, icon: Ship, color: "bg-cyan-500" },
            { label: "Land", count: kpis.landCount, icon: Truck, color: "bg-orange-500" },
          ].map((m) => (
            <div key={m.label} className="flex items-center gap-3">
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-white", m.color)}>
                <m.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-lg font-bold text-dark-900">{m.count}</p>
                <p className="text-xs text-dark-400">{m.label}</p>
              </div>
            </div>
          ))}
          {/* Visual bar */}
          <div className="flex-1 h-3 rounded-full bg-dark-100 overflow-hidden flex ml-4">
            {kpis.total > 0 && (
              <>
                <div className="bg-blue-500 h-full" style={{ width: `${(kpis.airCount / kpis.total) * 100}%` }} />
                <div className="bg-cyan-500 h-full" style={{ width: `${(kpis.seaCount / kpis.total) * 100}%` }} />
                <div className="bg-orange-500 h-full" style={{ width: `${(kpis.landCount / kpis.total) * 100}%` }} />
              </>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ── Search ── */}
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search by reference, tracking, or route..."
        className="max-w-md"
      />

      {/* ── Status chips ── */}
      <FilterChips<string>
        options={statusTabs.map((tab) => ({ value: tab, label: tab, count: tabCounts[tab] }))}
        value={activeTab}
        onChange={setActiveTab}
      />

      {/* ── Upcoming ETAs ── */}
      {kpis.upcomingETA.length > 0 && (
        <SectionCard title="Upcoming Arrivals" subtitle="Nearest estimated arrivals across active shipments">
          <div className="flex gap-3 overflow-x-auto pb-1">
            {kpis.upcomingETA.slice(0, 6).map((s) => (
              <button
                key={s.id}
                onClick={() => setSelected(s)}
                className="flex shrink-0 flex-col rounded-xl border border-dark-900/[0.06] px-4 py-3 hover:border-brand-300 hover:bg-brand-50/30 transition-all min-w-[160px]"
              >
                <span className="text-xs font-semibold text-dark-900">{s.reference}</span>
                <span className="text-[10px] text-dark-400">{s.origin} → {s.destination}</span>
                <span className={cn("mt-1 text-xs font-bold", getETAColor(s))}>
                  {getETAText(s)}
                </span>
                <span className="text-[10px] text-dark-300">{formatDate(s.estimated_arrival)}</span>
              </button>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ── Shipments table ── */}
      <TableShell
        isLoading={isLoading}
        error={error}
        errorRetry={fetchShipments}
        hasData={filteredShipments.length > 0}
        filtered={!!search || activeTab !== "All"}
        emptyImage={EMPTY_IMAGES.shipments}
        emptyTitle="No shipments yet"
        emptySubtitle="Shipments appear here once packages are consolidated."
      >
      <div className="rounded-2xl bg-white border border-dark-900/[0.06] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="admin-table w-full">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Method</th>
                <th>Route</th>
                <th>Packages</th>
                <th>Status</th>
                <th>Departure</th>
                <th>ETA</th>
                <th>Tracking</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-900/[0.04]">
              {filteredShipments.map((shipment) => {
                  const MethodIcon = methodIcons[shipment.method] || Truck;
                  return (
                    <tr
                      key={shipment.id}
                      className="hover:bg-dark-50/50 transition-colors cursor-pointer"
                      onClick={() => setSelected(shipment)}
                    >
                      <td className="px-6 py-3.5">
                        <span className="text-sm font-medium text-brand-500">{shipment.reference}</span>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2">
                          <MethodIcon className={cn("h-4 w-4", methodColors[shipment.method] || "text-dark-400")} />
                          <span className="text-sm text-dark-600 capitalize">{shipment.method}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-1.5 text-sm text-dark-500">
                          <MapPin className="h-3.5 w-3.5 text-dark-400" />
                          <span>{shipment.origin}</span>
                          <ArrowRight className="h-3 w-3 text-dark-300" />
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
                          onChange={(e) => {
                            e.stopPropagation();
                            handleStatusChange(shipment.id, e.target.value as Shipment["status"]);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className={cn(
                            "rounded-full border-0 px-2.5 py-0.5 text-xs font-medium capitalize focus:ring-2 focus:ring-brand-500/30 cursor-pointer",
                            statusColors[shipment.status] || "bg-dark-50 text-dark-500"
                          )}
                        >
                          {statusOptions.map((s) => (
                            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="text-sm text-dark-400">
                          {formatDate(shipment.departure_date ?? new Date().toISOString())}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <div>
                          <span className={cn("text-sm font-medium", getETAColor(shipment))}>
                            {getETAText(shipment)}
                          </span>
                          {shipment.estimated_arrival && (
                            <p className="text-[10px] text-dark-300">{formatDate(shipment.estimated_arrival)}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="text-xs font-mono text-dark-500">
                          {shipment.tracking_number || "—"}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
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
                 })}
            </tbody>
          </table>
        </div>
        {filteredShipments.length > 0 && (
          <div className="border-t border-dark-900/[0.04] px-4 py-2.5 text-xs text-dark-400">
            Showing {filteredShipments.length} of {shipments.length} shipments
          </div>
        )}
      </div>
      </TableShell>

      {/* ── Shipment Detail Drawer ── */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setSelected(null)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-dark-900/5 px-6 py-4">
                <div>
                  <h2 className="text-lg font-bold text-dark-900">{selected.reference}</h2>
                  <p className="text-xs text-dark-900/40">{selected.method.toUpperCase()} Shipment</p>
                </div>
                <button onClick={() => setSelected(null)} className="rounded-lg p-1.5 text-dark-900/50 hover:bg-dark-50">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 space-y-5 p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize", statusColors[selected.status])}>
                    {selected.status.replace(/_/g, " ")}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-dark-200 bg-dark-50 px-2.5 py-0.5 text-xs font-medium text-dark-600 capitalize">
                    {selected.method}
                  </span>
                </div>

                {/* Progress */}
                <div className="rounded-xl bg-dark-50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-dark-500">Shipment Progress</span>
                    <span className="text-xs font-bold text-brand-600">
                      {Math.round((statusWorkflow.indexOf(selected.status) / (statusWorkflow.length - 1)) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-dark-100 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600"
                      initial={{ width: 0 }}
                      animate={{ width: `${(statusWorkflow.indexOf(selected.status) / (statusWorkflow.length - 1)) * 100}%` }}
                      transition={{ duration: 0.6 }}
                    />
                  </div>
                </div>

                {/* Status timeline */}
                <div>
                  <p className="text-xs font-semibold text-dark-900/50 uppercase tracking-wider mb-3">Status Timeline</p>
                  <div className="space-y-1">
                    {statusWorkflow.map((s, idx) => {
                      const currentIdx = statusWorkflow.indexOf(selected.status);
                      const isCompleted = idx <= currentIdx;
                      const isCurrent = idx === currentIdx;
                      return (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(selected.id, s as Shipment["status"])}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-all text-left",
                            isCurrent ? "bg-brand-50 text-brand-700 border border-brand-200"
                              : isCompleted ? "bg-emerald-50 text-emerald-700"
                              : "text-dark-400 hover:bg-dark-50"
                          )}
                        >
                          <div className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-full shrink-0",
                            isCompleted ? "bg-emerald-500 text-white" : "bg-dark-100 text-dark-400"
                          )}>
                            {isCompleted ? <Check className="h-3 w-3" /> : <span className="h-2 w-2 rounded-full bg-dark-300" />}
                          </div>
                          <span className="flex-1 capitalize">{s.replace(/_/g, " ")}</span>
                          {isCurrent && (
                            <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-bold text-white">CURRENT</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-3 rounded-2xl bg-dark-50 p-4">
                  <div className="space-y-3">
                    {[
                      { label: "Origin", value: selected.origin, icon: MapPin },
                      { label: "Destination", value: selected.destination, icon: MapPin },
                      { label: "Departure", value: formatDate(selected.departure_date ?? new Date().toISOString()), icon: Calendar },
                      { label: "ETA", value: selected.estimated_arrival ? formatDate(selected.estimated_arrival) : "—", icon: Clock },
                      { label: "Tracking", value: selected.tracking_number || "—", icon: Navigation },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-3">
                        <item.icon className="h-4 w-4 text-dark-400 shrink-0" />
                        <div>
                          <p className="text-[10px] text-dark-900/40 uppercase tracking-wider">{item.label}</p>
                          <p className="text-sm font-semibold text-dark-900">{item.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => { setSelected(null); openEdit(selected); }}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-dark-100 bg-white px-4 py-2.5 text-sm font-medium text-dark-600 hover:bg-dark-50 transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => { setSelected(null); setDeleteTarget(selected); }}
                    className="flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Create / Edit Panel ── */}
      <SidePanel
        open={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingId(null); }}
        title={editingId ? "Edit Shipment" : "Create Shipment"}
        subtitle="Route, schedule and tracking details"
        width="max-w-xl"
        footer={
          <>
            <button onClick={() => { setIsModalOpen(false); setEditingId(null); }} className="admin-btn-ghost">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="admin-btn-primary">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingId ? "Update" : "Create"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <FormInput label="Reference" name="reference" value={form.reference} onChange={updateField("reference")} placeholder="e.g. SHP-2024-001" required />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-dark-700">Method <span className="text-red-500">*</span></label>
            <select
              value={form.method}
              onChange={(e) => updateField("method")(e.target.value)}
              className="w-full rounded-xl border border-dark-200 bg-white px-3.5 py-2.5 text-sm text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            >
              <option value="air">Air Freight</option>
              <option value="sea">Sea Freight</option>
              <option value="land">Land Transport</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormInput label="Origin" name="origin" value={form.origin} onChange={updateField("origin")} placeholder="e.g. Guangzhou, China" required />
            <FormInput label="Destination" name="destination" value={form.destination} onChange={updateField("destination")} placeholder="e.g. Mogadishu, Somalia" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormInput label="Departure Date" name="departure_date" value={form.departure_date} onChange={updateField("departure_date")} type="text" placeholder="YYYY-MM-DD" />
            <FormInput label="Estimated Arrival" name="estimated_arrival" value={form.estimated_arrival} onChange={updateField("estimated_arrival")} type="text" placeholder="YYYY-MM-DD" />
          </div>
          <FormInput label="Tracking Number" name="tracking_number" value={form.tracking_number} onChange={updateField("tracking_number")} placeholder="e.g. SF123456789" />
        </div>
      </SidePanel>

      {/* ── Delete ConfirmDialog ── */}
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
