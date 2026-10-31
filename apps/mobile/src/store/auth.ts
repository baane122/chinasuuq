import { create } from "zustand";
import {
  supabase,
  VERIFY_REDIRECT,
  RECOVERY_REDIRECT,
} from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useStaffStore } from "./staff";
import { setCartScope } from "./cart";
import { purgeUserScopedCaches } from "@/db/index";
import { isStaffRole } from "@/lib/roles";
import { getDeviceId, deviceLabel, devicePlatform } from "@/lib/deviceId";
import { sessionClaim } from "@/lib/sessionClaim";

const STAFF_SESSION_KEY = "chinasuuq-staff-session-enabled";

interface User {
  id: string;
  email?: string;
  full_name?: string;
  phone?: string;
  city?: string;
  role?: string; // 'staff' or 'super_admin' for staff mode
  /**
   * False when the account has been deactivated (profiles.is_active or an
   * inactive staff record). The server signs these sessions out, so this is
   * only ever true for the brief window before that lands; it exists so the
   * app can explain the state instead of showing an empty customer shell.
   */
  accountActive?: boolean;
}

/**
 * What an auth action produced.
 *
 * `requiresVerification` is the field the auth screens exist to handle: the
 * project's "Confirm email" toggle decides whether signUp hands us a session or
 * hands us a user awaiting a link, and that toggle lives on the Supabase project,
 * not in this repository. Screens must branch on it instead of guessing, because
 * guessing wrong either strands a signed-in customer on a "check your email"
 * screen or tells a waiting customer they are already in.
 *
 * As of 2026-10-16 the live project has it OFF (`mailer_autoconfirm: true`), so
 * signUp hands us a session and this branch is not taken. It is not dead code:
 * switching confirmation back on is a one-field dashboard change, and an app
 * build that assumed sessions would then strand every new customer.
 */
interface AuthResult {
  error?: string;
  requiresVerification?: boolean;
}

interface AuthStore {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  /** True when the current session belongs to a staff account (staff or super_admin). */
  isStaff: boolean;
  /**
   * Set when the server ended this session for a reason the customer must be
   * told about — today that is the one-device rule (they signed in elsewhere)
   * or a disabled account. Auth screens show it; `clearSessionNotice` dismisses.
   */
  sessionNotice: string | null;
  clearSessionNotice: () => void;
  /** Re-check that this phone is still the account's active device. */
  assertDeviceSession: () => Promise<void>;
  /** "Sign out my other phones" — returns how many sessions were revoked. */
  revokeOtherDevices: () => Promise<{ ok: boolean; revoked?: number; error?: string }>;
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
  /**
   * Phone sign-in: ask GoTrue to send the SMS OTP.
   *
   * The whole path is gated by a DASHBOARD setting, not by code: with no SMS
   * provider attached (`external.phone` off / Twilio without credentials), the
   * server answers `phone_provider_disabled` and this resolves with that
   * friendly error instead of throwing. The UI treats that as "phone sign-in
   * is not available yet, use email" — honest, because no SMS can be sent
   * without the provider the owner must configure.
   *
   * `createNewUser` defaults to true: a first-time number gets an account
   * created on OTP verify, matching the email flow.
   */
  /** Verify the SMS code for `phone`; on success a session is applied. */
  signOut: () => Promise<void>;
  loadSession: () => Promise<void>;
  clearError: () => void;
  refreshProfile: () => Promise<void>;
  /** Subscribe to Supabase's auth events for this app run. Idempotent. */
  startAuthListener: () => void;
  /** Persist whether the current login is staff-active so we can redirect on next load. */
  setStaffSessionEnabled: (enabled: boolean) => Promise<void>;
  /** Return true if the *previous* login session was staff mode — used by splash/gate logic. */
  wasStaffSession: () => Promise<boolean>;
}

/**
 * Supabase's own messages are written for the developer reading the API
 * response, not for a customer. Several of them are also indistinguishable from
 * a bug ("New resource not found, please contact support"). This maps the
 * stable `error_code` field — which supabase-js exposes on AuthApiError — to
 * something a shopper can act on, and only falls back to the server text for
 * codes we have not seen.
 */
function friendlyAuthError(error: any): string {
  const code: string = error?.code ?? error?.error_code ?? "";
  const raw: string = error?.message ?? "";
  switch (code) {
    case "invalid_credentials":
    case "invalid_login":
      return "Email or password is incorrect.";
    case "email_not_confirmed":
      return "Please confirm your email address before signing in.";
    case "weak_password":
      return "That password is too short. Use at least 6 characters.";
    case "rate_limit_exceeded":
    case "over_email_send_rate_limit":
    case "too_many_requests":
      return "Too many attempts. Please wait a minute and try again.";
    case "phone_provider_disabled":
    case "sms_provider_not_configured":
    case "unsupported_phone_provider":
      return "Phone sign-in is not available yet. Please use your email.";
    case "invalid_phone":
      return "That phone number doesn't look right. Use the full number, e.g. +252…";
    case "phone_not_confirmed":
      return "Please confirm that phone number first with the code we sent.";
    case "user_not_found":
      return "We could not find an account with that email.";
    case "validation_failed":
      return "Please check the details you entered.";
    case "bad_verification_code":
    case "otp_expired":
      return "That link or code has expired. Please request a new one.";
    case "single_use_token_not_found":
      return "That link has already been used.";
    // The session row behind this token was revoked — for this app that means
    // the account signed in on another phone (one-device rule), or staff
    // disabled the account. Both are "you are signed out", not "wrong password".
    case "refresh_token_not_found":
    case "refresh_token_already_used":
    case "session_not_found":
    case "session_expired":
      return "Your session ended. Please sign in again.";
    default:
      break;
  }
  const msg = raw.toLowerCase();
  if (msg.includes("invalid") && (msg.includes("credentials") || msg.includes("login")))
    return "Email or password is incorrect.";
  if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("already signuped"))
    return "This email is already registered. Try signing in instead.";
  if (msg.includes("confirm")) return "Please confirm your email address before signing in.";
  if (msg.includes("rate")) return "Too many attempts. Please wait a minute and try again.";
  if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("timed out"))
    return "Network problem. Check your connection and try again.";
  return raw || "Something went wrong. Please try again.";
}

/**
 * `profiles` and `customer_profiles` are independent reads, and this runs
 * behind the splash gate on every cold start. Awaited in series the user waits
 * for both round-trips before the app lets them in; in parallel it costs the
 * slower of the two.
 */
async function fetchProfile(userId: string) {
  try {
    const [profile, customer, context] = await Promise.all([
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
      // The SERVER's verdict on this session. `profiles.role` alone says a
      // deactivated staff member is still staff (their role column is
      // unchanged); `auth_context()` applies the same predicate the RLS
      // policies use, so staff tools cannot open for an account that has no
      // admin data access.
      supabase.rpc("auth_context"),
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

    // A failed auth_context() must not silently DOWNGRADE a real staff member
    // to customer (their tools would vanish with no explanation). Fall back to
    // the role column, which is the pre-existing behaviour.
    let role = (data as { role?: string | null }).role ?? null;
    let accountActive = true;
    if (context.error) {
      console.warn("[auth] auth_context failed:", context.error.message);
    } else {
      const ctx = context.data as
        | { is_staff?: boolean; role?: string | null; active?: boolean }
        | null;
      if (ctx) {
        accountActive = ctx.active !== false;
        // Staff authorisation comes from the server; a customer's role label
        // stays whatever the profile says so nothing else changes for them.
        if (ctx.is_staff) role = ctx.role ?? role;
        else if (role && isStaffRole(role)) role = "customer";
      }
    }

    return { ...data, role, accountActive, city: cp?.city ?? null };
  } catch (e: any) {
    console.warn("[auth] fetchProfile threw:", e?.message);
    return null;
  }
}

/**
 * The auth event subscription, kept at module scope so it is installed exactly
 * once per app run no matter how many components or stores ask for it.
 *
 * Before this existed nothing listened at all: a token refreshed in the
 * background, an email link opened in another screen, or a sign-out from the web
 * app left this store showing the previous truth indefinitely. `loadSession()`
 * ran once behind the splash, so a customer who signed in via an emailed link
 * after that moment was signed in on the server and a guest on their own phone.
 */
let authSubscription: { unsubscribe: () => void } | null = null;
let lastAppliedSessionId: string | null = null;

/**
 * Session id this runtime has already claimed as the active device.
 *
 * `session_id` survives refresh_token rotation, so TOKEN_REFRESHED re-applies the
 * same value every ~50 minutes. Without this guard each refresh would repeat a
 * write RPC that can only ever return the same answer.
 */
let claimedSessionId: string | null = null;

export const useAuthStore = create<AuthStore>((set, get) => {
  /**
   * Publish a session into every piece of state that depends on it.
   *
   * One function because there are now four ways a session appears — cold
   * start, sign-in, sign-up, and a background auth event — and each one has to
   * land the profile, the cart namespace and the staff flag the same way or the
   * app shows one account's chrome with another's data.
   */
  async function applySession(
    session: Session | null,
    options: { skipProfileFetchIfSameUser?: boolean; claimDevice?: boolean } = {}
  ) {
    if (!session?.user) {
      lastAppliedSessionId = null;
      await setCartScope(null);
      set({ user: null, session: null, isStaff: false, loading: false, initialized: true });
      return;
    }
    const userId = session.user.id;
    const unchanged =
      options.skipProfileFetchIfSameUser && lastAppliedSessionId === userId;
    const profile = unchanged ? get().user : await fetchProfile(userId);
    lastAppliedSessionId = userId;
    const mappedUser = mapUser(session.user, profile ?? undefined);
    const isStaff = isStaffRole(mappedUser.role);
    // Move the cart to this account's namespace BEFORE the session is
    // published, so no screen can render "signed in" while still showing
    // whoever used this phone last.
    await setCartScope(mappedUser.id);
    if (mappedUser.accountActive === false) {
      // Server already revoked this account's sessions; dropping local state
      // now means the customer sees the login screen instead of an empty app.
      await forceSignOut(
        "This account has been disabled. Please contact support."
      );
      return;
    }
    set({ user: mappedUser, session, isStaff, loading: false, initialized: true, error: null });
    if (mappedUser.role) {
      useStaffStore.getState().initFromProfile(mappedUser.role);
    }
    // Only WRITE the staff flag when it changes. TOKEN_REFRESHED re-applies the
    // same session every ~50 minutes; writing AsyncStorage each time was a
    // needless disk round-trip on the critical path of a background refresh.
    if ((await get().wasStaffSession()) !== isStaff) {
      await get().setStaffSessionEnabled(isStaff);
    }
    // Single-device rule: claim this phone AFTER the session is live. Running
    // it before `set` would make the claim's failure look like a sign-in
    // failure to the screen, when the account is in fact signed in.
    const claim = sessionClaim(session.access_token);
    if (options.claimDevice !== false && claim && claimedSessionId !== claim) {
      const claimed = await claimThisDevice();
      if (claimed) claimedSessionId = claim;
    }
  }

  /**
   * Tell the server this phone is the account's active device. Any other phone
   * registered to the account loses its session here (see
   * 202610310007_device_sessions.sql).
   *
   * Never throws: a failed claim must not break a sign-in that already
   * succeeded. `assertDeviceSession` retries it on the next app resume.
   */
  async function claimThisDevice(): Promise<boolean> {
    try {
      const deviceId = await getDeviceId();
      const { data, error } = await supabase.rpc("claim_device_session", {
        p_device_id: deviceId,
        p_device_name: deviceLabel(),
        p_platform: devicePlatform(),
      });
      if (error) {
        console.warn("[auth] claim_device_session failed:", error.message);
        return false;
      }
      const res = data as { ok?: boolean; reason?: string } | null;
      if (res && res.ok === false) {
        console.warn("[auth] claim_device_session refused:", res.reason);
        if (res.reason === "account_disabled") {
          await forceSignOut(
            "This account has been disabled. Please contact support."
          );
        }
        return false;
      }
      return true;
    } catch (e: any) {
      console.warn("[auth] claim_device_session threw:", e?.message ?? e);
      return false;
    }
  }

  /**
   * Local sign-out used when the SERVER has already ended the session (device
   * superseded, account disabled). It must not call `supabase.auth.signOut()`
   * first: that would round-trip to a session that no longer exists and can
   * hang on a bad connection while the customer stares at the old screen.
   *
   * `notice` is the sentence the login screen shows. It is state, not an
   * Alert, because an Alert fired from a background resume would steal focus
   * from whatever the customer was doing.
   */
  async function forceSignOut(notice: string) {
    lastAppliedSessionId = null;
    claimedSessionId = null;
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (e) {
      console.warn("[auth] local sign-out failed:", e);
    }
    await setCartScope(null).catch(() => {});
    purgeUserScopedCaches();
    useStaffStore.getState().exitStaffMode();
    await AsyncStorage.removeItem(STAFF_SESSION_KEY).catch(() => {});
    set({
      user: null,
      session: null,
      isStaff: false,
      loading: false,
      initialized: true,
      sessionNotice: notice,
    });
  }

  return {
    user: null,
    session: null,
    loading: true,
    initialized: false,
    error: null,
    isStaff: false,
    sessionNotice: null,

    signIn: async (email, password) => {
      try {
        set({ error: null });
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          const message = friendlyAuthError(error);
          set({ error: message });
          return { error: message };
        }
        if (!data.user) {
          set({ error: "We could not complete that sign-in. Please try again." });
          return { error: "We could not complete that sign-in. Please try again." };
        }
        await applySession(data.session);
        return {};
      } catch (e: any) {
        const message = friendlyAuthError(e);
        set({ error: message });
        return { error: message };
      }
    },

    signUp: async (email, password, fullName, phone) => {
      try {
        set({ error: null });
        const trimmedName = fullName.trim();
        const trimmedEmail = email.trim();
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            data: {
              full_name: trimmedName,
              // `handle_new_user` copies user_metadata onto the profile row, so
              // a phone captured here is the phone staff can call later. It is
              // optional: phone *sign-in* is off, but a number on the account is
              // still how a Somali customer is reached.
              ...(phone?.trim() ? { phone: phone.trim() } : {}),
            },
            // Without this, the dashboard's single global SITE_URL decides where
            // the link goes — and for a phone that is a browser, not this app.
            emailRedirectTo: VERIFY_REDIRECT,
          },
        });
        if (error) {
          const message = friendlyAuthError(error);
          set({ error: message });
          return { error: message };
        }
        if (!data.user) {
          set({ error: "We could not create that account. Please try again." });
          return { error: "We could not create that account. Please try again." };
        }
        // Email confirmation ON ⇒ no session; the caller must show the
        // "check your email" screen. OFF ⇒ a live session; sign them straight in.
        if (data.session) {
          await applySession(data.session);
          return {};
        }
        return { requiresVerification: true };
      } catch (e: any) {
        const message = friendlyAuthError(e);
        set({ error: message });
        return { error: message };
      }
    },

    forgotPassword: async (email) => {
      try {
        set({ error: null });
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: RECOVERY_REDIRECT,
        });
        if (error) {
          // Supabase deliberately answers success for unknown addresses, so a
          // returned error here is transport or rate limiting, not "no account".
          const message = friendlyAuthError(error);
          set({ error: message });
          return { error: message };
        }
        return {};
      } catch (e: any) {
        const message = friendlyAuthError(e);
        set({ error: message });
        return { error: message };
      }
    },

    /**
     * Finish a password reset.
     *
     * This method did not exist, which is why resetting a password could never
     * complete: a recovery link produced a session and then there was no code
     * anywhere that called `updateUser`, and no screen for the customer to type
     * a new password into. Requires the recovery session that the emailed link
     * established — `session.expires_in`-style checks are not available, so the
     * honest path is to attempt the update and explain the one failure that
     * means "you did not come in through the link".
     */
    setNewPassword: async (password) => {
      try {
        set({ error: null });
        if (!password || password.length < 6) {
          const message = "That password is too short. Use at least 6 characters.";
          set({ error: message });
          return { error: message };
        }
        const { data, error } = await supabase.auth.updateUser({ password });
        if (error) {
          const code: string = error.code ?? "";
          const isSessionProblem =
            code === "invalid_session" ||
            /no session|not logged in|for this action|requires? a recent|session must/.test(
              (error.message ?? "").toLowerCase()
            );
          const message = isSessionProblem
            ? "Please open the password-reset link from the email on this phone first, then set your new password."
            : friendlyAuthError(error);
          set({ error: message });
          return { error: message };
        }
        if (data.user) {
          // `updateUser` resolves to `{ user }` — there is no session in that
          // response, so the session has to be re-read. A password change also
          // mints fresh tokens server-side, and publishing the one we held
          // before the change is how a customer gets logged out on their next
          // request with no idea why.
          const { data: refreshed } = await supabase.auth.getSession();
          await applySession(refreshed.session ?? get().session);
        }
        return {};
      } catch (e: any) {
        const message = friendlyAuthError(e);
        set({ error: message });
        return { error: message };
      }
    },

    resendVerification: async (email) => {
      try {
        set({ error: null });
        const { error } = await supabase.auth.resend({
          type: "signup",
          email: email.trim(),
          options: { emailRedirectTo: VERIFY_REDIRECT },
        });
        if (error) {
          const message = friendlyAuthError(error);
          set({ error: message });
          return { error: message };
        }
        return {};
      } catch (e: any) {
        const message = friendlyAuthError(e);
        set({ error: message });
        return { error: message };
      }
    },

    signOut: async () => {
      try {
        await AsyncStorage.removeItem(STAFF_SESSION_KEY);
        // Device-scoped only: this is the customer's own "log out" button, and
        // it must never touch their session on another phone (or on the web).
        await supabase.auth.signOut({ scope: "local" });
        await setCartScope(null);
        purgeUserScopedCaches();
        useStaffStore.getState().exitStaffMode();
        lastAppliedSessionId = null;
        set({ user: null, session: null, error: null, isStaff: false, sessionNotice: null });
      } catch {
        // Even if sign out fails server-side, clear local state so the user
        // isn't stuck looking at stale data.
        await setCartScope(null);
        purgeUserScopedCaches();
        useStaffStore.getState().exitStaffMode();
        lastAppliedSessionId = null;
        set({ user: null, session: null, error: null, isStaff: false, sessionNotice: null });
      }
    },

    loadSession: async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          // A corrupt/unreadable stored session is the one case where starting
          // as a guest is the RIGHT answer: the token cannot be used anyway,
          // and keeping `loading` true would leave the splash up forever.
          console.warn("[auth] getSession failed on cold start:", error.message);
        }
        await applySession(session ?? null);
      } catch (e: any) {
        // Never strand the splash screen. The app starts as a guest, which
        // every screen already handles, and the reason is logged for support.
        console.warn("[auth] loadSession threw:", e?.message ?? e);
        set({ loading: false, initialized: true });
      }
    },

    startAuthListener: () => {
      if (authSubscription) return;
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        // No per-event console.log: auth events fire on every refresh (and this
        // log printed on every one of them in release builds). Failures are
        // logged where they actually happen.
        if (event === "TOKEN_REFRESHED" && !session) return; // handled below
        // SIGNED_OUT must clear immediately: leaving the last user's profile in
        // the store is how the next person on this phone sees a stranger's cart.
        if (event === "SIGNED_OUT") {
          lastAppliedSessionId = null;
          void (async () => {
            await setCartScope(null);
            purgeUserScopedCaches();
            useStaffStore.getState().exitStaffMode();
            set({ user: null, session: null, isStaff: false, loading: false, initialized: true });
          })();
          return;
        }
        if (event === "USER_UPDATED") {
          // A password change or email edit does not move the account between
          // namespaces, and the profile row may have changed with it.
          void applySession(session);
          return;
        }
        if (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
          // TOKEN_REFRESHED is the same account with new tokens; INITIAL_SESSION
          // fires alongside the splash-gate `loadSession()` call. Re-reading
          // `profiles` for a user we have already hydrated would put two
          // database round trips in front of an already-rendering screen.
          void applySession(session, { skipProfileFetchIfSameUser: true });
          return;
        }
        void applySession(session, { skipProfileFetchIfSameUser: true });
      });
      authSubscription = data?.subscription ?? null;
    },

    refreshProfile: async () => {
      const current = get().user;
      if (!current?.id) return;
      const profile = await fetchProfile(current.id);
      if (profile) {
        const mapped = mapUser({ id: current.id, email: current.email } as any, profile);
        set({ user: mapped, isStaff: isStaffRole(mapped.role) });
        if (mapped.role) {
          useStaffStore.getState().initFromProfile(mapped.role);
        }
      }
    },

    clearError: () => set({ error: null }),

    clearSessionNotice: () => set({ sessionNotice: null }),

    /**
     * Ask the server whether this phone is still the account's active device.
     *
     * Called on app resume (see app/_layout.tsx). The revoking request happens
     * server-side and cannot reach into another phone's memory, so the loser's
     * access token stays valid until it expires — this is what turns that
     * silent window into an honest "you were signed out" screen.
     */
    assertDeviceSession: async () => {
      if (!get().session || !get().user?.id) return;
      try {
        const deviceId = await getDeviceId();
        const { data, error } = await supabase.rpc("assert_device_session", {
          p_device_id: deviceId,
        });
        if (error) {
          // Network/server failure is NOT a revocation. Stay signed in: a
          // customer on 2G must not be logged out because a check timed out.
          console.warn("[auth] assert_device_session failed:", error.message);
          return;
        }
        const res = data as
          | { ok?: boolean; reason?: string; claimed?: boolean }
          | null;
        if (!res || res.ok !== false) {
          if (res && res.claimed === false) {
            // No device row for this install (pre-upgrade login): adopt it now
            // rather than leaving the account unguarded.
            await claimThisDevice();
          }
          return;
        }
        const notice =
          res.reason === "account_disabled"
            ? "This account has been disabled. Please contact support."
            : res.reason === "session_revoked"
              ? "You were signed out because this account signed in on another phone."
              // Any other false answer still means "this session must stop":
              // fail closed, and do not invent a reason we cannot explain.
              : "Your session ended. Please sign in again.";
        await forceSignOut(notice);
      } catch (e: any) {
        console.warn("[auth] assertDeviceSession threw:", e?.message ?? e);
      }
    },

    revokeOtherDevices: async () => {
      try {
        const { data, error } = await supabase.rpc("revoke_my_other_devices");
        if (error) return { ok: false, error: error.message };
        const res = data as { revoked?: number } | null;
        return { ok: true, revoked: Number(res?.revoked ?? 0) };
      } catch (e: any) {
        return { ok: false, error: e?.message ?? "Network error" };
      }
    },

    setStaffSessionEnabled: async (enabled) => {
      try {
        await AsyncStorage.setItem(STAFF_SESSION_KEY, enabled ? "1" : "0");
      } catch (e) {
        console.warn("[auth] could not persist staff session flag", e);
      }
    },

    wasStaffSession: () => {
      // This is read synchronously from the AsyncStorage key — the actual value
      // is set by setStaffSessionEnabled. We keep a small in-memory cache here
      // to avoid a round-trip per mount.
      return AsyncStorage.getItem(STAFF_SESSION_KEY).then((v) => v === "1");
    },
  };
});

function mapUser(sessionUser: Session["user"], profile?: any): User {
  return {
    // Carried on the user object so screens can explain a disabled account
    // without another round trip.
    accountActive: profile?.accountActive !== false,
    id: sessionUser.id,
    email: sessionUser.email,
    full_name: profile?.full_name || sessionUser.user_metadata?.full_name,
    phone: profile?.phone || sessionUser.user_metadata?.phone,
    city: profile?.city || sessionUser.user_metadata?.city,
    role: profile?.role || null,
  };
}
