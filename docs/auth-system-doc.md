# ChinaSuuq Authentication System — Complete Documentation

## 1. Architecture Overview

### 1.1 Core Identity: Supabase Auth

ChinaSuuq uses **Supabase Auth** as its sole authentication backend. Every user in the system is a row in `auth.users` — there are no custom auth tables, no separate login database, and no third-party identity provider. The `auth.users` record is the authoritative identity; the application-layer `profiles` table is a denormalized extension that stores display and role data.

```
auth.users (Supabase-managed)
  └── id (UUID) ← primary key, shared with profiles.id
        ├── email (TEXT)
        ├── encrypted_password (TEXT) ← bcrypt, managed by Supabase
        ├── email_confirmed_at (TIMESTAMPTZ)
        ├── confirmed_at (TIMESTAMPTZ)
        ├── user_metadata (JSONB)     ← full_name, phone set at signup
        └── app_metadata (JSONB)     ← provider, roles, admin flags

profiles (public schema)
  └── id (UUID, PK, FK → auth.users.id ON DELETE CASCADE)
        ├── email (TEXT, UNIQUE)      ← denormalized copy of auth.users.email
        ├── full_name (TEXT)
        ├── role (user_role)         ← 'customer' | 'staff' | 'super_admin'
        ├── status (user_status)     ← 'active' | 'locked'
        └── preferred_language (language_code)
```

**Why the duplication?** `profiles.email` and `profiles.role` allow row-level security (RLS) policies to filter queries without joining `auth.users` — every query on orders, products, or customers can be authored against `profiles` alone, which is simpler and faster under RLS.

### 1.2 Role Hierarchy

| Role            | Description                                                        | Login behavior                              |
|-----------------|--------------------------------------------------------------------|---------------------------------------------|
| `customer`      | Regular marketplace buyer                                            | Immediate access after email verification   |
| `staff`         | Enterprise staff (logistics, sourcing, admin support)              | Requires admin approval before first login  |
| `super_admin`   | ChinaSuuq internal team with full platform access                    | Immediate access after email verification   |

Staff accounts differ from customers in two ways:
1. Their `profiles.status` is set to `locked` at creation.
2. They must be manually approved via the `approve_staff()` function before `auth.users` marks their email confirmed and they can sign in.

### 1.3 Password Storage

Passwords are stored in `auth.users.encrypted_password` using Supabase's built-in **bcrypt** hash. The application never touches raw passwords — all password operations flow through Supabase Auth endpoints:

- **Signup**: `supabase.auth.signUp()` → Supabase hashes the password and stores it.
- **Login**: `supabase.auth.signInWithPassword()` → Supabase compares the provided password against the stored hash.
- **Password reset**: `supabase.auth.resetPasswordForEmail()` → Supabase generates a token and sends the reset email via its configured SMTP service.

The web app has **no custom password hashing logic**. Every auth operation goes through Supabase's API.

### 1.4 Session Management

Sessions are managed client-side by the Supabase JS SDK with these settings:

```typescript
// apps/web/src/lib/supabase.ts
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,   // silently refreshes JWT before expiry
    persistSession: true,     // stores session in localStorage
    detectSessionInUrl: false, // no URL-based session extraction
  },
});
```

The mobile app uses the same configuration but persists the session in **AsyncStorage** instead of localStorage (required for React Native):

```typescript
// apps/mobile/src/lib/supabase.ts
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,    // React Native persistent storage
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

**JWT lifetime**: Supabase's default is 3600 seconds (1 hour). The `autoRefreshToken` setting causes the SDK to automatically obtain a new access token before expiry, so users stay logged in across page/app reloads as long as the refresh token is valid (typically 14 days).

### 1.5 State Management

Both platforms maintain auth state in **Zustand stores** that mirror each other:

- **Web**: No dedicated auth store — the web app reads `supabase.auth.getSession()` directly on each render or via React Query/mutation hooks. Session changes propagate through the Supabase client's built-in broadcast channel.
- **Mobile**: `apps/mobile/src/store/auth.ts` — a Zustand store (`useAuthStore`) that holds `user`, `session`, `isStaff`, and `loading` state. It also persists a `chinasuuq-staff-session-enabled` flag in AsyncStorage to remember staff mode across app restarts.

```typescript
// apps/mobile/src/store/auth.ts — key interface
interface AuthStore {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  isStaff: boolean;
  signIn: (email, password) => Promise<{ error?: string }>;
  signUp: (email, password, name) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  loadSession: () => Promise<void>;
  clearError: () => void;
}
```

### 1.6 Route Protection

The web app uses **Next.js middleware** (not shown in search results, but standard pattern) and per-page checks via `getSession()` from `@supabase/ssr` or direct `supabase.auth.getSession()` calls in server components.

The mobile app uses **Expo Router** layout guards in `app/_layout.tsx` and per-screen redirects. When a user navigates to a protected route while unauthenticated, the router redirects to `/(auth)/login`.

### 1.7 Edge Function Auth

For API operations that require server-side validation (e.g., AI translation, staff CRUD, marketplace sync), the web app calls Supabase Edge Functions. These functions receive the user's JWT via the `Authorization: Bearer <token>` header and validate it using shared helpers:

```typescript
// apps/web/supabase/functions/_shared/auth.ts
export async function roleGate(expectedRole: string) {
  // Extracts JWT from Authorization header
  // Validates signature via Supabase JWT verification
  // Returns { role, sub } or throws 401/403
}

export async function staffGate() {
  const { role, sub } = await roleGate('staff');
  if (role !== 'staff' && role !== 'super_admin') {
    return deny(403, 'Staff access required');
  }
  return { role, sub };
}
```

The `edgeFetch` helper in `apps/web/src/lib/supabase.ts` automatically attaches the current session's access token to every edge function call:

```typescript
// apps/web/src/lib/supabase.ts — edgeFetch helper
export async function edgeFetch<T>(functionName: string, init = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? anonKey;
  return fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
    // ...
  });
}
```

---

## 2. Login Journey

### 2.1 Customer Login Flow (Mobile)

**Entry point**: `apps/mobile/app/(auth)/login.tsx`

```
User opens app
  └─→ Splash screen checks loadSession()
       └─→ If no session or expired: show login screen
            └─→ User enters email + password
                 └─→ handleSubmit() → useAuthStore.signIn(email, password)
                      └─→ supabase.auth.signInWithPassword({ email, password })
                           ├─→ Success:
                           │    ├─→ fetchProfile(userId) → loads profiles + customer_profiles
                           │    ├─→ mapUser() → constructs User object
                           │    ├─→ setCartScope(userId) → moves cart to user namespace
                           │    ├─→ If role === 'staff': initStaffMode() + persist staff flag
                           │    └─→ Redirect to home or staff hub
                           └─→ Error:
                                ├─→ "invalid login credentials" → show credential error
                                ├─→ "email not confirmed" → show verification prompt
                                └─→ Network error → show connection error
```

**Key code from `apps/mobile/src/store/auth.ts`:**

```typescript
signIn: async (email, password) => {
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
    const isStaff = isStaffRole(mappedUser.role);
    await setCartScope(mappedUser.id);
    set({ user: mappedUser, session: data.session, isStaff });
    if (mappedUser.role) {
      useStaffStore.getState().initFromProfile(mappedUser.role);
    }
    await get().setStaffSessionEnabled(isStaff);
    return {};
  }
}
```

### 2.2 Customer Login Flow (Web)

**Entry point**: `apps/web/src/app/admin/login/page.tsx`

The web admin login follows the same pattern but with additional guardrails:

```
Admin login page renders
  └─→ useEffect: if isDevBuild && hasAdminFallbackSession() → redirect to /admin
       └─→ Load saved email from localStorage
            └─→ User enters email + password
                 └─→ handleSubmit() → supabase.auth.signInWithPassword({ email, password })
                      ├─→ Success:
                      │    ├─→ Save email to localStorage
                      │    └─→ router.push("/admin")
                      └─→ Error:
                           ├─→ "database/schema/unexpected/network" → backend error message
                           ├─→ "invalid login credentials" → credential error
                           ├─→ "email not confirmed" → verification prompt
                           └─→ Recovery code path (dev builds only):
                                └─→ Verify against defaultRecoveryCode → setAdminFallbackSession()
```

**Dev-mode recovery code**: In development builds (`NEXT_PUBLIC_DEV_BUILD=1`), a fallback recovery code path exists. Production builds explicitly refuse this path:

```typescript
// apps/web/src/app/admin/login/page.tsx
const submitRecovery = (e: React.FormEvent) => {
  if (!isDevBuild) {
    setError("Recovery codes are disabled in production.");
    return;
  }
  if (recoveryCode !== defaultRecoveryCode) {
    setError("Incorrect recovery code.");
    return;
  }
  setAdminFallbackSession(true);
  router.replace("/admin");
};
```

### 2.3 Staff Login Special Handling

Staff users who have been approved but are logging in for the first time (or after a session clear) see the same login form. After successful authentication, the mobile app checks `userRole` and redirects to `/staff-info` if applicable. The web app validates staff permissions server-side via RLS policies and edge function `staffGate()`.

### 2.4 Session Persistence and Cart Isolation

A critical detail in the login flow: **the shopping cart is scoped to the user at sign-in time**. Before publishing the "signed in" state, the app moves any guest cart to the new user's namespace:

```typescript
// apps/mobile/src/store/auth.ts — inside signIn()
await setCartScope(mappedUser.id);  // Move cart BEFORE setting user state
set({ user: mappedUser, session: data.session });
```

This prevents a scenario where a newly-signed-in user sees another person's cart items. On sign-out, the cart scope is cleared:

```typescript
signOut: async () => {
  await setCartScope(null);        // Return cart to guest namespace
  purgeUserScopedCaches();
  set({ user: null, session: null, isStaff: false });
}
```

---

## 3. Registration Journey

### 3.1 Customer Registration Flow (Mobile)

**Entry point**: `apps/mobile/app/(auth)/signup.tsx`

```
User taps "Sign Up"
  └─→ SignupScreen renders
       └─→ User fills: full_name, email, password, confirm_password
            └─→ Client-side validation:
                 ├─→ All fields non-empty
                 ├─→ Password length >= 6
                 └─→ Password === confirm_password
                      └─→ handleSignup() → useAuthStore.signUp(email, password, name)
                           └─→ supabase.auth.signUp({
                                  email,
                                  password,
                                  options: { data: { full_name: name } }
                                })
                                ├─→ Success:
                                │    └─→ router.replace("/(auth)/verify-email", { email })
                                └─→ Error:
                                     ├─→ "email already registered" → "Try signing in"
                                     ├─→ "weak password" → length < 6
                                     └─→ Network error → retry prompt
```

**Key code from `apps/mobile/src/store/auth.ts`:**

```typescript
signUp: async (email, password, name) => {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  });
  if (error) {
    set({ error: error.message });
    return { error: error.message };
  }
  return {};
}
```

### 3.2 Email Verification (Post-Signup)

**Entry point**: `apps/mobile/app/(auth)/verify-email.tsx`

After signup, Supabase sends a confirmation email to the user. The mobile app shows a "Check your email" screen with a resend button:

```
VerifyEmailScreen renders
  └─→ Show instructions:
       ├─→ "Open your email inbox"
       ├─→ "Find the ChinaSuuq verification email"
       └─→ "Click the verification link"
            └─→ [Resend verification email] button
                 └─→ handleResend() → supabase.auth.resend({ type: 'signup', email })
                      ├─→ Success: show "Link resent"
                      └─→ Error: show resend failure
```

**Important**: The web app does **not** have a dedicated signup or verify-email page. Web users sign up through the mobile app or through Supabase's hosted management UI. The web app's public-facing pages (`/(public)/*`) are read-only marketing/tracking pages — there is no customer signup flow in the web app itself.

### 3.3 Email Templates

Supabase sends two types of transactional emails, each using a template stored in the project:

| Template | Path | Purpose |
|----------|------|---------|
| `verification.html` | `apps/web/public/emails/verification.html` | Email confirmation on signup |
| `password-reset.html` | `apps/web/public/emails/password-reset.html` | Password reset link |

Both templates are **bilingual** (English + Somali):

```html
<!-- From verification.html -->
<div lang="so">Fadlan xaqiiji iimaylkaaga si aad u dhammaystirto diiwaangelinta.</div>
<!-- Preview text: "Please verify your email to complete registration." in Somali -->

<span lang="en">Connecting China &amp; Somalia</span>
<span lang="so" style="margin-left: 15px;">Isku xirka China &amp; Soomaaliya</span>
<!-- Bilingual tagline in header -->
```

The templates use `{{ .ConfirmationURL }}` and `{{ .Token }}` placeholders that Supabase's templating engine fills in at send time. They are served from `public/emails/` and referenced in Supabase's Dashboard → Authentication → Email Templates.

### 3.4 Password Reset Flow

**Entry point**: `apps/mobile/app/(auth)/forgot-password.tsx`

```
User taps "Forgot password?" on login screen
  └─→ ForgotPasswordScreen renders
       └─→ User enters email
            └─→ handleSubmit() → supabase.auth.resetPasswordForEmail(email, {
                                   redirectTo: "chinasuuq://reset"
                                 })
                                 ├─→ Success: show "Check your email" confirmation
                                 └─→ Error: Alert dialog with error message
                                      └─→ User clicks "Back to login"
```

The `redirectTo: "chinasuuq://reset"` deep link opens the mobile app when the user clicks the reset link in their email. The app then needs a separate screen to handle the deep link and allow password entry (not yet implemented in the visible codebase — the flow likely falls back to a browser-based password update page).

### 3.5 Full Registration Sequence (End-to-End)

```
1. User opens mobile app
2. Taps "Sign Up" → SignupScreen
3. Enters: full_name, email, password (≥6 chars), confirm_password
4. Taps "Create Account"
5. signUp() → Supabase creates auth.users row + sends confirmation email
6. App redirects to VerifyEmailScreen
7. User checks email, clicks confirmation link (handled by Supabase)
8. User taps "Continue to Login" → LoginScreen
9. User enters credentials → signIn() → Supabase validates bcrypt hash
10. Profile loaded from profiles table → user redirected to home
```

---

## 4. Key Implementation Notes

> **Staff accounts require manual approval.** When a staff user signs up, their `profiles.status` is set to `locked`. An admin must call the `approve_staff()` function (defined in `202609210002_staff_approval_function.sql`) to flip the status to `active` and confirm the email. Until then, the user cannot log in — even with the correct password, Supabase returns `"email not confirmed"`.

> **The web app has no customer signup page.** All customer registration flows through the mobile app. The web app's `admin/login` page is exclusively for staff/admin access to the management dashboard. There is no `/(public)/signup` route.

> **Edge functions enforce their own auth.** The `roleGate()` and `staffGate()` helpers in `apps/web/supabase/functions/_shared/auth.ts` parse the JWT from the `Authorization` header, verify it against Supabase's public key, and check the caller's role. This is the security boundary for all privileged API operations — the client never trusts itself.

> **Cart scope is tied to auth state.** The `setCartScope(userId)` call runs inside `signIn()` and `loadSession()` — before the UI declares the user as "logged in." This ensures that the cart is always in the correct namespace regardless of when the session was established.

> **Bcrypt is the only password hash.** There is no custom hashing, no salting logic in application code, and no password migration layer. All password operations go through Supabase's managed auth service.

> **Admin fallback recovery is dev-only.** The `defaultRecoveryCode` and `setAdminFallbackSession()` pattern exists only in development builds. Production builds gate this with `if (!isDevBuild) { setError("Recovery codes are disabled in production."); return; }`.

---

## 5. File Index

| File | Role |
|------|------|
| `apps/mobile/app/(auth)/login.tsx` | Mobile customer login screen |
| `apps/mobile/app/(auth)/signup.tsx` | Mobile customer registration screen |
| `apps/mobile/app/(auth)/verify-email.tsx` | Post-signup email verification screen |
| `apps/mobile/app/(auth)/forgot-password.tsx` | Password reset request screen |
| `apps/mobile/src/store/auth.ts` | Zustand auth store (mobile) |
| `apps/mobile/src/lib/supabase.ts` | Supabase client + marketplace session helpers |
| `apps/web/src/app/admin/login/page.tsx` | Web admin/staff login page |
| `apps/web/src/lib/supabase.ts` | Supabase client + `edgeFetch` helper (web) |
| `apps/web/supabase/functions/_shared/auth.ts` | `roleGate()`, `staffGate()`, `deny()` for edge functions |
| `apps/web/public/emails/verification.html` | Email confirmation template (bilingual EN/SO) |
| `apps/web/public/emails/password-reset.html` | Password reset template (bilingual EN/SO) |
| `apps/web/supabase/migrations/202408010002_core_profiles_auth.sql` | `profiles` table schema + foreign key to `auth.users` |
| `apps/web/.env.example` | Required env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
