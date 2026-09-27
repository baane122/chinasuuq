// Server-authoritative cart gate before order placement.
// Calls the cart-validate edge function (source_products MOQ / stock).
// Best-effort: offline or function failure NEVER blocks checkout (offline-first
// app), but a genuine answer from the server does.
import { supabase } from "@/lib/supabase";

export type RemoteCartValidation = {
  ran: boolean; // false when skipped (offline or lookup failed)
  blocking: boolean;
  messages: string[];
};

type ValidationLine = {
  productId: string;
  quantity: number;
  status: string;
  problems: string[];
  minOrderQty: number | null;
  stockQty: number | null;
};

// Only these problems hold an order, and the server only sends these plus a
// bare `status: "unchecked"` for a product the catalog has never heard of —
// products captured in the WebView must stay orderable.
const MESSAGE: Record<string, (line: ValidationLine) => string> = {
  below_moq: (l) =>
    `One item needs at least ${l.minOrderQty} pieces — you have ${l.quantity}.`,
  insufficient_stock: (l) =>
    `Only ${l.stockQty} left in stock for one item — you have ${l.quantity}.`,
  out_of_stock: () => "One item is out of stock at the supplier.",
  not_available: () => "One item is no longer available for ordering.",
  invalid_quantity: () => "One item has an invalid quantity.",
};

export async function validateCartRemote(
  items: { productId: string; quantity: number; minOrderQty?: number | null }[]
): Promise<RemoteCartValidation> {
  if (items.length === 0) return { ran: false, blocking: false, messages: [] };
  try {
    const { data, error } = await supabase.functions.invoke("cart-validate", {
      body: { items },
    });
    if (error || !data?.lines) {
      // Fail open, but out loud. An unreachable function and a function that
      // rejects the caller (verify_jwt, a 401, or a schema drift that breaks its
      // lookup) are indistinguishable from "this cart is fine" otherwise — and
      // the previous version of this gate was silently dead for exactly that
      // reason.
      if (__DEV__) {
        console.warn("[cart-validate] server gate skipped:", error?.message ?? "no lines returned");
      }
      return { ran: false, blocking: false, messages: [] };
    }
    const lines = data.lines as ValidationLine[];
    const messages: string[] = [];
    let blocking = false;
    for (const line of lines) {
      for (const problem of line.problems ?? []) {
        const describe = MESSAGE[problem];
        if (!describe) continue;
        blocking = true;
        messages.push(describe(line));
      }
    }
    return { ran: true, blocking, messages: [...new Set(messages)] };
  } catch {
    return { ran: false, blocking: false, messages: [] };
  }
}
