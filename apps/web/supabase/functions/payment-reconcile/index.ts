// ChinaSuuq — payment-reconcile: server-side orchestration for a staff payment
// confirmation (audit §2 "Payments never sync orders.payment_status", §6 B).
//
// The admin payments page (apps/web/src/app/admin/(protected)/payments/page.tsx
// handleStatusChange, L227–250) writes ONLY the `payments` row — status plus, on
// confirm, verified_by/verified_at — and never touches the parent order. That
// left every confirmed payment desynced from orders.payment_status/orders.status.
// This function mirrors that page's logic and adds the missing sync:
//
//   1. update payments.status (verified_by/verified_at stamped when confirmed)
//   2. orders.payment_status := mapped payment status (see MAP below)
//   3. when the payment is PAID, nudge orders.status forward one step
//   4. insert a customer notification (payment_update milestone)
//
// POST { payment_id: uuid, status?: string }   (status defaults "confirmed",
//        the action the page's Confirm button performs today)
//   → 200 { ok: true, order_id } | { ok: false, error, detail? }
//
// AUTH: requireStaffOrAdmin. ALL writes use the CALLER's JWT client (userClient),
// not the service key, on purpose: the orders_money_guard trigger
// (202609210001 §3) raises whenever a non-staff context changes
// payment_status — and a service-role request carries no auth.uid() at all, so
// a service-key order update would be rejected by the guard. A staff JWT
// satisfies both the guard and the payments_update_staff / orders_update_own
// RLS policies.
import { corsHeaders } from "../_shared/cors.ts";
import { requireStaffOrAdmin, unauthorized, userClient } from "../_shared/auth.ts";

// payments.status → orders.payment_status. The live page vocabulary is
// pending/confirmed/failed/refunded (payments/page.tsx L48); the payment_status
// enum carries 'confirmed' via 202408010014 §2, and the 202408010001 labels
// cover the rest. Same word on both sides is the whole mapping.
const PAYMENT_TO_ORDER: Record<string, string> = {
  pending: "pending",
  processing: "processing",
  confirmed: "confirmed",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  refunded: "refunded",
};

// Statuses that mean "the money is in".
const PAID = ["confirmed", "completed"];

// Forward-only status nudge (live admin orders lifecycle, orders/page.tsx L43–
// L53: ordering = pending/confirmed, processing = purchasing/purchased/…). A
// paid order moves pending/confirmed/awaiting_payment → purchasing. Anything
// further along the pipeline is already past payment and is left alone.
// ASSUMPTION (live drift): 'paid' exists in the 202408010001 order_status enum
// but the admin flow never uses it, so it is not written here.
const ADVANCE_FROM = ["pending", "confirmed", "awaiting_payment"];
const ADVANCE_TO = "purchasing";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Notification insert, walked down a candidate list the way cart-validate walks
// its select list: the live notifications table is the compact shape
// (user_id/title/body/type/read/created_at — see mobile
// app/notifications/index.tsx L59 and admin layout L264–276), while the repo
// 202408010009 shape uses (profile_id/title/message/type/is_read/related_*).
// Whichever the database has, the first accepted payload wins; a rejected
// column list must not fail the reconciliation itself.
async function insertNotification(
  client: NonNullable<ReturnType<typeof userClient>>,
  uid: string,
  title: string,
  bodyText: string,
  orderId: string
) {
  const candidates: Record<string, unknown>[] = [
    { user_id: uid, title, body: bodyText, type: "payment_update", read: false },
    { profile_id: uid, title, message: bodyText, type: "payment_update", is_read: false, related_type: "order", related_id: orderId },
    { profile_id: uid, title, body: bodyText, type: "info" },
  ];
  for (const payload of candidates) {
    // `as never` sidesteps the schema-inferred excess-property check: the
    // whole point is to try column sets the local type declaration cannot
    // know about.
    const { error } = await client.from("notifications").insert(payload as never);
    if (!error) return true;
  }
  return false;
}

export async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const caller = await requireStaffOrAdmin(req);
  if (!caller) return unauthorized("auth_required");

  try {
    const body = await req.json();
    const paymentId = String(body?.payment_id ?? "");
    if (!paymentId) return json({ ok: false, error: "missing_payment_id" }, 400);
    const target = String(body?.status ?? "confirmed").trim().toLowerCase();
    const orderPaymentStatus = PAYMENT_TO_ORDER[target];
    if (!orderPaymentStatus) {
      return json({ ok: false, error: "invalid_status", detail: `unknown payment status: ${target}` }, 400);
    }

    const client = userClient(req);
    if (!client) return unauthorized("auth_required");

    // 1. read the payment (staff RLS: payments_select_staff, 202408010010 L605).
    const { data: payment, error: readErr } = await client
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();
    if (readErr) {
      // Codes stay, DB detail goes: Postgres messages are logged server-side
      // only (audit 2026-10-04 — no raw error text to callers).
      console.error("payment-reconcile: payment lookup failed", readErr.message);
      return json({ ok: false, error: "payment_lookup_failed" }, 500);
    }
    if (!payment) return json({ ok: false, error: "payment_not_found" }, 404);

    // 2. mirror the admin page exactly: stamp the verifier on confirmation.
    //    verified_by/verified_at exist on the live payments table (the page
    //    writes them today); an older schema generation gets a bare status
    //    update so reconciliation still proceeds.
    const withStamp =
      target === "confirmed"
        ? { status: target, verified_by: caller.userId, verified_at: new Date().toISOString() }
        : { status: target };
    let payUpd = await client.from("payments").update(withStamp).eq("id", paymentId);
    if (payUpd.error && /verified|column/i.test(payUpd.error.message ?? "")) {
      payUpd = await client.from("payments").update({ status: target }).eq("id", paymentId);
    }
    if (payUpd.error) {
      console.error("payment-reconcile: payment update failed", payUpd.error.message);
      return json({ ok: false, error: "payment_update_failed" }, 500);
    }

    // 3. the order sync the page never did.
    const orderId = String(payment.order_id ?? "");
    if (!orderId) return json({ ok: false, error: "payment_has_no_order" }, 422);

    const { data: order, error: ordReadErr } = await client
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();
    if (ordReadErr) {
      console.error("payment-reconcile: order lookup failed", ordReadErr.message);
      return json({ ok: false, error: "order_lookup_failed" }, 500);
    }
    if (!order) return json({ ok: false, error: "order_not_found" }, 404);

    const orderUpdate: Record<string, unknown> = { payment_status: orderPaymentStatus };
    const advancing = PAID.includes(target) && ADVANCE_FROM.includes(String(order.status ?? ""));
    if (advancing) orderUpdate.status = ADVANCE_TO;

    const { error: ordUpdErr } = await client.from("orders").update(orderUpdate).eq("id", orderId);
    if (ordUpdErr) {
      console.error("payment-reconcile: order update failed", ordUpdErr.message);
      return json({ ok: false, error: "order_update_failed" }, 500);
    }

    // 4. customer notification on a paid milestone (best-effort: never fails
    //    the reconciliation; 202610030001 additionally auto-notifies on the
    //    status change itself via trigger).
    const uid = String(order.user_id ?? order.profile_id ?? "");
    const ref = String(order.reference ?? order.order_number ?? "");
    if (uid && PAID.includes(target)) {
      await insertNotification(
        client,
        uid,
        "Payment received",
        `We received your payment for order ${ref}. Your order is now being purchased.`,
        orderId
      );
    }

    return json({ ok: true, order_id: orderId });
  } catch (e) {
    // Stable code only — the raw exception message never reaches the caller.
    console.error("payment-reconcile: unhandled error", (e as Error)?.name, (e as Error)?.message);
    return json({ ok: false, error: "internal_error" }, 500);
  }
}

Deno.serve(handler);
