/**
 * verify-cs-runtime.mjs — executable proof for the marketplace in-page scheduler.
 *
 * WHY THIS EXISTS: the WebView performance work (audit 2026-10-14) lives in a JS string
 * that only ever runs inside a third-party Chinese page on a phone. `tsc` checks that the
 * string is valid TypeScript around it, and `expo export` checks that it bundles. Neither
 * checks that the scheduler actually does what the perf claim rests on: one heartbeat,
 * idle backoff, retirement, revival, a shared bounded text snapshot, and a hard stop while
 * the page is backgrounded. So this file evaluates the real injected source against a stub
 * DOM and drives its clock, and fails loudly if a behaviour regresses.
 *
 * Run from apps/mobile:  node scripts/verify-cs-runtime.mjs
 * No dependencies, no device, no network. Exits non-zero on the first failed assertion.
 */

import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const runtimePath = join(here, "..", "src", "lib", "webviewScripts.runtime.ts");

// The source is a TS module exporting template literals. Strip the module syntax with a
// targeted read (no generic TS transform here, so the injected string is used byte-for-byte
// exactly as the app injects it).
const src = readFileSync(runtimePath, "utf8");
const start = src.indexOf("export const CS_RUNTIME_SCRIPT = `");
assert.ok(start !== -1, "CS_RUNTIME_SCRIPT must still be exported from webviewScripts.runtime.ts");
const bodyStart = src.indexOf("`", start + "export const CS_RUNTIME_SCRIPT = ".length) + 1;
const bodyEnd = src.indexOf("`;", bodyStart);
assert.ok(bodyEnd > bodyStart, "could not find the end of the CS_RUNTIME_SCRIPT template literal");
const injected = src.slice(bodyStart, bodyEnd);
assert.ok(!injected.includes("${"), "CS_RUNTIME_SCRIPT must not interpolate — it is injected verbatim");

// ── stub environment ───────────────────────────────────────────────────────────
let now = 1_000_000;
const RealDate = Date;
const timers = [];
let observerCallback = null;
let observerOptions = null;
let visibilityHandlers = [];
let textReads = 0;
let rafQueue = [];

function makeSandbox() {
  const body = {
    get textContent() {
      textReads++;
      return "some page text";
    },
  };
  const documentElement = { childList: true };
  const doc = {
    hidden: false,
    body,
    documentElement,
    addEventListener(name, fn) {
      if (name === "visibilitychange") visibilityHandlers.push(fn);
    },
  };
  const win = {
    requestAnimationFrame(fn) {
      rafQueue.push(fn);
      return rafQueue.length;
    },
    setInterval(fn, ms) {
      timers.push({ fn, ms });
      return timers.length;
    },
    setTimeout(fn, ms) {
      // Only used by the runtime's rAF fallback; run it on the next flush.
      rafQueue.push(fn);
      return rafQueue.length;
    },
    MutationObserver: class {
      constructor(cb) {
        observerCallback = cb;
      }
      observe(target, options) {
        this.target = target;
        observerOptions = options;
      }
      disconnect() {}
    },
    document: doc,
    Date: { now: () => now },
  };
  win.window = win;
  return { win, doc };
}

const { win, doc } = makeSandbox();
const ctx = createContext({
  window: win,
  document: doc,
  setInterval: win.setInterval,
  setTimeout: win.setTimeout,
  requestAnimationFrame: win.requestAnimationFrame,
  MutationObserver: win.MutationObserver,
  Date: { now: () => now },
  console: { log() {}, warn() {}, error() {} },
  JSON,
  String,
  Number,
  Math,
  Array,
  Object,
  Boolean,
  Error,
  Date0: RealDate,
});

runInContext(injected, ctx);
runInContext(injected, ctx); // idempotency: a second injection must not stack timers

const cs = runInContext("window.__cs", ctx);
const heartbeat = timers[0];

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + " :: " + (e?.message ?? e)]);
  }
}

function flushRaf() {
  const q = rafQueue;
  rafQueue = [];
  q.forEach((f) => f());
}

function tick(ms) {
  now += ms;
  heartbeat.fn();
}

check("one heartbeat only, 200ms cadence", () => {
  assert.equal(timers.length, 1, `expected 1 timer, got ${timers.length} (double injection stacked timers)`);
  assert.equal(heartbeat.ms, 200);
});

check("one MutationObserver watching the live body", () => {
  assert.ok(observerOptions, "observer.observe was never called");
  assert.equal(observerOptions.childList, true);
  assert.equal(observerOptions.subtree, true);
});

check("a working task runs at its base cadence", () => {
  let runs = 0;
  runInContext(
    `window.__cs.add("worker", { every: 1000, maxEvery: 8000, fn: function () { window.__runs++; return 1; } });`,
    ctx
  );
  ctx.window.__runs = 0;
  tick(0);
  tick(1000);
  tick(1000);
  assert.ok(ctx.window.__runs >= 2, `expected >=2 runs, got ${ctx.window.__runs}`);
  assert.equal(ctx.window.__runs <= 3, true, "a working task must not accelerate");
  void runs;
});

check("an idle task backs off, then retires", () => {
  runInContext(
    `window.__cs.add("idle", { every: 1000, maxEvery: 8000, idleStop: 5, fn: function () { window.__idleRuns = (window.__idleRuns||0)+1; return 0; } });`,
    ctx
  );
  ctx.window.__idleRuns = 0;
  const before = ctx.window.__idleRuns;
  // 20 minutes of heartbeat. A never-satisfied task must stop long before this.
  for (let i = 0; i < 6000; i++) tick(200);
  const total = ctx.window.__idleRuns - before;
  assert.ok(total <= 12, `idle task ran ${total} times in 20 simulated minutes; backoff/retirement is not working`);
  const state = runInContext("window.__cs.tasks.idle", ctx);
  assert.equal(state.stopped, true, "task with idleStop:5 must be stopped after idling");
});

check("reset() revives a retired task at base cadence", () => {
  runInContext('window.__cs.reset("idle");', ctx);
  const state = runInContext("window.__cs.tasks.idle", ctx);
  assert.equal(state.stopped, false);
  assert.equal(state.every, state.base, `revived at ${state.every}ms instead of base ${state.base}ms`);
});

check("re-inject adopts the new cadence, not the old backoff", () => {
  runInContext(
    `window.__cs.add("worker", { every: 1000, maxEvery: 8000, fn: function () { window.__runs2 = (window.__runs2||0)+1; return 1; } });`,
    ctx
  );
  const w = runInContext("window.__cs.tasks.worker", ctx);
  runInContext("window.__cs.tasks.worker.every = 8000; window.__cs.tasks.worker.idle = 4;", ctx);
  runInContext(
    `window.__cs.add("worker", { every: 1000, maxEvery: 8000, fn: function () { window.__runs2 = (window.__runs2||0)+1; return 1; } });`,
    ctx
  );
  assert.equal(w.every, 1000, `re-inject kept the backed-off ${w.every}ms cadence`);
  assert.equal(w.idle, 0);
  assert.equal(w.stopped, false);
});

check("text() snapshots are shared, bounded and cached", () => {
  const readsBefore = textReads;
  now += 1;
  const a = runInContext('window.__cs.text();', ctx);
  const b = runInContext('window.__cs.text(4);', ctx);
  const c = runInContext('window.__cs.text();', ctx);
  assert.equal(a, "some page text");
  assert.equal(b, "some");
  assert.equal(c, a);
  assert.equal(textReads - readsBefore, 1, `three text() asks caused ${textReads - readsBefore} body reads`);
  // A long page must not be walked unboundedly.
  const huge = runInContext(
    `document.body.textContent = "x".repeat(50000); window.__cs.textCache = null; window.__cs.textAt = 0; window.__cs.text().length;`,
    ctx
  );
  assert.ok(huge <= 12000, `text snapshot is ${huge} chars; the 12k bound is gone`);
});

check("nothing runs while the page is hidden", () => {
  runInContext('window.__cs.reset("idle");', ctx);
  runInContext("window.__hiddenRuns = 0;", ctx);
  runInContext(
    `window.__cs.add("hidden_probe", { every: 100, idleStop: 0, fn: function () { window.__hiddenRuns++; return 1; } });`,
    ctx
  );
  runInContext("document.hidden = true; window.__cs.tasks.hidden_probe.next = 0;", ctx);
  for (let i = 0; i < 50; i++) tick(200);
  assert.equal(ctx.window.__hiddenRuns, 0, "tasks ran on a backgrounded page");
  runInContext("document.hidden = false;", ctx);
  visibilityHandlers.forEach((h) => h());
  tick(0);
  assert.ok(ctx.window.__hiddenRuns >= 1, "returning to the foreground did not wake the tasks");
});

check("mutations wake watchers at most once per 300ms", () => {
  runInContext("window.__wakeRuns = 0;", ctx);
  runInContext(
    `window.__cs.add("watcher", { every: 5000, watches: true, idleStop: 0, fn: function () { window.__wakeRuns++; return 0; } });`,
    ctx
  );
  const w = runInContext("window.__cs.tasks.watcher", ctx);
  w.next = now + 5000;
  for (let i = 0; i < 20; i++) {
    runInContext("window.__cs.textCache = null;", ctx);
    observerCallback([], "mutations");
    flushRaf();
    tick(20);
  }
  assert.ok(ctx.window.__wakeRuns <= 3, `a burst of 20 mutation batches caused ${ctx.window.__wakeRuns} wakes (no throttle)`);
  assert.ok(ctx.window.__wakeRuns >= 1, "mutations never woke the watcher");
});

check("the observer re-attaches when a SPA replaces <body>", () => {
  const targetBefore = runInContext("window.__cs.observerTarget === document.body;", ctx);
  assert.equal(targetBefore, true, "observer should start on the live body");
  const newBody = { textContent: "replaced" };
  ctx.__newBody = newBody;
  runInContext("document.body = __newBody;", ctx);
  tick(200);
  assert.equal(
    runInContext("window.__cs.observerTarget === document.body;", ctx),
    true,
    "observer was never re-attached to the new body"
  );
});

// ── report ─────────────────────────────────────────────────────────────────────
let failed = 0;
for (const [status, name] of results) {
  if (status === "FAIL") failed++;
  console.log(`${status === "PASS" ? "  ok  " : " FAIL "} ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} scheduler behaviours verified against the injected source.`);
process.exit(failed ? 1 : 0);
