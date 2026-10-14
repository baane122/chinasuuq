/**
 * CS_RUNTIME — the single in-page scheduler for every marketplace WebView script.
 *
 * WHY THIS EXISTS (audit 2026-10-14, "WebView is very slow"):
 * Each injected script used to own its own timers and observers. On a product
 * page the customer actually lands on, that meant simultaneously:
 *   - NAV_WATCH      setInterval 500ms   (href poll)
 *   - RISK_WATCH     setInterval 700ms   (4 querySelectorAll + body.innerText)
 *   - USD overlay    setInterval 900ms   (full-body TreeWalker + all spans)
 *                      + MutationObserver @80ms  + 5 setTimeout sweeps
 *   - NAV cleanup    MutationObserver @250ms (3 DOM passes + getComputedStyle
 *                      over every div/section/footer)
 *   - AI translate   setTimeout 700ms    (TreeWalker + getBoundingClientRect)
 * i.e. 4 timers + 3 observers, and three of those passes read
 * `document.body.innerText`, which forces a synchronous full layout of a page
 * with tens of thousands of nodes. The page spends its main thread on our
 * sweeps instead of rendering — which is exactly the reported slowness.
 *
 * The runtime collapses all of it into ONE heartbeat + ONE MutationObserver and
 * adds the three things the old scripts had no notion of:
 *   1. idle backoff  — a script that finds nothing works slower and then stops;
 *   2. layout caching — one bounded `textContent` snapshot per tick instead of
 *      N × `innerText` (textContent never forces layout);
 *   3. hidden pause  — nothing runs while the page is backgrounded.
 *
 * Contracts the script files rely on and that must NOT change: the DOM marks
 * (data-cs-usd / data-cs-orig / data-cs-tr / data-cs-market-nav), the risk-wall
 * un-hiding, and the message types posted to React. Only *when* work happens
 * changed here.
 */

/**
 * (window.__cs is the only global this file defines.)
 *
 * Installs window.__cs (idempotent — safe to inject on every page load and
 * every SPA route change). Must be injected FIRST in the suite.
 */
export const CS_RUNTIME_SCRIPT = `(function () {
  if (window.__cs && window.__cs.v === 1) return true;

  var api = {
    v: 1,
    tasks: {},
    order: [],
    dirty: {},
    textCache: null,
    textAt: 0,
    observer: null,
    observerTarget: null,
    rafId: 0,
    lastDispatch: 0
  };

  // One 200ms heartbeat drives every task; each task carries its own cadence,
  // backoff and stop condition, so an idle page costs one cheap timer.
  api.HEARTBEAT_MS = 200;

  api.text = function (maxLen) {
    var now = Date.now();
    // Reuse the snapshot within a tick window: three scripts asked for the page
    // text on their own cadences, and each ask used to re-walk the tree.
    if (api.textCache !== null && now - api.textAt < 400) {
      return maxLen ? api.textCache.slice(0, maxLen) : api.textCache;
    }
    var t = "";
    try { t = String((document.body && document.body.textContent) || ""); } catch (e) { t = ""; }
    // textContent is layout-free but unbounded; 12k covers everything a
    // detection regex can plausibly need on the first screens.
    api.textCache = t.slice(0, 12000);
    api.textAt = now;
    return maxLen ? api.textCache.slice(0, maxLen) : api.textCache;
  };

  api.add = function (name, opts) {
    try {
      var prev = api.tasks[name];
      if (prev) {
        // Re-inject on the same document: keep the live cadence/backoff state
        // but let the new closure (fresh selectors, new rate) take over the run.
        prev.fn = opts.fn;
        prev.watches = !!opts.watches;
        if (opts.every) prev.base = opts.every;
        if (opts.maxEvery) prev.max = opts.maxEvery;
        if (opts.idleStop) prev.idleStop = opts.idleStop;
        // Adopt the NEW cadence too — leaving every at its backed-off value
        // meant a re-inject (language switch, rate refresh) kept running at the
        // slowest interval the previous page had settled on.
        prev.every = prev.base;
        prev.idle = 0;
        prev.stopped = false;
        prev.next = Date.now() + (opts.firstDelay != null ? opts.firstDelay : 0);
        return true;
      }
      api.tasks[name] = {
        fn: opts.fn,
        watches: !!opts.watches,
        base: opts.every || 1000,
        max: opts.maxEvery || 6000,
        every: opts.every || 1000,
        idle: 0,
        idleStop: opts.idleStop || 0,
        next: Date.now() + (opts.firstDelay != null ? opts.firstDelay : 0),
        stopped: false
      };
      api.order.push(name);
      return true;
    } catch (e) { return true; }
  };

  api.stop = function (name) {
    try {
      var t = api.tasks[name];
      if (t) { t.stopped = true; t.idle = 0; }
    } catch (e) {}
    return true;
  };

  api.reset = function (name) {
    try {
      var t = api.tasks[name];
      if (!t) return true;
      t.stopped = false;
      t.idle = 0;
      t.every = t.base;
      t.next = Date.now();
    } catch (e) {}
    return true;
  };

  // Single MutationObserver, rAF-coalesced and throttled to one dispatch per
  // 300ms: the old USD (80ms) and nav-cleanup (250ms) observers each re-ran a
  // full DOM sweep on their own timers, so one burst of SPA renders paid for it
  // twice. Tasks that care about mutations are woken by setting next=now.
  function onMutations() {
    api.textCache = null;
    if (api.rafId) return;
    api.rafId = (window.requestAnimationFrame || function (f) { setTimeout(f, 16); })(function () {
      api.rafId = 0;
      var now = Date.now();
      if (now - api.lastDispatch < 300) return;
      api.lastDispatch = now;
      for (var i = 0; i < api.order.length; i++) {
        var t = api.tasks[api.order[i]];
        if (t && !t.stopped && t.watches) t.next = now;
      }
    });
  }

  function attachObserver() {
    try {
      var target = document.body || document.documentElement;
      if (!target || api.observerTarget === target) return;
      if (!api.observer) {
        api.observer = new MutationObserver(onMutations);
      } else {
        api.observer.disconnect();
      }
      api.observer.observe(target, { childList: true, subtree: true, characterData: true });
      api.observerTarget = target;
    } catch (e) {}
  }
  attachObserver();

  function tick() {
    try {
      var now = Date.now();
      // Backgrounded page: do nothing at all, and arrive ready when it returns.
      if (document.hidden) return;
      if (api.textCache !== null && now - api.textAt > 400) api.textCache = null;
      for (var i = 0; i < api.order.length; i++) {
        var t = api.tasks[api.order[i]];
        if (!t || t.stopped) continue;
        if (now < t.next) continue;
        var work = 0;
        try { work = Number(t.fn()) || 0; } catch (e) { work = 0; }
        if (work > 0) {
          t.idle = 0;
          t.every = t.base;
        } else {
          t.idle++;
          // Nothing found twice in a row → back off. A quiet page that has
          // already been fully processed should not keep paying for sweeps.
          if (t.idle >= 2) t.every = Math.min(t.max, Math.round(t.every * 2));
          if (t.idleStop && t.idle >= t.idleStop) { t.stopped = true; continue; }
        }
        t.next = now + t.every;
      }
      // <body> gets replaced by some SPA frameworks; re-attach only then.
      if ((document.body || document.documentElement) !== api.observerTarget) attachObserver();
    } catch (e) {}
  }

  if (!api.heartbeat) {
    api.heartbeat = setInterval(tick, api.HEARTBEAT_MS);
  }
  if (!api.visibilityHooked) {
    api.visibilityHooked = true;
    try {
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) return;
        // Coming back to the foreground: wake everything once, immediately.
        var now = Date.now();
        for (var i = 0; i < api.order.length; i++) {
          var t = api.tasks[api.order[i]];
          if (t && !t.stopped) t.next = now;
        }
      });
    } catch (e) {}
  }

  window.__cs = api;
  return true;
})(); true;`;

