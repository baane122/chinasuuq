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
  Copy,
  Check,
  Link2,
  Mail,
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
  PermissionNotice,
  EMPTY_IMAGES,
} from "@/components/admin/ui";
import {
  useAdminPermissions,
  allowed,
  PERMISSIONS,
} from "@/lib/admin/permissions";

/**
 * WHAT IS NOT AVAILABLE, AND IS SAID SO
 *  - staff_profiles has no permissions column (live: user_id, role,
 *    department, two_factor_enabled, last_active, is_active,
 *    is_super_admin), so nothing here can read or store a per-member
 *    permission list — the role is the only access fact the database keeps.
 *  - profiles has no email column and admin_customers_view returns
 *    NULL::text AS email, so this client CANNOT resolve a sign-in email to an
 *    auth user id. There is no `invitations` table and no web signup page
 *    (accounts are created in the mobile app). Creating an auth user from the
 *    browser would need the service-role key, which is deliberately absent.
 *    INVITE MODEL: paste the invitee's existing auth user id to link a real
 *    staff_profiles row now, or generate a copyable instruction for them to
 *    sign up and send you their id. We NEVER insert an orphan staff_profiles
 *    row without a user_id — that was the original bug (unlinked members).
 *  - Deleting a member is a destructive section gated by the UI permission
 *    model (lib/admin/permissions.ts, staff:delete). Server RLS stays coarse
 *    (any staff/super_admin), so this is an affordance, not a security wall.
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
  const perms = useAdminPermissions();
  const canDelete = allowed(perms, "deleteStaff");
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Create / invite modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createRole, setCreateRole] = useState(ROLES[0]);
  const [createDept, setCreateDept] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createUserId, setCreateUserId] = useState("");
  const [creating, setCreating] = useState(false);
  // The copyable invitation instruction shown when no user id is linked yet.
  const [inviteText, setInviteText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  const openInvite = () => {
    resetCreate();
    setCreateOpen(true);
  };

  const filteredStaff = staff.filter((s) => {
    if (search === "") return true;
    const q = search.toLowerCase();
    return (
      s.role.toLowerCase().includes(q) ||
      (s.department ?? "").toLowerCase().includes(q) ||
      (s.profiles?.full_name ?? "").toLowerCase().includes(q)
    );
  });

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const resetCreate = () => {
    setCreateRole(ROLES[0]);
    setCreateDept("");
    setCreateEmail("");
    setCreateUserId("");
    setInviteText(null);
    setCopied(false);
  };

  /**
   * Build the copyable invitation. We cannot see the invitee's account from
   * this client, so the admin gets a self-contained instruction to send: sign
   * up, sign in on the web, then return the account id so the role can link.
   */
  const buildInvite = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const role = createRole.replace(/_/g, " ");
    const dept = createDept.trim();
    return [
      `You're invited to join the ChinaSuuq Mission Control as ${role}${
        dept ? ` (${dept})` : ""
      }.`,
      "",
      `1. Create your ChinaSuuq account in the mobile app (or ask an admin to register you).`,
      `2. Sign in on the web: ${origin ? `${origin}/admin/login` : "/admin/login"}`,
      `3. Find your account ID and send it to your admin so they can link your role:`,
      `   Supabase dashboard → Authentication → Users → your email → copy "UID".`,
      "",
      `Your admin pastes that ID into Staff & Roles → Invite and presses Create;`,
      `access then activates against your real login immediately.`,
    ].join("\n");
  };

  const handleInvite = async () => {
    // Path 1 — an auth user id is available: link a real staff_profiles row.
    const userId = createUserId.trim();
    if (userId) {
      if (!UUID_RE.test(userId)) {
        toast("error", "That account ID isn’t a valid UUID.");
        return;
      }
      try {
        setCreating(true);
        const { error: insertError } = await supabase
          .from("staff_profiles")
          .insert({
            user_id: userId,
            role: createRole,
            department: createDept.trim() || null,
            is_active: true,
            is_super_admin: createRole === "super_admin",
          });
        if (insertError) throw insertError;
        toast("success", "Staff member linked to their account");
        setCreateOpen(false);
        resetCreate();
        fetchStaff();
      } catch (err) {
        toast(
          "error",
          err instanceof Error ? err.message : "Failed to link staff account"
        );
      } finally {
        setCreating(false);
      }
      return;
    }

    // Path 2 — no linked account yet: produce the copyable invite, insert nothing.
    setInviteText(buildInvite());
    setCopied(false);
    toast("info", "No account ID given — copy the invitation to send them. Nothing was created yet.");
  };

  const copyInvite = async () => {
    if (!inviteText) return;
    try {
      await navigator.clipboard.writeText(inviteText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast("error", "Couldn’t reach the clipboard — select the text and copy manually.");
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
      const { data, error: deleteError } = await supabase
        .from("staff_profiles")
        .delete()
        .eq("id", deleteStaff.id)
        .select("id");
      if (deleteError) throw deleteError;
      // RLS denial returns 204 / 0 rows with NO error.
      if (!data || data.length === 0) {
        toast("error", "Blocked by permissions — nothing was deleted");
        return;
      }
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
          <button onClick={openInvite} className="admin-btn-primary">
            <Plus className="h-4 w-4" />
            Invite Staff
          </button>
        }
      />

      {/* RBAC affordance banners (lib/admin/permissions.ts). These gate the UI;
          server RLS still admits any staff/super_admin, so it is an affordance,
          not a security wall. */}
      {!perms.loading && !perms.configured && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Permissions not configured</p>
            <p className="mt-0.5 text-[13px] leading-relaxed">
              The role/permission tables have no rows yet, so every admin action
              (including staff deletion) is currently allowed. Seed the{" "}
              <span className="font-semibold">permissions</span> table to start
              gating sections.
            </p>
          </div>
        </div>
      )}
      {!perms.loading && perms.configured && !canDelete && (
        <PermissionNotice
          required={`${PERMISSIONS.deleteStaff.resource}:${PERMISSIONS.deleteStaff.action}`}
          className="mb-6"
        />
      )}

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
          <button onClick={openInvite} className="admin-btn-primary">
            <Plus className="h-4 w-4" />
            Invite Staff
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
                        {canDelete && (
                          <button
                            onClick={() => setDeleteStaff(member)}
                            className="rounded-lg p-1.5 text-dark-900/40 transition-all hover:bg-rose-50 hover:text-rose-600"
                            aria-label="Delete staff"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </TableShell>

      {/* Create / Invite Panel */}
      <SidePanel
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Invite a Team Member"
        subtitle="Give someone access by linking their account or sending an invite"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setCreateOpen(false)} className="admin-btn-ghost">
              Cancel
            </button>
            <button onClick={handleInvite} disabled={creating} className="admin-btn-primary">
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {!creating && (createUserId.trim() ? <Link2 className="h-4 w-4" /> : <Mail className="h-4 w-4" />)}
              {createUserId.trim() ? "Create & Link" : "Generate Invite"}
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

          <div>
            <label htmlFor="staff-invite-email" className="admin-label">
              Invitee email
            </label>
            <input
              id="staff-invite-email"
              type="email"
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              placeholder="name@company.com"
              className="admin-input"
            />
            <p className="mt-1.5 text-[11px] text-dark-900/40">
              Used only to write the invitation. The database stores no emails and the
              customers view returns a blank one, so we can’t look up an account from it.
            </p>
          </div>

          <div>
            <label htmlFor="staff-invite-uid" className="admin-label">
              Account ID (optional)
            </label>
            <input
              id="staff-invite-uid"
              value={createUserId}
              onChange={(e) => setCreateUserId(e.target.value)}
              placeholder="Existing auth user UUID"
              className="admin-input font-mono text-xs"
            />
            <p className="mt-1.5 text-[11px] text-dark-900/40">
              If they already have a login, paste their auth user id to create a linked
              staff_profiles row now. The user_id foreign key is enforced server-side, so a
              wrong id is rejected rather than silently saved.
            </p>
          </div>

          <DepartmentField id="staff-create-dept" value={createDept} onChange={setCreateDept} />

          {inviteText ? (
            <div className="rounded-xl border border-dark-900/[0.08] bg-dark-50 p-4 dark:border-white/10 dark:bg-dark-800">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-dark-900">Copyable invitation</p>
                <button onClick={copyInvite} className="admin-btn-outline h-8 px-2.5 text-xs">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <textarea
                readOnly
                value={inviteText}
                rows={9}
                className="admin-input font-mono text-[11px] leading-relaxed"
              />
              <p className="mt-2 text-[11px] text-dark-900/45">
                Nothing was created yet — send this to them, get their account ID back,
                paste it above and press Create &amp; Link.
              </p>
            </div>
          ) : (
            <p className="rounded-xl bg-warm-100 px-4 py-3 text-[12px] leading-relaxed text-dark-900/60 dark:bg-dark-800 dark:text-neutral-400">
              <strong className="font-semibold">Why two options?</strong> There is no
              invitations table and no web sign-up (accounts are created in the mobile app),
              so we can’t provision a login for someone from here. Link an existing account
              ID now, or generate an invitation for them to reply to.
            </p>
          )}
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
