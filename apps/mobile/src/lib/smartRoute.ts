// Smart order routing logic for ChinaSuuq.
//
// Given a shipping method (air | sea) and a destination city it builds the
// correct visual route a package travels, derives progress %, ETA, and the
// next milestone. City-aware so the customer always sees their own ports /
// airports (Berbera vs Mogadishu vs Mombasa, Hargeisa vs Nairobi …).

// ── City → hub mapping ─────────────────────────────────────────────
// Ports used by sea freight, keyed by (lowercased) destination city.
const CITY_PORT_MAP: Record<string, { port: string; portKey: string }> = {
  hargeisa: { port: "Berbera Port", portKey: "berbera_port" },
  berbera: { port: "Berbera Port", portKey: "berbera_port" },
  mogadishu: { port: "Mogadishu Port", portKey: "mogadishu_port" },
  kismayo: { port: "Mogadishu Port", portKey: "mogadishu_port" },
  garowe: { port: "Berbera Port", portKey: "berbera_port" },
  bosaso: { port: "Bosaso Port", portKey: "bosaso_port" },
  mandera: { port: "Mombasa Port", portKey: "mombasa_port" },
  nairobi: { port: "Mombasa Port", portKey: "mombasa_port" },
};

// Air gateways for air freight, keyed by destination city.
const CITY_AIRPORT_MAP: Record<string, string> = {
  hargeisa: "Hargeisa Airport",
  berbera: "Berbera Airport",
  mogadishu: "Mogadishu Airport",
  kismayo: "Kismayo Airport",
  garowe: "Garowe Airport",
  bosaso: "Bosaso Airport",
  mandera: "Mandera Airport",
  nairobi: "Jomo Kenyatta Airport",
};

// For multi-hop destinations (Garowe, Kismayo, Mandera), the package lands at
// a primary gateway then trucks to the final city.
const CITY_OVERLAND_SECOND_LEG: Record<string, string> = {
  garowe: "Hargeisa Hub",
  kismayo: "Mogadishu Hub",
  mandera: "Nairobi Hub",
};

// ── Route waypoint model ───────────────────────────────────────────
export interface RouteWaypoint {
  key: string; // stable id (used for progress / i18n)
  label: string; // display label
  shortLabel: string; // compact label for the route row
  icon: string; // emoji glyph
  statusMin: string; // first order status that marks this waypoint "done"
}

// Which raw order statuses map to the canonical milestones.
export const STATUS_ORDER = [
  "pending",
  "confirmed",
  "purchasing",
  "purchased",
  "in_transit_china",
  "warehouse",
  "inspection",
  "consolidated",
  "shipped",
  "in_transit",
  "arrived_somalia",
  "customs",
  "ready_for_pickup",
  "out_for_delivery",
  "delivered",
];

// A waypoint is "done" once the status index reaches its statusMin index.
export function isWaypointDone(statusMin: string, currentStatus: string): boolean {
  const curIdx = STATUS_ORDER.indexOf(currentStatus);
  const minIdx = STATUS_ORDER.indexOf(statusMin);
  if (curIdx === -1 || minIdx === -1) return false;
  return curIdx >= minIdx;
}

// ── Route builder ──────────────────────────────────────────────────
export function buildSmartRoute(
  method: "air" | "sea",
  city: string
): RouteWaypoint[] {
  const c = (city || "").trim().toLowerCase();

  // Common head: Processing → China Warehouse
  const route: RouteWaypoint[] = [
    { key: "processing", label: "Processing", shortLabel: "Ord", icon: "🛒", statusMin: "pending" },
    { key: "warehouse", label: "China Warehouse", shortLabel: "WH", icon: "🏭", statusMin: "in_transit_china" },
  ];

  if (method === "air") {
    // Guangzhou → Dubai air hub
    route.push(
      { key: "air_hub", label: "Dubai Air Hub", shortLabel: "DXB", icon: "✈️", statusMin: "shipped" }
    );
    // Destination airport
    const airport = CITY_AIRPORT_MAP[c] || CITY_AIRPORT_MAP.hargeisa!;
    route.push(
      { key: "dest_airport", label: airport, shortLabel: airportShort(airport), icon: "🛬", statusMin: "arrived_somalia" }
    );
    // Overland second leg for inland cities
    if (CITY_OVERLAND_SECOND_LEG[c]) {
      route.push(
        { key: "overland_hub", label: CITY_OVERLAND_SECOND_LEG[c], shortLabel: "Hub", icon: "🚚", statusMin: "ready_for_pickup" }
      );
    }
  } else {
    // Sea: Guangzhou → Ningbo origin port → Jabal Ali → destination port
    route.push(
      { key: "origin_port", label: "Ningbo Port", shortLabel: "NGB", icon: "⚓", statusMin: "shipped" },
      { key: "jabal_ali", label: "Jabal Ali (Dubai)", shortLabel: "JAB", icon: "🇦🇪", statusMin: "in_transit" }
    );
    // Destination port
    const portInfo = CITY_PORT_MAP[c] || CITY_PORT_MAP.mogadishu!;
    route.push(
      { key: "dest_port", label: portInfo.port, shortLabel: portShort(portInfo.port), icon: "🛳️", statusMin: "arrived_somalia" }
    );
    // Overland second leg for inland cities
    if (CITY_OVERLAND_SECOND_LEG[c]) {
      route.push(
        { key: "overland_hub", label: CITY_OVERLAND_SECOND_LEG[c], shortLabel: "Hub", icon: "🚚", statusMin: "ready_for_pickup" }
      );
    }
  }

  // Final leg for all routes
  route.push(
    { key: "final_delivery", label: "Final Delivery", shortLabel: "HM", icon: "🏠", statusMin: "out_for_delivery" },
    { key: "delivered", label: "Delivered", shortLabel: "OK", icon: "✅", statusMin: "delivered" }
  );

  return route;
}

function airportShort(name: string): string {
  const map: Record<string, string> = {
    "Hargeisa Airport": "HRG",
    "Berbera Airport": "BBR",
    "Mogadishu Airport": "MGQ",
    "Kismayo Airport": "KIS",
    "Garowe Airport": "GRW",
    "Bosaso Airport": "BSA",
    "Mandera Airport": "MDA",
    "Jomo Kenyatta Airport": "NBO",
  };
  return map[name] || "EST";
}

function portShort(name: string): string {
  const map: Record<string, string> = {
    "Berbera Port": "BBR",
    "Mogadishu Port": "MGQ",
    "Bosaso Port": "BSA",
    "Mombasa Port": "MBA",
    "Ningbo Port": "NGB",
  };
  return map[name] || name.slice(0, 3).toUpperCase();
}

// ── Progress / milestone helpers ───────────────────────────────────
export function getCurrentWaypointIndex(route: RouteWaypoint[], currentStatus: string): number {
  const idx = route.findIndex((wp) => !isWaypointDone(wp.statusMin, currentStatus));
  return idx === -1 ? route.length - 1 : idx;
}

export function getProgressPercent(route: RouteWaypoint[], currentStatus: string): number {
  if (!route.length) return 0;
  const done = route.filter((wp) => isWaypointDone(wp.statusMin, currentStatus)).length;
  return Math.round((done / route.length) * 100);
}

export function getNextMilestone(route: RouteWaypoint[], currentStatus: string): string | null {
  const next = route.find((wp) => !isWaypointDone(wp.statusMin, currentStatus));
  return next ? next.label : null;
}

// ── ETA (days remaining) ───────────────────────────────────────────
const AIR_ETA: Record<string, number> = {
  pending: 7,
  confirmed: 6,
  purchasing: 5,
  purchased: 4,
  in_transit_china: 3,
  warehouse: 2,
  inspection: 2,
  consolidated: 1,
  shipped: 1,
  in_transit: 1,
  arrived_somalia: 0,
  customs: 0,
  ready_for_pickup: 0,
  out_for_delivery: 0,
  delivered: 0,
};

const SEA_ETA: Record<string, number> = {
  pending: 30,
  confirmed: 28,
  purchasing: 25,
  purchased: 22,
  in_transit_china: 18,
  warehouse: 15,
  inspection: 14,
  consolidated: 12,
  shipped: 10,
  in_transit: 6,
  arrived_somalia: 3,
  customs: 2,
  ready_for_pickup: 1,
  out_for_delivery: 0,
  delivered: 0,
};

export function getEstimatedDays(method: "air" | "sea", currentStatus: string): number {
  const table = method === "air" ? AIR_ETA : SEA_ETA;
  return table[currentStatus] ?? (method === "air" ? 7 : 30);
}

// Compact "2-3 days" style range
export function getEstimateRange(method: "air" | "sea", currentStatus: string): string {
  const days = getEstimatedDays(method, currentStatus);
  if (days === 0) return "Today";
  const lo = Math.max(0, days);
  const hi = Math.max(lo + 1, Math.ceil(days * 1.5));
  return `${lo}-${hi} days`;
}
