"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { cn, formatDate } from "@/lib/utils";
import { Search, Users, Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import type { Customer } from "@/types";
import { useToast } from "@/components/admin/Toast";
import Modal from "@/components/admin/Modal";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import FormInput from "@/components/admin/FormInput";

const statusFilters = ["All", "Individual", "Business"] as const;

interface CustomerForm {
  full_name: string;
  phone: string;
  email: string;
  city: string;
  language: "en" | "so";
  customer_type: "individual" | "business";
  business_name: string;
}

const emptyForm: CustomerForm = {
  full_name: "",
  phone: "",
  email: "",
  city: "",
  language: "en",
  customer_type: "individual",
  business_name: "",
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [orderCounts, setOrderCounts] = useState<Record<string, number>>({});

  // Modal / dialog state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);

  const toast = useToast();

  // Refresh the customer list + order counts
  const fetchCustomers = async () => {
    const { data, error: fetchError } = await supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });

    if (fetchError) throw fetchError;

    setCustomers((data as Customer[]) || []);

    // Fetch order counts per customer
    if (data && data.length > 0) {
      const customerIds = data.map((c) => c.id);
      const { data: orders } = await supabase
        .from("orders")
        .select("customer_id")
        .in("customer_id", customerIds);

      if (orders) {
        const counts: Record<string, number> = {};
        orders.forEach((order: { customer_id: string }) => {
          counts[order.customer_id] = (counts[order.customer_id] || 0) + 1;
        });
        setOrderCounts(counts);
      }
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        await fetchCustomers();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load customers");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const matchesSearch =
        search === "" ||
        customer.full_name.toLowerCase().includes(search.toLowerCase()) ||
        customer.phone.includes(search) ||
        customer.city.toLowerCase().includes(search.toLowerCase()) ||
        (customer.email && customer.email.toLowerCase().includes(search.toLowerCase()));

      const matchesStatus =
        statusFilter === "All" ||
        (statusFilter === "Individual" && customer.customer_type === "individual") ||
        (statusFilter === "Business" && customer.customer_type === "business");

      return matchesSearch && matchesStatus;
    });
  }, [customers, search, statusFilter]);

  // Open modal in "create" mode
  const openCreate = () => {
    setEditingCustomer(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  // Open modal in "edit" mode (prefill from existing customer)
  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setForm({
      full_name: customer.full_name,
      phone: customer.phone,
      email: customer.email || "",
      city: customer.city,
      language: customer.language || "en",
      customer_type: customer.customer_type || "individual",
      business_name: customer.business_name || "",
    });
    setModalOpen(true);
  };

  const setField = (key: keyof CustomerForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // Create or update a customer
  const handleSubmit = async () => {
    if (!form.full_name.trim() || !form.phone.trim()) {
      toast.error("Please fill in name and phone");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        city: form.city.trim(),
        language: (form.language as "en" | "so") || "en",
        customer_type: (form.customer_type as "individual" | "business") || "individual",
        business_name: form.business_name.trim() || null,
      };

      if (editingCustomer) {
        const { error: updateError } = await supabase
          .from("customers")
          .update(payload)
          .eq("id", editingCustomer.id);
        if (updateError) throw updateError;
        toast.success("Customer updated successfully");
      } else {
        const { error: insertError } = await supabase.from("customers").insert([payload]);
        if (insertError) throw insertError;
        toast.success("Customer added successfully");
      }

      setModalOpen(false);
      await fetchCustomers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save customer");
    } finally {
      setSaving(false);
    }
  };

  // Delete a customer
  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const { error: deleteError } = await supabase
        .from("customers")
        .delete()
        .eq("id", deleteTarget.id);
      if (deleteError) throw deleteError;
      toast.success("Customer deleted successfully");
      setDeleteTarget(null);
      await fetchCustomers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete customer");
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-sm text-dark-400">Loading customers...</p>
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
          <h1 className="text-2xl font-bold text-dark-900">Customers</h1>
          <p className="text-sm text-dark-400">Manage your customer database</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Customer
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-400" />
          <input
            type="text"
            placeholder="Search by name, phone, city, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-dark-100 bg-white pl-10 pr-4 text-sm text-dark-900 placeholder:text-dark-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
          />
        </div>

        {/* Status filter tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-dark-50 p-1">
          {statusFilters.map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                statusFilter === filter
                  ? "bg-white text-dark-900 shadow-sm"
                  : "text-dark-400 hover:text-dark-600"
              )}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-sm text-dark-400">
        <div className="flex items-center gap-1.5">
          <Users className="h-4 w-4" />
          <span>{filteredCustomers.length} customer{filteredCustomers.length !== 1 ? "s" : ""}</span>
        </div>
        {search && (
          <button onClick={() => setSearch("")} className="text-brand-500 hover:underline">
            Clear search
          </button>
        )}
      </div>

      {/* Customers table */}
      <div className="rounded-2xl bg-white border border-dark-100/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-50 bg-dark-50/50">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Phone
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  City
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Orders
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">
                  Joined
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-dark-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-50">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <Users className="mx-auto h-10 w-10 text-dark-300" />
                    <p className="mt-2 text-sm font-medium text-dark-400">
                      {search ? "No customers match your search" : "No customers yet"}
                    </p>
                    {!search && (
                      <p className="text-xs text-dark-300 mt-1">Customers will appear here as they sign up</p>
                    )}
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-dark-50/50 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500/10">
                          <span className="text-sm font-semibold text-brand-500">
                            {customer.full_name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-dark-900">{customer.full_name}</p>
                          {customer.email && (
                            <p className="text-xs text-dark-400">{customer.email}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm text-dark-600">{customer.phone}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm text-dark-600">{customer.city}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                          customer.customer_type === "business"
                            ? "bg-purple-50 text-purple-600"
                            : "bg-blue-50 text-blue-600"
                        )}
                      >
                        {customer.customer_type}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm font-medium text-dark-900">
                        {orderCounts[customer.id] || 0}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm text-dark-400">{formatDate(customer.created_at ?? new Date().toISOString())}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(customer)}
                          title="Edit"
                          className="rounded-lg p-1.5 text-dark-400 hover:bg-brand-50 hover:text-brand-500 transition-all"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(customer)}
                          title="Delete"
                          className="rounded-lg p-1.5 text-dark-400 hover:bg-red-50 hover:text-red-500 transition-all"
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

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCustomer ? "Edit Customer" : "Add Customer"}
        onConfirm={handleSubmit}
        confirmText={editingCustomer ? "Save Changes" : "Add Customer"}
        confirmLoading={saving}
      >
        <div className="grid grid-cols-1 gap-4">
          <FormInput
            label="Full Name"
            name="full_name"
            value={form.full_name}
            onChange={(v) => setField("full_name", v)}
            required
          />
          <FormInput
            label="Phone"
            name="phone"
            value={form.phone}
            onChange={(v) => setField("phone", v)}
            type="tel"
            required
          />
          <FormInput
            label="Email"
            name="email"
            value={form.email}
            onChange={(v) => setField("email", v)}
            type="email"
          />
          <FormInput
            label="City"
            name="city"
            value={form.city}
            onChange={(v) => setField("city", v)}
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-dark-700">Language</label>
              <select
                name="language"
                value={form.language}
                onChange={(e) => setField("language", e.target.value)}
                className="w-full rounded-xl border border-dark-200 bg-white px-3.5 py-2.5 text-sm text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
              >
                <option value="en">English</option>
                <option value="so">Somali</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-dark-700">Customer Type</label>
              <select
                name="customer_type"
                value={form.customer_type}
                onChange={(e) => setField("customer_type", e.target.value)}
                className="w-full rounded-xl border border-dark-200 bg-white px-3.5 py-2.5 text-sm text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
              >
                <option value="individual">Individual</option>
                <option value="business">Business</option>
              </select>
            </div>
          </div>
          {form.customer_type === "business" && (
            <FormInput
              label="Business Name"
              name="business_name"
              value={form.business_name}
              onChange={(v) => setField("business_name", v)}
            />
          )}
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Customer"
        message={`Are you sure you want to delete "${deleteTarget?.full_name}"? This action cannot be undone.`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        confirmText="Delete"
        loading={deleting}
        danger
      />
    </div>
  );
}
