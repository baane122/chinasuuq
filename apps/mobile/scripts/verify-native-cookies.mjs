#!/usr/bin/env node
/**
 * Regression guard for the Expo Go / iOS cookie crash.
 *
 * THE BUG: apps/mobile/app/marketplace/[marketplace].tsx did a dynamic
 * `import("@react-native-cookies/cookies")`. That package throws inside its own
 * top-level code:
 *
 *   const RNCookieManagerIOS = NativeModules.RNCookieManagerIOS;
 *   invariant(RNCookieManagerIOS, 'Add RNCookieManagerIOS.h …');   // throws here
 *
 * Because the throw happens during MODULE EVALUATION (inside Metro's module
 * registry), a try/catch around the import does not contain it: the app showed
 * an "Uncaught Error" red screen as soon as a marketplace screen loaded in
 * Expo Go on iOS.
 *
 * WHAT THIS ASSERTS — all static, no device needed:
 *  1. Exactly one module in the app imports the cookie package (the guarded
 *     helper), so no screen can regress to an unguarded import.
 *  2. That helper cannot import it before checking that the native module the
 *     invariant tests is actually registered.
 *  3. The helper never gates on Platform.OS alone (which would wrongly disable a
 *     real iOS build where the pod IS linked).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const APP = join(ROOT, "app");
const PKG = "@react-native-cookies/cookies";

let pass = 0;
const fail = [];
const ok = (name) => {
  pass += 1;
  console.log(`ok   ${name}`);
};
const bad = (name, why) => {
  fail.push(`${name}: ${why}`);
  console.log(`FAIL ${name} — ${why}`);
};

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === ".expo") continue;
      walk(p, out);
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

const files = [...walk(SRC), ...walk(APP)];

// ---- 1. exactly one importer, and it is the guarded helper ---------------
const importers = files.filter((f) => {
  const s = readFileSync(f, "utf8");
  const p = PKG.replace(/[/]/g, "\\/");
  // static import, dynamic import(), and require()
  return new RegExp(
    `from\\s+["']${p}["']` + `|import\\(\\s*["']${p}["']` + `|require\\(\\s*["']${p}["']`
  ).test(s);
});

const HELPER = join(SRC, "lib", "nativeCookies.ts");
const relHelper = relative(ROOT, HELPER);
const rel = importers.map((f) => relative(ROOT, f));

if (rel.length === 1 && rel[0] === relHelper) {
  ok(`only ${relHelper} imports ${PKG}`);
} else if (rel.length === 0) {
  bad("single importer", `nothing imports ${PKG} — staff cookie sync is dead`);
} else {
  bad(
    "single importer",
    `expected only ${relHelper}, found: ${rel.join(", ")} — an unguarded import crashes Expo Go/iOS at module load`
  );
}

// ---- 2. the helper checks the native module before importing ------------
const helper = readFileSync(HELPER, "utf8");
const guardIdx = helper.indexOf("nativeCookieModuleRegistered()");
const importIdx = helper.indexOf(`import("${PKG}")`);

if (guardIdx === -1) {
  bad("guard before import", "helper never calls nativeCookieModuleRegistered()");
} else if (importIdx === -1) {
  bad("guard before import", `helper never imports ${PKG}`);
} else if (guardIdx > importIdx) {
  bad("guard before import", "the native-module check runs AFTER the import");
} else {
  ok("helper checks the native module before importing the package");
}

// The invariant tests NativeModules.RNCookieManagerIOS / RNCookieManagerAndroid.
for (const key of ["RNCookieManagerIOS", "RNCookieManagerAndroid"]) {
  if (helper.includes(key)) ok(`helper mirrors the invariant's ${key} check`);
  else bad("mirror invariant", `helper never reads NativeModules.${key}, so it cannot predict the throw`);
}

// ---- 3. never gate on Platform.OS alone ---------------------------------
// A Platform.OS === "android" gate silently disables a real iOS build that has
// the pod linked. The helper may read Platform.OS (it must, to pick the right
// native module) but must not early-return on it alone.
if (/if\s*\(\s*Platform\.OS\s*!==\s*["']android["']\s*\)\s*\{?\s*(cached\s*=\s*null|return)/.test(helper)) {
  bad("no platform-only gate", "helper early-returns on Platform.OS !== 'android', which breaks linked iOS builds");
} else {
  ok("no platform-only gate (a linked iOS build still works)");
}

// ---- 4. the screen must not offer a button it cannot honour -------------
const screen = readFileSync(join(APP, "marketplace", "[marketplace].tsx"), "utf8");
if (screen.includes("nativeCookiesLikelyAvailable()")) {
  ok("sync button is only rendered where native cookies exist");
} else {
  bad("sync button gating", "staff sync button renders unconditionally — tapping it fails in Expo Go");
}

// ---- report -------------------------------------------------------------
console.log(`\n${pass} passed, ${fail.length} failed`);
if (fail.length) {
  console.error("\nFailures:\n" + fail.map((f) => " - " + f).join("\n"));
  process.exit(1);
}
