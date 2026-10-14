/**
 * USD_PRICE_SCRIPT v4 — rewrites CNY prices (¥xx) to USD ($x.xx) live inside
 * the marketplace WebView. ChinaSuuq's selling point: the customer never sees RMB.
 *
 * v3 hardening (after field reports of ¥ surviving on YiwuGo):
 *  - Handles: text nodes ("¥35 ~ ¥43"), split spans (<span>¥</span><span>35</span>),
 *    aria-label prices (1688 buy buttons), fullwidth ￥, fullwidth digits,
 *    "人民币" worded prices.
 *  - Guards: converted elements are tagged data-cs-usd and skipped, so repeated
 *    sweeps never compound; originals stored for instant restore.
 *  - Self-healing: re-attaches observer if the SPA replaces <body>; falls back
 *    to documentElement when body is missing at inject time.
 *  - Debug counter: window.__csUsdCount = number of conversions so far.
 *
 * v4 scheduling (the "WebView is very slow" fix):
 *  - The sweep no longer owns a 900ms setInterval plus its own
 *    MutationObserver. It registers with the shared runtime heartbeat
 *    (webviewScripts.runtime.ts) as the "usd" task, which coalesces every
 *    DOM mutation in the page into ONE observer and backs the sweep off
 *    exponentially while the page stays quiet.
 *  - Split-span matching rejects anything that cannot be a bare currency
 *    token before touching getBoundingClientRect/inSkip, so the sweep stops
 *    forcing layout on every element on 1688's search grid.
 *  - The standalone timer/observer below still exists for the case where the
 *    runtime was not injected (risk-wall pages, older suites).
 */
import { RISK_INSIDE_FN } from "./webviewScripts.risk";

/**
 * The overlay DIVIDES every on-page ¥ figure by this rate, so a bad rate is a
 * bad price. Only a CNY-per-USD figure inside this plausible band may drive the
 * rewrite — the same band the FX store accepts, with room for a real
 * revaluation — and the overlay is skipped outside it.
 */
export const CNY_PER_USD_FLOOR = 2;

export const CNY_PER_USD_CEILING = 20;

/** Fallback cadence when the shared runtime is not present. */
const SWEEP_INTERVAL_MS = 900;

export function isUsableCnyPerUsd(raw: unknown): boolean {
  const n = Number(raw);
  return Number.isFinite(n) && n >= CNY_PER_USD_FLOOR && n <= CNY_PER_USD_CEILING;
}

export function usdPriceScript(cnyPerUsd: number): string {
  // cnyPerUsd = CNY per 1 USD (the exchange_rates contract), passed in by the
  // caller from useFx(). Anything outside the plausible band is skipped below.
  const rate = Number(cnyPerUsd);
  // No usable rate → no overlay: the page keeps its own yuan prices instead of
  // dollars computed off a flipped or 0.0001 figure.
  if (!isUsableCnyPerUsd(rate)) return "";
  return `(function () {
  try {
    var RATE = ${rate};

    // Idempotency guard: the app re-injects this on every page load AND on
    // every SPA route change. When the page is already being rewritten at
    // THIS rate, a re-inject would only stack another sweep + five extra
    // setTimeout sweeps per navigation — the observer and interval below are
    // window-guarded and keep working regardless. __csUsdRestore() clears
    // these two flags, so a genuine reinstall (USD toggled back on, a new
    // rate from the FX store, or a fresh document) still runs in full.
    // Nothing about the conversion itself or where the rate comes from
    // changes here — only whether an already-active overlay re-initialises.
    if (window.__csUsdActive && window.__csUsdRate === RATE) return true;

    // A grouped figure is ONE price: "¥1,299" is 1299 yuan ($185.57 at 7), not
    // "1.299" and not "1,29" + a stray "9". Taobao/Tmall discount tiles and
    // ChinaGoods wholesale prices do print the separator, so without the group
    // clause the overlay showed four-figure products at eighteen cents.
    var CNY_RE = /[¥￥]\\s?([0-9０-９]+(?:,[0-9]{3})*(?:[.,][0-9０-９]{1,2})?)/g;
    // Cheap head test for the split-span sweep: the element must START with a
    // currency sign (spaces allowed). Rejects the vast majority of <span>s on
    // the page before any normalisation or ancestor walk happens.
    var SYMBOL_HEAD = /^\\s*[¥￥]/;
    var FW = { "０":"0","１":"1","２":"2","３":"3","４":"4","５":"5","６":"6","７":"7","８":"8","９":"9" };
    var skipTags = new Set(["SCRIPT","STYLE","NOSCRIPT","INPUT","TEXTAREA","SELECT","CODE","PRE","IFRAME","SVG"]);

    function norm(s) {
      return s.replace(/[０-９]/g, function (c) { return FW[c] || c; });
    }
    function toUsd(num) {
      var s = norm(String(num));
      // Three shapes have to be told apart, and guessing wrong prices the item
      // wrong: "1,299.00" is one thousand… with a dot decimal; "1,299" is grouped
      // with no decimal; "43,5" is a European decimal comma (no group is ever
      // 1-2 digits). Anchored whole-string tests, no lookbehind (older Android
      // WebViews do not all support it).
      var grouped = /^([0-9]{1,3}(?:,[0-9]{3})+)(?:[.]([0-9]{1,2}))?$/.exec(s);
      if (grouped) s = grouped[1].replace(/,/g, "") + (grouped[2] ? "." + grouped[2] : "");
      else s = s.replace(",", ".");
      var v = parseFloat(s);
      if (isNaN(v) || v <= 0) return null;
      return "$" + (v / RATE).toFixed(2);
    }
    ${RISK_INSIDE_FN}

    function inSkip(el) {
      var p = el;
      while (p) {
        if (skipTags.has(p.tagName)) return true;
        if (__csInRisk(p)) return true;
        if (p.getAttribute && p.getAttribute("data-cs-usd") === "1") return true;
        p = p.parentElement;
      }
      return false;
    }

    function convertTextNode(node) {
      var t = node.nodeValue || "";
      if (t.indexOf("¥") === -1 && t.indexOf("￥") === -1) return;
      if (inSkip(node.parentElement)) return;
      var replaced = t.replace(CNY_RE, function (m, num) {
        var u = toUsd(num);
        return u != null ? u : m;
      });
      if (replaced !== t) {
        var par = node.parentElement;
        if (par) {
          par.setAttribute("data-cs-usd", "1");
          par.setAttribute("data-cs-usd-orig", t);
        }
        node.nodeValue = replaced;
        window.__csUsdCount = (window.__csUsdCount || 0) + 1;
      }
    }

    // Split spans: <span>¥</span><span>35</span>,
    // ChinaGoods: <span>￥</span><div>35.9</div>. Handles:
    //  a) symbol element + following ELEMENT sibling starting with a number
    //  b) symbol element + following TEXT sibling starting with a number
    //  c) symbol-only element INSIDE a parent whose remaining text is numeric
    //
    // PERF: this used to read and normalise the textContent of EVERY
    // span/em/b/i/strong/font on a marketplace page (thousands of nodes) on
    // every sweep. A symbol-only element is at most 2-3 characters, so the
    // length/first-character guard below rejects ~99% of them before any
    // string work happens, with identical results.
    function convertSplitSpans() {
      var hits = 0;
      var syms = document.querySelectorAll("span,em,b,i,strong,font");
      for (var i = 0; i < syms.length; i++) {
        var el = syms[i];
        if (el.getAttribute("data-cs-usd") === "1") continue;
        // Cheap rejects first: no normalisation, no ancestor walk. A
        // symbol-only element is <= 3 chars and starts with the currency sign
        // (optional leading space), which is exactly the old condition.
        var raw = el.textContent;
        if (!raw || raw.length > 3) continue;
        if (!SYMBOL_HEAD.test(raw)) continue;
        var txt = norm(raw.trim());
        if (txt !== "¥" && txt !== "￥" && txt !== "¥." && !/^¥\\s?$/.test(txt)) continue;
        if (inSkip(el)) continue;
        var done = false;

        // (a) next ELEMENT sibling starting with a number
        var next = el.nextElementSibling;
        var hops = 0;
        while (next && hops < 2 && !done) {
          var nt = norm((next.textContent || "").trim());
          var m = nt.match(/^([0-9]+(?:,[0-9]{3})*(?:[.,][0-9]{1,2})?)/);
          if (m) {
            var u = toUsd(m[1]);
            if (u != null && nt.length <= 12) {
              el.setAttribute("data-cs-usd", "1");
              el.setAttribute("data-cs-usd-orig", el.textContent);
              next.setAttribute("data-cs-usd", "1");
              next.setAttribute("data-cs-usd-orig", next.textContent);
              el.textContent = u;
              next.textContent = "";
              next.style.setProperty("display", "none", "important");
              window.__csUsdCount = (window.__csUsdCount || 0) + 1;
              hits++;
              done = true;
            }
            break;
          }
          next = next.nextElementSibling;
          hops++;
        }

        // (b) next TEXT sibling starting with a number
        if (!done && el.parentElement) {
          var sib = el.nextSibling;
          var hops2 = 0;
          while (sib && hops2 < 3 && !done) {
            if (sib.nodeType === 3) {
              var tv = norm(sib.nodeValue || "");
              var tm = tv.match(/^\\s*([0-9]+(?:,[0-9]{3})*(?:[.,][0-9]{1,2})?)/);
              if (tm) {
                var u2 = toUsd(tm[1]);
                if (u2 != null) {
                  el.setAttribute("data-cs-usd", "1");
                  el.setAttribute("data-cs-usd-orig", el.textContent);
                  el.textContent = u2;
                  sib.nodeValue = tv.replace(/^\\s*[0-9]+(?:,[0-9]{3})*(?:[.,][0-9]{1,2})?/, "");
                  window.__csUsdCount = (window.__csUsdCount || 0) + 1;
                  hits++;
                  done = true;
                }
                break;
              }
              if (tv.trim().length > 0) break; // non-numeric text — stop
            }
            sib = sib.nextSibling;
            hops2++;
          }
        }

        // (c) symbol-only element inside parent with trailing number:
        //     <span><em>¥</em>35.9</span> handled by (b); here: <div>¥</div><div>35.9</div>
        //     covered by (a). Nothing more needed.
      }
      return hits;
    }

    // aria-label prices (1688: aria-label="立即购买折后￥605.4起")
    function convertAriaLabels() {
      var hits = 0;
      var labeled = document.querySelectorAll("[aria-label]");
      for (var i = 0; i < labeled.length; i++) {
        var el = labeled[i];
        if (el.getAttribute("data-cs-usd") === "1") continue;
        var orig = el.getAttribute("aria-label") || "";
        if (orig.indexOf("¥") === -1 && orig.indexOf("￥") === -1) continue;
        var rep = norm(orig).replace(CNY_RE, function (m, num) {
          var u = toUsd(num);
          return u != null ? u : m;
        });
        if (rep !== orig) {
          el.setAttribute("data-cs-usd", "1");
          el.setAttribute("data-cs-usd-orig", "aria:" + orig);
          el.setAttribute("aria-label", rep);
          window.__csUsdCount = (window.__csUsdCount || 0) + 1;
          hits++;
        }
      }
      return hits;
    }

    function walk(root) {
      if (!root) return 0;
      var walker;
      try {
        walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      } catch (e) { return 0; }
      var n;
      var batch = [];
      while ((n = walker.nextNode())) {
        var v = n.nodeValue || "";
        if (v.indexOf("¥") !== -1 || v.indexOf("￥") !== -1) batch.push(n);
        if (batch.length >= 600) break;
      }
      for (var i = 0; i < batch.length; i++) convertTextNode(batch[i]);
      return batch.length;
    }

    // One sweep, returning how much work it found so the runtime can back off
    // when the page has nothing left to convert.
    function sweep() {
      var work = 0;
      try {
        work += walk(document.body || document.documentElement);
        work += convertSplitSpans();
        work += convertAriaLabels();
      } catch (e) {}
      return work;
    }

    if (window.__cs) {
      // One immediate pass (the customer must see dollars, not yuan, on first
      // paint) plus one short follow-up for content that mounts right after,
      // then the shared runtime owns the cadence. Previously this script ran
      // its own 80ms MutationObserver AND a ${SWEEP_INTERVAL_MS} interval AND
      // five setTimeout sweeps — three independent full-document walks.
      sweep();
      setTimeout(sweep, 350);
      window.__cs.add("usd", {
        every: ${SWEEP_INTERVAL_MS}, maxEvery: 6000, idleStop: 8, watches: true,
        fn: sweep
      });
      window.__csUsdRestore = function () {
        var els = document.querySelectorAll("[data-cs-usd-orig]");
        for (var i = 0; i < els.length; i++) {
          var el = els[i];
          var orig = el.getAttribute("data-cs-usd-orig") || "";
          if (orig.indexOf("aria:") === 0) {
            el.setAttribute("aria-label", orig.slice(5));
          } else {
            el.textContent = orig;
            el.style.removeProperty("display");
          }
          el.removeAttribute("data-cs-usd");
          el.removeAttribute("data-cs-usd-orig");
        }
        try { if (window.__cs.tasks["usd"]) window.__cs.tasks["usd"].stopped = true; } catch (e) {}
        if (window.__csUsdTimer) { clearInterval(window.__csUsdTimer); window.__csUsdTimer = null; }
        if (window.__csUsdMO) { window.__csUsdMO.disconnect(); window.__csUsdMO = null; }
        // Let the next inject re-install from scratch (the idempotency guard
        // above keys off these).
        window.__csUsdActive = false;
        window.__csUsdRate = null;
      };
      window.__csUsdRate = RATE;
      window.__csUsdActive = true;
      return true;
    }

    // Runtime absent (unexpected): keep the standalone interval + observer so
    // prices still convert rather than silently leaving yuan on screen.
    sweep();
    setTimeout(sweep, 150);
    setTimeout(sweep, 400);
    setTimeout(sweep, 1200);
    setTimeout(sweep, 2500);

    if (!window.__csUsdMO) {
      var pending = null;
      window.__csUsdMO = new MutationObserver(function () {
        if (pending) return;
        pending = setTimeout(function () { pending = null; sweep(); }, 80);
      });
    }
    function attachObserver() {
      var target = document.body || document.documentElement;
      if (!target) return false;
      try {
        window.__csUsdMO.disconnect();
      } catch (e) {}
      window.__csUsdMO.observe(target, { childList: true, subtree: true, characterData: true });
      window.__csUsdTarget = target;
      return true;
    }
    attachObserver();

    if (!window.__csUsdTimer) {
      window.__csUsdTimer = setInterval(function () {
        try {
          var cur = document.body || document.documentElement;
          if (cur && window.__csUsdTarget !== cur) attachObserver();
          sweep();
        } catch (e) {}
      }, ${SWEEP_INTERVAL_MS});
    }

    window.__csUsdRestore = function () {
      var els = document.querySelectorAll("[data-cs-usd-orig]");
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var orig = el.getAttribute("data-cs-usd-orig") || "";
        if (orig.indexOf("aria:") === 0) {
          el.setAttribute("aria-label", orig.slice(5));
        } else {
          el.textContent = orig;
          el.style.removeProperty("display");
        }
        el.removeAttribute("data-cs-usd");
        el.removeAttribute("data-cs-usd-orig");
      }
      if (window.__csUsdTimer) { clearInterval(window.__csUsdTimer); window.__csUsdTimer = null; }
      if (window.__csUsdMO) { window.__csUsdMO.disconnect(); window.__csUsdMO = null; }
      // Let the next inject re-install from scratch (the idempotency guard
      // above keys off these).
      window.__csUsdActive = false;
      window.__csUsdRate = null;
    };
    window.__csUsdRate = RATE;
    window.__csUsdActive = true;
    return true;
  } catch (e) { return true; }
})(); true;`;
}
