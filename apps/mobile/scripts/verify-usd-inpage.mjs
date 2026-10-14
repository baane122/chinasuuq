/**
 * verify-usd-inpage.mjs — executable proof for the ¥→$ price overlay.
 *
 * WHY THIS EXISTS: "the customer never sees RMB" is ChinaSuuq's headline promise,
 * and the whole promise lives in one injected string (USD_PRICE_SCRIPT) that only
 * ever runs inside a marketplace page on a phone. A wrong figure here is worse
 * than a slow screen: the customer orders the wrong item at the wrong price.
 * `tsc` proves the wrapper compiles and `expo export` proves it bundles; neither
 * proves that ¥35 becomes $5.00, that a re-sweep does not compound, or that a
 * captcha widget's price is left alone.
 *
 * This file imports the real `usdPriceScript(rate)`, runs the exact bytes it
 * returns in `node:vm` against the shared stub DOM (scripts/lib/cs-test-dom.mjs),
 * and drives sweeps the way the shared runtime heartbeat would.
 *
 * Run from apps/mobile:  npm run verify:usd
 * No device, no network. Non-zero exit on any failure.
 */

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { createContext, runInContext, Script } from "node:vm";
import {
  appendChild,
  makeElement,
  makePage,
  makeSandbox,
  makeText,
} from "./lib/cs-test-dom.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const libDir = join(here, "..", "src", "lib");

// Same stubbing trick as the translation harness: webviewUsd.ts's only import is
// the shared risk-region helper, so rewrite that ONE extensionless specifier and
// keep every line of the real script intact.
const dir = mkdtempSync(join(tmpdir(), "cs-usd-verify-"));
writeFileSync(join(dir, "risk.ts"), readFileSync(join(libDir, "webviewScripts.risk.ts"), "utf8"));
const usdSrc = readFileSync(join(libDir, "webviewUsd.ts"), "utf8");
const importLines = usdSrc.split("\n").filter((line) => /^import /.test(line));
assert.deepEqual(
  importLines.map((l) => l.trim()),
  ['import { RISK_INSIDE_FN } from "./webviewScripts.risk";'],
  "webviewUsd.ts gained or changed an import — update this harness to stub it"
);
writeFileSync(join(dir, "usd.ts"), usdSrc.replace('from "./webviewScripts.risk"', 'from "./risk.ts"'));
const usdModule = await import(pathToFileURL(join(dir, "usd.ts")).href);
const { usdPriceScript, isUsableCnyPerUsd, CNY_PER_USD_FLOOR, CNY_PER_USD_CEILING } = usdModule;

const RATE = 7; // CNY per 1 USD: ¥35 → $5.00

function compile(rate = RATE) {
  const injected = usdPriceScript(rate);
  try {
    new Script(injected);
  } catch (e) {
    assert.fail(`USD_PRICE_SCRIPT(${rate}) is not valid JavaScript as injected: ${e?.message ?? e}`);
  }
  return injected;
}

/**
 * A page plus the running script. `texts` become <div><span>¥35</span></div>
 * triples, which is how 1688/taobao/yiwugo actually mark a price, so the sweep
 * path being tested (convertTextNode) is the real one.
 */
function runScript({ texts = [], elements = [], cs = true, rate = RATE } = {}) {
  const page = makePage({ cs });
  const nodes = texts.map((t) => {
    const holder = appendChild(page.body, makeElement("div"));
    const span = appendChild(holder, makeElement("span"));
    return appendChild(span, makeText(t));
  });
  for (const el of elements) appendChild(page.body, el);
  const ctx = createContext(makeSandbox(page));
  const injected = compile(rate);
  runInContext(injected, ctx);
  page.nodes = nodes;
  page.ctx = ctx;
  page.sweep = () => Number(page.tasks.usd ? page.tasks.usd.fn() : 0);
  page.count = () => page.win.__csUsdCount || 0;
  return page;
}

// A re-injection must run against the SAME window state the first inject
// created, so what is under test is the script's own idempotency guard
// (window.__csUsdActive / __csUsdRate), not a fresh page — hence page.ctx.

/** <span>¥</span><span>35</span> — the split-span shape ChinaGoods uses. */
function splitSpanPair(symbol, number) {
  const holder = makeElement("div");
  const a = appendChild(holder, makeElement("span"));
  appendChild(a, makeText(symbol));
  const b = appendChild(holder, makeElement("span"));
  appendChild(b, makeText(number));
  return holder;
}

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + " :: " + (e?.message ?? e)]);
  }
}

// ── scenarios ──────────────────────────────────────────────────────────────────

check("a plain ¥ price becomes dollars and is stamped for restore", () => {
  const page = runScript({ texts: ["¥35"] });
  assert.equal(page.nodes[0].nodeValue, "$5.00", `got ${page.nodes[0].nodeValue}`);
  const span = page.nodes[0].parentNode;
  assert.equal(span.getAttribute("data-cs-usd"), "1", "the converted element must be tagged");
  assert.equal(span.getAttribute("data-cs-usd-orig"), "¥35", "the yuan original must be kept for restore");
  assert.equal(page.count(), 1);
});

check("fullwidth ￥ and fullwidth digits convert too", () => {
  const page = runScript({ texts: ["￥３５"] });
  assert.equal(page.nodes[0].nodeValue, "$5.00", `got ${page.nodes[0].nodeValue}`);
});

check("a price range converts both ends in one pass", () => {
  const page = runScript({ texts: ["¥35 ~ ¥43"] });
  assert.equal(page.nodes[0].nodeValue, "$5.00 ~ $6.14", `got ${page.nodes[0].nodeValue}`);
});

check("a thousands separator is a thousands separator, not a decimal point", () => {
  // ¥1,299 at 7 CNY/USD is $185.57. Reading the comma as a decimal gives $0.18
  // and leaves the trailing "9" on screen — a four-figure product priced at
  // eighteen cents, which is the kind of wrong number a customer orders.
  const page = runScript({ texts: ["¥1,299", "¥12,345,678", "¥1,299.00"] });
  assert.equal(page.nodes[0].nodeValue, "$185.57", `got ${page.nodes[0].nodeValue}`);
  assert.equal(page.nodes[1].nodeValue, "$1763668.29", `got ${page.nodes[1].nodeValue}`);
  assert.equal(page.nodes[2].nodeValue, "$185.57", `grouped with decimals: ${page.nodes[2].nodeValue}`);
});

check("a European-style decimal comma still converts as a decimal", () => {
  const page = runScript({ texts: ["¥43,5"] });
  assert.equal(page.nodes[0].nodeValue, "$6.21", `got ${page.nodes[0].nodeValue}`);
});

check("a repeated sweep never compounds an already-converted price", () => {
  const page = runScript({ texts: ["¥35"] });
  const before = page.count();
  page.sweep();
  page.sweep();
  assert.equal(page.nodes[0].nodeValue, "$5.00", "a converted price was converted again");
  assert.equal(page.count(), before, "the data-cs-usd guard let a repeat sweep spend conversions");
});

check("zero and negative figures are left alone", () => {
  const page = runScript({ texts: ["¥0", "¥0.00"] });
  assert.equal(page.nodes[0].nodeValue, "¥0", "¥0 must not become $0.00");
  assert.equal(page.nodes[1].nodeValue, "¥0.00", `got ${page.nodes[1].nodeValue}`);
});

check("a split <span>¥</span><span>35.9</span> collapses into one dollar figure", () => {
  const page = runScript({ elements: [splitSpanPair("¥", "35.9")] });
  const holder = page.body.childNodes[page.body.childNodes.length - 1];
  const [symbol, number] = holder.childNodes;
  assert.equal(symbol.textContent, "$5.13", `got ${symbol.textContent}`);
  assert.equal(number.textContent, "", "the yuan half must be emptied, not left beside the dollar");
  assert.equal(number.style.getPropertyValue("display"), "none", "the emptied node must be hidden");
  assert.equal(number.getAttribute("data-cs-usd"), "1", "the emptied node must be stamped");
});

check("a symbol followed by a text sibling converts and leaves the suffix intact", () => {
  const holder = makeElement("div");
  const symbol = appendChild(holder, makeElement("span"));
  appendChild(symbol, makeText("¥"));
  appendChild(holder, makeText("35.9 起"));
  const page = runScript({ elements: [holder] });
  assert.equal(symbol.textContent, "$5.13", `got ${symbol.textContent}`);
  const tail = holder.childNodes[1];
  assert.equal(tail.nodeValue, " 起", `the "from" suffix was lost: ${JSON.stringify(tail.nodeValue)}`);
});

check("an aria-label price converts and remembers its original", () => {
  const holder = makeElement("div", { attrs: { "aria-label": "立即购买折后￥605.4起" } });
  const page = runScript({ elements: [holder] });
  assert.equal(
    holder.getAttribute("aria-label"),
    "立即购买折后$86.49起",
    `got ${holder.getAttribute("aria-label")}`
  );
  assert.equal(holder.getAttribute("data-cs-usd-orig"), "aria:立即购买折后￥605.4起");
});

check("prices inside a risk widget are not rewritten", () => {
  // Same contract as the translation guard: the risk engine fingerprints its own
  // text, so our overlay must not touch a slider/captcha subtree.
  const risk = makeElement("div", { className: "-slider-wrap" });
  const holder = appendChild(risk, makeElement("span"));
  const node = appendChild(holder, makeText("¥35"));
  runScript({ elements: [risk] });
  assert.equal(node.nodeValue, "¥35", "a price inside the captcha region was rewritten");
});

check("prices inside a <script> are not rewritten", () => {
  const holder = makeElement("div");
  const script = appendChild(holder, makeElement("script"));
  const node = appendChild(script, makeText('var price = "¥35";'));
  runScript({ elements: [holder] });
  assert.equal(node.nodeValue, 'var price = "¥35";', "inline script text was rewritten");
});

check("a split symbol plus a grouped figure converts the whole price", () => {
  const page = runScript({ elements: [splitSpanPair("¥", "1,299.00")] });
  const holder = page.body.childNodes[page.body.childNodes.length - 1];
  const [symbol, number] = holder.childNodes;
  assert.equal(symbol.textContent, "$185.57", `got ${symbol.textContent}`);
  assert.equal(number.textContent, "", `the yuan half kept residue: ${JSON.stringify(number.textContent)}`);
});

check("__csUsdRestore puts every yuan price back on screen", () => {
  const page = runScript({ texts: ["¥35"] });
  assert.equal(page.nodes[0].nodeValue, "$5.00");
  const span = page.nodes[0].parentNode;
  page.win.__csUsdRestore();
  // restore writes el.textContent, which replaces the text node — assert on the
  // element, the thing the customer actually sees.
  assert.equal(span.textContent, "¥35", "restore did not put the yuan price back");
  assert.equal(span.getAttribute("data-cs-usd"), null, "restore left the stamp behind");
  assert.equal(span.getAttribute("data-cs-usd-orig"), null);
});

check("a re-inject at the same rate does not stack a second sweep", () => {
  const page = runScript({ texts: ["¥35"] });
  const addedBefore = page.tasks.usd.added;
  runInContext(compile(RATE), page.ctx);
  assert.equal(page.tasks.usd.added, addedBefore, "the idempotency guard let a second task register");
  assert.equal(page.timers.length, 1, `re-inject scheduled ${page.timers.length} sweeps`);
});

check("a new rate re-installs and converts with the new rate", () => {
  const page = runScript({ texts: ["¥70"] });
  const span = page.nodes[0].parentNode;
  assert.equal(span.textContent, "$10.00", `got ${span.textContent}`);
  // The FX figure changed: the app restores, then re-injects at the new rate.
  page.win.__csUsdRestore();
  assert.equal(span.textContent, "¥70", "restore did not put the yuan price back");
  runInContext(compile(14), page.ctx);
  assert.equal(span.textContent, "$5.00", `the new rate was ignored: ${span.textContent}`);
});

check("no usable FX figure means no overlay at all", () => {
  for (const bad of [0, -7, 0.0001, 700, 21, "abc", {}, [], null, undefined, NaN]) {
    assert.equal(isUsableCnyPerUsd(bad), false, `${String(bad)} was accepted as a CNY-per-USD rate`);
    assert.equal(usdPriceScript(bad), "", `an overlay was built from the unusable rate ${String(bad)}`);
  }
  // A numeric string is still a plausible rate — the FX store caches JSON.
  assert.equal(isUsableCnyPerUsd("7"), true, "a numeric string rate was rejected");
  assert.ok(usdPriceScript("7").length > 200, "no overlay built from the string form of a valid rate");
  for (const good of [CNY_PER_USD_FLOOR, 7, CNY_PER_USD_CEILING]) {
    assert.equal(isUsableCnyPerUsd(good), true, `${good} is inside the documented band`);
    assert.ok(usdPriceScript(good).length > 200, "the overlay did not build at a valid rate");
  }
});

check("without the shared runtime the fallback still sweeps on its own timer", () => {
  const page = runScript({ texts: ["¥35"], cs: false });
  assert.equal(page.nodes[0].nodeValue, "$5.00", "the no-runtime fallback did not convert on inject");
  assert.equal(page.intervals.filter((i) => !i.cleared).length, 1, "the fallback interval is missing or stacked");
  assert.equal(page.observers.length >= 1, true, "the fallback observer was never attached");
  page.timers.forEach((t) => t.fn()); // the five follow-up sweeps
  page.intervals[0].fn();
  assert.equal(page.nodes[0].nodeValue, "$5.00", "a fallback sweep corrupted an already-converted price");
});

// ── report ─────────────────────────────────────────────────────────────────────
let failed = 0;
for (const [status, name] of results) {
  if (status === "FAIL") failed++;
  console.log(`${status === "PASS" ? "  ok  " : " FAIL "} ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} price-overlay behaviours verified against USD_PRICE_SCRIPT.`);
process.exit(failed ? 1 : 0);
