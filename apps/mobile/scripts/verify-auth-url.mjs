/**
 * verify-auth-url.mjs — executable proof that an emailed Supabase link is read
 * correctly, on every shape we have seen and a few we hope to see.
 *
 * WHY THIS EXISTS: this is the only place in the app where the input format is
 * decided by somebody else. Supabase's dashboard owns the email template, so a
 * template edit — or flipping between the implicit and PKCE flow — changes the
 * URL without touching a line of our code. And the failure is silent in the worst
 * way: the customer taps "Reset password", the app comes back to the foreground,
 * nothing happens, and there is no error to read. They conclude their account is
 * gone. `tsc` cannot see that, and neither can `expo export`.
 *
 * So: run the REAL parser (Node type-stripping, no copy of the logic) against
 * recorded link shapes, then read the files that have to agree with it — the
 * client config, the deep-link wiring, and the routes the redirect constants
 * point at — and fail when they drift.
 *
 * Run from apps/mobile:  npm run verify:authurl
 * No device, no network, no Supabase call. Non-zero exit on any failure.
 */

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const ROOT = process.cwd();
const MODULE = join(ROOT, "src", "lib", "auth-url.ts");
const CLIENT = join(ROOT, "src", "lib", "supabase.ts");
const LAYOUT = join(ROOT, "app", "_layout.tsx");
const STORE = join(ROOT, "src", "store", "auth.ts");

const m = await import(pathToFileURL(MODULE).href);
const clientSrc = readFileSync(CLIENT, "utf8");
const layoutSrc = readFileSync(LAYOUT, "utf8");
const storeSrc = readFileSync(STORE, "utf8");

let failures = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (e) {
    failures++;
    console.error(`FAIL  ${name}\n      ${e.message}`);
    process.exitCode = 1;
  }
};

console.log("auth-url: the shapes Supabase actually sends");

await check("PKCE recovery link: ?code= lands as a recovery ticket", () => {
  const t = m.parseAuthUrl("chinasuuq://set-password?code=Kj8dLm2xQp&type=recovery");
  assert.equal(t.code, "Kj8dLm2xQp");
  assert.equal(t.kind, "recovery");
  assert.equal(t.error, undefined);
});

await check("PKCE signup link is a signup ticket, not a recovery one", () => {
  const t = m.parseAuthUrl("chinasuuq://verify-email?code=Ab12&type=signup");
  assert.equal(t.code, "Ab12");
  assert.equal(t.kind, "signup");
});

await check("legacy implicit link: tokens in the # fragment still parse", () => {
  const t = m.parseAuthUrl(
    "chinasuuq://reset#access_token=eyJhbGciOi.abc.def&refresh_token=rt-9&type=recovery"
  );
  assert.equal(t.accessToken, "eyJhbGciOi.abc.def");
  assert.equal(t.refreshToken, "rt-9");
  assert.equal(t.kind, "recovery");
  assert.equal(t.code, undefined);
});

await check("hash routing plus query fragment (web-style redirect target)", () => {
  const t = m.parseAuthUrl("https://chinasuuq.com/#/set-password?code=Hy7&type=recovery");
  assert.equal(t.code, "Hy7");
  assert.equal(t.kind, "recovery");
});

await check("email_change and invite types are modelled, not dropped", () => {
  assert.equal(m.parseAuthUrl("chinasuuq://verify-email?code=1&type=email_change").kind, "emailchange");
  assert.equal(m.parseAuthUrl("chinasuuq://verify-email?code=1&type=invite").kind, "invite");
  assert.equal(m.parseAuthUrl("chinasuuq://verify-email?code=1&type=magiclink").kind, "magiclink");
});

await check("an unrecognised type keeps its credentials and borrows intent from the route", () => {
  const t = m.parseAuthUrl("chinasuuq://verify-email?code=1&type=something_new_in_2027");
  assert.equal(t.code, "1", "a session must never be discarded over an unfamiliar label");
  // `kind` only decides whether to open the password screen, so a route-derived
  // guess is safe here; wrong-and-conservative beats throwing the ticket away.
  assert.equal(t.kind, "signup");
});

await check("an explicit type outranks route inference", () => {
  // A recovery link redirected onto the verify route must still be recovery:
  // this is the branch that decides whether the customer sees the password form.
  const t = m.parseAuthUrl("chinasuuq://verify-email?code=1&type=recovery");
  assert.equal(t.kind, "recovery");
});

await check("a template edit that drops `type` falls back to the route", () => {
  assert.equal(m.parseAuthUrl("chinasuuq://set-password?code=Q2").kind, "recovery");
  assert.equal(m.parseAuthUrl("chinasuuq://reset?code=Q2").kind, "recovery");
  assert.equal(m.parseAuthUrl("chinasuuq://verify-email?code=Q2").kind, "signup");
});

await check("code nested inside redirect_to is recovered", () => {
  const t = m.parseAuthUrl(
    "chinasuuq://return?redirect_to=chinasuuq%3A%2F%2Fset-password%3Fcode%3DIn99%26type%3Drecovery"
  );
  assert.equal(t.code, "In99");
  assert.equal(t.kind, "recovery");
});

await check("an outer code wins over a nested one", () => {
  const t = m.parseAuthUrl(
    "chinasuuq://set-password?code=Outer1&redirect_to=chinasuuq%3A%2F%2Fset-password%3Fcode%3DNested2"
  );
  assert.equal(t.code, "Outer1");
});

await check("a link reporting its own failure carries error_code", () => {
  const t = m.parseAuthUrl(
    "chinasuuq://set-password?error_code=single_use_token_not_found&error_description=Link+expired"
  );
  assert.equal(t.error, "single_use_token_not_found");
  assert.equal(t.kind, "recovery");
});

console.log("auth-url: refusing to misread a non-auth link");

await check("product and order deep links are not auth tickets", () => {
  assert.equal(m.parseAuthUrl("chinasuuq://product/8f2c-uuid"), null);
  assert.equal(m.parseAuthUrl("chinasuuq://orders"), null);
  assert.equal(m.parseAuthUrl("chinasuuq://(tabs)/home"), null);
});

await check("a bare redirect_to with no credentials is not consumed", () => {
  assert.equal(
    m.parseAuthUrl("https://athkmrvsaijwgsyvwrbp.supabase.co/auth/v1/verify?type=recovery&redirect_to=chinasuuq%3A%2F%2Fset-password"),
    null,
    "a token-less verify URL cannot produce a session — treating it as one shows a false error"
  );
});

await check("empty and null input returns null instead of throwing", () => {
  assert.equal(m.parseAuthUrl(""), null);
  assert.equal(m.parseAuthUrl(null), null);
  assert.equal(m.parseAuthUrl(undefined), null);
});

await check("a malformed percent-escape is survived, not thrown", () => {
  // decodeURIComponent("%zz") throws. A throwing parser here means the reset
  // link the customer is holding does nothing at all.
  const t = m.parseAuthUrl("chinasuuq://set-password?code=%zz&type=recovery");
  assert.equal(t.kind, "recovery");
  assert.ok(t.code);
});

console.log("auth-url: the files that must agree with it");

await check("the redirect constants point at routes that exist", () => {
  const appJson = JSON.parse(readFileSync(join(ROOT, "app.json"), "utf8")).expo;
  assert.equal(appJson.scheme, "chinasuuq", "app.json must declare the scheme the links use");
  assert.equal(m.VERIFY_REDIRECT, "chinasuuq://verify-email");
  assert.equal(m.RECOVERY_REDIRECT, "chinasuuq://set-password");
  // Route groups in parentheses are stripped from the path, so (auth)/ is transparent.
  assert.ok(existsSync(join(ROOT, "app", "set-password.tsx")), "set-password route is missing");
  assert.ok(
    existsSync(join(ROOT, "app", "(auth)", "verify-email.tsx")),
    "verify-email route is missing"
  );
});

await check("the client is configured for the flow these links carry", () => {
  assert.match(clientSrc, /flowType:\s*"pkce"/, "PKCE links carry ?code=; without this the exchange is never set up");
  assert.match(clientSrc, /detectSessionInUrl:\s*false/, "RN has no URL to sniff; leaving it true hides the dead handler");
  assert.match(clientSrc, /storage:\s*AsyncStorage/, "SecureStore's ~2 KB item limit silently truncates a session");
});

await check("consumeAuthUrl is what the deep-link handler actually calls", () => {
  assert.match(clientSrc, /export async function consumeAuthUrl/);
  assert.match(
    layoutSrc,
    /consumeAuthUrl\(/,
    "_layout.tsx must route incoming URLs through consumeAuthUrl"
  );
  assert.match(layoutSrc, /getInitialURL/, "cold-start links arrive via getInitialURL, not the url event");
  assert.match(layoutSrc, /set-password/, "a recovery link must land the customer on the password screen");
});

await check("one link is consumed once, not re-fed on every app focus", () => {
  assert.match(layoutSrc, /lastUrl/, "URLs must be deduped");
  // An AppState handler that clears the dedupe key replays a single-use code and
  // the customer is told their own link "already used".
  assert.doesNotMatch(
    layoutSrc,
    /AppState[\s\S]{0,200}lastUrl\.current\s*=\s*null/,
    "resetting the dedupe key on focus replays a single-use code"
  );
});

await check("phone OTP is gone from the client and the routes", () => {
  // Phone sign-in is disabled project-wide (the live OTP endpoint answers 400
  // phone_provider_disabled), so a surviving call site is a button that cannot work.
  assert.doesNotMatch(storeSrc, /auth\.signInWithOtp/, "store still offers phone OTP");
  assert.ok(!existsSync(join(ROOT, "app", "(auth)", "phone-login.tsx")), "phone-login route still exists");
  assert.doesNotMatch(layoutSrc, /phone-login/);
});

await check("the session listener exists — a token refresh must not drop the profile", () => {
  assert.match(storeSrc, /onAuthStateChange/);
  assert.match(storeSrc, /startAuthListener/);
  assert.match(layoutSrc, /startAuthListener\(\)/);
});

console.log("");
if (failures) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log(`All auth-url checks passed. source sha256 ${createHash("sha256").update(readFileSync(MODULE, "utf8")).digest("hex").slice(0, 16)}`);
