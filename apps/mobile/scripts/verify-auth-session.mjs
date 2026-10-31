#!/usr/bin/env node
/**
 * verify-auth-session.mjs — static guards for the auth/session contract.
 *
 * Three classes of regression are invisible to `tsc` and to a manual smoke
 * test, so each gets an assertion here:
 *
 *  1. `signOut()` with no argument is GLOBAL in supabase-js: it revokes every
 *     session of the account, including the web app's. A customer tapping
 *     "Log out" on their phone must not be logged out of Mission Control, so
 *     the local sign-out must name scope:"local".
 *  2. The one-device rule has two halves that must both exist or the rule is
 *     fiction: the claiming RPC after sign-in, and the resume check that turns
 *     a server-side revocation into an actual sign-out.
 *  3. The `(auth)` screens must have a boundary. `ScreenErrorBoundary` is
 *     declared on the root Stack; a future refactor that drops the prop turns
 *     a bad render into a full-app crash.
 *
 * Run from apps/mobile:  node scripts/verify-auth-session.mjs
 * No device, no network.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const STORE = read("src/store/auth.ts");
const LAYOUT = read("app/_layout.tsx");
const LOGIN = read("app/(auth)/login.tsx");
const DEVICE = read("src/lib/deviceId.ts");
const SECURITY = read("app/profile/security.tsx");

let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (e) {
    failures += 1;
    console.error(`FAIL  ${name}\n      ${e.message}`);
    process.exitCode = 1;
  }
};
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const CLAIM_MODULE = join(ROOT, "src/lib/sessionClaim.ts");
const claimMod = await import(pathToFileURL(CLAIM_MODULE).href);

console.log("auth-session: sign-out scope, device rule, boundaries");

check("every local sign-out names scope:'local' (never global)", () => {
  // Only real calls: `await supabase.auth.signOut(...)`. Mentions inside
  // comments are documentation, not behaviour.
  const signOutCalls = [...STORE.matchAll(/await supabase\.auth\.signOut\(([^)]*)\)/g)];
  assert(signOutCalls.length >= 2, "expected the user sign-out and the forced sign-out");
  for (const [, args] of signOutCalls) {
    assert(
      /scope:\s*"local"/.test(args),
      `signOut(${args}) would revoke the account's web session too — pass { scope: "local" }`
    );
  }
});

check("sign-in claims the device", () => {
  assert(
    /claim_device_session/.test(STORE),
    "store never calls claim_device_session — the one-device rule is not enforced"
  );
});

check("resume re-checks the device claim", () => {
  assert(/assert_device_session/.test(STORE), "store never calls assert_device_session");
  assert(
    /AppState/.test(LAYOUT) && /assertDeviceSession/.test(LAYOUT),
    "app/_layout.tsx does not re-check the session on resume, so a revoked phone stays signed in until its token expires"
  );
});

check("a revoked session signs the customer out and explains why", () => {
  assert(/session_revoked/.test(STORE), "never handles the session_revoked reason");
  assert(/forceSignOut/.test(STORE), "no forced local sign-out path");
  assert(/sessionNotice/.test(STORE), "no customer-facing notice for a server-side sign-out");
  assert(/sessionNotice/.test(LOGIN), "the login screen never renders the notice");
  assert(
    /sessionNotice/.test(LAYOUT),
    "the root layout does not route to login after a server-side sign-out"
  );
});

check("device id is stable across launches (not a per-launch value)", () => {
  assert(/chinasuuq-device-id/.test(DEVICE), "device id has no persistent key");
  const code = DEVICE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert(
    !/sessionId/.test(code),
    "Constants.sessionId changes every launch and must not be part of the device id"
  );
});

check("route boundaries are declared for the whole stack and the tabs", () => {
  assert(
    /unstable_screenErrorBoundary=\{ScreenErrorBoundary\}/.test(LAYOUT),
    "root Stack has no screen error boundary"
  );
  const TABS = read("app/(tabs)/_layout.tsx");
  assert(
    /unstable_screenErrorBoundary=\{ScreenErrorBoundary\}/.test(TABS),
    "tab navigator has no screen error boundary"
  );
});

check("customer can revoke lost devices without support", () => {
  assert(/revoke_my_other_devices/.test(STORE), "store has no revoke-other-devices action");
  assert(/revokeOtherDevices/.test(SECURITY), "security screen does not call it");
});

check("auth events are not logged on every refresh", () => {
  assert(
    !/console\.log\(\s*"\[auth\] event:/.test(STORE),
    "per-event console.log is back (it fired on every token refresh in release builds)"
  );
});

check("sessionClaim reads session_id and survives base64url padding", () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const token = `eyJhbGciOiJIUzI1NiJ9.${b64({ sub: "u1", session_id: "abc-123" })}.sig`;
  if (claimMod.sessionClaim(token) !== "abc-123") {
    throw new Error("did not return the session_id claim");
  }
});

check("sessionClaim returns null instead of throwing on junk", () => {
  for (const bad of [null, undefined, "", "not-a-jwt", "a.!!!.c", "a.eyJ.0"]) {
    if (claimMod.sessionClaim(bad) !== null) {
      throw new Error(`expected null for ${JSON.stringify(bad)}`);
    }
  }
});

check("sessionClaim is null when the token has no session_id", () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (claimMod.sessionClaim(`h.${b64({ sub: "u1" })}.s`) !== null) {
    throw new Error("a token with no session_id must not produce a claim");
  }
});

console.log(failures === 0 ? "\nall auth-session checks passed" : `\n${failures} failure(s)`);
