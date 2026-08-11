"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Plus,
  KeyRound,
  Globe,
  Link2,
  Trash2,
  Pencil,
  ShieldCheck,
  Eye,
  EyeOff,
  RefreshCw,
  AlertTriangle,
  Store,
  ExternalLink,
  CheckCircle2,
  DollarSign,
} from "lucide-react";

const MARKETPLACES = [
  { id: "1688", name: "1688", home: "https://www.1688.com", color: "#FF5000", stat: "50M+ items" },
  { id: "taobao", name: "Taobao", home: "https://www.taobao.com", color: "#FF6A00", stat: "100M+ items" },
  { id: "yiwugo", name: "YiwuGo", home: "https://www.yiwugo.com", color: "#1A8CFF", stat: "5M+ items" },
  { id: "alibaba", name: "Alibaba", home: "https://www.alibaba.com", color: "#FF6A00", stat: "200M+ items" },
  { id: "chinagoods", name: "ChinaGoods", home: "https://www.chinagoods.com", color: "#E60012", stat: "2M+ items" },
  { id: "jd", name: "JD.com", home: "https://www.jd.com", color: "#E1251B", stat: "400M+ items" },
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

export default function AdminMarketplacesPage() {
  const [accounts, setAccounts] = useState<MarketplaceAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showPasswordIds, setShowPasswordIds] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MarketplaceAccount | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    marketplace_type: "1688",
    account_label: "",
    username: "",
    password_encrypted: "",
    phone: "",
    email: "",
    notes: "",
    is_shared: true,
    is_active: true,
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

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
    setForm({
      marketplace_type: "1688",
      account_label: "",
      username: "",
      password_encrypted: "",
      phone: "",
      email: "",
      notes: "",
      is_shared: true,
      is_active: true,
    });
    setEditing(null);
  };

  const openCreate = () => { resetForm(); setModalOpen(true); };
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
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.account_label.trim()) { showToast("Give this account a label"); return; }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        const { error } = await supabase
          .from("marketplace_accounts")
          .update(form)
          .eq("id", editing.id);
        if (error) throw error;
        showToast("Account updated");
      } else {
        const { error } = await supabase
          .from("marketplace_accounts")
          .insert(form);
        if (error) throw error;
        showToast("Account created");
      }
      setModalOpen(false);
      resetForm();
      fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save account.");
      showToast("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this marketplace account?")) return;
    try {
      const { error } = await supabase.from("marketplace_accounts").delete().eq("id", id);
      if (error) throw error;
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      showToast("Account deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account.");
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
      showToast(acc.is_shared ? "Account unshared" : "Account shared with users");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update.");
    }
  };

  const marketplaceMeta = (id: string) =>
    MARKETPLACES.find((m) => m.id === id) || { id, name: id, home: "", color: "#667085", stat: "" };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed right-6 top-6 z-50 flex items-center gap-2 rounded-xl bg-dark-900 px-4 py-3 text-sm text-white shadow-xl">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark-900">Marketplace Accounts</h1>
          <p className="text-sm text-dark-400">
            Manage shared marketplace logins used across the ChinaSuuq app.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchAccounts}
            className="flex items-center gap-2 rounded-xl border border-dark-200 bg-white px-4 py-2 text-sm font-medium text-dark-600 hover:bg-dark-50 transition-colors"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-brand-600 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Account
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Marketplace overview strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {MARKETPLACES.map((m) => {
          const count = accounts.filter((a) => a.marketplace_type === m.id).length;
          return (
            <div key={m.id} className="rounded-2xl bg-white border border-dark-100/50 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold text-white" style={{ backgroundColor: m.color }}>
                  {m.name.slice(0, 2)}
                </div>
                <span className="text-[10px] font-medium text-dark-400">{count} acct</span>
              </div>
              <p className="mt-2 text-sm font-bold text-dark-900">{m.name}</p>
              <p className="text-[11px] text-dark-400">{m.stat}</p>
            </div>
          );
        })}
      </div>

      {/* Accounts list */}
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-brand-500" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-dark-200 bg-white p-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-warm-100">
            <KeyRound className="h-6 w-6 text-brand-500" />
          </div>
          <p className="text-sm font-medium text-dark-600">No marketplace accounts yet</p>
          <p className="mt-1 text-sm text-dark-400">Add shared logins so users can browse marketplaces directly.</p>
          <button onClick={openCreate} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
            <Plus className="h-4 w-4" /> Add your first account
          </button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {accounts.map((acc) => {
            const meta = marketplaceMeta(acc.marketplace_type);
            const showPw = showPasswordIds.has(acc.id);
            return (
              <div key={acc.id} className={cn("rounded-2xl bg-white border shadow-sm p-5", acc.is_active ? "border-dark-100/50" : "border-dark-200 opacity-70")}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ backgroundColor: meta.color }}>
                      {meta.name.slice(0, 2)}
                    </div>
                    <div>
                      <p className="flex items-center gap-2 text-sm font-bold text-dark-900">
                        {acc.account_label || meta.name}
                        {acc.is_shared && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                            <ShieldCheck className="h-3 w-3" /> Shared
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-dark-400">{meta.name} · {meta.stat}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(acc)} className="rounded-lg p-2 text-dark-400 hover:bg-dark-50 hover:text-dark-700">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(acc.id)} className="rounded-lg p-2 text-dark-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {acc.username && (
                    <div className="flex items-center justify-between rounded-lg bg-dark-50 px-3 py-2">
                      <span className="text-xs text-dark-500">Username</span>
                      <span className="text-sm font-medium text-dark-800">{acc.username}</span>
                    </div>
                  )}
                  {acc.password_encrypted && (
                    <div className="flex items-center justify-between rounded-lg bg-dark-50 px-3 py-2">
                      <span className="text-xs text-dark-500">Password</span>
                      <span className="flex items-center gap-2 text-sm font-medium text-dark-800">
                        {showPw ? acc.password_encrypted : "••••••••"}
                        <button onClick={() => togglePassword(acc.id)} className="text-dark-400 hover:text-dark-700">
                          {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </span>
                    </div>
                  )}
                  {acc.email && (
                    <div className="flex items-center justify-between rounded-lg bg-dark-50 px-3 py-2">
                      <span className="text-xs text-dark-500">Email</span>
                      <span className="text-sm font-medium text-dark-800">{acc.email}</span>
                    </div>
                  )}
                </div>

                {acc.notes && <p className="mt-3 text-xs text-dark-500">{acc.notes}</p>}

                <div className="mt-4 flex items-center justify-between">
                  <button
                    onClick={() => toggleShared(acc)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                      acc.is_shared ? "bg-emerald-50 text-emerald-600" : "bg-dark-50 text-dark-500 hover:bg-dark-100"
                    )}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    {acc.is_shared ? "Shared" : "Private"}
                  </button>
                  <a
                    href={meta.home}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open {meta.name}
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-dark-900">{editing ? "Edit Account" : "Add Marketplace Account"}</h2>
              <button onClick={() => setModalOpen(false)} className="text-dark-400 hover:text-dark-700">
                <span className="text-xl leading-none">×</span>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-dark-700">Marketplace</label>
                <select
                  value={form.marketplace_type}
                  onChange={(e) => setForm({ ...form, marketplace_type: e.target.value })}
                  className="h-11 w-full rounded-xl border border-dark-200 px-3 text-sm focus:border-brand-500 focus:outline-none"
                >
                  {MARKETPLACES.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-dark-700">Account Label</label>
                <input
                  value={form.account_label}
                  onChange={(e) => setForm({ ...form, account_label: e.target.value })}
                  placeholder="e.g. Primary YiwuGo account"
                  className="h-11 w-full rounded-xl border border-dark-200 px-3 text-sm focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-dark-700">Username</label>
                  <input
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className="h-11 w-full rounded-xl border border-dark-200 px-3 text-sm focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-dark-700">Password</label>
                  <input
                    type="text"
                    value={form.password_encrypted}
                    onChange={(e) => setForm({ ...form, password_encrypted: e.target.value })}
                    className="h-11 w-full rounded-xl border border-dark-200 px-3 text-sm focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-dark-700">Email</label>
                  <input
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="h-11 w-full rounded-xl border border-dark-200 px-3 text-sm focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-dark-700">Phone</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="h-11 w-full rounded-xl border border-dark-200 px-3 text-sm focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-dark-700">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full rounded-xl border border-dark-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-dark-700">
                  <input
                    type="checkbox"
                    checked={form.is_shared}
                    onChange={(e) => setForm({ ...form, is_shared: e.target.checked })}
                    className="h-4 w-4 rounded"
                  />
                  Share with users
                </label>
                <label className="flex items-center gap-2 text-sm text-dark-700">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="h-4 w-4 rounded"
                  />
                  Active
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} className="rounded-xl border border-dark-200 px-4 py-2 text-sm font-medium text-dark-600 hover:bg-dark-50">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "Save Changes" : "Create Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
