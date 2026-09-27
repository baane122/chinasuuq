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

/**
 * WHAT IS NOT AVAILABLE, AND IS SAID SO
 *  - staff_profiles has no permissions column (live: user_id, role,
 *    department, two_factor_enabled, last_active, is_active,
 *    is_super_admin), so nothing here can read or store a per-member
 *    permission list — the role is the only access fact the database keeps.
 *  - profiles has no email column, so members are identified by full_name;
 *    the sign-in email is not readable from this client.
 */
interface StaffRow {
  id: string;
  user_id: string | null;
  role: string;
  department: string | null;
  is_active: boolean;
  is_super_admin: boolean;
  last_active?: string | null;
  created_at?: string;
  profiles: { full_name: string | null } | null;
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

const PERMISSIONS_NOTE =
  "Per-member permissions are not recorded in the database — access is derived from the role alone.";

export default function StaffPage() {
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createRole, setCreateRole] = useState(ROLES[0]);
  const [createDept, setCreateDept] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editStaff, setEditStaff] = useState<StaffRow | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editDept, setEditDept] = useState("");
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
        .select(
          "id, user_id, role, department, last_active, is_active, is_super_admin, created_at, profiles(full_name)"
        )
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      // supabase-js types a to-one embed as an array; at runtime the joined
      // profile is a single object.
      setStaff((data as unknown as StaffRow[]) || []);
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
    const q = search.toLowerCase();
    return (
      s.role.toLowerCase().includes(q) ||
      (s.department ?? "").toLowerCase().includes(q) ||
      (s.profiles?.full_name ?? "").toLowerCase().includes(q)
    );
  });

  const handleCreate = async () => {
    try {
      setCreating(true);
      // staff_profiles has no permissions column — the insert carries only the
      // fields the table actually stores.
      const { error: insertError } = await supabase.from("staff_profiles").insert({
        role: createRole,
        department: createDept.trim() || null,
        is_active: true,
        is_super_admin: createRole === "super_admin",
      });
      if (insertError) throw insertError;
      toast("success", "Staff member created");
      setCreateOpen(false);
      setCreateRole(ROLES[0]);
      setCreateDept("");
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
    setEditDept(s.department ?? "");
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
          department: editDept.trim() || null,
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

  const DepartmentField = ({
    value,
    onChange,
    id,
  }: {
    value: string;
    onChange: (v: string) => void;
    id: string;
  }) => (
    <div>
      <label htmlFor={id} className="admin-label">
        Department
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Sourcing"
        className="admin-input"
      />
      <p className="mt-1.5 text-[11px] text-dark-900/40">{PERMISSIONS_NOTE}</p>
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
        subtitle="Team members, roles and access"
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
                  <th>Member</th>
                  <th>Role</th>
                  <th>Department</th>
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
                      <p className="font-medium text-dark-900">
                        {member.profiles?.full_name || "—"}
                      </p>
                      <p className="text-[11px] text-dark-900/40">
                        {member.user_id ? `user ${member.user_id.slice(0, 8)}` : "no linked user"}
                      </p>
                    </td>
                    <td>
                      <StatusBadge status={member.role} />
                    </td>
                    <td>
                      <span className="text-sm text-dark-900/60">
                        {member.department || "—"}
                      </span>
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
        subtitle="Assign a role and department to a new team member"
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
          <DepartmentField id="staff-create-dept" value={createDept} onChange={setCreateDept} />
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
          <DepartmentField id="staff-edit-dept" value={editDept} onChange={setEditDept} />
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
