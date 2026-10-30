#!/usr/bin/env node
/**
 * verify-usd-worded.mjs — proves the price overlay converts yiwugo/ChinaGoods
 * style prices, not just leading-¥ ones.
 *
 * THE BUG: convertTextNode() began with
 *
 *   if (t.indexOf("¥") === -1 && t.indexOf("￥") === -1) return;
 *
 * so a page printing "35.00元", "价格：88" or "RMB 120" was skipped entirely.
 * YiwuGo and ChinaGoods print exactly those forms on their mobile pages, which
 * is why the owner reported "the exchange is not working" on yiwugo and "some
 * others" while 1688 looked fine: 1688 prints ¥, they print 元 / labels.
 * `walk()` had the same ¥-only prefilter, so widening the regexes alone would
 * not have fixed it — both gates are asserted here.
 *
 * This evaluates the REAL injected script against a stub DOM. It also asserts
 * the cases that must NOT convert (weights, counts, ids), because over-matching
 * is the worse failure: it would turn "500g" into "$71".
 *
 * TWO HARNESS TRAPS this file documents, both of which produced false results
 * before they were fixed — worth knowing if you edit it:
 *
 *  1. The script is a JS string inside a TS template literal. Slicing the
 *     SOURCE gives `/\\s?/` (doubled backslash), which as a runtime regex means
 *     "a literal backslash then s" — nothing ever matches. The escapes must be
 *     undone exactly as the JS engine would do it.
 *  2. The injected script is idempotent: it sets window.__csUsdActive and
 *     returns early on re-injection at the same rate. Reusing one global
 *     `window` across test cases makes every case after the first a no-op, so
 *     each run needs a FRESH window.
 *
 * Run from apps/mobile:  node scripts/verify-usd-worded.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const RATE = 6.6;

// --- extract the injected script from the TypeScript source ---------------
const src = readFileSync(join(ROOT, "src", "lib", "webviewUsd.ts"), "utf8");
const fnStart = src.indexOf("export function usdPriceScript");
const tmplStart = src.indexOf("`", fnStart);
let tmplEnd = -1;
for (let i = tmplStart + 1; i < src.length; i++) {
  if (src[i] === "\\") { i++; continue; }
  if (src[i] === "`") { tmplEnd = i; break; }
}
if (tmplEnd === -1) {
  console.error("FAIL could not locate the script template literal");
  process.exit(1);
}

let script = src.slice(tmplStart + 1, tmplEnd);
// Trap 1: undo the template-literal escaping (see the header comment).
script = script
  .replace(/\\`/g, "`")
  .replace(/\\\$/g, "$")
  .replace(/\\\\/g, "\\");
// Then fill the TS interpolations.
script = script.replace(/\$\{RISK_INSIDE_FN\}/g, "function __csInRisk(){ return false; }");
script = script.replace(/\$\{rate\}/g, String(RATE));
script = script.replace(/\$\{SWEEP_INTERVAL_MS\}/g, "900");
script = script.replace(/\$\{[^}]+\}/g, "0");

// --- minimal DOM stub -----------------------------------------------------
class TextNode {
  constructor(value) {
    this.nodeValue = value;
    this.parentElement = null;
  }
}
class El {
  constructor(tag = "DIV") {
    this.tagName = tag;
    this.attrs = {};
    this.parentElement = null;
    this.childNodes = [];
    this.style = { removeProperty() {} };
  }
  getAttribute(k) { return this.attrs[k] ?? null; }
  setAttribute(k, v) { this.attrs[k] = v; }
  removeAttribute(k) { delete this.attrs[k]; }
  append(...nodes) {
    for (const n of nodes) {
      n.parentElement = this;
      this.childNodes.push(n);
    }
    return this;
  }
  querySelectorAll() { return []; }
  querySelector() { return null; }
}

function makeDoc(parts) {
  const body = new El("BODY");
  const host = new El("DIV");
  const nodes = parts.map((t) => {
    const n = new TextNode(t);
    host.append(n);
    return n;
  });
  body.append(host);
  const doc = {
    body,
    documentElement: body,
    readyState: "complete",
    createTreeWalker() {
      let i = 0;
      return {
        nextNode() {
          while (i < nodes.length) {
            const n = nodes[i++];
            if (n.nodeValue && n.nodeValue.trim()) return n;
          }
          return null;
        },
      };
    },
    addEventListener() {},
    removeEventListener() {},
    querySelectorAll() { return []; },
    querySelector() { return null; },
  };
  return { doc, nodes };
}

/** Trap 2: a fresh window per case — the script is idempotent per rate. */
function makeWin() {
  return {
    innerWidth: 400,
    __csInRisk: () => false,
    // The fast path needs the shared in-page runtime: it runs one immediate
    // sweep() then registers itself as the "usd" task. Capture the fn so the
    // harness can drive it deterministically.
    __cs: {
      tasks: {},
      add(name, spec) { this.tasks[name] = spec; this.last = spec.fn; },
      stop() {},
      text() { return ""; },
    },
    setTimeout(fn) { try { fn(); } catch { /* ignore */ } return 1; },
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    addEventListener() {},
    MutationObserver: class {
      observe() {}
      disconnect() {}
      takeRecords() { return []; }
    },
  };
}

let pass = 0;
const fail = [];
const ok = (n) => { pass += 1; console.log(`ok   ${n}`); };
const bad = (n, why) => { fail.push(`${n}: ${why}`); console.log(`FAIL ${n} — ${why}`); };

function run(texts) {
  const { doc, nodes } = makeDoc(texts);
  const win = makeWin();
  const g = {
    window: win,
    document: doc,
    Set, Map, Math, Date, JSON, Number, String,
    parseFloat, isNaN, RegExp, Object, Array, Boolean, Error,
    NodeFilter: { SHOW_TEXT: 4 },
  };
  // SAFETY: `script` comes from this repo's own src/lib/webviewUsd.ts at test
  // time — the code we ship, not external input. Evaluating it is the point of
  // the harness: tsc cannot check a JS template literal and this behaviour only
  // exists inside a real DOM.
  const fn = new Function(...Object.keys(g), script);
  fn(...Object.values(g));
  if (typeof win.__cs.last === "function") win.__cs.last();
  return nodes.map((n) => n.nodeValue);
}

const usd = (n) => "$" + (n / RATE).toFixed(2);

// --- must convert ---------------------------------------------------------
const positives = [
  ["¥35", usd(35), "leading ¥ (1688)"],
  ["35.00元", usd(35), "suffixed 元 (yiwugo)"],
  ["价格：88", "价格：" + usd(88), "labelled price (ChinaGoods)"],
  ["RMB 120", "RMB " + usd(120), "CNY/RMB code"],
  // The label 批发价 is preserved on purpose: it is the marketplace's own
  // wording and stripping it would read as a broken page.
  ["批发价 6.50元起", "批发价 " + usd(6.5) + "起", "compound with 元 (label kept)"],
];
for (const [input, expected, label] of positives) {
  const out = run([input])[0];
  if (out === expected) ok(`converts ${label} ("${input}" → "${out}")`);
  else bad(label, `expected "${expected}", got "${out}"`);
}

// --- must NOT convert -----------------------------------------------------
const negatives = [
  ["500g", "a weight"],
  ["2024", "a bare number / year"],
  ["规格 20", "a spec count"],
  ["库存 300", "a stock count"],
  ["id 888888", "an identifier"],
];
for (const [text, label] of negatives) {
  const out = run([text])[0];
  if (out === text) ok(`does NOT convert ${label} ("${text}")`);
  else bad(`over-match on ${label}`, `"${text}" became "${out}"`);
}

// --- the rate band still gates the whole overlay -------------------------
if (/if\s*\(\s*!isUsableCnyPerUsd|isUsableCnyPerUsd\(/.test(src)) {
  ok("an implausible rate disables the overlay");
} else {
  bad("rate guard", "usdPriceScript does not guard the rate band");
}

console.log(`\n${pass} passed, ${fail.length} failed`);
if (fail.length) {
  console.error("\nFailures:\n" + fail.map((f) => " - " + f).join("\n"));
  process.exit(1);
}
