/**
 * PUNISH_SCRIPT — detects Alibaba-family risk walls inside the WebView:
 *   x5sec / _____tmd_____ punish pages, slide-captcha overlays, security
 *   verification screens. Posts PUNISH to ReactNativeWebView so the app can
 *   swap in a friendly recovery overlay instead of a dead page.
 *
 * Signal priority (matches live probes of m.1688.com punish pages):
 *   1. URL contains /_____tmd_____/punish or x5secdata (hard signal)
 *   2. Page is tiny but declares punish/risk machinery (soft signal)
 *   3. Visible slide-captcha / security-verification UI
 */
export const PUNISH_SCRIPT = `(function () {
  try {
    if (window.__csPunishSent) return true;
    var href = location.href || "";
    var hard = /_____tmd_____\\/punish|x5secdata|punish\\?x5sec/i.test(href);
    var txt = (document.body && document.body.innerText || "").slice(0, 1200);
    var soft =
      /安全验证/.test(txt) ||
      /环境异常/.test(txt) ||
      (document.querySelector("#nc_1_n1z, .nc-container, #baxia-dialog-content, .baxia-dialog") != null);
    // Slide-captcha iframe used by Taobao/1688 risk flows
    var slide = !!document.querySelector("iframe[src*='punish'], iframe[src*='captcha'], iframe[src*='__amtVerify__']");
    if (hard || soft || slide) {
      window.__csPunishSent = true;
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
        type: "PUNISH",
        payload: { url: href, hard: hard, slide: slide }
      }));
    }
    return true;
  } catch (e) { return true; }
})(); true;`;

/**
 * HIDE_RISK_SCRIPT — hides Taobao/1688's own inline "environment abnormal"
 * interstitials when they render inside the page body (belt & braces with
 * the full-screen overlay).
 */
export const HIDE_RISK_SCRIPT = `(function () {
  try {
    var kill = document.querySelectorAll(
      "#baxia-dialog-content, .baxia-dialog, #nc_1_wrapper"
    );
    for (var i = 0; i < kill.length; i++) {
      kill[i].style.display = "none";
    }
    return true;
  } catch (e) { return true; }
})(); true;`;

/**
 * VISIBILITY_SNAPSHOT_SCRIPT — captures a compact description of what is on
 * screen (title + price + top images) for the AI Vision fallback. Runs on
 * demand: the app injects this when the user taps "AI Scan" and the result
 * is posted back as a VISION_SCAN message.
 */
export const VISION_SNAPSHOT_SCRIPT = `(function () {
  try {
    var out = { title: "", price: null, priceMax: null, moqText: "", images: [], url: location.href };
    // Title: og:title, then H1, then document.title
    var og = document.querySelector('meta[property="og:title"]');
    out.title = (og && og.content) ||
      (document.querySelector("h1") && document.querySelector("h1").innerText) ||
      (document.title || "").replace(/[-_|].*(1688|taobao|yiwugo).*$/i, "").trim();

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
    var priceNodes = document.querySelectorAll(
      "[class*='price' i], [class*='Price'], [class*='jiaqian'], [class*='amount'], [class*='originPrice'], [class*='curPrice'], [class*='sellPrice'], .price, em[class*='flag'], [class*='goods-price'], [class*='commodity-price']"
    );
    for (var i = 0; i < priceNodes.length; i++) {
      var txt = norm(priceNodes[i].innerText || "");
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
      // Fall back: first ¥-price anywhere in visible text
      var bodyTxt = norm((document.body && document.body.innerText) || "").slice(0, 20000);
      var mm = priceRe.exec(bodyTxt);
      if (mm) {
        var lo2 = parseFloat(mm[1].replace(",", "."));
        if (!isNaN(lo2) && lo2 > 0) best = { lo: lo2, hi: mm[2] ? parseFloat(mm[2].replace(",", ".")) : null };
      }
    }
    if (best) {
      out.price = best.lo;
      if (best.hi && best.hi > best.lo) out.priceMax = best.hi;
    }

    // MOQ EVIDENCE — same grammar as PRODUCT_CAPTURE_SCRIPT. Without these
    // lines the vision model guesses MOQ from a compressed screenshot and
    // returns junk. This is the single biggest accuracy fix for AI Scan.
    var moqLines = [];
    var moqRe = /起批|起订|最小|moq|min\\.?\\s*order|minimum\\s*order|每箱|装箱|整箱|混批|[≥>]\\s*\\d|件以上|[¥￥]\\s*\\d/i;
    var rawLines = String((document.body && document.body.innerText) || "").split("\\n");
    var seenLine = {};
    for (var b = 0; b < rawLines.length && moqLines.length < 30; b++) {
      var ln = rawLines[b].replace(/\\s+/g, " ").trim();
      if (!ln || ln.length > 160 || seenLine[ln] || !moqRe.test(ln)) continue;
      seenLine[ln] = 1;
      moqLines.push(ln);
    }
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
