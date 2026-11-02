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

/** One spreadsheet column: a header and how to pull its cell out of a row. */
export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
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
/**
 * The row shape ORDERS_CSV_COLUMNS reads. Deliberately loose (every field
 * optional) because the dashboard feeds it its own `RecentOrder` and the orders
 * page feeds it full view rows; both are structurally compatible, and a missing
 * field must export as an empty cell rather than be invented.
 */
export interface OrdersCsvRow {
  id?: string | null;
  order_number?: string | null;
  reference?: string | null;
  created_at?: string | null;
  customer_name?: string | null;
  recipient_name?: string | null;
  phone?: string | null;
  customer_phone?: string | null;
  city?: string | null;
  status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  shipping_method?: string | null;
  apps?: string[] | null;
  target_marketplace?: string | null;
  total?: number | null;
  subtotal?: number | null;
  shipping_cost?: number | null;
  service_fee?: number | null;
}

export const ORDERS_CSV_COLUMNS: CsvColumn<OrdersCsvRow>[] = [
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

