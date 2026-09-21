// Server-authoritative cart gate before order placement.
// Calls the cart-validate edge function (products MOQ / stock). Best-effort:
// offline or function failure NEVER blocks checkout (offline-first app).
import { supabase } from "@/lib/supabase";

export type RemoteCartValidation = {
  ran: boolean; // false when skipped (offline)
  blocking: boolean;
  messages: string[];
};

export async function validateCartRemote(
  items: { productId: string; quantity: number }[]
): Promise<RemoteCartValidation> {
  if (items.length === 0) return { ran: false, blocking: false, messages: [] };
  try {
    const { data, error } = await supabase.functions.invoke("cart-validate", {
      body: { items },
    });
    if (error || !data?.lines) return { ran: false, blocking: false, messages: [] };
    const lines = data.lines as {
      status: string;
      problems: string[];
      minOrderQty: number | null;
      stockQty: number | null;
    }[];
    const messages: string[] = [];
    let blocking = false;
    for (const l of lines) {
      if (l.problems?.includes("below_moq")) {
        blocking = true;
        messages.push(`One item is below its minimum order quantity (${l.minOrderQty}).`);
      }
      if (l.problems?.includes("insufficient_stock")) {
        blocking = true;
        messages.push(`Only ${l.stockQty} left in stock for one item.`);
      }
    }
    return { ran: true, blocking, messages: [...new Set(messages)] };
  } catch {
    return { ran: false, blocking: false, messages: [] };
  }
}
