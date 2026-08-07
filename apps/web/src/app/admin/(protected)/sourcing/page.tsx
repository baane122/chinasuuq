"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { cn, formatDate } from "@/lib/utils";
import { Search, ClipboardList, Loader2, Plus, Edit3, Trash2 } from "lucide-react";
import { useToast } from "@/components/admin/Toast";
import Modal from "@/components/admin/Modal";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import FormInput from "@/components/admin/FormInput";

interface SourcingRequest {
  id: string;
  customer_id: string;
  marketplace: string;
  product_url?: string;
  product_description: string;
  quantity: number;
  destination_city: string;
  status: "pending" | "assigned" | "quoted" | "approved" | "purchased";
  agent_id?: string;
  created_at: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-amber-50 text-amber-600",
  assigned: "bg-blue-50 text-blue-600",
  quoted: "bg-purple-50 text-purple-600",
  approved: "bg-green-50 text-green-600",
  purchased: "bg-indigo-50 text-indigo-600",
};

const statusLabels: Record<string, string> = {
  pending: "Pending",
  assigned: "Assigned",
  quoted: "Quoted",
  approved: "Approved",
  purchased: "Purchased",
};

const defaultForm = {
  customer_id: "",
  marketplace: "",
  product_description: "",
  quantity: 1,
  destination_city: "",
};

export default function SourcingPage() {
  const toast = useToast();
  const [requests, setRequests] = useState<SourcingRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  // Confirm dialog state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Status update loading
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from("sourcing_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setRequests((data as SourcingRequest[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sourcing requests");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredRequests = useMemo(() => {
    if (!search) return requests;
    const q = search.toLowerCase();
    return requests.filter(
      (r) =>
        r.customer_id.toLowerCase().includes(q) ||
        r.marketplace.toLowerCase().includes(q) ||
        r.destination_city.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q) ||
        (r.product_description && r.product_description.toLowerCase().includes(q))
    );
  }, [requests, search]);

  const openCreate = () => {
    setEditId(null);
    setForm(defaultForm);
    setModalOpen(true);
  };

  const openEdit = (req: SourcingRequest) => {
    setEditId(req.id);
    setForm({
      customer_id: req.customer_id,
      marketplace: req.marketplace,
      product_description: req.product_description,
      quantity: req.quantity,
      destination_city: req.destination_city,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.customer_id || !form.marketplace || !form.product_description || !form.destination_city) {
      toast.error("Please fill in all required fields");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        customer_id: form.customer_id,
        marketplace: form.marketplace,
        product_description: form.product_description,
        quantity: form.quantity,
        destination_city: form.destination_city,
        status: "pending" as const,
      };

      if (editId) {
        const { error: updateError } = await supabase
          .from("sourcing_requests")
          .update(payload)
          .eq("id", editId);

        if (updateError) throw updateError;
        toast.success("Sourcing request updated");
      } else {
        const { error: insertError } = await supabase
          .from("sourcing_requests")
          .insert(payload);

        if (insertError) throw insertError;
        toast.success("Sourcing request created");
      }

      setModalOpen(false);
      fetchRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save sourcing request");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const { error: deleteError } = await supabase
        .from("sourcing_requests")
        .delete()
        .eq("id", deleteId);

      if (deleteError) throw deleteError;
      toast.success("Sourcing request deleted");
      setDeleteId(null);
      fetchRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete sourcing request");
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    setUpdatingStatus(id);
    try {
      const { error: updateError } = await supabase
        .from("sourcing_requests")
        .update({ status: newStatus })
        .eq("id", id);

      if (updateError) throw updateError;

      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: newStatus as SourcingRequest["status"] } : r))
      );
      toast.success(`Status updated to ${statusLabels[newStatus] || newStatus}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setUpdatingStatus(null);
    }
  };

  const truncate = (text: string, max: number) => {
    if (!text) return "-";
    return text.length > max ? text.slice(0, max) + "..." : text;
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-sm text-dark-400">Loading sourcing requests...</p>
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
          <h1 className="text-2xl font-bold text-dark-900">Sourcing Requests</h1>
          <p className="text-sm text-dark-400">Manage product sourcing from Chinese marketplaces</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-brand-600 transition-all"
        >
          <Plus className="h-4 w-4" />
          New Request
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-400" />
        <input
          type="text"
          placeholder="Search by customer, marketplace, or city..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-full rounded-xl border border-dark-100 bg-white pl-10 pr-4 text-sm text-dark-900 placeholder:text-dark-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
        />
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-sm text-dark-400">
        <div className="flex items-center gap-1.5">
          <ClipboardList className="h-4 w-4" />
          <span>{filteredRequests.length} request{filteredRequests.length !== 1 ? "s" : ""}</span>
        </div>
        {search && (
          <button onClick={() => setSearch("")} className="text-brand-500 hover:underline">
            Clear search
          </button>
        )}
      </div>

      {/* Sourcing table */}
      <div className="rounded-2xl bg-white border border-dark-100/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-50 bg-dark-50/50">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Marketplace</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Qty</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Destination</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-dark-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-50">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <ClipboardList className="mx-auto h-10 w-10 text-dark-300" />
                    <p className="mt-2 text-sm font-medium text-dark-400">
                      {search ? "No requests match your search" : "No sourcing requests yet"}
                    </p>
                    {!search && (
                      <p className="text-xs text-dark-300 mt-1">Click &quot;New Request&quot; to create one</p>
                    )}
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-dark-50/50 transition-colors">
                    <td className="px-6 py-3.5">
                      <span className="text-sm font-medium text-dark-900">{req.customer_id}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="inline-flex items-center rounded-full bg-orange-50 text-orange-600 px-2.5 py-0.5 text-xs font-medium">
                        {req.marketplace}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm text-dark-600 max-w-[250px] truncate inline-block" title={req.product_description}>
                        {truncate(req.product_description, 80)}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm font-medium text-dark-900">{req.quantity}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm text-dark-600">{req.destination_city}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <select
                          value={req.status}
                          onChange={(e) => handleStatusChange(req.id, e.target.value)}
                          disabled={updatingStatus === req.id}
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border-0 cursor-pointer appearance-none focus:outline-none focus:ring-2 focus:ring-brand-500/30",
                            statusColors[req.status] || "bg-dark-50 text-dark-500"
                          )}
                        >
                          {Object.entries(statusLabels).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(req)}
                          className="rounded-lg p-1.5 text-dark-400 hover:bg-dark-50 hover:text-brand-500 transition-all"
                          title="Edit"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteId(req.id)}
                          className="rounded-lg p-1.5 text-dark-400 hover:bg-red-50 hover:text-red-500 transition-all"
                          title="Delete"
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

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? "Edit Sourcing Request" : "New Sourcing Request"}
        onConfirm={handleSave}
        confirmText={editId ? "Update" : "Create Request"}
        confirmLoading={saving}
      >
        <div className="space-y-4">
          <FormInput
            label="Customer ID"
            name="customer_id"
            value={form.customer_id}
            onChange={(v) => setForm((f) => ({ ...f, customer_id: v }))}
            placeholder="e.g. uuid or reference"
            required
          />
          <FormInput
            label="Marketplace"
            name="marketplace"
            value={form.marketplace}
            onChange={(v) => setForm((f) => ({ ...f, marketplace: v }))}
            placeholder="e.g. 1688, Taobao, Yiwugo"
            required
          />
          <FormInput
            label="Product Description"
            name="product_description"
            value={form.product_description}
            onChange={(v) => setForm((f) => ({ ...f, product_description: v }))}
            placeholder="Describe the product to source..."
            textarea
            rows={3}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Quantity"
              name="quantity"
              type="number"
              value={form.quantity}
              onChange={(v) => setForm((f) => ({ ...f, quantity: Number(v) || 1 }))}
              min={1}
              required
            />
            <FormInput
              label="Destination City"
              name="destination_city"
              value={form.destination_city}
              onChange={(v) => setForm((f) => ({ ...f, destination_city: v }))}
              placeholder="e.g. Hargeisa, Mogadishu"
              required
            />
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={deleteId !== null}
        title="Delete Sourcing Request"
        message="Are you sure you want to delete this sourcing request? This action cannot be undone."
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDelete}
        loading={deleting}
        confirmText="Delete"
        danger
      />
    </div>
  );
}