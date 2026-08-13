import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CartItem, Product } from "@/types";

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
        const usdFromCny = cny > 0 ? cny / (meta.exchange_rate || 7.25) : 0;
        // Prefer the estimated USD, else derive from the CNY snapshot so the
        // cart never shows $0 for a product that has a real CNY price.
        const usdEst = product.price_usd_estimated > 0 ? product.price_usd_estimated : usdFromCny;
        const snapshot = {
          ...product,
          price_cny_min: cny,
          price_cny_max: cny,
          price_usd_estimated: usdEst,
        };
        if (existing) {
          set({
            items: get().items.map((i) =>
              i.id === existing.id
                ? {
                    ...i,
                    quantity: i.quantity + quantity,
                    price_cny_snapshot: cny || i.price_cny_snapshot,
                    price_usd_estimated: Math.max(i.price_usd_estimated, usdEst) || i.price_usd_estimated,
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
                exchange_rate: meta.exchange_rate || 7.25,
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
      name: "chinasuuq-cart",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
