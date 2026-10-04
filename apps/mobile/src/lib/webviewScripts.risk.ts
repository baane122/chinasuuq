/**
 * Risk-wall handling inside the Alibaba-family WebViews (1688 / Taobao login).
 *
 * HISTORY — why this file changed on 2026-10-04:
 * The previous pair of scripts made verification IMPOSSIBLE to complete:
 *   1. HIDE_RISK_SCRIPT set `display:none` on `#nc_1_wrapper` / `.baxia-dialog`
 *      — those ARE the slide-captcha the user has to drag.
 *   2. PUNISH_SCRIPT posted once (window.__csPunishSent) and the app answered
 *      with a full-screen React overlay that swallowed every touch.
 *   3. Both ran only at inject time, while the dialog mounts LATER (after the
 *      SMS code is requested), so the app's state also went stale.
 * Result: "亲，请拖动下方滑块完成验证" with no slider under it, forever.
 *
 * The rule this file now follows: a risk wall is the ONE page where ChinaSuuq
 * must get out of the way. We detect it, make sure nothing (including our own
 * earlier hiding) keeps the widget invisible, tell React the live state, and
 * never cover it.
 */

const RISK_SELECTORS = {
  // The draggable slider itself (noCaptcha / baxia).
  slider:
    "#nc_1_wrapper, #nc_1_n1z, .nc-container, .nc_scale, .nc_wrapper, [id^='nc_'], [class*='nc-container' i], [class*='slider-verify' i], [class*='slide-check' i]",
  // The dialog that hosts it.
  dialog:
    "#baxia-dialog, .baxia-dialog, #baxia-dialog-content, [class*='baxia' i], [id*='baxia' i], [class*='punish' i], [id*='punish' i]",
  // Cross-origin verification frames (their DOM is unreachable, but their
  // presence is the signal, and they must not be hidden either).
  frame:
    "iframe[src*='punish'], iframe[src*='captcha'], iframe[src*='x5sec'], iframe[src*='_____tmd_____'], iframe[src*='login.taobao.com'], iframe[src*='ynuf.aliapp.org']",
};

/**
 * RISK_WATCH_SCRIPT — detect + un-block + report the live risk-wall state.
 *
 * Posts PUNISH only when the state SIGNATURE changes, so React gets both the
 * "wall appeared" and the "wall is gone" edge without an injection storm.
 * Installs its own 700ms watcher because the dialog is mounted after our
 * inject (SMS-code request), which is exactly the moment staff get stuck.
 */
export const RISK_WATCH_SCRIPT = `(function () {
  var SLIDER = ${JSON.stringify(RISK_SELECTORS.slider)};
  var DIALOG = ${JSON.stringify(RISK_SELECTORS.dialog)};
  var FRAME = ${JSON.stringify(RISK_SELECTORS.frame)};
  function q(sel) {
    try { return Array.prototype.slice.call(document.querySelectorAll(sel)); } catch (e) { return []; }
  }
  function marked(el) {
    return el && el.getAttribute && el.getAttribute("data-chinasuuq-risk") === "1";
  }
  /** Undo ANY hiding — ours (data-cs-market-nav) or the page's own inline
   *  display:none — so the slider is on screen and receives touches. */
  function unhide(el) {
    try {
      if (!el || !el.style) return;
      if (el.getAttribute("data-cs-market-nav") === "1") {
        el.removeAttribute("data-cs-market-nav");
        el.removeAttribute("data-cs-market-nav-parent");
      }
      var hidden = el.style.display === "none" || el.style.visibility === "hidden" ||
        el.style.pointerEvents === "none";
      if (hidden) {
        el.style.removeProperty("display");
        el.style.removeProperty("visibility");
        el.style.removeProperty("pointer-events");
        el.style.setProperty("display", "block", "important");
        el.style.setProperty("visibility", "visible", "important");
        el.style.setProperty("pointer-events", "auto", "important");
      }
    } catch (e) {}
  }
  function run() {
    try {
      var href = location.href || "";
      var hard = /_____tmd_____\\/punish|x5secdata|punish\\?x5sec/i.test(href);
      var sliders = q(SLIDER);
      var frames = q(FRAME);
      var dialogs = q(DIALOG);
      var txt = "";
      try { txt = (document.body && document.body.innerText || "").slice(0, 3000); } catch (e) {}
      var words = /安全验证|拖动.{0,8}滑块|滑块.{0,8}验证|请完成.{0,8}验证|环境异常|验证失败/.test(txt);
      var present = hard || sliders.length > 0 || frames.length > 0 || (dialogs.length > 0 && words);
      if (present) {
        for (var i = 0; i < sliders.length; i++) unhide(sliders[i]);
        for (var d = 0; d < dialogs.length; d++) {
          var el = dialogs[d];
          unhide(el);
          // Lift the host dialog above anything we or the page stack over it,
          // and keep it clickable even if an ancestor lost pointer-events.
          try {
            el.style.setProperty("z-index", "2147483000", "important");
            var p = el.parentElement, depth = 0;
            while (p && depth < 6) {
              if (p.style && p.style.pointerEvents === "none") {
                p.style.setProperty("pointer-events", "auto", "important");
              }
              p = p.parentElement; depth++;
            }
          } catch (e) {}
          if (!marked(el)) {
            try { el.setAttribute("data-chinasuuq-risk", "1"); } catch (e) {}
            try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {}
          }
        }
        for (var f = 0; f < frames.length; f++) unhide(frames[f]);
      }
      var interactive = sliders.length > 0 || frames.length > 0;
      var sig = (present ? 1 : 0) + "" + (interactive ? 1 : 0) + "" + (hard ? 1 : 0);
      if (window.__csRiskSig !== sig) {
        window.__csRiskSig = sig;
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "PUNISH",
            payload: {
              url: href, hard: hard, present: present,
              slide: interactive, interactive: interactive
            }
          }));
        }
      }
      return true;
    } catch (e) { return true; }
  }
  run();
  // The wall mounts after injection (right after the SMS code is sent), so a
  // watcher is the only way React learns about it in time. 700ms of a few
  // querySelectors is cheaper than the page's own polling.
  if (!window.__csRiskWatch) {
    window.__csRiskWatch = setInterval(run, 700);
  }
  return true;
})(); true;`;

/**
 * RISK_EXCLUDE_HELPER — appended into the mutating scripts (translate, USD
 * overlay, product capture) so they never rewrite the DOM a risk engine is
 * fingerprinting. Returns true when an element sits inside a verification
 * widget, dialog or frame.
 */
export const RISK_INSIDE_FN = `function __csInRisk(el) {
  try {
    var p = el, depth = 0;
    while (p && depth < 25) {
      if (p.tagName === "IFRAME") return true;
      var id = (p.id || "").toLowerCase();
      var cls = (typeof p.className === "string" ? p.className : "").toLowerCase();
      if (id.indexOf("baxia") > -1 || id.indexOf("punish") > -1 || id.indexOf("captcha") > -1 ||
          id === "nc_1_wrapper" || id.indexOf("nc_") === 0 ||
          cls.indexOf("baxia") > -1 || cls.indexOf("nc-container") > -1 ||
          cls.indexOf("nc_") > -1 || cls.indexOf("punish") > -1 || cls.indexOf("captcha") > -1 ||
          cls.indexOf("slider") > -1 || p.getAttribute && p.getAttribute("data-chinasuuq-risk") === "1") return true;
      p = p.parentElement; depth++;
    }
  } catch (e) {}
  return false;
}`;

/**
 * VISIBILITY_SNAPSHOT_SCRIPT — captures a compact description of what is on
 * screen (title + price + top images) for the AI Vision fallback. Runs on
 * demand: the app injects this when the user taps "AI Scan" and the result
 * is posted back as a VISION_SCAN message.
 */
export const VISION_SNAPSHOT_SCRIPT = `(function () {
  try {
    var out = { title: "", price: null, priceMax: null, moqText: "", images: [], url: location.href };
    // Title: og:title, then H1, then a class-named product title (YiwuGo,
    // ChinaGoods and the 1$ store all use hashed class names, so substring
    // matches outlast exact selectors), then document.title.
    var og = document.querySelector('meta[property="og:title"]');
    out.title = (og && og.content) ||
      (document.querySelector("h1") && document.querySelector("h1").innerText) ||
      (function () {
        var sels = ["[class*='goods-title' i]", "[class*='product-title' i]", "[class*='commodity-title' i]", ".detail-title", ".product-name", ".sku-name"];
        for (var s = 0; s < sels.length; s++) {
          var e = document.querySelector(sels[s]);
          if (e && e.innerText && e.innerText.trim().length > 8) return e.innerText.trim();
        }
        return "";
      })() ||
      (document.title || "").replace(/[-_|].*(1688|taobao|yiwugo|chinagoods).*$/i, "").trim();

    // Price: scan price-classed nodes AND the whole page text.
    // Handles fullwidth ￥ and ranges ("¥35 ~ ¥43" -> price=35, priceMax=43).
    // Picks the price node that sits CLOSEST to the title (main offer), not
    // the first random promo number on the page.
    var FW = { "０":"0","１":"1","２":"2","３":"3","４":"4","５":"5","６":"6","７":"7","８":"8","９":"9" };
    function norm(s) { return String(s).replace(/[０-９]/g, function (c) { return FW[c] || c; }); }
    var priceRe = /[¥￥]\\s?([0-9]+(?:[.,][0-9]{1,2})?)(?:\\s*[-~～至\\\\/]+\\s*[¥￥]?\\s*([0-9]+(?:[.,][0-9]{1,2})?))?/g;
    var titleRect = null;
    try {
      var tEl = document.querySelector("h1") || document.querySelector('[class*="title" i]');
      if (tEl && tEl.getBoundingClientRect) titleRect = tEl.getBoundingClientRect();
    } catch (e) {}
    function scoreRect(r) {
      if (!r || !titleRect) return 9999;
      return Math.abs((r.top || 0) - (titleRect.top || 0));
    }
    var best = null, bestScore = Infinity;
    var shipRe = /运费|快递|物流|邮费|express|shipping|freight|delivery/i;
    var priceNodes = document.querySelectorAll(
      "[class*='price' i], [class*='Price'], [class*='jiaqian'], [class*='amount'], [class*='originPrice'], [class*='curPrice'], [class*='sellPrice'], .price, em[class*='flag'], [class*='goods-price'], [class*='commodity-price']"
    );
    for (var i = 0; i < priceNodes.length; i++) {
      var txt = norm(priceNodes[i].innerText || "");
      if (shipRe.test(txt)) continue; // "Express: ¥5.00起" is not the product price
      if (txt.indexOf("¥") === -1 && txt.indexOf("￥") === -1) continue;
      var m = priceRe.exec(txt);
      priceRe.lastIndex = 0;
      if (!m) continue;
      var lo = parseFloat(m[1].replace(",", "."));
      if (isNaN(lo) || lo <= 0) continue;
      var sc = scoreRect(priceNodes[i].getBoundingClientRect ? priceNodes[i].getBoundingClientRect() : null);
      if (sc < bestScore) {
        bestScore = sc;
        best = { lo: lo, hi: m[2] ? parseFloat(m[2].replace(",", ".")) : null };
      }
    }
    if (!best) {
      // The USD overlay (webviewUsd) rewrites ¥ to $ and blanks the original
      // spans, keeping them in data-cs-usd-orig. Once it has run the DOM holds
      // no ¥ at all — read the originals back before falling to raw body text.
      try {
        var usdEls = document.querySelectorAll("[data-cs-usd-orig]");
        for (var ue = 0; ue < usdEls.length && !best; ue++) {
          var utx = norm(usdEls[ue].getAttribute("data-cs-usd-orig") || "");
          if (shipRe.test(utx)) continue;
          priceRe.lastIndex = 0;
          var um = priceRe.exec(utx);
          if (!um) continue;
          var uv = parseFloat(um[1].replace(",", "."));
          if (!isNaN(uv) && uv > 0) {
            best = { lo: uv, hi: um[2] ? parseFloat(um[2].replace(",", ".")) : null };
          }
        }
      } catch (e) {}
    }
    if (!best) {
      // Fall back: first ¥-price anywhere in visible text that is not a shipping
      // quote. "Express: ¥5.00起" is the cheapest number on many pages, and
      // taking it made the review sheet price a ¥19 toy at ¥5.
      var bodyTxt = norm((document.body && document.body.innerText) || "").slice(0, 20000);
      priceRe.lastIndex = 0;
      var mm;
      while ((mm = priceRe.exec(bodyTxt)) !== null) {
        var ls = bodyTxt.lastIndexOf("\\n", mm.index) + 1;
        var le = bodyTxt.indexOf("\\n", mm.index);
        if (le < 0) le = bodyTxt.length;
        var lc = bodyTxt.slice(ls, le);
        if (shipRe.test(lc) || /起\\s*$/.test(lc.trim())) continue;
        var lo2 = parseFloat(mm[1].replace(",", "."));
        if (!isNaN(lo2) && lo2 > 0) {
          best = { lo: lo2, hi: mm[2] ? parseFloat(mm[2].replace(",", ".")) : null };
          break;
        }
      }
    }
    if (best) {
      out.price = best.lo;
      if (best.hi && best.hi > best.lo) out.priceMax = best.hi;
    }

    // MOQ EVIDENCE — same grammar as PRODUCT_CAPTURE_SCRIPT. Without these
    // lines the vision model guesses MOQ from a compressed screenshot and
    // returns junk. This is the single biggest accuracy fix for AI Scan.
    // English shapes included: the translate layer may have rewritten the page.
    var moqLines = [];
    var moqRe = /起批|起订|起购|最小|moq|min\\.?\\s*order|min\\.?\\s*purchas|minimum\\s*(?:order|purchas|qty|quantity)|每箱|装箱|整箱|混批|[≥>]\\s*\\d|件以上|[¥￥]\\s*\\d|\\d+\\s*(?:pcs|pieces?|units?)\\s*minimum/i;
    var moqReNum = /\\b\\d{1,6}\\s*(?:minimum|min\\b)\\b/i;
    var rawLines = String((document.body && document.body.innerText) || "").split("\\n");
    var seenLine = {};
    for (var b = 0; b < rawLines.length && moqLines.length < 30; b++) {
      var ln = rawLines[b].replace(/\\s+/g, " ").trim();
      if (!ln || ln.length > 160 || seenLine[ln] || !(moqRe.test(ln) || moqReNum.test(ln))) continue;
      seenLine[ln] = 1;
      moqLines.push(ln);
    }
    // Original untranslated text (translate layer stores it in data-cs-orig).
    try {
      var origEls = document.querySelectorAll("[data-cs-orig]");
      for (var oe = 0; oe < origEls.length && moqLines.length < 45; oe++) {
        var otx = (origEls[oe].getAttribute("data-cs-orig") || "").replace(/\\s+/g, " ").trim();
        if (!otx || otx.length > 160 || seenLine[otx]) continue;
        if (moqRe.test(otx)) { seenLine[otx] = 1; moqLines.push(otx); }
      }
    } catch (_) {}
    out.moqText = moqLines.join("\\n").slice(0, 3000);

    // Images: first 5 content images (alicdn / yiwugo / dollarstore CDNs or large imgs)
    var imgs = document.querySelectorAll(
      "img[src*='alicdn'], img[src*='taobaocdn'], img[src*='yiwugo'], img[src*='chinagoods'], img[src*='huolangjun666'], img"
    );
    var seen = {};
    for (var j = 0; j < imgs.length && out.images.length < 5; j++) {
      var src = imgs[j].currentSrc || imgs[j].src || "";
      if (src && !seen[src] && imgs[j].naturalWidth >= 100) {
        seen[src] = 1;
        out.images.push(src);
      }
    }
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
      type: "VISION_SCAN",
      payload: out
    }));
    return true;
  } catch (e) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
      type: "VISION_SCAN",
      payload: { error: String(e), url: location.href }
    }));
    return true;
  }
})(); true;`;
