"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { cn, formatDate } from "@/lib/utils";
import {
  UserCog,
  UserCheck,
  ShieldCheck,
  Layers,
  Plus,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import { useToast } from "@/components/admin/Toast";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  PageHeader,
  PageGrid,
  StatCard,
  SearchInput,
  TableShell,
  SidePanel,
  EMPTY_IMAGES,
} from "@/components/admin/ui";

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
    <div>
      <span className="admin-label">Permissions</span>
      <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto rounded-xl border border-dark-900/10 bg-white p-2.5">
        {PERMISSIONS.map((perm) => (
          <label
            key={perm}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-dark-900/70 transition-colors hover:bg-dark-900/5"
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
      <p className="mt-1.5 text-[11px] text-dark-900/40">
        {value.length} of {PERMISSIONS.length} granted
      </p>
    </div>
  );

  const totalStaff = staff.length;
  const activeStaff = staff.filter((s) => s.is_active).length;
  const superAdmins = staff.filter((s) => s.is_super_admin).length;
  const rolesCovered = new Set(staff.map((s) => s.role)).size;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <PageHeader
        title="Staff & Roles"
        subtitle="Team members, permissions and access"
        actions={
          <button onClick={() => setCreateOpen(true)} className="admin-btn-primary">
            <Plus className="h-4 w-4" />
            Add Staff
          </button>
        }
      />

      {/* Stats */}
      {!isLoading && !error && (
        <PageGrid>
          <StatCard label="Total Staff" value={totalStaff} icon={UserCog} tone="brand" delay={0} />
          <StatCard
            label="Active Members"
            value={activeStaff}
            icon={UserCheck}
            tone="success"
            delay={1}
          />
          <StatCard
            label="Super Admins"
            value={superAdmins}
            icon={ShieldCheck}
            tone="error"
            delay={2}
          />
          <StatCard
            label="Roles Covered"
            value={rolesCovered}
            icon={Layers}
            tone="violet"
            delay={3}
          />
        </PageGrid>
      )}

      {/* Search */}
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search by role..."
        className="max-w-md"
      />

      {/* Staff table */}
      <TableShell
        isLoading={isLoading}
        error={error}
        errorRetry={fetchStaff}
        hasData={filteredStaff.length > 0}
        filtered={search.length > 0}
        emptyImage={EMPTY_IMAGES.customers}
        emptyTitle="No team members"
        emptySubtitle="Invite your operations, finance and support team."
        emptyAction={
          <button onClick={() => setCreateOpen(true)} className="admin-btn-primary">
            <Plus className="h-4 w-4" />
            Add Staff
          </button>
        }
      >
        <div className="rounded-2xl border border-dark-900/[0.06] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="admin-table w-full">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Permissions</th>
                  <th>Super Admin</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <StatusBadge status={member.role} />
                    </td>
                    <td>
                      <div className="flex max-w-xs flex-wrap gap-1">
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
                          <span className="inline-flex items-center rounded-md bg-dark-900/[0.06] px-2 py-0.5 text-[11px] font-medium text-dark-900/50">
                            +{member.permissions.length - 4} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {member.is_super_admin ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Yes
                        </span>
                      ) : (
                        <span className="text-sm text-dark-900/40">No</span>
                      )}
                    </td>
                    <td>
                      <button
                        onClick={() => handleToggleActive(member)}
                        disabled={togglingId === member.id}
                        aria-label={`Toggle ${member.role} active status`}
                        className={cn(
                          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50",
                          member.is_active ? "bg-emerald-500" : "bg-dark-200"
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
                    <td>
                      <span className="text-sm text-dark-900/50">
                        {member.created_at ? formatDate(member.created_at) : "—"}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(member)}
                          className="rounded-lg p-1.5 text-dark-900/40 transition-all hover:bg-dark-900/5 hover:text-brand-500"
                          aria-label="Edit staff"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteStaff(member)}
                          className="rounded-lg p-1.5 text-dark-900/40 transition-all hover:bg-rose-50 hover:text-rose-600"
                          aria-label="Delete staff"
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
        </div>
      </TableShell>

      {/* Create Panel */}
      <SidePanel
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add Staff Member"
        subtitle="Assign a role and permissions to a new team member"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setCreateOpen(false)} className="admin-btn-ghost">
              Cancel
            </button>
            <button onClick={handleCreate} disabled={creating} className="admin-btn-primary">
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Staff
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <label htmlFor="staff-role" className="admin-label">
              Role
            </label>
            <select
              id="staff-role"
              value={createRole}
              onChange={(e) => setCreateRole(e.target.value)}
              className="admin-input"
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
      </SidePanel>

      {/* Edit Panel */}
      <SidePanel
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Staff Member"
        subtitle={editStaff ? `Updating ${editStaff.role.replace(/_/g, " ")}` : undefined}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setEditOpen(false)} className="admin-btn-ghost">
              Cancel
            </button>
            <button onClick={handleEdit} disabled={savingEdit} className="admin-btn-primary">
              {savingEdit && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <label htmlFor="staff-edit-role" className="admin-label">
              Role
            </label>
            <select
              id="staff-edit-role"
              value={editRole}
              onChange={(e) => setEditRole(e.target.value)}
              className="admin-input"
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
      </SidePanel>

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
