// Destination markets (Phase 5 — Somalia-first, East Africa-ready).
// Only enabled destinations with real operational routes are listed. Adding a
// country is NOT just a flag/currency: it requires routed delivery + payment.
export type DeliveryRoute = "doorstep" | "pickup";
export type PaymentMethod = "on-delivery" | "bank-transfer" | "mobile-money";

export interface DestinationMarket {
  id: string;
  country: string;
  city: string;
  routes: DeliveryRoute[];
  paymentMethods: PaymentMethod[];
  settlementCurrency: string;
  displayCurrency: string;
  phoneCountryCode: string;
  addressFields: ("city" | "district" | "landmark" | "phone")[];
  customsNote: string;
  supportLanguage: "en" | "so";
}

export const ENABLED_DESTINATIONS: DestinationMarket[] = [
  {
    id: "so-mogadishu",
    country: "Somalia",
    city: "Mogadishu",
    routes: ["doorstep", "pickup"],
    paymentMethods: ["on-delivery", "mobile-money"],
    settlementCurrency: "USD",
    displayCurrency: "USD",
    phoneCountryCode: "+252",
    addressFields: ["city", "district", "landmark", "phone"],
    customsNote: "Duties may apply; final quote after packing details are confirmed.",
    supportLanguage: "so",
  },
];

export function getDestination(id: string): DestinationMarket | undefined {
  return ENABLED_DESTINATIONS.find((d) => d.id === id);
}

// Phone validation without forcing postal code. Certifies only the format.
export function validPhone(input: string, cc: string): boolean {
  const digits = input.replace(/[^0-9]/g, "");
  const withoutCc = digits.startsWith(cc.replace("+", ""))
    ? digits.slice(cc.length - 1)
    : digits;
  return withoutCc.length >= 7 && withoutCc.length <= 11;
}

// Markets low-data/offline rule: offline carts are drafts until the server
// acknowledges placement.
export const OFFLINE_CART_IS_DRAFT = true;
