import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { useStaffStore } from "./staff";
import { setCartScope } from "./cart";
import { purgeUserScopedCaches } from "@/db/index";

interface User {
  id: string;
  email?: string;
  full_name?: string;
  phone?: string;
  city?: string;
  role?: string; // 'staff' or 'super_admin' for staff mode
}

interface AuthStore {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  loadSession: () => Promise<void>;
  clearError: () => void;
  refreshProfile: () => Promise<void>;
}

function mapUser(sessionUser: Session["user"], profile?: any): User {
  return {
    id: sessionUser.id,
    email: sessionUser.email,
    full_name: profile?.full_name || sessionUser.user_metadata?.full_name,
    phone: profile?.phone || sessionUser.user_metadata?.phone,
    city: profile?.city || sessionUser.user_metadata?.city,
    role: profile?.role || null,
  };
}

// `profiles` and `customer_profiles` are independent reads, and this runs
// behind the splash gate on every cold start. Awaited in series the user waits
// for both round-trips before the app lets them in; in parallel it costs the
// slower of the two.
async function fetchProfile(userId: string) {
  try {
    const [profile, customer] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, phone, language, role")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("customer_profiles")
        .select("city")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    const { data, error } = profile;
    if (error) {
      console.warn("[auth] fetchProfile: profiles read failed", error.message);
      return null;
    }
    if (!data) return null;
    // A failed city read leaves the field blank, which is honest; it must not
    // discard the name/role that did load (role decides staff mode).
    const { data: cp, error: cpError } = customer;
    if (cpError) console.warn("[auth] fetchProfile: city read failed", cpError.message);
    return { ...data, city: cp?.city ?? null };
  } catch (e: any) {
    console.warn("[auth] fetchProfile threw:", e?.message);
    return null;
  }
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  initialized: false,
  error: null,

  signIn: async (email, password) => {
    try {
      set({ error: null });
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        set({ error: error.message });
        return { error: error.message };
      }
      if (data.user) {
        const profile = await fetchProfile(data.user.id);
        const mappedUser = mapUser(data.user, profile);
        // Move the cart to this account's namespace BEFORE the session is
        // published, so no screen can render "signed in" while still showing
        // whoever used this phone last.
        await setCartScope(mappedUser.id);
        set({
          user: mappedUser,
          session: data.session,
          error: null,
        });
        // Initialize staff mode if user has staff role
        if (mappedUser.role) {
          useStaffStore.getState().initFromProfile(mappedUser.role);
        }
      }
      return {};
    } catch (err) {
      const msg = "Network error. Please check your connection.";
      set({ error: msg });
      return { error: msg };
    }
  },

  signUp: async (email, password, name) => {
    try {
      set({ error: null });
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      });
      if (error) {
        set({ error: error.message });
        return { error: error.message };
      }
      if (data.user) {
        // Best-effort: write the name into the profiles table right away so
        // the rest of the app sees a fully populated user.
        try {
          await supabase
            .from("profiles")
            .upsert({ id: data.user.id, full_name: name, updated_at: new Date().toISOString() });
        } catch (e) {
          // A missing profiles row means no role, and RLS then hides every
          // staff-scoped table from this account — the classic "admin console
          // is empty" symptom. Never let that fail silently.
          console.warn("[auth] profile upsert after signup failed", e);
        }
        // Same namespace move as signIn. A brand-new account has no basket of
        // its own; the guest namespace is left alone, so signing back out
        // restores whatever was there.
        await setCartScope(data.user.id);
        set({
          user: mapUser(data.user, { full_name: name }),
          session: data.session,
          error: null,
        });
      }
      return {};
    } catch (err) {
      const msg = "Network error. Please check your connection.";
      set({ error: msg });
      return { error: msg };
    }
  },

  signOut: async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Sign out even if server call fails
    }
    // Point the cart back at the guest namespace BEFORE the session is dropped:
    // that blanks memory, so the next person on this device reads an empty cart
    // instead of these lines. The basket itself is NOT deleted — it stays under
    // `chinasuuq-cart:<this user id>` until this same person signs back in,
    // because losing a basket on logout is what the owner ruled against.
    await setCartScope(null);
    set({ user: null, session: null, error: null });
    // In-memory clear is not enough on a shared device: the AsyncStorage
    // caches (addresses/profile — namespaced and legacy keys —, local
    // orders, notifications, payment methods) still hold this person's
    // data until the next login sees them. Purge them. Device-wide caches
    // (translate cache, fx rate, product catalog) are kept. The cart is not
    // on this list: it is namespaced per account, not device-wide, and it is
    // the one cache a customer expects to find again after logging in.
    await purgeUserScopedCaches().catch(() => {});
  },

  loadSession: async () => {
    try {
      set({ loading: true });
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.warn("Session restore failed:", error.message);
      }
      if (data.session?.user) {
        const profile = await fetchProfile(data.session.user.id);
        const mappedUser = mapUser(data.session.user, profile);
        // Cold start with a stored session: load this account's cart (and drop
        // any guest basket still in memory) before the app lets a screen render.
        await setCartScope(mappedUser.id);
        set({
          user: mappedUser,
          session: data.session,
          loading: false,
          initialized: true,
        });
        // Initialize staff mode if user has staff role
        if (mappedUser.role) {
          useStaffStore.getState().initFromProfile(mappedUser.role);
        }
      } else {
        // No session: stay in the guest namespace. A cart left here by a
        // previous signed-in account is impossible — sign-out moved it.
        await setCartScope(null);
        set({ loading: false, initialized: true });
      }
    } catch {
      set({ loading: false, initialized: true });
    }
  },

  refreshProfile: async () => {
    const current = get().user;
    if (!current?.id) return;
    const profile = await fetchProfile(current.id);
    if (profile) {
      set({ user: mapUser({ id: current.id, email: current.email } as any, profile) });
    }
  },

  clearError: () => set({ error: null }),
}));
