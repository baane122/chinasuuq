"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem, Product } from "@/types";

interface CartStore {
  items: CartItem[];
  addItem: (product: Product, quantity: number, variant?: any, options?: Record<string, string>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  getTotal: () => { items: number; subtotalCNY: number; subtotalUSD: number };
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (product, quantity, variant, options = {}) => {
        const existingIndex = get().items.findIndex(
          (item) => item.product_id === product.id && JSON.stringify(item.selected_options) === JSON.stringify(options)
        );
        if (existingIndex >= 0) {
          const updated = [...get().items];
          updated[existingIndex].quantity += quantity;
          set({ items: updated });
        } else {
          const newItem: CartItem = {
            id: `cart-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            product_id: product.id,
            product,
            variant,
            selected_options: options,
            quantity,
            price_cny_snapshot: product.price_cny_min,
            price_usd_estimated: product.price_usd_estimated,
            exchange_rate: 7.0,
            added_at: new Date().toISOString(),
          };
          set({ items: [...get().items, newItem] });
        }
      },
      removeItem: (id) => set({ items: get().items.filter((i) => i.id !== id) }),
      updateQuantity: (id, quantity) => {
        if (quantity <= 0) {
          set({ items: get().items.filter((i) => i.id !== id) });
        } else {
          const updated = get().items.map((i) => (i.id === id ? { ...i, quantity } : i));
          set({ items: updated });
        }
      },
      clearCart: () => set({ items: [] }),
      getTotal: () => {
        const items = get().items;
        return {
          items: items.reduce((sum, i) => sum + i.quantity, 0),
          subtotalCNY: items.reduce((sum, i) => sum + i.price_cny_snapshot * i.quantity, 0),
          subtotalUSD: items.reduce((sum, i) => sum + i.price_usd_estimated * i.quantity, 0),
        };
      },
    }),
    { name: "chinasuuq-cart" }
  )
);
