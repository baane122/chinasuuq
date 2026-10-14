import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFxSync } from "@/lib/exchange";
import { CART_STORAGE_KEY } from "@/lib/constants";
import type { CartItem, Product } from "@/types";

/**
 * THE CART BELONGS TO AN ACCOUNT, NOT TO THE DEVICE.
 *
 * These phones are handed from one person to the next and the cart FAB is
 * visible to guests, so one global AsyncStorage key meant the next person
 * opened a basket of lines they never added — with someone else's prices and
 * totals on them. The owner's rule is that a basket must survive a logout, so
 * the entry is NAMESPACED instead of purged:
 *   `chinasuuq-cart:<user id>` while signed in, `chinasuuq-cart:guest` for an
 *   anonymous session.
 * setCartScope() below is the only thing that moves that pointer: signing in
 * re-reads that account's own entry, signing out blanks memory and points back
 * at `guest`, so nothing signed-in is reachable from an anonymous session (and
 * a guest basket on a fresh device keeps working exactly like before).
 */
const GUEST_SCOPE = "guest";

/** Account the persisted cart currently reads and writes. */
let cartScope = GUEST_SCOPE;

/**
 * True only while an account switch is in flight. zustand writes to storage on
 * every set(), so the in-memory clear in setCartScope() would otherwise be
 * stored under the NEW key and the rehydrate right after it would read that
 * empty cart straight back — the account would lose the basket this fix exists
 * to protect. Frozen writes are dropped, never queued.
 */
let writesFrozen = false;

/** Counts account switches so only the NEWEST one releases the freeze: a
 *  sign-out finishing late must not re-enable writes while the sign-in that
 *  followed it is still loading the next account's basket. */
let scopeSwitch = 0;

/** Which AsyncStorage entry the current scope owns. */
const scopedCartKey = (name: string) => `${name}:${cartScope}`;

const cartStorage = createJSONStorage<{ items: CartItem[] }>(() => ({
  getItem: async (name) => await AsyncStorage.getItem(scopedCartKey(name)),
  setItem: async (name, value) => {
    if (writesFrozen) return;
    await AsyncStorage.setItem(scopedCartKey(name), value);
  },
  removeItem: async (name) => await AsyncStorage.removeItem(scopedCartKey(name)),
}));

/**
 * Installs from before this change persisted ONE unscoped basket for the whole
 * device. Nothing can say whose it was, and handing it to the next person is
 * the leak being fixed, so it is dropped rather than adopted by whoever boots
 * first. No write ever uses the bare key again.
 */
void AsyncStorage.removeItem(CART_STORAGE_KEY).catch(() => {});

interface CartStore {
  items: CartItem[];
  addItem: (product: Product, quantity: number, options?: Record<string, string>, meta?: { estimated_kg?: number; estimated_cbm?: number; exchange_rate?: number }) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  getTotal: () => { items: number; subtotalUSD: number };
  getMarketplaceCount: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (product, quantity, options = {}, meta = {}) => {
        const existing = get().items.find(
          (i) =>
            i.product.id === product.id &&
            JSON.stringify(i.selected_options) === JSON.stringify(options)
        );
        const cny = product.price_cny_min || product.price_cny_max || 0;
        // Stamp the same CNY-per-USD rate we used for the math; the caller's
        // capture-time rate wins, otherwise read the live FX store.
        const fxRate =
          Number(meta.exchange_rate) > 0 ? Number(meta.exchange_rate) : getFxSync().cnyPerUsd;
        const usdFromCny = cny > 0 ? cny / fxRate : 0;
        // When there is a yuan cost, USD is DERIVED from it at the rate we
        // stamp — that is the only way `exchange_rate` is honestly "the rate
        // used". Only CNY-less lines (USD-native marketplaces) keep their
        // stored price_usd_estimated.
        const usdEst = usdFromCny > 0 ? usdFromCny : product.price_usd_estimated > 0 ? product.price_usd_estimated : 0;
        const snapshot = {
          ...product,
          price_cny_min: cny,
          price_cny_max: cny,
          price_usd_estimated: usdEst,
        };
        if (existing) {
          // A re-add is a FRESH price capture, so all three money numbers are
          // stamped from it together. They used to be merged one at a time
          // (`cny || old`, `Math.max(oldUsd, newUsd)` and an `exchange_rate`
          // written only on the first add), so one line could describe three
          // different moments — and checkout sends all three to createOrder,
          // which billed a price cut at the old high figure while the preview
          // disagreed with the server. Last write wins: the unit price the
          // customer was just shown is the unit price the order carries.
          // Quantity still just bumps.
          const freshCapture = usdEst > 0;
          set({
            items: get().items.map((i) =>
              i.id === existing.id
                ? {
                    ...i,
                    quantity: i.quantity + quantity,
                    // A capture with no price at all keeps the whole old trio
                    // instead of mixing one new number into two stale ones.
                    price_cny_snapshot: freshCapture ? cny : i.price_cny_snapshot,
                    price_usd_estimated: freshCapture ? usdEst : i.price_usd_estimated,
                    exchange_rate: freshCapture ? fxRate : i.exchange_rate,
                    estimated_kg: meta.estimated_kg ?? i.estimated_kg,
                    estimated_cbm: meta.estimated_cbm ?? i.estimated_cbm,
                  }
                : i
            ),
          });
        } else {
          set({
            items: [
              ...get().items,
              {
                id: `cart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                product_id: product.id,
                product: snapshot,
                quantity,
                selected_options: options,
                price_cny_snapshot: cny,
                price_usd_estimated: usdEst,
                exchange_rate: fxRate,
                estimated_kg: meta.estimated_kg,
                estimated_cbm: meta.estimated_cbm,
                added_at: new Date().toISOString(),
              },
            ],
          });
        }
      },
      removeItem: (id) =>
        set({ items: get().items.filter((i) => i.id !== id) }),
      updateQuantity: (id, quantity) => {
        if (quantity <= 0) {
          set({ items: get().items.filter((i) => i.id !== id) });
        } else {
          set({
            items: get().items.map((i) =>
              i.id === id ? { ...i, quantity } : i
            ),
          });
        }
      },
      clearCart: () => set({ items: [] }),
      getTotal: () => ({
        items: get().items.reduce((sum, i) => sum + i.quantity, 0),
        subtotalUSD: get().items.reduce(
          (sum, i) => sum + i.price_usd_estimated * i.quantity,
          0
        ),
      }),
      getMarketplaceCount: () => new Set(get().items.map((i) => i.product.marketplace)).size,
    }),
    {
      // Base name only: the storage adapter above appends the account scope, so
      // this constant never names a real entry on its own.
      name: CART_STORAGE_KEY,
      storage: cartStorage,
      partialize: (state) => ({ items: state.items }),
    }
  )
);

/**
 * Point the persisted cart at an account (or back at the guest namespace) and
 * load whatever that scope already holds. store/auth.ts is the only caller:
 * sign-in, session restore and sign-out are where the signed-in identity
 * changes.
 */
export async function setCartScope(userId?: string | null): Promise<void> {
  const next = userId?.trim() || GUEST_SCOPE;
  if (next === cartScope) return;
  cartScope = next;
  const mySwitch = ++scopeSwitch;
  writesFrozen = true;
  try {
    // Blank memory before reading the new scope: every screen reads this store
    // live, and an empty basket is honest while the right one loads. The write
    // is frozen, so this blank never lands in the entry we just switched to.
    useCartStore.setState({ items: [] });
    await useCartStore.persist.rehydrate();
  } finally {
    if (mySwitch === scopeSwitch) writesFrozen = false;
  }
}
