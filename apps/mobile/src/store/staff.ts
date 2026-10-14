/**
 * Staff Mode Store
 * 
 * Tracks when a user is in "staff mode" - allows browsing all marketplaces
 * with special staff-only controls (sync cookies, view all orders, etc.)
 */
import { create } from "zustand";
import { isStaffRole } from "@/lib/roles";

export interface StaffModeState {
  isActive: boolean;
  role: string | null;
  
  initFromProfile: (role: string | null) => void;
  enterStaffMode: () => void;
  exitStaffMode: () => void;
  
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
  
  initFromProfile: (role) => {
    const isStaff = isStaffRole(role);
    const staffRole = isStaff ? role : null;
    set({
      role: staffRole,
      // "isActive" means "a staff account is operating": a staff/super_admin
      // login starts in staff mode (previously forced false, which made the
      // whole mode dead). Capabilities are wired from the role, not hardcoded.
      isActive: isStaff,
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
  
  canManageMarketplaces: false,
  canSyncCookies: false,
  canViewAllOrders: false,
}));
