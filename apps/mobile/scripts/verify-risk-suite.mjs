#!/usr/bin/env node
/**
 * verify-risk-suite.mjs — regression guard for the risk-wall injection path.
 *
 * THE BUG THIS GUARDS: runPerPageScripts() in app/marketplace/[marketplace].tsx
 * used to early-return from its risk-wall branch with only
 * [CS_RUNTIME, NAV_WATCH, RISK_WATCH] — no price overlay, no translation. The
 * practical effect: Taobao and the other login-walled marketplaces sit behind a
 * verification wall for the first seconds of every session, and while that wall
 * was up the prices stayed in raw ¥ and the text stayed Chinese. On a mobile
 * connection that is most of the first page view, which is why it read as "some
 * marketplaces don't convert or translate".
 *
 * The fix keeps the DOM-safe subset (runtime + watchers are harmless) and adds
 * the USD overlay and the translation task, both of which walk TEXT NODES and
 * skip anything inside a captcha container via RISK_INSIDE_FN — so the slide
 * puzzle's own DOM is never rewritten.
 *
 * This asserts the invariant statically, so a future refactor cannot silently
 * drop the overlay or the translation from that branch again.
 *
 * Run from apps/mobile:  node scripts/verify-risk-suite.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SCREEN = join(ROOT, "app", "marketplace", "[marketplace].tsx");
const src = readFileSync(SCREEN, "utf8");

let pass = 0;
const fail = [];
const ok = (n) => {
  pass += 1;
  console.log(`ok   ${n}`);
};
const bad = (n, why) => {
  fail.push(`${n}: ${why}`);
  console.log(`FAIL ${n} — ${why}`);
};

// Locate the risk-wall branch: `if (riskActiveRef.current) { ... return; }`
const start = src.indexOf("if (riskActiveRef.current) {");
if (start === -1) {
  bad("risk branch exists", "no `if (riskActiveRef.current)` branch found in runPerPageScripts");
} else {
  ok("risk branch exists");
  // Take the branch body up to the closing `return;` that ends it.
  const endMarker = src.indexOf("return;", start);
  const end = endMarker === -1 ? start + 2000 : endMarker;
  const branch = src.slice(start, end);

  const checks = [
    ["runtime script in risk branch", "CS_RUNTIME_SCRIPT", "the shared scheduler must still be installed"],
    ["nav watcher in risk branch", "NAV_WATCH_SCRIPT", "SPA route detection must survive the wall"],
    ["risk watcher in risk branch", "RISK_WATCH_SCRIPT", "the wall must stay observable so we can clear it"],
    ["USD overlay in risk branch", "usdPriceScript(fxRate)", "prices must convert while a login wall is up"],
    ["translation task in risk branch", "AI_TRANSLATE_SCRIPT", "text must translate while a login wall is up"],
  ];

  for (const [name, needle, why] of checks) {
    if (branch.includes(needle)) ok(name);
    else bad(name, `${needle} missing — ${why}`);
  }

  // The overlay + translation must be gated by the same user toggles as the
  // normal path, not forced on.
  if (/riskUsd\s*=\s*usdOn\s*\?/.test(branch)) {
    ok("USD overlay still respects the $ toggle");
  } else {
    bad("USD overlay gating", "risk branch forces the overlay on regardless of usdOn");
  }

  if (/if\s*\(\s*translateLang\s*\)/.test(branch)) {
    ok("translation still respects the language toggle");
  } else {
    bad("translation gating", "risk branch ignores translateLang (would fight 'show original')");
  }
}

// The price overlay and the translate script must both consult the captcha
// guard, or they will rewrite the verification widget's own text.
const usd = readFileSync(join(ROOT, "src", "lib", "webviewUsd.ts"), "utf8");
if (usd.includes("RISK_INSIDE_FN")) ok("USD overlay skips captcha containers");
else bad("USD overlay captcha guard", "webviewUsd.ts does not use RISK_INSIDE_FN");

const ai = readFileSync(join(ROOT, "src", "lib", "webviewScripts.ai.ts"), "utf8");
if (ai.includes("RISK_INSIDE_FN") || ai.includes("riskInside")) {
  ok("translation skips captcha containers");
} else {
  bad("translation captcha guard", "webviewScripts.ai.ts does not skip captcha containers");
}

// The translation race: the stored language is read asynchronously, so a fast
// first page can beat it. The fix re-pushes the task once the pref resolves.
if (/earlySuiteRef\.current[\s\S]{0,400}AI_TRANSLATE_SCRIPT/.test(src)) {
  ok("stored language re-pushes translation when it loses the race");
} else {
  bad(
    "translation race",
    "no earlySuiteRef + AI_TRANSLATE_SCRIPT re-push — fast marketplaces stay untranslated on first load"
  );
}

console.log(`\n${pass} passed, ${fail.length} failed`);
if (fail.length) {
  console.error("\nFailures:\n" + fail.map((f) => " - " + f).join("\n"));
  process.exit(1);
}
