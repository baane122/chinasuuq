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
  refreshProfile: () => Promise<void>;
}

function mapUser(sessionUser: Session["user"], profile?: any): User {
  return {
    id: sessionUser.id,
    email: sessionUser.email,
    full_name: profile?.full_name || sessionUser.user_metadata?.full_name,
    phone: profile?.phone || sessionUser.user_metadata?.phone,
    city: profile?.city || sessionUser.user_metadata?.city,
  };
}

async function fetchProfile(userId: string) {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, phone, city")
      .eq("id", userId)
      .maybeSingle();
    return data || null;
  } catch {
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
        set({
          user: mapUser(data.user, profile),
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
        // Best-effort: write the name into the profiles table right away so
        // the rest of the app sees a fully populated user.
        try {
          await supabase
            .from("profiles")
            .upsert({ id: data.user.id, full_name: name, updated_at: new Date().toISOString() });
        } catch {}
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
        const profile = await fetchProfile(data.session.user.id);
        set({
          user: mapUser(data.session.user, profile),
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
