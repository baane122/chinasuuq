import { useAuthStore } from "@/store/auth";

/**
 * The auth store is being rebuilt concurrently to exactly this contract
 * (owned by another agent; this file must not drift from it). Screens read
 * the store through `useAuthContract()` so these screens compile against the
 * agreed interface even while `src/store/auth.ts` is mid-rebuild.
 */
export interface AuthResult {
  error?: string;
  requiresVerification?: boolean;
}

export interface AuthContract {
  user: { id: string; email?: string; full_name?: string; phone?: string } | null;
  session: { user?: { id: string } } | null;
  error: string | null;
  isStaff: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    phone?: string
  ) => Promise<AuthResult>;
  forgotPassword: (email: string) => Promise<AuthResult>;
  setNewPassword: (password: string) => Promise<AuthResult>;
  resendVerification: (email: string) => Promise<AuthResult>;
  /** Phone number sign-in path: send the OTP. Fails with a friendly message
   *  until the dashboard has an SMS provider attached (see AUTH-DASHBOARD-SETUP.md). */
  signInWithOtpPhone: (phone: string, createNewUser?: boolean) => Promise<AuthResult>;
  /** Verify the OTP that `signInWithOtpPhone` sent. */
  verifyOtpPhone: (phone: string, code: string) => Promise<AuthResult>;
  clearError: () => void;
}

export function useAuthContract(): AuthContract {
  // The live store implements this exact interface once rebuilt; the cast
  // only insulates our screens from the store being edited mid-flight.
  return useAuthStore() as unknown as AuthContract;
}

/**
 * Fresh (non-reactive) read for the instant right after an await, when the
 * hook value in the calling closure is still the pre-action snapshot.
 */
export function readAuthContract(): AuthContract {
  return useAuthStore.getState() as unknown as AuthContract;
}
