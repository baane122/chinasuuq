import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

interface User {
  id: string;
  email?: string;
  full_name?: string;
  phone?: string;
  city?: string;
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
}

function mapUser(sessionUser: Session["user"]): User {
  return {
    id: sessionUser.id,
    email: sessionUser.email,
    full_name: sessionUser.user_metadata?.full_name,
    phone: sessionUser.user_metadata?.phone,
    city: sessionUser.user_metadata?.city,
  };
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
        set({
          user: mapUser(data.user),
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
        set({
          user: mapUser(data.user),
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
    set({ user: null, session: null, error: null });
  },

  loadSession: async () => {
    try {
      set({ loading: true });
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.warn("Session restore failed:", error.message);
      }
      if (data.session?.user) {
        set({
          user: mapUser(data.session.user),
          session: data.session,
          loading: false,
          initialized: true,
        });
      } else {
        set({ loading: false, initialized: true });
      }
    } catch {
      set({ loading: false, initialized: true });
    }
  },

  clearError: () => set({ error: null }),
}));
