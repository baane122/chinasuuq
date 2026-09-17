// Server-authoritative cart validation (Phase 2 — smart cart).
// Each line is validated against the product's real ordering rules in the DB.
// Offline carts remain drafts until this function passes.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

export async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    if (!Array.isArray(body?.items) || body.items.length === 0) {
      return json({ ok: false, error: "no_items" }, 400);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const lines: any[] = [];
    for (const item of body.items) {
      const { data: row } = await supabase
        .from("products")
        .select("id, min_order_qty, price_cny, stock_qty")
        .eq("id", item.productId)
        .maybeSingle();

      if (!row) {
        lines.push({ productId: item.productId, status: "needs_review", problems: ["missing_product_id"] });
        continue;
      }
      const problems: string[] = [];
      if (row.min_order_qty && item.quantity < row.min_order_qty) problems.push("below_moq");
      if (row.stock_qty != null && row.stock_qty < item.quantity) problems.push("insufficient_stock");
      lines.push({
        productId: item.productId,
        status: problems.length === 0 ? "valid" : "needs_review",
        problems,
        minOrderQty: row.min_order_qty,
        stockQty: row.stock_qty,
        unitPriceCny: row.price_cny,
      });
    }
    return json({ ok: lines.every((l) => l.status === "valid"), lines, validatedAt: new Date().toISOString() }, 200);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message || "internal" }, 500);
  }
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}


Deno.serve(handler);
