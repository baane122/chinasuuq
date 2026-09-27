// Client-side CSV export for the admin. apps/web is a static export, so there
// is no server to stream this from, and every screen already has the rows in
// hand.

/**
 * Spreadsheet formula injection. A product name like `=cmd|'/c calc'!A0` is
 * harmless in a cell and executable in Excel, so anything that starts an
 * expression is neutralised with a leading apostrophe. `-` is included because
 * `-1+2` also evaluates; it costs nothing since these are labels, not numbers.
 */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  const dangerous = /^[=+\-@\t\r]/.test(s);
  const body = dangerous ? `'${s}` : s;
  return /[",\n\r]/.test(body) ? `"${body.replace(/"/g, '""')}"` : body;
}

export function toCsv(
  columns: { header: string; value: (row: any) => unknown }[],
  rows: any[]
): string {
  const head = columns.map((c) => escapeCell(c.header)).join(",");
  const body = rows.map((row) =>
    columns.map((c) => escapeCell(c.value(row))).join(",")
  );
  // The BOM is what makes Excel read Chinese product names as UTF-8 instead of
  // mojibake.
  return "\uFEFF" + [head, ...body].join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Shared by the dashboard and the orders list so both export the same shape —
 * a staff member opening either file should not have to relearn the columns.
 */
export const ORDERS_CSV_COLUMNS: { header: string; value: (row: any) => unknown }[] = [
  { header: "Order", value: (r) => r.order_number || r.reference || r.id },
  { header: "Placed (UTC)", value: (r) => r.created_at },
  { header: "Customer", value: (r) => r.customer_name || r.recipient_name || "" },
  { header: "Phone", value: (r) => r.phone || r.customer_phone || "" },
  { header: "City", value: (r) => r.city || "" },
  { header: "Status", value: (r) => r.status },
  { header: "Payment", value: (r) => r.payment_status },
  { header: "Method", value: (r) => r.payment_method },
  { header: "Shipping", value: (r) => r.shipping_method },
  { header: "Bought in (line items)", value: (r) =>
    Array.isArray(r.apps) && r.apps.length ? r.apps.join(" | ") : "not recorded" },
  { header: "Marketplace (order-level)", value: (r) => r.target_marketplace },
  { header: "Subtotal USD", value: (r) => r.subtotal },
  { header: "Shipping USD", value: (r) => r.shipping_cost },
  { header: "Service fee USD", value: (r) => r.service_fee },
  { header: "Total USD", value: (r) => r.total },
];

export function stamp() {
  return new Date().toISOString().slice(0, 10);
}

