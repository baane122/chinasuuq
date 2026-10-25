/**
 * verify-translate-inpage.mjs — executable proof for the in-page translation pipeline.
 *
 * WHY THIS EXISTS: the other two gates cover half of the feature each.
 * `verify-cs-runtime.mjs` proves the shared scheduler (`window.__cs`);
 * `verify-translate-client.mjs` proves the RN side (`src/api/translate.ts`).
 * The piece in between — `AI_TRANSLATE_SCRIPT`, the JS string that runs INSIDE
 * 1688/taobao/yiwugo/chinagoods/dollarstore — decides whether a customer sees
 * Somali/English text or Chinese, and it is the only place that owns the DOM
 * marks the app depends on (`data-cs-orig`, `data-cs-tr`) plus the failure path
 * (`__csTranslateFailed`) that stops a dead server from leaving a page half
 * translated forever. Nothing else can execute it: it needs a document.
 *
 * So this file imports the REAL module (Node type stripping, byte-for-byte the
 * same string the app injects), runs it against a stub document in `node:vm`,
 * and drives the passes the way the shared heartbeat would.
 *
 * WHAT THE PIPELINE NOW IS: the page never touches the network. It posts
 * TRANSLATE_REQUEST, the app answers from src/api/translate.ts (Google's free
 * endpoint since the owner took translation off the paid edge function), and the
 * page applies the reply. Which makes the in-page contract — one batch in flight,
 * a hard per-page text budget, no self-installed interval, the data-cs-orig /
 * data-cs-tr stamps and the __csTranslateFailed refund path — the only thing this
 * gate can regress.
 *
 * Run from apps/mobile:  npm run verify:translate-inpage
 * No device, no network, no paid provider call. Non-zero exit on any failure.
 */

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { createContext, runInContext, Script } from "node:vm";
import {
  makeElement,
  makeText,
  appendChild,
  makePage as makeBasePage,
  makeSandbox,
} from "./lib/cs-test-dom.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const libDir = join(here, "..", "src", "lib");

// ── the real injected source, with its one interpolation resolved ──────────────
// webviewScripts.ai.ts imports webviewScripts.risk.ts extensionlessly, which
// Node's ESM resolver rejects; rewriting ONLY that specifier keeps the template
// literal — and therefore the injected bytes — untouched.
const dir = mkdtempSync(join(tmpdir(), "cs-inpage-verify-"));
const riskSrc = readFileSync(join(libDir, "webviewScripts.risk.ts"), "utf8");
const aiSrc = readFileSync(join(libDir, "webviewScripts.ai.ts"), "utf8");
// The stubbing below is only safe while this module has that ONE environment
// boundary. If a second import appears, this harness must be taught to stub it
// rather than silently importing app code into Node.
const importLines = aiSrc.split("\n").filter((line) => /^import /.test(line));
assert.deepEqual(
  importLines.map((l) => l.trim()),
  ['import { RISK_INSIDE_FN } from "./webviewScripts.risk";'],
  "webviewScripts.ai.ts gained or changed an import — update this harness to stub it"
);
writeFileSync(join(dir, "risk.ts"), riskSrc);
writeFileSync(
  join(dir, "ai.ts"),
  aiSrc.replace('from "./webviewScripts.risk"', 'from "./risk.ts"')
);
const aiModule = await import(pathToFileURL(join(dir, "ai.ts")).href);
const INJECTED = aiModule.AI_TRANSLATE_SCRIPT;
assert.ok(typeof INJECTED === "string" && INJECTED.includes("__csTranslateFailed"), "AI_TRANSLATE_SCRIPT did not load");
assert.ok(!INJECTED.includes("${"), "the injected script still contains an unresolved interpolation");
// Cheap, high-value: this string is a template literal, so a stray backtick in a
// comment truncates the injected JS (and only shows up as a broken page on a
// phone). Compiling it here turns that into a red CI run.
try {
  new Script(INJECTED);
} catch (e) {
  assert.fail(`AI_TRANSLATE_SCRIPT is not valid JavaScript as injected: ${e?.message ?? e}`);
}

// ── stub document ──────────────────────────────────────────────────────────────
// The shared duck-typed DOM (scripts/lib/cs-test-dom.mjs) is what the USD overlay
// harness runs against too, so both gates test the same fake page. This file only
// adds what the translation pipeline needs on top: per-text wrapper elements
// (the stamp contract is per-parent) and the vm context.

let label = 0;
const ZH = () => `测试商品${++label}`;

/**
 * A fresh page + fresh script instance. `window.__csAiTrState` is module state
 * on purpose (idempotent re-injection), so every scenario needs its own context
 * or the previous page's budget and cache leak into it.
 */
function makePage({ cs = true, texts, wrappers = [], ownWrapper = true, href } = {}) {
  const page = makeBasePage({ cs, href });
  // Each text normally gets its OWN parent element, because the stamp contract
  // is per-parent (data-cs-orig lives on parentNode). A page where every Chinese
  // node shared one parent would legitimately only translate once.
  const chain = wrappers.reduce(
    (parent, w) => appendChild(parent, makeElement(w.tag || "div", w)),
    page.body
  );
  const nodes = (texts || []).map((t) => {
    const parent = ownWrapper ? appendChild(chain, makeElement("div")) : chain;
    return appendChild(parent, makeText(t));
  });
  const ctx = createContext(makeSandbox(page));
  const { timers, messages, body } = page;
  const csTasks = page.tasks;
  const out = {
    body,
    nodes,
    timers,
    messages,
    csTasks,
    ctx,
    // The app injects the target language immediately before the script.
    inject(lang = "en") {
      runInContext(`window.__CS_TL=${JSON.stringify(lang)};${INJECTED}`, ctx);
    },
    // One pass of the shared heartbeat for the translate task.
    pass() {
      return csTasks.translate ? Number(csTasks.translate.fn()) : 0;
    },
    requested() {
      return messages.flatMap((m) => m.texts || []);
    },
    // A late-mounted node (SPA content, lazy image caption, scrolled-in block).
    addText(value) {
      const node = appendChild(appendChild(body, makeElement("div")), makeText(value));
      nodes.push(node);
      return node;
    },
    apply(originals, translated) {
      runInContext(
        `window.__csApplyTranslations(${JSON.stringify(originals)}, ${JSON.stringify(translated)});`,
        ctx
      );
    },
    fail(originals) {
      runInContext(`window.__csTranslateFailed(${JSON.stringify(originals)});`, ctx);
    },
    state: () => runInContext("window.__csAiTrState", ctx),
  };
  return out;
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

check("one pass posts one flat request and stamps every node it asked about", () => {
  const texts = ["免费包邮", "高品质", "限时折扣"];
  const page = makePage({ texts });
  page.inject("en");
  page.pass();
  assert.equal(page.messages.length, 1, `expected 1 message, got ${page.messages.length}`);
  assert.equal(page.messages[0].type, "TRANSLATE_REQUEST");
  assert.equal(page.messages[0].targetLang, "en");
  assert.deepEqual(page.messages[0].texts, texts);
  for (const node of page.nodes) {
    const p = node.parentNode;
    assert.equal(p.getAttribute("data-cs-tr"), "1", "requested node must be stamped");
    assert.equal(p.getAttribute("data-cs-orig"), node.nodeValue, "stamp must carry the original");
  }
});

check("a pass never posts more than the app's 40-text batch cap", () => {
  const texts = Array.from({ length: 90 }, () => ZH());
  const page = makePage({ texts });
  page.inject("en");
  page.pass();
  assert.equal(page.messages[0].texts.length, 40, "GROUP_SIZE must stay at src/api/translate.ts's batch cap");
});

check("ONE batch in flight: a pass while a request is unanswered posts nothing", () => {
  // The policy that replaced the old self-fetching script: the page may never
  // stack requests behind each other, because a queue of hanging fetches is
  // what made every marketplace page crawl before d75318c.
  const texts = Array.from({ length: 80 }, () => ZH());
  const page = makePage({ texts });
  page.inject("en");
  page.pass();
  assert.equal(page.messages.length, 1);
  page.pass();
  page.pass();
  assert.equal(page.messages.length, 1, "the page stacked a second request behind an unanswered one");
  assert.equal(page.state().requests, 40, "a blocked pass spent budget it never asked about");
  assert.equal(page.state().inflight, 1, "the in-flight guard must stay set until the answer arrives");
  const batch = page.messages[0].texts;
  page.apply(batch, batch.map((text) => "EN " + text));
  assert.equal(page.state().inflight, 0, "an answer must release the guard");
  page.pass();
  assert.equal(page.messages.length, 2, "the page never resumed after its batch was answered");
});

check("a batch the app never answers is abandoned, not waited on forever", () => {
  const texts = Array.from({ length: 90 }, () => ZH());
  const page = makePage({ texts });
  page.inject("en");
  page.pass(); // posted, and the app is never going to answer
  page.pass();
  page.pass();
  assert.equal(page.messages.length, 1, "the guard released before STALE_TICKS unanswered passes");
  page.pass(); // the stale pass: release the batch and carry on with the page
  assert.equal(page.messages.length, 2, "an unanswered batch froze the page forever");
  assert.equal(page.state().inflight, 1, "the replacement batch must re-arm the guard");
});

check("the same string on two nodes costs one request, and one answer covers both", () => {
  const page = makePage({ texts: ["全新上市", "全新上市"] });
  page.inject("en");
  page.pass();
  assert.deepEqual(page.messages[0].texts, ["全新上市"], "duplicates must collapse on the wire");
  assert.equal(page.state().map["全新上市"].length, 2, "both live nodes must share one request key");
  page.apply(["全新上市"], ["Brand new"]);
  assert.deepEqual(
    page.nodes.map((n) => n.nodeValue),
    ["Brand new", "Brand new"],
    "the answer must reach every attached node"
  );
});

check("an already-translated string is applied free, with no new request", () => {
  const page = makePage({ texts: ["热卖爆款"] });
  page.inject("en");
  page.pass();
  page.apply(["热卖爆款"], ["Hot seller"]);
  const before = page.messages.length;
  const late = page.addText("热卖爆款"); // another copy mounts (SPA/scroll)
  page.pass();
  assert.equal(page.messages.length, before, "a known string triggered a paid request");
  assert.equal(late.nodeValue, "Hot seller", "the new copy stayed Chinese");
});

check("collect() ignores nodes it already stamped", () => {
  const page = makePage({ texts: ["工厂直销"] });
  page.inject("en");
  page.pass();
  page.pass();
  page.pass();
  assert.equal(page.messages.length, 1, "stamped nodes were re-requested on every pass");
});

check("__csTranslateFailed un-stamps, refunds budget, and re-queues the text", () => {
  const texts = ["批发价格", "支持定制"];
  const page = makePage({ texts });
  page.inject("en");
  page.pass();
  assert.equal(page.state().requests, 2);
  page.fail(texts);
  assert.equal(page.state().requests, 0, "a failed batch must refund its text budget");
  assert.equal(page.state().pending["批发价格"], undefined, "the string must stop being pending");
  for (const node of page.nodes) {
    assert.equal(node.parentNode.getAttribute("data-cs-tr"), null, "failed nodes must be un-stamped");
    assert.equal(node.parentNode.getAttribute("data-cs-orig"), null);
    assert.match(node.nodeValue, /[\u4e00-\u9fff]/, "failed text must still show its original");
  }
  page.pass();
  assert.equal(page.messages.length, 2, "un-stamped text must be collected again");
  assert.deepEqual(page.messages[1].texts, texts);
});

check("a string is abandoned after 3 failures instead of retrying forever", () => {
  const texts = ["海运双清"];
  const page = makePage({ texts });
  page.inject("en");
  for (let attempt = 1; attempt <= 3; attempt++) {
    page.pass();
    assert.equal(page.messages.length, attempt, `attempt ${attempt} did not request the text`);
    page.fail(texts);
  }
  assert.equal(page.state().done["海运双清"], true, "the give-up flag is missing after MAX_FAILS");
  page.pass();
  assert.equal(page.messages.length, 3, "an abandoned string kept being requested (infinite retry loop)");
  // The giving-up pass never refunded its last request — that budget is spent, and
  // only one string was involved, so exactly 1 of the 120-slot budget remains used.
  assert.equal(page.state().requests, 1, `unexpected budget accounting after giving up: ${page.state().requests}`);
});

check("a mixed batch keeps the answered text and releases only the failed one", () => {
  const page = makePage({ texts: ["正品保证", "假一赔十"] });
  page.inject("en");
  page.pass();
  assert.deepEqual(page.messages[0].texts, ["正品保证", "假一赔十"]);
  // The edge function answered one string and the app reported the other as failed.
  page.apply(["正品保证"], ["Genuine guarantee"]);
  page.fail(["假一赔十"]);
  assert.equal(page.nodes[0].nodeValue, "Genuine guarantee", "a translated node must not be reverted");
  assert.match(page.nodes[1].nodeValue, /[\u4e00-\u9fff]/, "the failed string stays Chinese");
  assert.equal(page.nodes[1].parentNode.getAttribute("data-cs-tr"), null, "the failed node must be un-stamped");
  assert.equal(page.nodes[0].parentNode.getAttribute("data-cs-tr"), "1", "the healthy node must keep its stamp");
  page.pass();
  assert.deepEqual(page.messages[1].texts, ["假一赔十"], "the healthy string must not be re-requested");
});

check("the per-page text budget stops the pipeline at 120 strings", () => {
  const texts = Array.from({ length: 130 }, () => ZH());
  const page = makePage({ texts });
  page.inject("en");
  // The batch cap is a HARD budget, not a rate: a page may never ask for more
  // than 120 distinct strings for one target language, however long it keeps
  // mounting content. Each pass is answered here because one batch in flight is
  // the policy (see the scenario above) — the loop only continues when the app
  // actually replied, which is exactly what a real page does.
  for (let i = 0; i < 6; i++) {
    const before = page.messages.length;
    page.pass();
    if (page.messages.length > before) {
      const batch = page.messages[page.messages.length - 1].texts;
      page.apply(batch, batch.map((text) => "EN " + text));
    }
  }
  assert.equal(page.messages.length, 3, `expected 3 batches (40+40+40), got ${page.messages.length}`);
  assert.equal(page.requested().length, 120, "the 120-text budget is not enforced");
  assert.equal(page.state().requests, 120);
});

check("switching target language restores the originals before re-translating", () => {
  const texts = ["新款上市"];
  const page = makePage({ texts });
  page.inject("en");
  page.pass();
  page.apply(["新款上市"], ["New arrival"]);
  assert.equal(page.nodes[0].nodeValue, "New arrival");
  page.inject("so");
  assert.equal(page.nodes[0].nodeValue, "新款上市", "a language switch must restore the Chinese original");
  assert.equal(page.nodes[0].parentNode.getAttribute("data-cs-orig"), null, "the stamp must be cleared");
  page.pass();
  assert.equal(page.messages.length, 2);
  assert.equal(page.messages[1].targetLang, "so", "the re-request must go to the new target");
  assert.deepEqual(page.messages[1].texts, ["新款上市"], "the new pass must run against the ORIGINAL text");
});

check("risk-region text is never translated, even as a direct child of the widget", () => {
  // A slide-captcha / risk dialog keeps its own Chinese text and node identity:
  // rewriting it changes what the risk engine fingerprints (observed as an
  // unusable verification widget). ownWrapper:false puts the text DIRECTLY in
  // the flagged element, which is the shape 1688's slider uses and the shape the
  // old shouldSkip() walk from el.parentElement silently failed to cover.
  const page = makePage({
    texts: ["请拖动滑块完成验证", "安全检测中"],
    wrappers: [{ tag: "div", id: "nc_1_wrapper" }],
    ownWrapper: false,
  });
  page.inject("en");
  page.pass();
  assert.equal(page.messages.length, 0, `risk-widget text was sent for translation: ${JSON.stringify(page.messages)}`);
  for (const node of page.nodes) {
    assert.match(node.nodeValue, /[\u4e00-\u9fff]/, "risk-widget text must stay untouched");
  }
  // and the rest of the page still translates normally
  const ok1 = page.addText("现货批发");
  page.pass();
  assert.deepEqual(page.requested(), ["现货批发"], "the risk guard blocked the whole page");
  page.apply(["现货批发"], ["In stock"]);
  assert.equal(ok1.nodeValue, "In stock");
});

check("skip-tag content (script/style) is not collected", () => {
  const page = makePage({ texts: ["立即购买"] });
  const script = appendChild(page.body, makeElement("script"));
  appendChild(script, makeText("免费试用")); // Chinese string inside inline JS
  page.inject("en");
  page.pass();
  assert.deepEqual(page.requested(), ["立即购买"], "script text leaked into the translation request");
  assert.match(script.childNodes[0].nodeValue, /[\u4e00-\u9fff]/, "inline script text was rewritten");
});

check("re-injection for the same page+target reuses the task instead of stacking timers", () => {
  const page = makePage({ texts: ["现货秒发"] });
  page.inject("en");
  page.pass();
  const requestsBefore = page.state().requests;
  page.inject("en");
  assert.equal(page.timers.length, 0, "a second timer chain was started while window.__cs drives the task");
  assert.equal(page.csTasks.translate.resets, 1, "the shared scheduler was not asked to wake the task");
  assert.equal(page.state().requests, requestsBefore, "re-injection double-spent the budget");
});

check("without window.__cs the private fallback still runs exactly one timer", () => {
  const page = makePage({ texts: ["海外直邮"], cs: false });
  page.inject("en");
  assert.equal(page.timers.length, 1, `fallback started ${page.timers.length} timers`);
  page.inject("en");
  assert.equal(page.timers.filter((t) => !t.cleared).length, 1, "a second injection stacked a timer chain");
  page.timers[0].fn(); // first scheduled pass
  assert.deepEqual(page.requested(), ["海外直邮"]);
});

check("a fresh SPA route resets the budget and the cache", () => {
  const page = makePage({ texts: ["一件代发"] });
  page.inject("en");
  page.pass();
  page.apply(["一件代发"], ["Dropship"]);
  runInContext('location.href = "https://detail.1688.com/next-product.html";', page.ctx);
  const fresh = page.addText("支持退换"); // content of the route just mounted
  page.inject("en");
  assert.equal(page.state().requests, 0, "the budget carried over to the new route");
  assert.equal(page.state().results["一件代发"], undefined, "the answer cache carried over to the new route");
  page.pass();
  assert.deepEqual(page.messages[page.messages.length - 1].texts, ["支持退换"], "text on the new route was not requested");
  assert.equal(fresh.parentNode.getAttribute("data-cs-tr"), "1", "the new route did not stamp its nodes");
});

check("the script installs no self-owned interval (the d75318c regression)", () => {
  // WHY THIS EXISTS: the translator deleted in d75318c re-installed a permanent
  // 600ms interval plus a MutationObserver, and its hanging in-page fetches made
  // every marketplace page crawl. Whatever backend answers the texts, the page
  // must never own a repeating timer again — this fails the build if one returns.
  const page = makePage({ texts: ["现货批发"] });
  runInContext(
    "window.__intervals = []; setInterval = function (fn, ms) { window.__intervals.push(ms); return 1; };",
    page.ctx
  );
  page.inject("en");
  for (let i = 0; i < 12; i++) page.pass();
  // `.length` is compared inside the realm on purpose: assert.deepEqual against a
  // host [] fails on the cross-realm prototype, not on the behaviour.
  assert.equal(
    runInContext("window.__intervals.length", page.ctx),
    0,
    "AI_TRANSLATE_SCRIPT re-introduced a self-installed interval"
  );
  assert.ok(page.state().inflight <= 1, "more than one batch is in flight");
});

check("pagehide tears the pipeline down instead of leaving it ticking", () => {
  // Teardown on document unload: the private fallback chain and the shared task
  // must both stop, or a navigation away from the page keeps a scheduler alive.
  const page = makePage({ texts: ["海外直邮"], cs: false });
  runInContext(
    "window.__listeners = {}; window.addEventListener = function (name, fn) {" +
      " (window.__listeners[name] = window.__listeners[name] || []).push(fn); };",
    page.ctx
  );
  page.inject("en");
  const listeners = runInContext("window.__listeners", page.ctx);
  assert.ok(listeners.pagehide && listeners.pagehide.length === 1, "no pagehide teardown was registered");
  assert.equal(page.timers.filter((t) => !t.cleared).length, 1, "the fallback should own exactly one timer");
  listeners.pagehide[0]();
  assert.equal(
    page.timers.filter((t) => !t.cleared).length,
    0,
    "pagehide left the private timer chain running after the document went away"
  );
});

// ── report ─────────────────────────────────────────────────────────────────────
let failed = 0;
for (const [status, name] of results) {
  if (status === "FAIL") failed++;
  console.log(`${status === "PASS" ? "  ok  " : " FAIL "} ${name}`);
}
console.log(
  `\n${results.length - failed}/${results.length} in-page translation behaviours verified against AI_TRANSLATE_SCRIPT.`
);
process.exit(failed ? 1 : 0);
