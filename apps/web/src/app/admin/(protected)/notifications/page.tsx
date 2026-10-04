"use client";

/**
 * Notification Composer — Mission Control.
 *
 * Lets staff push an in-app message into the customer inbox that the mobile app
 * actually reads. The recipient/column shape here is the LIVE one the mobile
 * inbox queries (`notifications.user_id / body / read`), NOT the older names in
 * the repo migrations (`profile_id / message / is_read`) — writing the wrong
 * columns is exactly why the mobile inbox was empty. We try the live shape and
 * fall back to the legacy shape on a missing-column error, so the send lands
 * whichever way this project's database is currently shaped.
 *
 * HONEST BACKEND GAP (documented, no migration written here)
 *  - Sending works: the `notifications` table has an admin INSERT policy
 *    (insert_admin, "is_staff_or_admin").
 *  - A DURABLE sent-history / delete does NOT exist yet: the table has no
 *    column recording WHO sent a message, RLS only lets staff read their OWN
 *    inbox (select_own), and there is no staff DELETE policy. So the list below
 *    is a session-local log of the sends YOU just performed — removing an entry
 *    only clears it from this log, it cannot recall a delivered message. To make
 *    this a real audit trail + recall, the backend needs: (a) a `created_by`
 *    column, (b) a staff SELECT policy over sent rows, and (c) a staff DELETE
 *    policy.
 */

import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { isMissingColumnError } from "@/lib/admin/supabase-data";
import {
  PageHeader,
  SectionCard,
  Field,
  EmptyState,
  EMPTY_IMAGES,
} from "@/components/admin/ui";
import { useToast } from "@/components/admin/Toast";
import {
  Send,
  Users,
  User,
  Search,
  Trash2,
  Loader2,
  Megaphone,
  Info,
  Check,
  KeyRound,
} from "lucide-react";

type Audience = "all" | "customer" | "id";

// notification_type enum values the DB accepts (system-facing first). Mobile maps
// a few of these to icons and defaults the rest.
const TYPES: { value: string; label: string }[] = [
  { value: "system_announcement", label: "System announcement" },
  { value: "promotion", label: "Promotion" },
  { value: "reminder", label: "Reminder" },
  { value: "alert", label: "Alert" },
  { value: "order_update", label: "Order update" },
  { value: "shipping_update", label: "Shipping update" },
  { value: "payment_update", label: "Payment update" },
];

interface CustomerHit {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface SentLog {
  id: string;
  at: string;
  title: string;
  body: string;
  type: string;
  audience: string;
  delivered: number;
  failed: number;
}

export default function NotificationsComposerPage() {
  const { success, error: toastError, info } = useToast();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<string>("system_announcement");

  const [audience, setAudience] = useState<Audience>("all");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerHit[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerHit | null>(null);
  const [profileId, setProfileId] = useState("");

  const [sending, setSending] = useState(false);
  const [log, setLog] = useState<SentLog[]>([]);

  const canSend =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (audience === "all" ||
      (audience === "customer" && !!selectedCustomer) ||
      (audience === "id" && profileId.trim().length > 0));

  const searchCustomers = useCallback(async () => {
    const q = customerSearch.trim();
    if (!q) {
      setCustomerResults([]);
      return;
    }
    setCustomerSearching(true);
    try {
      const { data, error } = await supabase
        .from("admin_customers_view")
        .select("id, full_name, email")
        .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(15);
      if (error) throw error;
      setCustomerResults((data as CustomerHit[]) || []);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Customer search failed");
    } finally {
      setCustomerSearching(false);
    }
  }, [customerSearch, toastError]);

  /**
   * Insert one notification for one recipient, preferring the live column shape
   * the mobile inbox reads and falling back to the legacy migration shape.
   */
  /* Row builders — preferring the live column shape the mobile inbox reads,
   * with a legacy fallback for schemas the migrations don't carry. */
  const buildLiveRow = useCallback(
    (recipientId: string) => ({
      user_id: recipientId,
      title: title.trim(),
      body: body.trim(),
      type,
      read: false,
      created_at: new Date().toISOString(),
    }),
    [title, body, type]
  );

  const buildLegacyRow = useCallback(
    (recipientId: string) => ({
      profile_id: recipientId,
      title: title.trim(),
      message: body.trim(),
      type,
      is_read: false,
      channel: "in_app",
      created_at: new Date().toISOString(),
    }),
    [title, body, type]
  );

  const handleSend = useCallback(async () => {
    if (!canSend) {
      toastError("Add a title, a message and pick a recipient.");
      return;
    }
    setSending(true);

    // Resolve the recipient set.
    let recipients: string[] = [];
    let audienceLabel = "";
    try {
      if (audience === "all") {
        // admin_customers_view is guaranteed staff-readable (the Customers screen
        // uses it), so it's a safer enumeration than guessing profiles RLS.
        const { data, error } = await supabase
          .from("admin_customers_view")
          .select("id")
          .limit(5000);
        if (error) throw error;
        recipients = ((data as any[]) || []).map((r) => r.id).filter(Boolean);
        audienceLabel = `All customers (${recipients.length})`;
      } else if (audience === "customer") {
        if (!selectedCustomer) throw new Error("Select a customer first.");
        recipients = [selectedCustomer.id];
        audienceLabel = selectedCustomer.full_name || selectedCustomer.email || selectedCustomer.id;
      } else {
        recipients = [profileId.trim()];
        audienceLabel = `Profile ${profileId.trim().slice(0, 8)}…`;
      }
    } catch (e) {
      setSending(false);
      toastError(e instanceof Error ? e.message : "Couldn't resolve recipients.");
      return;
    }

    if (recipients.length === 0) {
      setSending(false);
      info("There are no customers to send to yet.");
      return;
    }

    // Deliver, batching wide sends so we don't build a single giant statement.
    // PostgREST accepts an array body, so each 200-recipient batch is ONE
    // request instead of 200 individual POSTs. `.select("id")` returns the rows
    // actually written, which is what we count for a delivered/failed tally.
    let delivered = 0;
    let failed = 0;
    let firstError: string | undefined;
    // Resolved from the first batch: "live" columns, or "legacy" if the live
    // schema is missing one this project's migrations don't carry.
    let shape: "live" | "legacy" = "live";
    const BATCH = 200;
    for (let i = 0; i < recipients.length; i += BATCH) {
      const chunk = recipients.slice(i, i + BATCH);
      // Keep this batch on a single concrete column shape (any[]) so the typed
      // insert() overload doesn't widen a live|legacy union it can't check.
      let rows: any[] =
        shape === "live" ? chunk.map(buildLiveRow) : chunk.map(buildLegacyRow);
      let res = await supabase.from("notifications").insert(rows).select("id");

      // Older schema: flip the shape once and retry this batch in legacy columns.
      if (res.error && shape === "live" && isMissingColumnError(res.error)) {
        shape = "legacy";
        rows = chunk.map(buildLegacyRow);
        res = await supabase.from("notifications").insert(rows).select("id");
      }

      if (res.error) {
        // A batch insert is atomic: one bad row rejects all 200 and would
        // under-report. Fall back to per-row inserts for JUST this batch so a
        // single bad recipient can't hide the other 199, counting each honestly.
        const perRow = await Promise.all(
          rows.map((row) => supabase.from("notifications").insert(row).select("id"))
        );
        for (const r of perRow) {
          if (r.error) {
            failed++;
            if (!firstError) firstError = r.error.message;
          } else delivered += r.data?.length ?? 0;
        }
      } else {
        const n = res.data?.length ?? 0;
        delivered += n;
        const missing = chunk.length - n;
        if (missing > 0) {
          failed += missing;
          if (!firstError) firstError = "Some recipients were rejected by the server.";
        }
      }
    }

    setSending(false);
    if (delivered > 0) {
      setLog((prev) => [
        {
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : String(Date.now() + Math.random()),
          at: new Date().toISOString(),
          title: title.trim(),
          body: body.trim(),
          type,
          audience: audienceLabel,
          delivered,
          failed,
        },
        ...prev,
      ]);
    }

    if (failed === 0) {
      success(`Sent to ${delivered} recipient${delivered === 1 ? "" : "s"}.`);
      setTitle("");
      setBody("");
    } else if (delivered > 0) {
      toastError(`${delivered} sent, ${failed} failed${firstError ? `: ${firstError}` : ""}`);
    } else {
      // Whole send rejected — almost always a missing INSERT policy.
      toastError(
        firstError
          ? `Send refused: ${firstError}`
          : "Send refused by the server. The notifications INSERT policy may be missing."
      );
    }
  }, [canSend, audience, selectedCustomer, profileId, buildLiveRow, buildLegacyRow, title, body, type, success, toastError, info]);

  const audienceTabs: { value: Audience; label: string; icon: any }[] = useMemo(
    () => [
      { value: "all", label: "All customers", icon: Users },
      { value: "customer", label: "Specific customer", icon: User },
      { value: "id", label: "Profile ID", icon: KeyRound },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Push an in-app message into the customer mobile inbox"
      />

      {/* Honest scope note */}
      <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info/5 px-4 py-3 text-sm text-info dark:border-info/30 dark:bg-info/10">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="leading-relaxed">
          Delivery channel is <strong>in-app</strong> (the mobile inbox). The send log below is
          session-local: the notifications table has no <code>created_by</code> column and staff
          can’t read or delete others’ rows under current RLS, so entries can’t be recalled from
          here. See the file header for the backend grants a durable audit trail needs.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Composer */}
        <SectionCard title="New notification" subtitle="What your customers will see">
          <div className="space-y-4">
            <Field label="Title" required>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Eid promotion is live"
                className="admin-input"
                maxLength={120}
              />
            </Field>

            <Field label="Message" required hint={`${body.length}/500 characters`}>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, 500))}
                rows={4}
                placeholder="Write the message shown in the inbox…"
                className="w-full rounded-xl border border-dark-900/10 bg-white px-3.5 py-2.5 text-sm text-dark-900 placeholder:text-dark-900/35 transition-all focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 dark:border-[var(--admin-border)] dark:bg-[var(--admin-surface)] dark:text-[var(--admin-text)] dark:placeholder:text-[var(--admin-text-faint)]"
              />
            </Field>

            <Field label="Type">
              <select value={type} onChange={(e) => setType(e.target.value)} className="admin-input">
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>

            {/* Audience selector */}
            <div>
              <label className="admin-label">Audience</label>
              <div className="flex flex-wrap gap-1.5">
                {audienceTabs.map((tab) => {
                  const Icon = tab.icon;
                  const active = audience === tab.value;
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => setAudience(tab.value)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                        active
                          ? "border-brand-500 bg-brand-500 text-white"
                          : "border-dark-900/10 bg-white text-dark-900/60 hover:border-dark-900/25 dark:border-white/10 dark:bg-dark-900 dark:text-neutral-400"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Audience-specific inputs */}
            {audience === "all" && (
              <p className="rounded-xl bg-warm-100 px-3 py-2 text-xs text-dark-900/60 dark:bg-dark-800 dark:text-neutral-400">
                Sends to every customer returned by the admin customers view.
              </p>
            )}

            {audience === "customer" && (
              <div className="space-y-2">
                {selectedCustomer ? (
                  <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                    <span className="flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">
                      <Check className="h-4 w-4" />
                      {selectedCustomer.full_name || selectedCustomer.email || selectedCustomer.id}
                    </span>
                    <button
                      onClick={() => setSelectedCustomer(null)}
                      className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-900/30 dark:text-neutral-500" />
                        <input
                          value={customerSearch}
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), searchCustomers())}
                          placeholder="Search by name or email…"
                          className="admin-input pl-9"
                        />
                      </div>
                      <button onClick={searchCustomers} disabled={customerSearching} className="admin-btn-outline h-10">
                        {customerSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        Search
                      </button>
                    </div>
                    {customerResults.length > 0 && (
                      <div className="max-h-48 overflow-y-auto rounded-xl border border-dark-900/10 dark:border-white/10">
                        {customerResults.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => setSelectedCustomer(c)}
                            className="flex w-full items-center justify-between gap-2 border-b border-dark-900/[0.06] px-3 py-2 text-left text-sm last:border-0 hover:bg-warm-100 dark:border-white/[0.06] dark:hover:bg-white/5"
                          >
                            <span className="truncate font-medium text-dark-900 dark:text-neutral-200">
                              {c.full_name || "Unnamed"}
                            </span>
                            <span className="truncate text-xs text-dark-900/45 dark:text-neutral-500">{c.email || "—"}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {audience === "id" && (
              <Field label="Profile (user) ID" required hint="The recipient's auth uid — same value as notifications.user_id.">
                <input
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                  placeholder="e.g. 7c1e…"
                  className="admin-input font-mono"
                />
              </Field>
            )}

            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-dark-900/10 bg-white px-2.5 py-1 text-[11px] font-semibold text-dark-900/55 dark:border-white/10 dark:bg-dark-900 dark:text-neutral-400">
                <Megaphone className="h-3.5 w-3.5 text-brand-500" /> In-app channel
              </span>
              <button onClick={handleSend} disabled={!canSend || sending} className="admin-btn-primary">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? "Sending…" : "Send notification"}
              </button>
            </div>
          </div>
        </SectionCard>

        {/* Session send log */}
        <SectionCard
          title="Sent this session"
          subtitle="Local log of the sends you just performed — not a durable server audit trail"
        >
          {log.length === 0 ? (
            <EmptyState
              image={EMPTY_IMAGES.generic}
              compact
              title="No sends yet"
              subtitle="Messages you deliver in this session appear here so you can review or clear them from the log."
            />
          ) : (
            <div className="space-y-3">
              {log.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-dark-900/[0.06] bg-warm-50 p-4 dark:border-white/[0.08] dark:bg-dark-950"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-dark-900 dark:text-neutral-100">{entry.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-dark-900/55 dark:text-neutral-400">{entry.body}</p>
                    </div>
                    <button
                      onClick={() => setLog((prev) => prev.filter((l) => l.id !== entry.id))}
                      className="shrink-0 rounded-lg p-1.5 text-dark-900/40 transition hover:bg-rose-50 hover:text-rose-600 dark:text-neutral-500 dark:hover:bg-rose-500/10"
                      title="Remove from this log (does not recall the message)"
                      aria-label="Remove from log"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-dark-900/50 dark:text-neutral-500">
                    <span className="rounded-full bg-dark-900/[0.06] px-2 py-0.5 font-semibold dark:bg-white/10">
                      {entry.audience}
                    </span>
                    <span>· {new Date(entry.at).toLocaleString()}</span>
                    <span className={cn(entry.failed > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400", "font-semibold")}>
                      · {entry.delivered} delivered{entry.failed > 0 ? `, ${entry.failed} failed` : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
