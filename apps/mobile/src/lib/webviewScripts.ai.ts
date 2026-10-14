// AI Translation for WebView - uses app's ai-translate edge function
//
// The script runs INSIDE the marketplace page and owns the whole pipeline:
//  1. collect() walks the DOM for Chinese text nodes, scored by viewport
//     position (visible first), and requestTranslation() STAMPS each node's
//     parent with data-cs-orig (the trimmed original) + data-cs-tr="1",
//     registers the live node refs in state.map, then posts a FLAT message
//     {type:"TRANSLATE_REQUEST", texts, targetLang} to the RN app.
//  2. The app translates the batch and injects ONLY
//     window.__csApplyTranslations(originals, translated) — the DOM swap
//     lives here (single source), not in the app layer.
//  3. On a target-language change the script restores the originals from
//     the stamped data-cs-orig attributes before re-translating.
//     The app's RESTORE_SCRIPT performs the same undo for "show original".
//
// The schedule loop STOPS by itself once the per-page text budget is spent
// or the page goes quiet (IDLE_STOP consecutive empty passes) — it no longer
// ticks every 3s forever. Re-injection (page load / SPA NAV) revives it.

import { RISK_INSIDE_FN } from "./webviewScripts.risk";

export const AI_TRANSLATE_SCRIPT = `
(function () {
  var TARGET = window.__CS_TL || "en";
  // 40, not 60: the edge function caps a request at 40 texts and the app
  // chunks at 40, so a 60-text pass cost TWO sequential paid round-trips (each
  // with an edge cold-start) for one page region. One pass now = one request.
  var GROUP_SIZE = 40;      // distinct texts posted per pass
  var MAX_REQUESTS = 120;   // text budget per page / target language
  var INTERVAL_MS = 600;    // burst cadence while the page still has new text
  var IDLE_STOP = 4;        // consecutive empty passes before the loop quits

  if (typeof window.__csAiTrState === "undefined") {
    window.__csAiTrState = {
      requests: 0, done: {}, pending: {}, results: {}, map: {}, fails: {},
      target: null, installed: false, timer: 0, href: "", idle: 0
    };
  }
  var state = window.__csAiTrState;
  var HREF = location.href;

  var skipTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION", "CODE", "PRE", "IFRAME", "SVG", "CANVAS", "META", "TITLE", "HEAD"]);
  var zhRe = /[\\u4e00-\\u9fff]/;

  ${RISK_INSIDE_FN}

  function shouldSkip(el) {
    // Start at el ITSELF (the text node's direct parent), not its parent. The
    // old "var p = el.parentElement" made the immediate parent invisible, so text
    // written directly inside a risk widget (a div id="nc_1_wrapper" holding the
    // slider label) or directly inside a <script> was still collected and
    // rewritten — the exact case the captcha fix and the skip-tag list exist for.
    // Matches inSkip() in webviewUsd.ts, which already walks from el.
    // (No backticks in this comment: it lives inside an injected template literal.)
    var p = el;
    while (p) {
      if (skipTags.has(p.tagName)) return true;
      // A slide-captcha / risk dialog must keep its own Chinese text and node
      // identity: rewriting it changes what the risk engine fingerprints and
      // has been observed to leave the verification widget unusable.
      if (__csInRisk(p)) return true;
      p = p.parentElement;
    }
    return false;
  }

  // Restore every node we ever translated, from its stamped original.
  function restoreOriginals() {
    var els = document.querySelectorAll('[data-cs-orig]');
    for (var ri = 0; ri < els.length; ri++) {
      var parent = els[ri];
      var orig = parent.getAttribute('data-cs-orig');
      for (var ni = 0; ni < parent.childNodes.length; ni++) {
        var cn = parent.childNodes[ni];
        if (cn && cn.nodeType === 3) {
          cn.nodeValue = orig;
          break;
        }
      }
      parent.removeAttribute('data-cs-orig');
      parent.removeAttribute('data-cs-tr');
    }
  }

  // Idempotency guard: same document + same target means the pipeline is
  // already running — never stack a second timer or re-scan the DOM.
  // A schedule that ended (budget spent / idle) is revived here, because
  // SPA content can keep mounting after the first pass went quiet.
  if (state.installed && state.target === TARGET && state.href === HREF) {
    if (window.__cs) {
      // Budget spent for this page+target: leave it stopped. Otherwise wake the
      // task, because SPA content keeps mounting after the first pass goes quiet.
      if (state.requests < MAX_REQUESTS) window.__cs.reset("translate");
    } else if (!state.timer && state.requests < MAX_REQUESTS) {
      state.timer = setTimeout(function () { state.timer = 0; tick(); }, 150);
      window.__csAiTimer = state.timer;
    }
    return true;
  }

  // Language switch: undo the previous target's translations first so the
  // new pass runs against the ORIGINAL Chinese, not a translation of one.
  if (state.target && state.target !== TARGET) restoreOriginals();

  // Fresh page (SPA route) or fresh target: fresh budget, single timer.
  if (state.timer) { clearTimeout(state.timer); state.timer = 0; }
  if (window.__csAiTimer) { clearTimeout(window.__csAiTimer); }
  window.__csAiTimer = 0;
  if (window.__cs) window.__cs.reset("translate");
  if (state.href !== HREF || state.target !== TARGET) {
    state.requests = 0;
    state.idle = 0;
    state.done = {};
    state.pending = {};
    state.results = {};
    state.map = {};
    state.fails = {};
  }
  state.target = TARGET;
  state.href = HREF;
  state.installed = true;

  // Viewport-prioritised collection (scoring ported from the old Google
  // path): visible nodes get score 0, off-screen ones their distance —
  // the user sees the on-page text translated first.
  function collect() {
    var vh = window.innerHeight || document.documentElement.clientHeight || 800;
    var list = [];
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var t = (node.nodeValue || "").trim();
        if (t.length < 2 || !zhRe.test(t)) return NodeFilter.FILTER_REJECT;
        if (shouldSkip(node.parentNode)) return NodeFilter.FILTER_REJECT;
        if (node.parentNode && node.parentNode.getAttribute &&
            node.parentNode.getAttribute("data-cs-tr") === "1") {
          // already requested/applied for this target; skip
          return NodeFilter.FILTER_REJECT;
        }
        // Chinese-char ratio: skip price/number strings & tiny fragments
        var zhCount = (t.match(/[\\u4e00-\\u9fff]/g) || []).length;
        var nonZh = t.replace(/[\\u4e00-\\u9fff]/g, "")
                     .replace(/[\\s\\d$.,%()!?。，、：；·/&'"—…\\-]/g, "");
        if (zhCount < 2 || nonZh.length > zhCount) return NodeFilter.FILTER_REJECT;
        var n = node.parentNode;
        var score = 1000;
        if (n && typeof n.getBoundingClientRect === "function") {
          try {
            var r = n.getBoundingClientRect();
            if (r && typeof r.top === "number" && r.top >= -50 && r.top < vh + 50) score = 0;
            else if (r) score = Math.max(0, (r.top || 0));
          } catch (_) {}
        }
        node.__csScore = score;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var node;
    while ((node = walker.nextNode()) && list.length < 200) list.push(node);
    list.sort(function (a, b) { return (a.__csScore || 0) - (b.__csScore || 0); });
    return list.slice(0, GROUP_SIZE);
  }

  // Stamp the parent and swap in a translation we already hold (a repeated
  // string that was answered for a different node) — free, no round-trip.
  function stampAndApply(parent, node, orig, out) {
    try {
      if (!parent.getAttribute("data-cs-orig")) parent.setAttribute("data-cs-orig", orig);
      parent.setAttribute("data-cs-tr", "1");
      node.nodeValue = out;
    } catch (e) {}
  }

  function requestTranslation(nodes) {
    if (state.requests >= MAX_REQUESTS) return;
    var texts = [];
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var t = (node.nodeValue || "").replace(/\\n/g, " ").trim();
      if (!t) continue;
      var parent = node.parentNode;
      if (!parent) continue;
      var known = state.results[t];
      if (known) { stampAndApply(parent, node, t, known); continue; }
      if (state.done[t]) continue;
      if (state.map[t] && state.pending[t]) {
        // A request for this exact string is already in flight — attach this
        // node to the same key so the single response covers every copy.
        state.map[t].push({ n: node, p: parent });
        parent.setAttribute("data-cs-tr", "1");
        if (!parent.getAttribute("data-cs-orig")) parent.setAttribute("data-cs-orig", t);
        continue;
      }
      state.pending[t] = true;
      state.map[t] = [{ n: node, p: parent }];
      // STAMP: handleTranslateRequest/restore depend on these attributes.
      parent.setAttribute("data-cs-orig", t);
      parent.setAttribute("data-cs-tr", "1");
      texts.push(t);
      if (state.requests + texts.length >= MAX_REQUESTS) break;
    }
    if (!texts.length) return;
    state.requests += texts.length;
    try {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
        type: "TRANSLATE_REQUEST",
        texts: texts,
        targetLang: TARGET
      }));
    } catch (e) {}
  }

  // THE DOM SWAP (single source of truth). The app injects exactly:
  //   window.__csApplyTranslations(<originals json>, <translated json>);true;
  // keyed by TRIMMED original text — the same key the request was stamped
  // with, so there is no untrimmed/trimmed mismatch.
  window.__csApplyTranslations = function (originals, translated) {
    try {
      if (!originals || !originals.length) return true;
      for (var i = 0; i < originals.length; i++) {
        var key = String(originals[i] || "").trim();
        if (!key) continue;
        delete state.pending[key];
        state.done[key] = true;
        var out = translated && translated[i] != null ? String(translated[i]) : "";
        var refs = state.map[key];
        delete state.map[key];
        if (!out || out === key) continue; // untranslated (provider miss): keep zh
        state.results[key] = out;
        if (refs) {
          for (var r = 0; r < refs.length; r++) {
            try {
              var ref = refs[r];
              if (ref.n && ref.p && ref.n.parentNode === ref.p) ref.n.nodeValue = out;
            } catch (e) {}
          }
        }
      }
    } catch (e) {}
    return true;
  };

  // FAILURE PATH. Without this a failed batch left every one of its strings
  // flagged pending forever: the parent kept data-cs-tr="1" (so collect()
  // rejected it), the budget was already spent, and that text stayed Chinese
  // for the rest of the page's life. The app calls this with the same
  // originals array it was asked to translate when the request errored:
  //   window.__csTranslateFailed(<originals json>);true;
  // Nodes are un-stamped (their Chinese was never replaced, so nothing to
  // restore) and the budget is refunded, up to MAX_FAILS per string.
  var MAX_FAILS = 3;
  window.__csTranslateFailed = function (originals) {
    try {
      if (!originals || !originals.length) return true;
      var revived = false;
      for (var i = 0; i < originals.length; i++) {
        var key = String(originals[i] || "").trim();
        if (!key || !state.pending[key]) continue;
        delete state.pending[key];
        var refs = state.map[key];
        delete state.map[key];
        state.fails[key] = (state.fails[key] || 0) + 1;
        if (state.fails[key] >= MAX_FAILS) {
          // Give up on this string; leave it visible in Chinese.
          state.done[key] = true;
          continue;
        }
        state.requests = Math.max(0, state.requests - 1);
        if (refs) {
          for (var r = 0; r < refs.length; r++) {
            try {
              var p = refs[r] && refs[r].p;
              if (p && p.removeAttribute) {
                p.removeAttribute("data-cs-tr");
                if (p.getAttribute("data-cs-orig") === key) p.removeAttribute("data-cs-orig");
              }
            } catch (e) {}
          }
        }
        revived = true;
      }
      if (revived && state.requests < MAX_REQUESTS) {
        if (window.__cs) window.__cs.reset("translate");
        else if (!state.timer) {
          state.timer = setTimeout(function () { state.timer = 0; tick(); }, 800);
          window.__csAiTimer = state.timer;
        }
      }
    } catch (e) {}
    return true;
  };
  // IDLE_STOP consecutive ticks ends the loop. Driven by the shared runtime
  // heartbeat when present — this script used to own a 700ms setTimeout chain
  // that kept re-walking the whole document on top of the three other private
  // timers the page was already running.
  function tick() {
    if (state.requests >= MAX_REQUESTS) return 0;
    var nodes = collect();
    if (nodes.length > 0) {
      state.idle = 0;
      requestTranslation(nodes);
      return nodes.length;
    }
    state.idle++;
    return 0;
  }
  if (window.__cs) {
    // idleStop lets the runtime retire this task once the page has been quiet
    // for IDLE_STOP passes (or the budget is spent); window.__cs.reset
    // ("translate") on every re-injection revives it for late-mounted SPA
    // content — instead of a timer chain that never ended.
    window.__cs.add("translate", {
      every: INTERVAL_MS, maxEvery: 3000, firstDelay: 150, watches: true,
      idleStop: IDLE_STOP,
      fn: function () {
        if (state.requests >= MAX_REQUESTS) { state.idle = IDLE_STOP; return 0; }
        return tick();
      }
    });
    return true;
  }
  function loop() {
    state.timer = 0;
    var work = tick();
    if (state.requests >= MAX_REQUESTS) return;
    if (state.idle >= IDLE_STOP && work === 0) return;
    state.timer = setTimeout(loop, INTERVAL_MS);
    window.__csAiTimer = state.timer;
  }
  if (!state.timer) {
    state.timer = setTimeout(loop, 150);
    window.__csAiTimer = state.timer;
  }
  return true;
})();
true;
`;
