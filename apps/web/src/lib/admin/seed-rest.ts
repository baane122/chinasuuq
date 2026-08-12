// Products, shipments, quotes, payments, rates, suppliers, staff, marketplace accounts, sourcing.
import type {
  AdminMarketplaceAccount,
  AdminProduct,
  AdminQuote,
  AdminRate,
  AdminShipment,
  AdminSourcingRequest,
  AdminStaffMember,
  AdminSupplier,
  AdminPayment,
} from "./types";
import { daysAgo, hoursAgo } from "./seed";

export const SEED_PRODUCTS: AdminProduct[] = [
  { id: "p1", sku: "CS-1688-EL-001", title: "Wireless Earbuds TWS Pro", title_somali: "Earphone-ka wireless-ka", category: "Electronics", marketplace: "1688", price_cny: 128, price_usd: 18, stock_status: "low_stock", stock_count: 4, moq: 5, supplier: "Shenzhen Sound Tech", status: "active", updated_at: daysAgo(2) },
  { id: "p2", sku: "CS-1688-EL-002", title: "Smartwatch Series 9", title_somali: "Saacad gacmeed", category: "Electronics", marketplace: "1688", price_cny: 1_980, price_usd: 280, stock_status: "in_stock", stock_count: 26, moq: 2, supplier: "Shenzhen Sound Tech", status: "active", updated_at: daysAgo(1) },
  { id: "p3", sku: "CS-TAO-KIT-014", title: "Industrial Stand Mixer 20L", category: "Kitchen & Hotel", marketplace: "Taobao", price_cny: 2_300, price_usd: 320, stock_status: "in_stock", stock_count: 12, moq: 1, supplier: "Guangzhou Hotel Supply", status: "active", updated_at: daysAgo(3) },
  { id: "p4", sku: "CS-TAO-KIT-022", title: "Stainless Steel Cookware Set", category: "Kitchen & Hotel", marketplace: "Taobao", price_cny: 685, price_usd: 95, stock_status: "in_stock", stock_count: 38, moq: 4, supplier: "Guangzhou Hotel Supply", status: "active", updated_at: daysAgo(4) },
  { id: "p5", sku: "CS-TAO-HOM-031", title: "Hotel Linen Set King", category: "Hotel & Hospitality", marketplace: "Taobao", price_cny: 560, price_usd: 78, stock_status: "in_stock", stock_count: 84, moq: 6, supplier: "Hangzhou Linen Co.", status: "active", updated_at: daysAgo(5) },
  { id: "p6", sku: "CS-1688-PWR-011", title: "Power Bank 20000mAh", category: "Electronics", marketplace: "1688", price_cny: 158, price_usd: 22, stock_status: "in_stock", stock_count: 64, moq: 5, supplier: "Dongguan Power", status: "active", updated_at: daysAgo(2) },
  { id: "p7", sku: "CS-YWU-APP-008", title: "Men's Casual Sneakers", category: "Fashion & Apparel", marketplace: "YiwuGo", price_cny: 175, price_usd: 24, stock_status: "in_stock", stock_count: 122, moq: 6, supplier: "Yiwu Apparel Co.", status: "active", updated_at: daysAgo(7) },
  { id: "p8", sku: "CS-ALI-HOM-019", title: "LED Desk Lamp", category: "Home & Office", marketplace: "Alibaba", price_cny: 78, price_usd: 11, stock_status: "in_stock", stock_count: 250, moq: 10, supplier: "Foshan Lighting", status: "active", updated_at: daysAgo(1) },
  { id: "p9", sku: "CS-CG-HOT-024", title: "Bulk Towels 12-pack", category: "Hotel & Hospitality", marketplace: "ChinaGoods", price_cny: 100, price_usd: 14, stock_status: "in_stock", stock_count: 200, moq: 12, supplier: "Hangzhou Linen Co.", status: "active", updated_at: daysAgo(3) },
  { id: "p10", sku: "CS-JD-OFF-027", title: "Laptop Stand Aluminum", category: "Home & Office", marketplace: "JD", price_cny: 230, price_usd: 32, stock_status: "in_stock", stock_count: 96, moq: 4, supplier: "Shenzhen Office Co.", status: "active", updated_at: daysAgo(2) },
  { id: "p11", sku: "CS-TAO-KIT-030", title: "Commercial Blender 1500W", category: "Kitchen & Hotel", marketplace: "Taobao", price_cny: 1_020, price_usd: 122, stock_status: "in_stock", stock_count: 18, moq: 2, supplier: "Guangzhou Hotel Supply", status: "active", updated_at: daysAgo(4) },
  { id: "p12", sku: "CS-1688-EL-031", title: "Replacement Smartwatch Strap", category: "Electronics", marketplace: "1688", price_cny: 100, price_usd: 14, stock_status: "out_of_stock", stock_count: 0, moq: 1, supplier: "Shenzhen Sound Tech", status: "archived", updated_at: daysAgo(15) },
  { id: "p13", sku: "CS-YWU-APP-040", title: "Camping Tent 4-Person", category: "Outdoor & Travel", marketplace: "YiwuGo", price_cny: 790, price_usd: 110, stock_status: "in_stock", stock_count: 24, moq: 2, supplier: "Yiwu Apparel Co.", status: "active", updated_at: daysAgo(8) },
  { id: "p14", sku: "CS-CG-HOT-048", title: "Restaurant Plates Set", category: "Hotel & Hospitality", marketplace: "ChinaGoods", price_cny: 130, price_usd: 18, stock_status: "in_stock", stock_count: 110, moq: 6, supplier: "Hangzhou Linen Co.", status: "active", updated_at: daysAgo(6) },
  { id: "p15", sku: "CS-1688-EL-040", title: "USB-C Fast Charger 65W", category: "Electronics", marketplace: "1688", price_cny: 95, price_usd: 13, stock_status: "in_stock", stock_count: 184, moq: 8, supplier: "Dongguan Power", status: "active", updated_at: hoursAgo(8) },
  { id: "p16", sku: "CS-YWU-APP-051", title: "Kids Cartoon Backpack", category: "Fashion & Apparel", marketplace: "YiwuGo", price_cny: 88, price_usd: 12, stock_status: "in_stock", stock_count: 220, moq: 6, supplier: "Yiwu Apparel Co.", status: "active", updated_at: daysAgo(4) },
];

export const SEED_SHIPMENTS: AdminShipment[] = [
  { id: "s1", reference: "SHP-2026-0088", order_id: "o1", customer_name: "Mohamed Abdi", mode: "air", origin: "Guangzhou", destination: "Hargeisa", weight_kg: 1.2, status: "shipped", carrier: "Air China Cargo", tracking_no: "CCA-9988123", departed_at: daysAgo(2), eta: daysAgo(-2), created_at: daysAgo(6) },
  { id: "s2", reference: "SHP-2026-0087", order_id: "o3", customer_name: "Hodan Abdi", mode: "air", origin: "Guangzhou", destination: "Hargeisa", weight_kg: 42.1, cbm: 0.32, status: "ready", carrier: "Air China Cargo", tracking_no: "CCA-9988119", eta: hoursAgo(-12), created_at: daysAgo(9) },
  { id: "s3", reference: "SHP-2026-0086", order_id: "o7", customer_name: "Mohamed Abdi", mode: "air", origin: "Guangzhou", destination: "Hargeisa", weight_kg: 2.2, status: "received", carrier: "Air China Cargo", tracking_no: "CCA-9988112", departed_at: daysAgo(2), eta: hoursAgo(-2), created_at: daysAgo(7) },
  { id: "s4", reference: "SHP-2026-0085", order_id: "o4", customer_name: "Liban Farah", mode: "sea", origin: "Ningbo", destination: "Berbera", weight_kg: 1.6, cbm: 0.02, status: "shipped", carrier: "PIL Shipping", tracking_no: "PIL-2231-7", departed_at: daysAgo(35), eta: daysAgo(11), created_at: daysAgo(40) },
  { id: "s5", reference: "SHP-2026-0084", order_id: "o5", customer_name: "Faisal Nur", mode: "air", origin: "Yiwu", destination: "Garowe", weight_kg: 5.4, status: "inspecting", carrier: "China Southern Cargo", eta: daysAgo(-5), created_at: daysAgo(3) },
  { id: "s6", reference: "SHP-2026-0083", order_id: "o6", customer_name: "Sahra Ali", mode: "sea", origin: "Ningbo", destination: "Mogadishu", weight_kg: 96.0, cbm: 0.55, status: "shipped", carrier: "Maersk", tracking_no: "MAEU-44510", departed_at: daysAgo(40), eta: daysAgo(15), created_at: daysAgo(60) },
  { id: "s7", reference: "SHP-2026-0082", order_id: "o9", customer_name: "Hodan Abdi", mode: "air", origin: "Guangzhou", destination: "Hargeisa", weight_kg: 1.0, status: "expected", carrier: "Air China Cargo", eta: daysAgo(-1), created_at: daysAgo(2) },
  { id: "s8", reference: "SHP-2026-0081", order_id: "o8", customer_name: "Asma Hassan", mode: "sea", origin: "Ningbo", destination: "Mogadishu", weight_kg: 38.0, cbm: 0.31, status: "consolidated", carrier: "PIL Shipping", eta: daysAgo(-30), created_at: daysAgo(2) },
  { id: "s9", reference: "SHP-2026-0080", order_id: "o14", customer_name: "Yusuf Adan", mode: "sea", origin: "Ningbo", destination: "Mogadishu", weight_kg: 48.0, cbm: 0.42, status: "shipped", carrier: "PIL Shipping", departed_at: daysAgo(2), eta: daysAgo(-22), created_at: daysAgo(5) },
];

export const SEED_QUOTES: AdminQuote[] = [
  { id: "q1", reference: "Q-2026-0093", customer_id: "c2", customer_name: "Asma Hassan", item_summary: "Industrial Stand Mixer 20L × 4 + Stainless Cookware × 8", quantity: 12, unit_price_cny: 1_149, total_usd: 2_140, shipping_method: "sea", status: "sent", valid_until: daysAgo(-7), created_at: hoursAgo(8) },
  { id: "q2", reference: "Q-2026-0092", customer_id: "c3", customer_name: "Liban Farah", item_summary: "Power Bank 20000mAh × 6", quantity: 6, unit_price_cny: 158, total_usd: 152, shipping_method: "air", status: "accepted", valid_until: daysAgo(-3), created_at: daysAgo(2) },
  { id: "q3", reference: "Q-2026-0091", customer_id: "c4", customer_name: "Hodan Abdi", item_summary: "Hotel Linen Set King × 24", quantity: 24, unit_price_cny: 560, total_usd: 1_872, shipping_method: "air", status: "accepted", valid_until: daysAgo(-2), created_at: daysAgo(3) },
  { id: "q4", reference: "Q-2026-0090", customer_id: "c5", customer_name: "Faisal Nur", item_summary: "Sneakers × 5 + LED Desk Lamp × 6", quantity: 11, unit_price_cny: 134, total_usd: 200, shipping_method: "air", status: "sent", valid_until: daysAgo(-5), created_at: daysAgo(1) },
  { id: "q5", reference: "Q-2026-0089", customer_id: "c1", customer_name: "Mohamed Abdi", item_summary: "Earbuds × 4 + Smartwatch × 1", quantity: 5, unit_price_cny: 524, total_usd: 372, shipping_method: "air", status: "expired", valid_until: daysAgo(2), created_at: daysAgo(14) },
  { id: "q6", reference: "Q-2026-0088", customer_id: "c6", customer_name: "Sahra Ali", item_summary: "Bulk Towels 12-pack × 40", quantity: 40, unit_price_cny: 100, total_usd: 560, shipping_method: "sea", status: "draft", valid_until: daysAgo(-7), created_at: hoursAgo(4) },
  { id: "q7", reference: "Q-2026-0087", customer_id: "c8", customer_name: "Yusuf Adan", item_summary: "Industrial Stand Mixer × 2 + Cookware × 4", quantity: 6, unit_price_cny: 938, total_usd: 1_320, shipping_method: "sea", status: "sent", valid_until: daysAgo(-6), created_at: daysAgo(1) },
];

export const SEED_PAYMENTS: AdminPayment[] = [
  { id: "pm1", reference: "PMT-2026-0142", order_id: "o1", customer_name: "Mohamed Abdi", method: "zaad", amount_usd: 842, status: "confirmed", reference_code: "ZAAD-773291", received_at: daysAgo(6), confirmed_by: "Fatma Yusuf" },
  { id: "pm2", reference: "PMT-2026-0141", order_id: "o3", customer_name: "Hodan Abdi", method: "bank_transfer", amount_usd: 2_010, status: "confirmed", reference_code: "CBT-557771", received_at: daysAgo(9), confirmed_by: "Fatma Yusuf" },
  { id: "pm3", reference: "PMT-2026-0140", order_id: "o4", customer_name: "Liban Farah", method: "zaad", amount_usd: 198, status: "confirmed", reference_code: "ZAAD-773188", received_at: daysAgo(40), confirmed_by: "Abdirahman Hassan" },
  { id: "pm4", reference: "PMT-2026-0139", order_id: "o6", customer_name: "Sahra Ali", method: "bank_transfer", amount_usd: 1_400, status: "confirmed", reference_code: "CBT-557762", received_at: daysAgo(60), confirmed_by: "Fatma Yusuf" },
  { id: "pm5", reference: "PMT-2026-0138", order_id: "o2", customer_name: "Asma Hassan", method: "edahab", amount_usd: 2_140, status: "pending", received_at: hoursAgo(8) },
  { id: "pm6", reference: "PMT-2026-0137", order_id: "o8", customer_name: "Asma Hassan", method: "edahab", amount_usd: 1_120, status: "confirmed", reference_code: "E-DHAB-991124", received_at: hoursAgo(20), confirmed_by: "Fatma Yusuf" },
  { id: "pm7", reference: "PMT-2026-0136", order_id: "o5", customer_name: "Faisal Nur", method: "premier_wallet", amount_usd: 322, status: "confirmed", reference_code: "PRM-66201", received_at: daysAgo(3), confirmed_by: "Fatma Yusuf" },
  { id: "pm8", reference: "PMT-2026-0135", order_id: "o9", customer_name: "Hodan Abdi", method: "bank_transfer", amount_usd: 312, status: "refunded", reference_code: "CBT-557752", received_at: daysAgo(15), confirmed_by: "Fatma Yusuf" },
  { id: "pm9", reference: "PMT-2026-0134", order_id: "o14", customer_name: "Yusuf Adan", method: "edahab", amount_usd: 1_320, status: "confirmed", reference_code: "E-DHAB-991118", received_at: daysAgo(5), confirmed_by: "Abdirahman Hassan" },
  { id: "pm10", reference: "PMT-2026-0133", order_id: "o15", customer_name: "Hodan Abdi", method: "bank_transfer", amount_usd: 410, status: "confirmed", reference_code: "CBT-557748", received_at: hoursAgo(4), confirmed_by: "Fatma Yusuf" },
];

export const SEED_RATES: AdminRate[] = [
  { id: "r1", pair: "USD → SOS", buy: 571, sell: 565, source: "Central Bank of Somalia", updated_at: hoursAgo(1) },
  { id: "r2", pair: "USD → CNY", buy: 7.18, sell: 7.12, source: "People's Bank of China", updated_at: hoursAgo(2) },
  { id: "r3", pair: "CNY → SOS", buy: 80.5, sell: 79.0, source: "Cross-rates", updated_at: hoursAgo(2) },
  { id: "r4", pair: "USDT → SOS", buy: 572, sell: 568, source: "Binance P2P", updated_at: hoursAgo(3) },
];

export const SEED_SUPPLIERS: AdminSupplier[] = [
  { id: "sp1", name: "Shenzhen Sound Tech", marketplace: "1688", contact: "Linda Wang · +86 755 8829 1010", rating: 4.8, categories: ["Electronics", "Audio"], orders_count: 142, on_time_pct: 96, status: "active" },
  { id: "sp2", name: "Guangzhou Hotel Supply", marketplace: "Taobao", contact: "Marco Liu · +86 20 8831 7711", rating: 4.6, categories: ["Kitchen & Hotel"], orders_count: 88, on_time_pct: 92, status: "active" },
  { id: "sp3", name: "Yiwu Apparel Co.", marketplace: "YiwuGo", contact: "Sun Wei · +86 579 8521 0099", rating: 4.5, categories: ["Fashion & Apparel"], orders_count: 64, on_time_pct: 89, status: "active" },
  { id: "sp4", name: "Foshan Lighting", marketplace: "Alibaba", contact: "Rita Chen · +86 757 8831 0102", rating: 4.7, categories: ["Home & Office", "Lighting"], orders_count: 51, on_time_pct: 95, status: "active" },
  { id: "sp5", name: "Hangzhou Linen Co.", marketplace: "Taobao", contact: "Anny Hu · +86 571 8800 1100", rating: 4.4, categories: ["Hotel & Hospitality", "Linen"], orders_count: 76, on_time_pct: 88, status: "active" },
  { id: "sp6", name: "Dongguan Power", marketplace: "1688", contact: "Kevin Zhao · +86 769 8800 1100", rating: 4.6, categories: ["Power & Charging"], orders_count: 39, on_time_pct: 93, status: "active" },
];

export const SEED_STAFF: AdminStaffMember[] = [
  { id: "st1", full_name: "Mohamed Ali", email: "m.ali@chinasuuq.com", role: "admin", branch: "Hargeisa", active: true, last_active: hoursAgo(1) },
  { id: "st2", full_name: "Fatma Yusuf", email: "f.yusuf@chinasuuq.com", role: "finance", branch: "Hargeisa", active: true, last_active: hoursAgo(2) },
  { id: "st3", full_name: "Abdirahman Hassan", email: "a.hassan@chinasuuq.com", role: "ops", branch: "Hargeisa", active: true, last_active: hoursAgo(4) },
  { id: "st4", full_name: "Hodan Abdi", email: "h.abdi@chinasuuq.com", role: "admin", branch: "Mogadishu", active: true, last_active: hoursAgo(6) },
  { id: "st5", full_name: "Liban Farah", email: "l.farah@chinasuuq.com", role: "ops", branch: "Bosaso", active: true, last_active: hoursAgo(8) },
  { id: "st6", full_name: "Khadra Yusuf", email: "k.yusuf@chinasuuq.com", role: "support", branch: "Hargeisa", active: true, last_active: daysAgo(1) },
  { id: "st7", full_name: "Sahra Ali", email: "s.ali@chinasuuq.com", role: "support", branch: "Mogadishu", active: false, last_active: daysAgo(7) },
  { id: "st8", full_name: "Anwar Ali", email: "a.ali@chinasuuq.com", role: "warehouse", branch: "Yiwu (China)", active: true, last_active: hoursAgo(3) },
];

export const SEED_MARKETPLACE_ACCOUNTS: AdminMarketplaceAccount[] = [
  { id: "ma1", marketplace: "1688", label: "1688 Wholesale · Yiwu", username: "yiwu_wholesale_91", email: "yiwu91@partner.cn", phone: "+86 579 8521 0099", notes: "Use for product discovery and bulk requests. Verify via 2FA before checkout.", shared: true, active: true, last_used: hoursAgo(2) },
  { id: "ma2", marketplace: "taobao", label: "Taobao · Hangzhou", username: "hangzhou_retail_44", email: "hz44@partner.cn", phone: "+86 571 8800 1100", shared: true, active: true, last_used: daysAgo(1) },
  { id: "ma3", marketplace: "yiwugo", label: "YiwuGo · Wholesale", username: "yg_marketing_02", email: "yg02@partner.cn", phone: "+86 579 8521 0088", shared: true, active: true, last_used: daysAgo(1) },
  { id: "ma4", marketplace: "alibaba", label: "Alibaba · Foshan Lighting", username: "foshan_lighting_05", email: "foshan05@partner.cn", phone: "+86 757 8831 0102", shared: false, active: true, last_used: daysAgo(2) },
  { id: "ma5", marketplace: "chinagoods", label: "ChinaGoods · Yiwu", username: "yiwu_cg_03", email: "cg03@partner.cn", phone: "+86 579 8521 0044", shared: true, active: false, last_used: daysAgo(14) },
  { id: "ma6", marketplace: "jd", label: "JD · Shenzhen", username: "jd_shenzhen_07", email: "jd07@partner.cn", phone: "+86 755 8829 1010", shared: true, active: true, last_used: daysAgo(3) },
];

export const SEED_SOURCING: AdminSourcingRequest[] = [
  { id: "sr1", reference: "SRC-2026-0044", customer_name: "Asma Hassan", source_url: "https://detail.1688.com/offer/987654321.html", notes: "Need 4× industrial stand mixers for hotel opening in Bosaso.", priority: "high", status: "open", assigned_to: "Abdirahman Hassan", created_at: hoursAgo(5) },
  { id: "sr2", reference: "SRC-2026-0043", customer_name: "Hodan Abdi", notes: "Bulk USB-C cables 500 units. Look for wholesale pricing on 1688.", priority: "normal", status: "quoted", assigned_to: "Mohamed Ali", created_at: daysAgo(2) },
  { id: "sr3", reference: "SRC-2026-0042", customer_name: "Sahra Ali", source_url: "https://item.taobao.com/item.htm?id=5544332211", notes: "Restaurant-grade stainless steel tables. 6 units.", priority: "urgent", status: "approved", assigned_to: "Liban Farah", created_at: daysAgo(1) },
  { id: "sr4", reference: "SRC-2026-0041", customer_name: "Yusuf Adan", notes: "Solar power banks 50 units with branding.", priority: "normal", status: "fulfilled", assigned_to: "Abdirahman Hassan", created_at: daysAgo(5) },
  { id: "sr5", reference: "SRC-2026-0040", customer_name: "Liban Farah", source_url: "https://detail.1688.com/offer/123987456.html", notes: "Premium kitchen knives 12 sets.", priority: "low", status: "open", created_at: hoursAgo(20) },
];
