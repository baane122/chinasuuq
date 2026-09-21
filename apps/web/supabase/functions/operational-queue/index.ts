// Phase 3 — Mission Control operational queue (server-authoritative).
// Returns actionable items: orders awaiting confirmation, payments awaiting
// verification, open sourcing, draft/sent quotes — from the real admin views.

import { corsHeaders } from "../_shared/cors.ts";
import { requireStaffOrAdmin, unauthorized } from "../_shared/auth.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

export async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // SECURITY: returns internal operations data (orders, payments, customers)
  // from the admin views. Staff/admin only — anonymous callers must never see
  // this queue.
  const staff = await requireStaffOrAdmin(req);
  if (!staff) return unauthorized("staff_required");
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const [orders, sourcing, payments] = await Promise.all([
      supabase.from("admin_orders_view").select("id,order_number,customer_name,status,payment_status,total,created_at").order("created_at", { ascending: false }).limit(50),
      supabase.from("admin_sourcing_view").select("id,status,created_at").limit(50),
      supabase.from("admin_payments_view").select("*").limit(50),
    ]);

    const items: any[] = [];
    (orders.data || []).forEach((o: any) => {
      if (o.payment_status === "pending") {
        items.push({
          id: "order_" + o.id, kind: "order_confirmation",
          priority: o.status === "confirmed" ? "high" : "normal",
          status: "open",
          problem: "Order " + o.order_number + " awaits confirmation",
          why: "Payment is pending; no funds verified yet.",
          evidence: ["admin_orders_view:" + o.id],
          recommendedAction: "Confirm payment proof with provider before purchasing.",
          approvalRequired: "single", orderId: o.id, createdAt: o.created_at, updatedAt: o.created_at,
        });
      }
    });
    (sourcing.data || []).forEach((s: any) => {
      if (s.status === "open" || s.status === "quoted") {
        items.push({
          id: "sourcing_" + s.id, kind: "purchase_blocked", priority: "normal", status: "open",
          problem: "Sourcing request needs supplier decision",
          why: "Supplier offer not yet accepted.",
          evidence: ["admin_sourcing_view:" + s.id],
          recommendedAction: "Compare documented supplier offers and choose a buyer-approved supplier.",
          approvalRequired: "single", createdAt: s.created_at, updatedAt: s.created_at,
        });
      }
    });

    return json({ ok: true, total: items.length, items: items.slice(0, 100), generatedAt: new Date().toISOString() }, 200);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message || "internal" }, 500);
  }
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}


Deno.serve(handler);
