"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  Plus,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  RefreshCw,
  ExternalLink,
  Globe,
  Globe2,
  ShieldCheck,
  Loader2,
  Store,
  CheckCircle2,
  LayoutGrid,
  KeyRound,
} from "lucide-react";
import {
  PageHeader,
  PageGrid,
  StatCard,
  SectionCard,
  TableShell,
  SidePanel,
  Field,
  EMPTY_IMAGES,
} from "@/components/admin/ui";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { useToast } from "@/components/admin/Toast";
import ConfirmDialog from "@/components/admin/ConfirmDialog";

const MARKETPLACES = [
  { id: "1688", name: "1688", home: "https://www.1688.com", color: "#FF5000", stat: "50M+ items" },
  { id: "taobao", name: "Taobao", home: "https://www.taobao.com", color: "#FF6A00", stat: "100M+ items" },
  { id: "yiwugo", name: "YiwuGo", home: "https://www.yiwugo.com", color: "#1A8CFF", stat: "5M+ items" },
  { id: "alibaba", name: "Alibaba", home: "https://www.alibaba.com", color: "#FF6A00", stat: "200M+ items" },
  { id: "chinagoods", name: "ChinaGoods", home: "https://www.chinagoods.com", color: "#E60012", stat: "2M+ items" },
  { id: "jd", name: "JD.com", home: "https://www.jd.com", color: "#E1251B", stat: "400M+ items" },
  { id: "dollarstore", name: "1$ Dollar Store", home: "https://www.huolangjun666.com", color: "#FF5A0A", stat: "10K+ items" },
];

interface MarketplaceAccount {
  id: string;
  marketplace_type: string;
  account_label: string;
  username: string;
  password_encrypted: string;
  phone: string;
  email: string;
  notes: string;
  is_shared: boolean;
  is_active: boolean;
  created_at: string;
}

const emptyForm = {
  marketplace_type: "1688",
  account_label: "",
  username: "",
  password_encrypted: "",
  phone: "",
  email: "",
  notes: "",
  is_shared: true,
  is_active: true,
};

export default function AdminMarketplacesPage() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<MarketplaceAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showPasswordIds, setShowPasswordIds] = useState<Set<string>>(new Set());
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<MarketplaceAccount | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [form, setForm] = useState(emptyForm);

  const fetchAccounts = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("marketplace_accounts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setAccounts((data as MarketplaceAccount[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load marketplace accounts.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditing(null);
  };

  const openCreate = () => { resetForm(); setPanelOpen(true); };
  const openEdit = (acc: MarketplaceAccount) => {
    setEditing(acc);
    setForm({
      marketplace_type: acc.marketplace_type,
      account_label: acc.account_label,
      username: acc.username,
      password_encrypted: acc.password_encrypted,
      phone: acc.phone,
      email: acc.email,
      notes: acc.notes,
      is_shared: acc.is_shared,
      is_active: acc.is_active,
    });
    setPanelOpen(true);
  };

  const handleSave = async () => {
    if (!form.account_label.trim()) { toast.info("Give this account a label"); return; }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        const { error } = await supabase
          .from("marketplace_accounts")
          .update(form)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Account updated");
      } else {
        const { error } = await supabase
          .from("marketplace_accounts")
          .insert(form);
        if (error) throw error;
        toast.success("Account created");
      }
      setPanelOpen(false);
      resetForm();
      fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save account.");
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("marketplace_accounts").delete().eq("id", deleteId);
      if (error) throw error;
      setAccounts((prev) => prev.filter((a) => a.id !== deleteId));
      toast.success("Account deleted");
      setDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account.");
      toast.error("Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const togglePassword = (id: string) => {
    setShowPasswordIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleShared = async (acc: MarketplaceAccount) => {
    try {
      const { error } = await supabase
        .from("marketplace_accounts")
        .update({ is_shared: !acc.is_shared, is_active: acc.is_active })
        .eq("id", acc.id);
      if (error) throw error;
      fetchAccounts();
      toast.success(acc.is_shared ? "Account unshared" : "Account shared with users");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update.");
    }
  };

  const marketplaceMeta = (id: string) =>
    MARKETPLACES.find((m) => m.id === id) || { id, name: id, home: "", color: "#667085", stat: "" };

  const activeCount = accounts.filter((a) => a.is_active).length;
  const sharedCount = accounts.filter((a) => a.is_shared).length;
  const platformsUsed = new Set(accounts.map((a) => a.marketplace_type)).size;

  return (
    <div>
      <PageHeader
        title="Marketplaces"
        subtitle="Connected seller accounts and platform status"
        actions={
          <>
            <button onClick={fetchAccounts} className="admin-btn-outline">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <button onClick={openCreate} className="admin-btn-primary">
              <Plus className="h-4 w-4" /> Add Account
            </button>
          </>
        }
      />

      {/* Stats */}
      <PageGrid>
        <StatCard label="Total Accounts" value={accounts.length} icon={Store} tone="brand" delay={0} />
        <StatCard label="Active" value={activeCount} icon={CheckCircle2} tone="success" delay={1} />
        <StatCard label="Shared" value={sharedCount} icon={ShieldCheck} tone="info" delay={2} />
        <StatCard label="Platforms Used" value={platformsUsed} icon={LayoutGrid} tone="violet" delay={3} />
      </PageGrid>

      {/* Non-blocking error (save / delete / update) */}
      {accounts.length > 0 && error && (
        <div className="mb-6 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
          <KeyRound className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Platform coverage strip */}
      <SectionCard
        title="Platform coverage"
        subtitle="Seller accounts grouped by marketplace"
        className="mb-6"
        bodyClassName="p-4"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {MARKETPLACES.map((m) => {
            const count = accounts.filter((a) => a.marketplace_type === m.id).length;
            return (
              <div
                key={m.id}
                className="rounded-xl border border-dark-900/[0.06] bg-warm-50 p-3.5 transition-colors hover:border-brand-500/30"
              >
                <div className="flex items-center justify-between">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-bold text-white"
                    style={{ backgroundColor: m.color }}
                  >
                    {m.name.slice(0, 2)}
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-dark-900/40">
                    {count} acct{count === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="mt-2 text-sm font-bold text-dark-900">{m.name}</p>
                <p className="text-[11px] text-dark-900/40">{m.stat}</p>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Accounts list */}
      <TableShell
        isLoading={isLoading}
        error={accounts.length === 0 ? error : null}
        errorRetry={fetchAccounts}
        hasData={accounts.length > 0}
        filtered={false}
        emptyImage={EMPTY_IMAGES.products}
        emptyTitle="No marketplace accounts connected"
        emptySubtitle="Add shared logins so users can browse marketplaces directly."
        emptyAction={
          <button onClick={openCreate} className="admin-btn-primary">
            <Plus className="h-4 w-4" /> Add your first account
          </button>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {accounts.map((acc, i) => {
            const meta = marketplaceMeta(acc.marketplace_type);
            const showPw = showPasswordIds.has(acc.id);
            return (
              <div
                key={acc.id}
                style={{ animationDelay: `${Math.min(i, 8) * 0.04}s` }}
                className={cn(
                  "rounded-2xl border bg-white p-5 shadow-sm transition-all hover:shadow-md",
                  acc.is_active ? "border-dark-900/[0.06]" : "border-dark-900/[0.06] opacity-70"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                      style={{ backgroundColor: meta.color }}
                    >
                      {meta.name.slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-sm font-bold text-dark-900">
                        {acc.account_label || meta.name}
                        {acc.is_shared && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                            <ShieldCheck className="h-3 w-3" /> Shared
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-dark-900/45">{meta.name} · {meta.stat}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={acc.is_active ? "active" : "inactive"} />
                    <button
                      onClick={() => openEdit(acc)}
                      className="rounded-lg p-2 text-dark-900/40 transition-colors hover:bg-dark-50 hover:text-dark-700"
                      title="Edit account"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeleteId(acc.id)}
                      className="rounded-lg p-2 text-dark-900/40 transition-colors hover:bg-rose-50 hover:text-rose-600"
                      title="Delete account"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {acc.username && (
                    <div className="flex items-center justify-between rounded-lg bg-dark-50 px-3 py-2">
                      <span className="text-xs text-dark-900/45">Username</span>
                      <span className="truncate text-sm font-medium text-dark-800">{acc.username}</span>
                    </div>
                  )}
                  {acc.password_encrypted && (
                    <div className="flex items-center justify-between rounded-lg bg-dark-50 px-3 py-2">
                      <span className="text-xs text-dark-900/45">Password</span>
                      <span className="flex items-center gap-2 text-sm font-medium text-dark-800">
                        {showPw ? acc.password_encrypted : "••••••••"}
                        <button
                          onClick={() => togglePassword(acc.id)}
                          className="text-dark-900/40 transition-colors hover:text-dark-700"
                          title={showPw ? "Hide password" : "Show password"}
                        >
                          {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </span>
                    </div>
                  )}
                  {acc.email && (
                    <div className="flex items-center justify-between rounded-lg bg-dark-50 px-3 py-2">
                      <span className="text-xs text-dark-900/45">Email</span>
                      <span className="truncate text-sm font-medium text-dark-800">{acc.email}</span>
                    </div>
                  )}
                </div>

                {acc.notes && <p className="mt-3 text-xs text-dark-900/50">{acc.notes}</p>}

                <div className="mt-4 flex items-center justify-between border-t border-dark-900/[0.06] pt-3">
                  <button
                    onClick={() => toggleShared(acc)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                      acc.is_shared
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-dark-50 text-dark-900/50 hover:bg-dark-100"
                    )}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    {acc.is_shared ? "Shared" : "Private"}
                  </button>
                  <a
                    href={meta.home}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-500 transition-colors hover:bg-brand-50"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open {meta.name}
                  </a>
                  <a
                    href={`/marketplaces/${acc.marketplace_type}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-dark-900/50 transition-colors hover:bg-dark-900/5 hover:text-dark-900"
                  >
                    <Globe2 className="h-3.5 w-3.5" /> Public page
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </TableShell>

      {/* Add / Edit panel */}
      <SidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={editing ? "Edit Account" : "Add Marketplace Account"}
        subtitle={editing ? `Editing ${editing.account_label || "account"}` : "Connect a shared seller login"}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setPanelOpen(false)} className="admin-btn-ghost">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="admin-btn-primary">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save Changes" : "Create Account"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Marketplace">
            <select
              value={form.marketplace_type}
              onChange={(e) => setForm({ ...form, marketplace_type: e.target.value })}
              className="admin-input"
            >
              {MARKETPLACES.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Account Label" required hint="Shown to staff picking an account for a purchase.">
            <input
              value={form.account_label}
              onChange={(e) => setForm({ ...form, account_label: e.target.value })}
              placeholder="e.g. Primary YiwuGo account"
              className="admin-input"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Username">
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="admin-input"
              />
            </Field>
            <Field label="Password">
              <input
                type="text"
                value={form.password_encrypted}
                onChange={(e) => setForm({ ...form, password_encrypted: e.target.value })}
                className="admin-input"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="admin-input"
              />
            </Field>
            <Field label="Phone">
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="admin-input"
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="admin-input"
            />
          </Field>

          <div className="flex items-center justify-between rounded-xl border border-dark-900/[0.06] bg-warm-50 px-4 py-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-dark-700">
              <input
                type="checkbox"
                checked={form.is_shared}
                onChange={(e) => setForm({ ...form, is_shared: e.target.checked })}
                className="h-4 w-4 rounded accent-brand-500"
              />
              Share with users
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-dark-700">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="h-4 w-4 rounded accent-brand-500"
              />
              Active
            </label>
          </div>
        </div>
      </SidePanel>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteId !== null}
        title="Delete Marketplace Account"
        message="Delete this marketplace account? Users will no longer see this login."
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDelete}
        confirmText="Delete"
        loading={deleting}
        danger
      />
    </div>
  );
}
