// Server-authoritative cart validation (Supabase Edge Function).
// Each cart line is checked against the product's real ordering rules.
//
// The table is `source_products`. There is no `products` table and no
// `min_order_qty` column: the query this file used to run failed for every
// line, each line came back `missing_product_id`, and the mobile gate — which
// only blocks on `below_moq` / `insufficient_stock` — silently let everything
// through. The lookup below is written so that failure is loud and rare.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LINES = 100;

// Provenance columns arrive with migration 202609250003, the curated
// stock_status / price_cny_min with 202609250004, and `status` with
// 202609250005. Until they are applied a wider select raises 42703
// (undefined_column) and aborts the WHOLE query, so the lookup walks down a list
// of column sets and uses the first one this database accepts.
//
// There is no `price_cny` column on this table in ANY generation — the CNY price
// is `source_price`, and 202609250004 adds the curated `price_cny_min`. Naming a
// column that never existed put the base select on the same footing as the wide
// one: both returned 42703, the function answered 500 for every cart holding a
// catalog product, and the mobile gate read that as "not validated" and let the
// order through unchecked. That is the failure this ladder exists to prevent, so
// the LAST entry must name only columns every generation has ever had.
const SELECT_CANDIDATES = [
  // Everything: an importer catalog with both migrations applied.
  "id, moq, moq_source, source_min_quantity, status, in_stock, stock_status, stock_quantity, price_cny_min, source_price",
  // The live project's source_products (probed 2026-09-25) is the curated
  // vocabulary only: no in_stock, no source_price, no stock_quantity, and it
  // says "buyable" with the stock_status enum.
  "id, moq, moq_source, status, stock_status, price_cny_min",
  // 202408010004's importer row before any of this quarter's migrations: the
  // boolean flag and the scraped price are all it has, and they are worth a rung
  // of their own — dropping to the floor would quietly stop detecting a sold-out
  // or archived product on an un-migrated catalog.
  "id, moq, source_min_quantity, status, in_stock, stock_quantity, source_price",
  // The floor. moq has defaulted to 1 since 202408010004 and `id` is the key, so
  // this cannot 42703 — a catalog that answers nothing else can still refuse a
  // quantity below its own minimum.
  "id, moq",
];

// Problems a customer must resolve before ordering. A product that is simply
// absent from the catalog is NOT here: see the `!row` branch.
const BLOCKING = [
  "below_moq",
  "insufficient_stock",
  "out_of_stock",
  "not_available",
  "invalid_quantity",
];

type ProductRow = {
  id: string;
  moq: number | null;
  // Every field below is optional because which of them arrive is the schema's
  // answer, not the caller's: the narrowest select fetches none of them.
  moq_source?: string | null;
  source_min_quantity?: number | null;
  status?: string | null;
  in_stock?: boolean | null;
  /** Curated three-state flag; absent on a schema before 202609250004. */
  stock_status?: string | null;
  stock_quantity?: number | null;
  /** Curated CNY price; absent on a schema before 202609250004. */
  price_cny_min?: number | null;
  source_price?: number | null;
};

export async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    if (!Array.isArray(body?.items) || body.items.length === 0) {
      return json({ ok: false, error: "no_items" }, 400);
    }
    const requested = (body.items as unknown as any[]).slice(0, MAX_LINES).map((item) => ({
      productId: String(item?.productId ?? ""),
      quantity: Number(item?.quantity),
      // The minimum the cart enforced for this line, derived from the captured
      // listing. A catalog row wins when it has one; when the product only
      // exists in the customer's cart there is nothing better to compare
      // against, and a client can only ever block itself with this.
      clientMin: Number(item?.minOrderQty),
    }));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // One round trip for the whole cart. A productId that is not a UUID is a
    // product the customer captured in the WebView and never wrote to the
    // catalog (SmartProductForm uses the listing's source id or URL), so those
    // ids are filtered out rather than sent to Postgres.
    const catalogIds = [
      ...new Set(requested.map((r) => r.productId).filter((id) => UUID_RE.test(id))),
    ];

    let rows: ProductRow[] = [];
    if (catalogIds.length > 0) {
      let result: { data?: unknown; error: { code?: string; message?: string } | null } =
        { data: [], error: null };
      for (const columns of SELECT_CANDIDATES) {
        result = await supabase
          .from("source_products")
          .select(columns)
          .in("id", catalogIds);
        if (!result.error) break;
        // Only a rejected column name moves to the next, narrower select. A
        // connection or permission failure is the same on every shape, so
        // retrying it three times would just delay the 500 the client expects.
        if (!isMissingColumn(result.error)) break;
      }
      // A dead lookup returns 500, which the client reads as "not validated"
      // and checks out anyway. That is the intended offline-first behaviour,
      // and the reason an unreachable DB must never block an order.
      if (result.error) {
        return json({ ok: false, error: "lookup_failed", detail: result.error.message }, 500);
      }
      rows = (result.data ?? []) as unknown as ProductRow[];
    }
    const byId = new Map(rows.map((r) => [r.id, r]));

    const lines = requested.map(({ productId, quantity, clientMin }) => {
      const echo = { productId, quantity };
      const clientMinimum =
        Number.isFinite(clientMin) && clientMin > 1 ? Math.trunc(clientMin) : null;
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return {
          ...echo,
          status: "needs_review",
          problems: ["invalid_quantity"],
          minOrderQty: null,
          stockQty: null,
          unitPriceCny: null,
        };
      }

      const row = UUID_RE.test(productId) ? byId.get(productId) : undefined;
      if (!row) {
        // Local capture, or a catalog row that has since been removed. The
        // product itself is NOT a reason to hold an order — this app's primary
        // sourcing flow is customer-captured products that legitimately have no
        // catalog row — but a minimum derived from that listing still applies.
        const problems: string[] = [];
        if (clientMinimum !== null && quantity < clientMinimum) problems.push("below_moq");
        return {
          ...echo,
          status: problems.length === 0 ? "unchecked" : "needs_review",
          problems,
          minOrderQty: clientMinimum,
          stockQty: null,
          unitPriceCny: null,
        };
      }

      const problems: string[] = [];
      const minOrderQty = effectiveMinimum(row) ?? clientMinimum;
      if (minOrderQty !== null && quantity < minOrderQty) problems.push("below_moq");

      const stockQty = toInt(row.stock_quantity);
      // Either flag can say the product is gone: `in_stock` is what importers
      // write, `stock_status` what the admin UI writes. 202609250004 keeps them
      // in step by trigger; reading both means a row saved between deploys
      // cannot be bought from a screen that shows it as out of stock.
      const soldOut = row.in_stock === false || row.stock_status === "out_of_stock";
      if (soldOut) problems.push("out_of_stock");
      else if (stockQty !== null && quantity > stockQty) problems.push("insufficient_stock");

      // RLS already hides non-active products from customers, so this only
      // fires for a product that changed status after it reached the cart.
      if (row.status && row.status !== "active") problems.push("not_available");

      return {
        ...echo,
        status: problems.length === 0 ? "valid" : "needs_review",
        problems,
        minOrderQty,
        // Explicit 0 when the supplier flag says out of stock: null would hide
        // why the line is held, and stock_quantity is NULL for "unknown".
        stockQty: soldOut ? 0 : stockQty,
        // A live catalog declares price_cny_min NOT NULL DEFAULT 0, so 0 is that
        // row saying "no price captured", not a free product. Reporting it as a
        // price would put ¥0 in the customer's total.
        unitPriceCny: positiveOr(toNum(row.price_cny_min)) ?? positiveOr(toNum(row.source_price)),
      };
    });

    return json(
      {
        ok: lines.every((l) => !l.problems.some((p) => BLOCKING.includes(p))),
        lines,
        validatedAt: new Date().toISOString(),
      },
      200
    );
  } catch (e) {
    return json({ ok: false, error: (e as Error).message || "internal" }, 500);
  }
}

/**
 * The minimum a customer has to order, or null when nothing establishes one.
 *
 * `moq INTEGER DEFAULT 1` and `source_min_quantity INTEGER DEFAULT 1` both use
 * 1 as "no evidence", so 1 is never a stated minimum — reading it as one would
 * make every un-curated product look like a single-piece order, which is exactly
 * the wrong direction for a wholesale catalog.
 */
function effectiveMinimum(row: ProductRow): number | null {
  const moq = toInt(row.moq);
  // A manual value is staff's exact answer, including a deliberate 1 meaning
  // "this has no minimum". The scraped figure must not resurrect a limit the
  // team just removed.
  if (row.moq_source === "manual") return moq !== null && moq > 1 ? moq : null;

  const evidence = [moq, toInt(row.source_min_quantity)].filter(
    (v): v is number => v !== null && v > 1
  );
  return evidence.length > 0 ? Math.max(...evidence) : null;
}

function isMissingColumn(error: { code?: string; message?: string }): boolean {
  return error.code === "42703" || /column|does not exist/i.test(error.message ?? "");
}

function toNum(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function toInt(value: unknown): number | null {
  const n = toNum(value);
  return n === null ? null : Math.trunc(n);
}

/** null for 0 as well as for absent: both columns that hold it use 0 as
 *  "nobody captured a price", and a 0 here would price the line as free. */
function positiveOr(value: number | null): number | null {
  return value !== null && value > 0 ? value : null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(handler);
