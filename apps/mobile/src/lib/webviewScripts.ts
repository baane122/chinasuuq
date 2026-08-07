// JavaScript injection scripts for the marketplace WebView.
// These run INSIDE the third-party Chinese marketplace page.
//
// The translator here is SELF-CONTAINED — it does NOT rely on Google's
// iframe widget (which is blocked by RN WebView sandboxing). Instead it calls
// the plain-JSON translation endpoint and rewrites text nodes in-place via
// MutationObserver, so it works inside any WebView.

// ---------------------------------------------------------------------------
// 1. SELF-CONTAINED TRANSLATOR (zh -> target language)
//   - Fetches chunks via translate.googleapis.com/translate_a/single (no key)
//   - Rewrites visible text nodes, skipping scripts/styles/inputs
//   - MutationObserver catches dynamically loaded content
//   - Sets a flag + data attribute so it doesn't re-translate itself
//   - Re-runnable for any target language via window.__CS_TL
// ---------------------------------------------------------------------------
export const TRANSLATE_SCRIPT = `
(function () {
  var TARGET = window.__CS_TL || "en";
  if (typeof window.__csTrRunning === "undefined") {
    window.__csTrRunning = 0;
  }
  if (window.__csTrRunning >= 50) return true;
  window.__csTrRunning += 1;
  var done = window.__csTrDone || (window.__csTrDone = {});
  var skipTags = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "TEXTAREA", "INPUT",
    "SELECT", "OPTION", "CODE", "PRE", "IFRAME", "SVG", "CANVAS", "META", "TITLE", "HEAD"
  ]);
  var MIN_LEN = 2;
  var zhRe = /[\\u4e00-\\u9fff]/;

  function isVisible(n) {
    if (!n || n.parentNode === null) return false;
    var r = n.parentNode.getBoundingClientRect ? n.parentNode.getBoundingClientRect() : { width: 0, height: 0 };
    return r.width > 0 && r.height > 0;
  }
  function shouldSkip(el) {
    var p = el.parentElement;
    while (p) {
      if (skipTags.has(p.tagName)) return true;
      p = p.parentElement;
    }
    return false;
  }

  // Collect short, non-empty text nodes that contain Chinese
  function collect() {
    var out = [];
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var t = (node.nodeValue || "").trim();
        if (t.length < MIN_LEN || !zhRe.test(t)) return NodeFilter.FILTER_REJECT;
        if (done[node.nodeValue]) return NodeFilter.FILTER_REJECT;
        if (node.parentNode && skipTags.has(node.parentNode.tagName)) return NodeFilter.FILTER_REJECT;
        if (node.parentNode && node.parentNode.getAttribute && node.parentNode.getAttribute("data-cs-tr") === "1") return NodeFilter.FILTER_REJECT;

        // Chinese-char ratio: skip price/number strings & tiny fragments so
        // output doesn't look garbled (don't translate "¥89" or a lone "件").
        var zhCount = (t.match(/[\u4e00-\u9fff]/g) || []).length;
        var nonZh = t.replace(/[\u4e00-\u9fff]/g, "").replace(/[\s\d$.,%()\-+!?，。、：；·/&'"—…]/g, "");
        if (zhCount < 2 || nonZh.length > zhCount) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var node; var cap = 60;
    while ((node = walker.nextNode()) && out.length < cap) out.push(node);
    return out;
  }

  async function translateNodes(nodes) {
    // Batch via ONE request: join texts with a literal newline (verified the
    // endpoint returns them newline-joined in the same order, 1:1). Rare
    // embedded newlines in a title are collapsed to a space first so they
    // don't desync the split.
    var group = nodes.slice(0, 12);
    var texts = group.map(function (n) { return (n.nodeValue || "").replace(/\\n/g, " ").trim(); });
    var targetTexts;
    try {
      var params = new URLSearchParams();
      params.set("client", "gtx");
      params.set("sl", "zh-CN");
      params.set("tl", TARGET);
      params.set("dt", "t");
      params.set("q", texts.join("\\n"));
      var res = await fetch("https://translate.googleapis.com/translate_a/single?" + params.toString(), { method: "GET" });
      var data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        var joinedOut = data[0]
          .filter(function (seg) { return Array.isArray(seg) && seg.length; })
          .map(function (seg) { return seg[0] || ""; })
          .join("");
        targetTexts = joinedOut.split("\\n");
      }
    } catch (e) {
      // offline/blocked — leave as-is, stop trying this cycle
      return true;
    }
    if (!targetTexts) return true;
    for (var j = 0; j < group.length; j++) {
      var node = group[j];
      var out = targetTexts[j];
      if (!out) continue;
      var parent = node.parentNode;
      // store original for potential restore + prevent loops
      parent.setAttribute("data-cs-tr", "1");
      parent.setAttribute("data-cs-orig", node.nodeValue);
      node.nodeValue = out;
    }
    return false;
  }

  var mutTimer = null;
  function schedule() {
    if (mutTimer) return;
    mutTimer = setTimeout(function () {
      mutTimer = null;
      var nodes = collect();
      if (nodes.length) translateNodes(nodes);
    }, 350);
  }
  var mo = new MutationObserver(schedule);
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });

  // initial pass
  var nodes = collect();
  if (nodes.length) translateNodes(nodes);

  // periodic catch-all
  setInterval(function () { var n2 = collect(); if (n2.length) translateNodes(n2); }, 5000);
  return true;
})();
true;`;

// ---------------------------------------------------------------------------
// 2. SMART PRODUCT CAPTURE — best-effort scraper for title / price / image / url
//   posts a JSON message back to RN via postMessage({type:"CAPTURE",payload})
// ---------------------------------------------------------------------------
export const PRODUCT_CAPTURE_SCRIPT = `(function () {
  try {
    var out = { title: "", price: 0, currency: "CNY", image: "", url: location.href, brand: "" };

    // TITLE
    var titleSel = ["h1", ".title", ".item-title", ".tb-detail-hd h1", ".d-title", ".sku-name", ".detail-title", ".product-name", ".goods-detail h1"];
    for (var i = 0; i < titleSel.length; i++) {
      var el = document.querySelector(titleSel[i]);
      if (el && el.textContent) {
        var tx = el.textContent.replace(/\\s+/g, " ").trim();
        if (tx.length > 8) { out.title = tx.slice(0, 160); break; }
      }
    }
    if (!out.title && document.title) {
      out.title = document.title.replace(/[-_|].*(1688|taobao|yiwugo).*$/gi, "").trim().slice(0, 160);
    }

    // PRICE (CNY)
    var priceRe = /(?:¥|￥|RMB|CNY)\\s?([\\d,]+(?:\\.\\d{1,2})?)/gi;
    var best = 0;
    var priceNodes = document.querySelectorAll(".price, .price-text, .p-price, .tb-rmb-num, .sku-price, .detail-price, [class*='price' i]");
    for (var p = 0; p < priceNodes.length; p++) {
      var txt = priceNodes[p].textContent || "";
      var m = priceRe.exec(txt);
      while (m) {
        var v = parseFloat(m[1].replace(/,/g, ""));
        if (!isNaN(v) && v > 0 && v < 100000000) { if (v > best) best = v; }
        m = priceRe.exec(txt);
      }
    }
    if (!best) {
      var bodyText = (document.body && document.body.innerText || "").slice(0, 20000);
      var mm = priceRe.exec(bodyText);
      if (mm) { var bv = parseFloat(mm[1].replace(/,/g, "")); if (!isNaN(bv) && bv > 0 && bv < 100000000) best = bv; }
    }
    out.price = best;

    // IMAGE
    var og = document.querySelector("meta[property='og:image']");
    out.image = og ? og.content : "";
    if (!out.image) {
      var img = document.querySelector("#J_ImgBooth, .tb-booth img, img[class*='mainpic' i], .detail-main img, img[src*='alicdn'], img[src*='taobaocdn']");
      if (img && img.src) out.image = img.src;
    }
    if (out.image && out.image.indexOf("//") === 0) out.image = "https:" + out.image;

    if (out.title && out.price > 0) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: "CAPTURE", payload: out }));
    } else {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: "CAPTURE", payload: out, incomplete: true }));
    }
  } catch (e) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: "CAPTURE", payload: {}, error: String(e) }));
  }
  return true;
})(); true;`;

// ---------------------------------------------------------------------------
// 3. LOGIN-WALL / BLOCK DETECTION — Taobao / YiwuGo force sign-in or QR
// ---------------------------------------------------------------------------
export const LOGIN_WALL_SCRIPT = `(function () {
  try {
    var hint = false;
    var url = location.href;
    var body = (document.body && document.body.innerText || "").slice(0, 4000);
    var clues = [/请登录/, /扫码登录/, /扫码支付/, /二维码/, /手机验证/, /验证码/, /登录淘宝/, /登录后/, /未登录/, /安全验证/, /login/i, /passport\\./i, /qr.*login/i, /u\\.taobao\\.com/i, /account\\.yiwugo/i, /trademanager/i, /安全认证/];
    for (var i = 0; i < clues.length; i++) {
      if (clues[i].test(url) || clues[i].test(body)) { hint = true; break; }
    }
    if (hint) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: "LOGIN_WALL", payload: { url: url } }));
    }
    return true;
  } catch (e) { return true; }
})(); true;`;

// Detect page has NO real content (blocked / blank / error), for branded offline state
export const BLANK_PAGE_SCRIPT = `(function () {
  try {
    var body = (document.body && document.body.innerText || "").trim();
    var hasImages = !!(document.images && document.images.length);
    if (!body && !hasImages) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: "BLANK", payload: { url: location.href } }));
    }
    return true;
  } catch (e) { return true; }
})(); true;`;
