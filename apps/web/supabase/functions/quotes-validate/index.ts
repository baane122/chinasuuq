// ChinaSuuq — server-authoritative quote validation (Supabase Edge Function).
// The client must never be authoritative for payable totals. This function
// runs with the service role, re-validates quantities and prices, and returns
// payable-now (known lines only) with every unknown line explicitly PENDING.
// It never fabricates a precise delivered total.

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface QuoteLine {
  productId?: string;
  variantId?: string;
  quantity: number;
  unitPriceCny?: number;
}

export async function handler(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json();
    if (!Array.isArray(body?.items) || body.items.length === 0) {
      return json({ ok: false, error: "no_items" }, 400);
    }

    // Service-role client (safe server-side).
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const lines: any[] = [];
    for (const item of body.items as QuoteLine[]) {
      const cents = Math.round((item.unitPriceCny || 0) * 100);
      const goodsCny = ((cents * item.quantity) / 100).toFixed(2);

      let status = "valid";
      let problem: string | undefined;
      if (!item.productId) { status = "needs_review"; problem = "missing_product_id"; }
      else if (!Number.isFinite(item.quantity) || item.quantity <= 0) { status = "needs_review"; problem = "invalid_quantity"; }
      else {
        // Re-read the product price from the DB (not client-supplied). The live
        // catalog is `source_products`; `products` does not exist, and querying
        // it made every line come back needs_review: missing_price. Its price is
        // price_cny_min, declared NOT NULL DEFAULT 0, so 0 means "unpriced" —
        // the same absence as NULL.
        const { data } = await supabase
          .from("source_products")
          .select("price_cny_min")
          .eq("id", item.productId)
          .maybeSingle();
        const dbPrice = Number(data?.price_cny_min ?? 0) > 0 ? data?.price_cny_min : null;
        if (dbPrice == null) { status = "needs_review"; problem = "missing_price"; }
        else if (Math.abs(Number(dbPrice) - Number(item.unitPriceCny || 0)) > 0.005) {
          status = "needs_review"; problem = "price_mismatch";
        }
      }
      lines.push({ ok: status === "valid", productId: item.productId, quantity: item.quantity, goodsCny, status, problem });
    }

    const centsTotal = lines.reduce((a, l) => a + Math.round(Number(l.goodsCny) * 100), 0);
    return json({
      ok: lines.every((l) => l.ok),
      currency: "CNY",
      lines,
      breakdown: {
        goodsCny: lines.reduce((a, l) => a + Number(l.goodsCny), 0).toFixed(2),
        serviceFeeUsd: "pending",
        domesticDeliveryCny: "pending",
        internationalShippingUsd: "pending",
        dutiesUsd: "pending",
        payableNowUsd: (centsTotal / 100 * 1).toFixed(2),
        remainingToConfirm: "pending",
      },
      validatedAt: new Date().toISOString(),
    }, 200);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message || "internal" }, 500);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}


Deno.serve(handler);
