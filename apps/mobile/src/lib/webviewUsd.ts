/**
 * USD_PRICE_SCRIPT v3 — rewrites CNY prices (¥xx) to USD ($x.xx) live inside
 * the marketplace WebView. ChinaSuuq's selling point: the customer never sees RMB.
 *
 * v3 hardening (after field reports of ¥ surviving on YiwuGo):
 *  - Aggressive sweep: converts immediately, on every MutationObserver tick,
 *    AND on a fast 900ms interval (SPA sites stream prices long after load).
 *  - Handles: text nodes ("¥35 ~ ¥43"), split spans (<span>¥</span><span>35</span>),
 *    aria-label prices (1688 buy buttons), fullwidth ￥, fullwidth digits,
 *    "人民币" worded prices.
 *  - Guards: converted elements are tagged data-cs-usd and skipped, so repeated
 *    sweeps never compound; originals stored for instant restore.
 *  - Self-healing: re-attaches observer if the SPA replaces <body>; falls back
 *    to documentElement when body is missing at inject time.
 *  - Debug counter: window.__csUsdCount = number of conversions so far.
 */
export function usdPriceScript(cnyPerUsd: number): string {
  const rate = Number(cnyPerUsd) > 0 ? Number(cnyPerUsd) : 7.25;
  return `(function () {
  try {
    var RATE = ${rate};

    var CNY_RE = /[¥￥]\\s?([0-9０-９]+(?:[.,][0-9０-９]{1,2})?)/g;
    var FW = { "０":"0","１":"1","２":"2","３":"3","４":"4","５":"5","６":"6","７":"7","８":"8","９":"9" };
    var skipTags = new Set(["SCRIPT","STYLE","NOSCRIPT","INPUT","TEXTAREA","SELECT","CODE","PRE","IFRAME","SVG"]);

    function norm(s) {
      return s.replace(/[０-９]/g, function (c) { return FW[c] || c; });
    }
    function toUsd(num) {
      var v = parseFloat(norm(String(num)).replace(",", "."));
      if (isNaN(v) || v <= 0) return null;
      return "$" + (v / RATE).toFixed(2);
    }
    function inSkip(el) {
      var p = el;
      while (p) {
        if (skipTags.has(p.tagName)) return true;
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
    function convertSplitSpans() {
      var syms = document.querySelectorAll("span,em,b,i,strong,font");
      for (var i = 0; i < syms.length; i++) {
        var el = syms[i];
        if (el.getAttribute("data-cs-usd") === "1") continue;
        var txt = norm((el.textContent || "").trim());
        if (txt !== "¥" && txt !== "￥" && txt !== "¥." && !/^¥\\s?$/.test(txt)) continue;
        if (inSkip(el)) continue;
        var done = false;

        // (a) next ELEMENT sibling starting with a number
        var next = el.nextElementSibling;
        var hops = 0;
        while (next && hops < 2 && !done) {
          var nt = norm((next.textContent || "").trim());
          var m = nt.match(/^([0-9]+(?:[.,][0-9]{1,2})?)/);
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
              var tm = tv.match(/^\\s*([0-9]+(?:[.,][0-9]{1,2})?)/);
              if (tm) {
                var u2 = toUsd(tm[1]);
                if (u2 != null) {
                  el.setAttribute("data-cs-usd", "1");
                  el.setAttribute("data-cs-usd-orig", el.textContent);
                  el.textContent = u2;
                  sib.nodeValue = tv.replace(/^\\s*[0-9]+(?:[.,][0-9]{1,2})?/, "");
                  window.__csUsdCount = (window.__csUsdCount || 0) + 1;
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
    }

    // aria-label prices (1688: aria-label="立即购买折后￥605.4起")
    function convertAriaLabels() {
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
        }
      }
    }

    function walk(root) {
      if (!root) return;
      var walker;
      try {
        walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      } catch (e) { return; }
      var n;
      var batch = [];
      while ((n = walker.nextNode())) {
        var v = n.nodeValue || "";
        if (v.indexOf("¥") !== -1 || v.indexOf("￥") !== -1) batch.push(n);
        if (batch.length >= 600) break;
      }
      for (var i = 0; i < batch.length; i++) convertTextNode(batch[i]);
    }

    function sweep() {
      try {
        walk(document.body || document.documentElement);
        convertSplitSpans();
        convertAriaLabels();
      } catch (e) {}
    }
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
      }, 500);
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
    };
    return true;
  } catch (e) { return true; }
})(); true;`;
}
