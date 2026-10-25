/**
 * Staff Mode Store
 *
 * Tracks when a user is in "staff mode" - allows browsing all marketplaces
 * with special staff-only controls (sync cookies, view all orders, etc.)
 */
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isStaffRole } from "@/lib/roles";

/**
 * Value = the user id of the staff account that has already been shown the
 * one-time staff welcome. Same "write a marker to AsyncStorage" pattern as
 * `STAFF_SESSION_KEY` in `store/auth.ts`: keyed per account so a second staff
 * login on the same device still gets its own welcome.
 */
export const STAFF_WELCOME_KEY = "chinasuuq-staff-welcome-seen-for";

/**
 * One claim per JS runtime. AsyncStorage is the durable guard; this stops two
 * banners mounted at the same instant (home + account tabs) or a React
 * re-mount from navigating twice before the first write has landed.
 */
let welcomeClaimInFlight = false;

export interface StaffModeState {
  isActive: boolean;
  role: string | null;
  /** User id whose staff welcome has been accounted for in this runtime. */
  welcomeSeenFor: string | null;

  initFromProfile: (role: string | null) => void;
  enterStaffMode: () => void;
  exitStaffMode: () => void;
  claimStaffWelcome: (userId?: string | null) => Promise<boolean>;

  canManageMarketplaces: boolean;
  canSyncCookies: boolean;
  canViewAllOrders: boolean;
}

/**
 * Screens used to re-derive this with `role === "staff" || role === "super_admin"`
 * (three copies, none of them counting the legacy `admin` role the server does
 * accept). Read the hydrated store instead — `store/auth.ts` fills it at
 * sign-in and on session restore, so this costs no extra `profiles` query per
 * screen mount.
 */
export const useIsStaff = (): boolean => useStaffStore((s) => s.role !== null && isStaffRole(s.role));

export const useStaffStore = create<StaffModeState>((set, get) => ({
  isActive: false,
  role: null,
  welcomeSeenFor: null,

  initFromProfile: (role) => {
    const isStaff = isStaffRole(role);
    const staffRole = isStaff ? role : null;
    set({
      role: staffRole,
      // "isActive" means "this staff account is currently OPERATING in staff
      // mode" — an explicit choice, so signing in must not set it. It used to
      // be `isActive: isStaff`, and because the tab layout redirected whenever
      // isActive was true, every staff login bounced out of the app in an
      // infinite loop. Staff mode is now entered from the staff banner
      // (StaffEntryBanner) and left from the staff header (StaffModeHeader).
      // A re-hydration (home.tsx re-runs this on role change) keeps the choice
      // the staff member already made; losing staff access flips it off.
      isActive: isStaff ? get().isActive : false,
      canManageMarketplaces: isStaff,
      canSyncCookies: isStaff,
      canViewAllOrders: isStaff,
    });
  },

  enterStaffMode: () => {
    // Only a staff role may enter; a customer tapping the banner changes nothing.
    if (!get().role) return;
    set({ isActive: true });
  },

  exitStaffMode: () => {
    // Leaves operating mode but keeps the role and capabilities: a staff
    // member who browses as a customer and flips back does not re-login.
    set({ isActive: false });
  },

  /**
   * Resolve true EXACTLY ONCE per staff account, the first time a staff surface
   * is mounted. The marker is written before the caller is allowed to navigate,
   * so no screen can re-fire it: signing in shows the welcome once, and
   * navigating back to the tabs afterwards never does. (Trade-off: if the app is
   * killed between the write and the welcome rendering, the welcome is skipped
   * on the next start — the correct direction to fail, since the alternative is
   * a redirect loop.)
   */
  claimStaffWelcome: async (userId) => {
    if (!userId || welcomeClaimInFlight) return false;
    welcomeClaimInFlight = true;
    try {
      const seenFor = await AsyncStorage.getItem(STAFF_WELCOME_KEY);
      if (seenFor === userId) {
        set({ welcomeSeenFor: userId });
        return false;
      }
      await AsyncStorage.setItem(STAFF_WELCOME_KEY, userId);
      set({ welcomeSeenFor: userId });
      return true;
    } catch (e) {
      // Unreadable storage must NOT become "show it again on every mount".
      console.warn("[staff] could not account for the staff welcome; skipping it", e);
      return false;
    } finally {
      welcomeClaimInFlight = false;
    }
  },

  canManageMarketplaces: false,
  canSyncCookies: false,
  canViewAllOrders: false,
}));
