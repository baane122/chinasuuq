"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { cn, formatDate } from "@/lib/utils";
import { UserCog, Search, Loader2, Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/admin/Toast";
import Modal from "@/components/admin/Modal";
import ConfirmDialog from "@/components/admin/ConfirmDialog";

interface StaffRow {
  id: string;
  profile_id: string | null;
  role: string;
  permissions: string[];
  is_active: boolean;
  is_super_admin: boolean;
  created_at?: string;
}

const ROLES = [
  "super_admin",
  "operations_director",
  "finance_manager",
  "sourcing_manager",
  "sourcing_agent",
  "purchasing_officer",
  "warehouse_manager",
  "warehouse_operator",
  "quality_inspector",
  "logistics_manager",
  "support_manager",
  "support_agent",
  "content_manager",
];

const PERMISSIONS = [
  "view",
  "create",
  "edit",
  "approve",
  "verify_payment",
  "refund",
  "pay_supplier",
  "manage_exchange_rate",
  "export",
  "manage_roles",
  "view_finance",
  "view_sensitive_customer_data",
  "archive",
];

const roleColors: Record<string, string> = {
  super_admin: "bg-red-50 text-red-600",
  operations_director: "bg-purple-50 text-purple-600",
  finance_manager: "bg-emerald-50 text-emerald-600",
  sourcing_manager: "bg-indigo-50 text-indigo-600",
  sourcing_agent: "bg-blue-50 text-blue-600",
  purchasing_officer: "bg-cyan-50 text-cyan-600",
  warehouse_manager: "bg-orange-50 text-orange-600",
  warehouse_operator: "bg-amber-50 text-amber-600",
  quality_inspector: "bg-teal-50 text-teal-600",
  logistics_manager: "bg-sky-50 text-sky-600",
  support_manager: "bg-pink-50 text-pink-600",
  support_agent: "bg-rose-50 text-rose-600",
  content_manager: "bg-violet-50 text-violet-600",
};

export default function StaffPage() {
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createRole, setCreateRole] = useState(ROLES[0]);
  const [createPerms, setCreatePerms] = useState<string[]>(["view"]);
  const [creating, setCreating] = useState(false);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editStaff, setEditStaff] = useState<StaffRow | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  // Toggle active
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Delete
  const [deleteStaff, setDeleteStaff] = useState<StaffRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchStaff = async () => {
    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from("staff_profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setStaff((data as StaffRow[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load staff");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const filteredStaff = staff.filter((s) => {
    if (search === "") return true;
    return s.role.toLowerCase().includes(search.toLowerCase());
  });

  const togglePermission = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    permission: string
  ) => {
    setter((prev) =>
      prev.includes(permission)
        ? prev.filter((p) => p !== permission)
        : [...prev, permission]
    );
  };

  const handleCreate = async () => {
    try {
      setCreating(true);
      // permissions is a JSONB array column — store as JSON array via JSON.stringify
      const { error: insertError } = await supabase.from("staff_profiles").insert({
        role: createRole,
        permissions: JSON.parse(JSON.stringify(createPerms)),
        is_active: true,
        is_super_admin: createRole === "super_admin",
      });
      if (insertError) throw insertError;
      toast("success", "Staff member created");
      setCreateOpen(false);
      setCreateRole(ROLES[0]);
      setCreatePerms(["view"]);
      fetchStaff();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to create staff");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (s: StaffRow) => {
    setEditStaff(s);
    setEditRole(s.role);
    setEditPerms(Array.isArray(s.permissions) ? s.permissions : []);
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editStaff) return;
    try {
      setSavingEdit(true);
      const { error: updateError } = await supabase
        .from("staff_profiles")
        .update({
          role: editRole,
          permissions: JSON.parse(JSON.stringify(editPerms)),
          is_super_admin: editRole === "super_admin",
        })
        .eq("id", editStaff.id);
      if (updateError) throw updateError;
      toast("success", "Staff role updated");
      setEditOpen(false);
      fetchStaff();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to update staff");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleActive = async (s: StaffRow) => {
    try {
      setTogglingId(s.id);
      const { error: updateError } = await supabase
        .from("staff_profiles")
        .update({ is_active: !s.is_active })
        .eq("id", s.id);
      if (updateError) throw updateError;
      toast("success", `Staff ${s.is_active ? "deactivated" : "activated"}`);
      setStaff((prev) =>
        prev.map((m) => (m.id === s.id ? { ...m, is_active: !m.is_active } : m))
      );
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to toggle status");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteStaff) return;
    try {
      setDeleting(true);
      const { error: deleteError } = await supabase
        .from("staff_profiles")
        .delete()
        .eq("id", deleteStaff.id);
      if (deleteError) throw deleteError;
      toast("success", "Staff member deleted");
      setDeleteStaff(null);
      setStaff((prev) => prev.filter((m) => m.id !== deleteStaff.id));
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to delete staff");
    } finally {
      setDeleting(false);
    }
  };

  const PermCheckboxGroup = ({
    value,
    onChange,
  }: {
    value: string[];
    onChange: React.Dispatch<React.SetStateAction<string[]>>;
  }) => (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-dark-700">Permissions</label>
      <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto rounded-xl border border-dark-100 p-3">
        {PERMISSIONS.map((perm) => (
          <label
            key={perm}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-dark-700 hover:bg-dark-50"
          >
            <input
              type="checkbox"
              checked={value.includes(perm)}
              onChange={() => togglePermission(onChange, perm)}
              className="h-4 w-4 rounded border-dark-200 text-brand-500 focus:ring-brand-500/30"
            />
            <span className="capitalize">{perm.replace(/_/g, " ")}</span>
          </label>
        ))}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-sm text-dark-400">Loading staff...</p>
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
          <h1 className="text-2xl font-bold text-dark-900">Staff & Roles</h1>
          <p className="text-sm text-dark-400">Manage team members, roles, and permissions</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Staff
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-400" />
        <input
          type="text"
          placeholder="Search by role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-full rounded-xl border border-dark-100 bg-white pl-10 pr-4 text-sm text-dark-900 placeholder:text-dark-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
        />
      </div>

      {/* Staff table */}
      <div className="rounded-2xl bg-white border border-dark-100/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-50 bg-dark-50/50">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Permissions</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Super Admin</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400">Created</th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-dark-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-50">
              {filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <UserCog className="mx-auto h-10 w-10 text-dark-300" />
                    <p className="mt-2 text-sm font-medium text-dark-400">
                      {search ? "No staff match your search" : "No staff yet"}
                    </p>
                    {!search && (
                      <p className="text-xs text-dark-300 mt-1">Add your first staff member to assign roles</p>
                    )}
                  </td>
                </tr>
              ) : (
                filteredStaff.map((member) => (
                  <tr key={member.id} className="hover:bg-dark-50/50 transition-colors">
                    <td className="px-6 py-3.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                          roleColors[member.role] || "bg-dark-50 text-dark-500"
                        )}
                      >
                        {member.role.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {(Array.isArray(member.permissions) ? member.permissions : [])
                          .slice(0, 4)
                          .map((perm) => (
                            <span
                              key={perm}
                              className="inline-flex items-center rounded-md bg-brand-500/10 px-2 py-0.5 text-[11px] font-medium text-brand-500"
                            >
                              {perm.replace(/_/g, " ")}
                            </span>
                          ))}
                        {Array.isArray(member.permissions) && member.permissions.length > 4 && (
                          <span className="inline-flex items-center rounded-md bg-dark-100 px-2 py-0.5 text-[11px] font-medium text-dark-500">
                            +{member.permissions.length - 4} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      {member.is_super_admin ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Yes
                        </span>
                      ) : (
                        <span className="text-sm text-dark-400">No</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5">
                      <button
                        onClick={() => handleToggleActive(member)}
                        disabled={togglingId === member.id}
                        aria-label={`Toggle ${member.role} active status`}
                        className={cn(
                          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50",
                          member.is_active ? "bg-green-500" : "bg-dark-200"
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                            member.is_active ? "translate-x-6" : "translate-x-1"
                          )}
                        />
                      </button>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-sm text-dark-400">
                        {member.created_at ? formatDate(member.created_at) : "—"}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(member)}
                          className="rounded-lg p-1.5 text-dark-400 hover:bg-dark-50 hover:text-brand-500 transition-all"
                          aria-label="Edit staff"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteStaff(member)}
                          className="rounded-lg p-1.5 text-dark-400 hover:bg-red-50 hover:text-red-500 transition-all"
                          aria-label="Delete staff"
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

      {/* Create Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add Staff Member"
        onConfirm={handleCreate}
        confirmText="Create Staff"
        confirmLoading={creating}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="staff-role" className="block text-sm font-medium text-dark-700">
              Role
            </label>
            <select
              id="staff-role"
              value={createRole}
              onChange={(e) => setCreateRole(e.target.value)}
              className="w-full rounded-xl border border-dark-200 bg-white px-3.5 py-2.5 text-sm text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <PermCheckboxGroup value={createPerms} onChange={setCreatePerms} />
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Staff Member"
        onConfirm={handleEdit}
        confirmText="Save Changes"
        confirmLoading={savingEdit}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="staff-edit-role" className="block text-sm font-medium text-dark-700">
              Role
            </label>
            <select
              id="staff-edit-role"
              value={editRole}
              onChange={(e) => setEditRole(e.target.value)}
              className="w-full rounded-xl border border-dark-200 bg-white px-3.5 py-2.5 text-sm text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <PermCheckboxGroup value={editPerms} onChange={setEditPerms} />
        </div>
      </Modal>

      {/* Delete Dialog */}
      <ConfirmDialog
        open={!!deleteStaff}
        title="Remove staff member"
        message={`Are you sure you want to remove the ${deleteStaff?.role.replace(/_/g, " ") || ""} from staff? This cannot be undone.`}
        confirmText="Delete"
        onCancel={() => setDeleteStaff(null)}
        onConfirm={handleDelete}
        loading={deleting}
        danger
      />
    </div>
  );
}
