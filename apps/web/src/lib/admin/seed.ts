// Seed data for the admin Mission Control.
// Compact, fully-typed seed used when Supabase data isn't available.
import type {
  AdminActivityEvent,
  AdminCustomer,
  AdminMarketplaceAccount,
  AdminNotification,
  AdminOrder,
  AdminOrderItem,
  AdminPayment,
  AdminProduct,
  AdminQuote,
  AdminRate,
  AdminShipment,
  AdminSourcingRequest,
  AdminStaffMember,
  AdminSupplier,
} from "./types";

const NOW = new Date("2026-08-12T09:00:00Z");
export const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
export const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000).toISOString();
export const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString();

// Item factory — returns AdminOrderItem ready to drop into orders.
export const it = (id: string, product_id: string, title: string, qty: number, price: number, variant?: string): AdminOrderItem => ({
  id, product_id, product_title: title, variant, quantity: qty, unit_price_usd: price, total_usd: price * qty,
});

export const SEED_NOTIFICATIONS: AdminNotification[] = [
  { id: "n1", title: "Order #CS-2026-00124 paid", body: "Mohamed Abdi in Hargeisa paid via ZAAD — $842 confirmed.", kind: "payment", read: false, href: "/admin/orders", created_at: hoursAgo(1) },
  { id: "n2", title: "Shipment delayed in customs", body: "CS-2026-00118 (air) flagged in Berbera customs — opened ticket.", kind: "order", read: false, href: "/admin/shipments", created_at: hoursAgo(2) },
  { id: "n3", title: "Sourcing request awaiting quote", body: "Asma Hassan in Mogadishu requested 4× industrial mixers.", kind: "system", read: false, href: "/admin/sourcing", created_at: hoursAgo(5) },
  { id: "n4", title: "Low-stock product", body: "Wireless Earbuds TWS (1688) hit low_stock threshold (4 units).", kind: "system", read: true, href: "/admin/products", created_at: daysAgo(1) },
  { id: "n5", title: "New staff request", body: "Two customer-support staff onboarding requested by Hargeisa ops.", kind: "system", read: true, href: "/admin/staff", created_at: daysAgo(2) },
];

export const SEED_ACTIVITY: AdminActivityEvent[] = [
  { id: "a1", actor: "Mohamed Ali", action: "moved to in_transit", target: "CS-2026-00122", kind: "order", created_at: hoursAgo(1) },
  { id: "a2", actor: "Fatma Yusuf", action: "confirmed payment $2,140 for", target: "CS-2026-00119", kind: "payment", created_at: hoursAgo(2) },
  { id: "a3", actor: "Abdirahman Hassan", action: "updated inventory for", target: "Solar Power Bank 20000mAh", kind: "product", created_at: hoursAgo(4) },
  { id: "a4", actor: "Hodan Abdi", action: "approved quote for", target: "Q-2026-0091", kind: "order", created_at: hoursAgo(6) },
  { id: "a5", actor: "Liban Farah", action: "marked received at warehouse", target: "CS-2026-00121", kind: "warehouse", created_at: hoursAgo(8) },
  { id: "a6", actor: "Khadra Yusuf", action: "resolved support ticket", target: "#TKT-0427", kind: "system", created_at: daysAgo(1) },
  { id: "a7", actor: "Mohamed Ali", action: "issued refund for", target: "CS-2026-00116", kind: "payment", created_at: daysAgo(2) },
  { id: "a8", actor: "Fatma Yusuf", action: "added 1,840 USD invoice to", target: "Stella Hotel Group", kind: "payment", created_at: daysAgo(3) },
];

export const SEED_CUSTOMERS: AdminCustomer[] = [
  { id: "c1", full_name: "Mohamed Abdi", email: "m.abdi@example.so", phone: "+252 63 412 0001", city: "Hargeisa", type: "individual", total_orders: 14, total_spent_usd: 6_842, created_at: daysAgo(120), notes: "Repeat buyer of electronics." },
  { id: "c2", full_name: "Asma Hassan", email: "asma@horseed.so", phone: "+252 90 555 0102", city: "Mogadishu", type: "business", total_orders: 38, total_spent_usd: 24_120, created_at: daysAgo(220), notes: "Hotel supply, weekly orders." },
  { id: "c3", full_name: "Liban Farah", email: "liban.f@gmail.com", phone: "+252 65 778 8090", city: "Bosaso", type: "individual", total_orders: 4, total_spent_usd: 980, created_at: daysAgo(45) },
  { id: "c4", full_name: "Hodan Abdi", email: "hodan@baaniye.so", phone: "+252 61 333 4421", city: "Hargeisa", type: "business", total_orders: 21, total_spent_usd: 11_340, created_at: daysAgo(150) },
  { id: "c5", full_name: "Faisal Nur", email: "faisal.n@outlook.com", phone: "+252 64 901 1155", city: "Garowe", type: "individual", total_orders: 7, total_spent_usd: 1_840, created_at: daysAgo(60) },
  { id: "c6", full_name: "Sahra Ali", email: "sahra@stellahotels.so", phone: "+252 90 779 0033", city: "Mogadishu", type: "business", total_orders: 9, total_spent_usd: 5_640, created_at: daysAgo(95) },
  { id: "c7", full_name: "Safia Noor", email: "safia.noor@example.so", phone: "+252 65 770 0011", city: "Hargeisa", type: "individual", total_orders: 3, total_spent_usd: 420, created_at: daysAgo(20) },
  { id: "c8", full_name: "Yusuf Adan", email: "yusuf@dawan.so", phone: "+252 61 220 7799", city: "Mogadishu", type: "business", total_orders: 12, total_spent_usd: 7_900, created_at: daysAgo(80) },
];
