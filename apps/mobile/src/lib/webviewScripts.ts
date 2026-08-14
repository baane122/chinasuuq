// JavaScript injection scripts for the marketplace WebView.
// These run INSIDE the third-party Chinese marketplace page.
//
// The translator is SELF-CONTAINED — it does NOT rely on Google's iframe
// widget (which is blocked by RN WebView sandboxing). Instead it calls
// the plain-JSON translation endpoint and rewrites text nodes in-place via
// MutationObserver, so it works inside any WebView.
//
// Versioning per language is important: when the user switches target
// language (e.g. EN -> SO -> off -> EN), the script must be able to undo
// its previous translations and re-translate the original Chinese text.
// We accomplish that by storing the original zh text on the parent element
// (data-cs-orig) and resetting the node text to the original before
// re-running the batch for the new target.

// ---------------------------------------------------------------------------
// 1. SELF-CONTAINED TRANSLATOR (zh -> target language)
//   - Fetches chunks via translate.googleapis.com/translate_a/single (no key)
//   - Rewrites visible text nodes, skipping scripts/styles/inputs
//   - MutationObserver catches dynamically loaded content
//   - Stores the ORIGINAL Chinese on the parent element so re-runs /
//     language switches can re-translate from zh -> new target
//   - Re-runnable for any target language via window.__CS_TL
//   - Aggressive, fast first pass (150ms / 100ms / 150ms) and a tight
//     1.5s follow-up so SPA pages translate quickly
// ---------------------------------------------------------------------------
export const TRANSLATE_SCRIPT = `
(function () {
  var TARGET = window.__CS_TL || "en";

  // Per-page state
  if (typeof window.__csTrState === "undefined") {
    window.__csTrState = { requests: 0, done: {}, origs: {}, target: null };
  }
  var state = window.__csTrState;

  // If the target language changed, restore all original text nodes so the
  // new pass translates the *original* Chinese, not the previous language.
  if (state.target && state.target !== TARGET) {
    var origKeys = Object.keys(state.origs);
    for (var rk = 0; rk < origKeys.length; rk++) {
      var k = origKeys[rk];
      try {
        // key is the original Chinese text; we use the parent's data-cs-orig
        // to find it. The "done" map is keyed by original, so we keep that
        // to avoid re-fetching translations we already did for this target.
        // For language switches we simply drop the "done" cache to force
        // a fresh translation pass against the new target.
      } catch (_) {}
    }
    state.done = {};
    state.requests = 0;
    // Walk the DOM and restore all data-cs-orig attributes
    var els = document.querySelectorAll('[data-cs-orig]');
    for (var ri = 0; ri < els.length; ri++) {
      var parent = els[ri];
      // First text child is the only one we replaced; restore it.
      for (var ni = 0; ni < parent.childNodes.length; ni++) {
        var cn = parent.childNodes[ni];
        if (cn && cn.nodeType === 3) {
          cn.nodeValue = parent.getAttribute('data-cs-orig');
          break;
        }
      }
    }
  }
  state.target = TARGET;

  var skipTags = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT",
    "SELECT", "OPTION", "CODE", "PRE", "IFRAME", "SVG", "CANVAS", "META", "TITLE", "HEAD"
  ]);
  var MIN_LEN = 2;
  var zhRe = /[\\u4e00-\\u9fff]/;
  var MAX_REQUESTS = 40;     // bumped from 25 to cover longer product pages
  var GROUP_SIZE = 30;       // up from 20; fewer round-trips
  var INTERVAL_MS = 1200;    // tighter loop (was 3000)

  function shouldSkip(el) {
    var p = el.parentElement;
    while (p) {
      if (skipTags.has(p.tagName)) return true;
      p = p.parentElement;
    }
    return false;
  }

  // Collect short, non-empty text nodes that contain Chinese, prioritizing
  // nodes currently visible in the viewport so the user sees results fastest.
  function collect() {
    var out = [];
    var vh = window.innerHeight || document.documentElement.clientHeight || 800;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var t = (node.nodeValue || "").trim();
        if (t.length < MIN_LEN || !zhRe.test(t)) return NodeFilter.FILTER_REJECT;
        if (shouldSkip(node.parentNode)) return NodeFilter.FILTER_REJECT;
        if (node.parentNode && node.parentNode.getAttribute &&
            node.parentNode.getAttribute("data-cs-tr") === "1") {
          // already translated to current target; skip
          return NodeFilter.FILTER_REJECT;
        }
        // Chinese-char ratio: skip price/number strings & tiny fragments
        var zhCount = (t.match(/[\\u4e00-\\u9fff]/g) || []).length;
        var nonZh = t.replace(/[\\u4e00-\\u9fff]/g, "")
                     .replace(/[\\s\\d$.,%()!?。，、：；·/&'"—…\\-]/g, "");
        if (zhCount < 2 || nonZh.length > zhCount) return NodeFilter.FILTER_REJECT;
        // Prioritize nodes inside the visible viewport
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
    var node; var cap = 120;
    var list = [];
    while ((node = walker.nextNode()) && list.length < cap) list.push(node);
    list.sort(function (a, b) { return (a.__csScore || 0) - (b.__csScore || 0); });
    for (var i = 0; i < list.length; i++) out.push(list[i]);
    return out;
  }

  async function translateBatch(texts) {
    if (!texts || !texts.length) return [];
    const params = new URLSearchParams();
    params.set("client", "gtx");
    params.set("sl", "zh-CN");
    params.set("tl", state.target);
    params.set("dt", "t");
    params.set("q", texts.join("\\n"));
    const url = "https://translate.googleapis.com/translate_a/single?" + params.toString();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { method: "GET" });
        if (!res.ok) {
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 60 * Math.pow(2, attempt)));
            continue;
          }
          return [];
        }
        const data = await res.json();
        if (Array.isArray(data) && Array.isArray(data[0])) {
          const joinedOut = data[0]
            .filter((seg) => Array.isArray(seg) && seg.length)
            .map((seg) => seg[0] || "")
            .join("");
          return joinedOut.split("\\n");
        }
        return [];
      } catch (_) {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 60 * Math.pow(2, attempt)));
          continue;
        }
        return [];
      }
    }
    return [];
  }

  async function translateAndApply(nodes) {
    if (!nodes || !nodes.length) return;
    var group = nodes.slice(0, GROUP_SIZE);
    var texts = group.map(function (n) {
      return (n.nodeValue || "").replace(/\\n/g, " ").trim();
    });
    var targetTexts = await translateBatch(texts);
    if (!targetTexts || !targetTexts.length) return;
    for (var j = 0; j < group.length; j++) {
      var node = group[j];
      var out = targetTexts[j];
      if (!out) continue;
      var parent = node.parentNode;
      if (!parent) continue;
      // Save original Chinese on first sight so future language switches
      // can re-translate from the original.
      if (!parent.getAttribute("data-cs-orig")) {
        parent.setAttribute("data-cs-orig", node.nodeValue);
      }
      parent.setAttribute("data-cs-tr", "1");
      node.nodeValue = out;
    }
  }

  var mutTimer = null;
  function schedule() {
    if (mutTimer) return;
    mutTimer = setTimeout(function () {
      mutTimer = null;
      if (state.requests >= MAX_REQUESTS) return;
      var nodes = collect();
      if (!nodes.length) return;
      state.requests++;
      translateAndApply(nodes);
    }, 60);
  }

  if (!window.__csMO) {
    window.__csMO = new MutationObserver(schedule);
    window.__csMO.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  // Aggressive initial burst so the visible viewport is translated
  // almost immediately after page load.
  function kick() {
    if (state.requests >= MAX_REQUESTS) return;
    var nodes = collect();
    if (!nodes.length) return;
    state.requests++;
    translateAndApply(nodes);
  }
  // Three quick passes (immediately + 100ms + 400ms) so SPA content
  // that mounts over the first half-second gets caught fast.
  kick();
  setTimeout(kick, 100);
  setTimeout(kick, 400);

  // Periodic catch-all (stops once we hit the per-page cap)
  if (!window.__csInterval) {
    window.__csInterval = setInterval(function () {
      if (state.requests >= MAX_REQUESTS) {
        if (window.__csInterval) { clearInterval(window.__csInterval); window.__csInterval = null; }
        return;
      }
      var n2 = collect();
      if (n2.length) {
        state.requests++;
        translateAndApply(n2);
      }
    }, INTERVAL_MS);
  }
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

    // IMAGE — broad selectors to cover all marketplaces, not just 1688/Taobao
    var og = document.querySelector("meta[property='og:image']");
    out.image = og ? og.content : "";
    if (!out.image) {
      // Try the largest image on the page that looks like a product photo.
      // 1) Known marketplace selectors (1688/Taobao/JD/YiwuGo/ChinaGoods/Alibaba)
      var imgSelectors = [
        // 1688
        "#J_ImgBooth", ".tb-booth img", "img[class*='mainpic' i]",
        // Taobao detail
        ".detail-main img", ".PicGallery--mainImage--3CiGq5P img",
        // JD product page
        "#spec-img", ".product-img img", ".main-img img",
        // Alibaba.com
        ".detail-gallery-img img", ".gallery-img img",
        // YiwuGo
        ".product-gallery img", ".goods-pic img",
        // ChinaGoods
        ".product-image img", ".goods-img img", ".item-img img",
        // Generic patterns
        "article img", ".product img", "[class*='product'] img",
        "[class*='goods'] img", "[class*='detail'] img"
      ];
      for (var si = 0; si < imgSelectors.length; si++) {
        var el = document.querySelector(imgSelectors[si]);
        if (el && el.src && el.src.indexOf("data:") !== 0) { out.image = el.src; break; }
      }
      // 2) CDN-specific src patterns (covers any marketplace using Alibaba CDN, JD CDN, etc.)
      if (!out.image) {
        var cdnImg = document.querySelector("img[src*='alicdn'], img[src*='taobaocdn'], img[src*='jd.com'], img[src*='chinagoods'], img[src*='yiwugo'], img[src*='cbu01.alicdn'], img[src*='img.alicdn']");
        if (cdnImg && cdnImg.src) out.image = cdnImg.src;
      }
      // 3) Last resort: find the largest visible image on the page
      if (!out.image) {
        var allImgs = document.querySelectorAll("img");
        var bestArea = 0;
        for (var ai = 0; ai < allImgs.length; ai++) {
          var im = allImgs[ai];
          if (!im.src || im.src.indexOf("data:") === 0) continue;
          if (im.naturalWidth && im.naturalHeight && im.naturalWidth >= 100 && im.naturalHeight >= 100) {
            var area = im.naturalWidth * im.naturalHeight;
            if (area > bestArea) { bestArea = area; out.image = im.src; }
          }
        }
      }
    }
    if (!out.title || !out.price) {
      try {
        var candidates = [
          window.__INITIAL_STATE__,
          window.__NEXT_DATA__,
          window._DATA_,
          window.__NUXT__,
        ];
        for (var c = 0; c < candidates.length; c++) {
          var blob = candidates[c];
          if (!blob) continue;
          var s = JSON.stringify(blob);
          if (!s || s === "{}") continue;
          if (!out.title) {
            var tm = s.match(/"(?:title|subject|name|itemTitle|item_title|productTitle)"\\s*:\\s*"([^"]{8,200})"/);
            if (tm) out.title = tm[1].slice(0, 160);
          }
          if (!out.price) {
            var pm = s.match(/"(?:price|salePrice|currentPrice|orgPrice|sellPrice|skuPrice)"\\s*:\\s*"?([0-9]+(?:\\.[0-9]+)?)/);
            if (pm) {
              var v = parseFloat(pm[1]);
              if (!isNaN(v) && v > 0 && v < 100000000) out.price = v;
            }
          }
          if (out.title && out.price > 0) break;
        }
      } catch (_) {}
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
    var body = (document.body && document.body.innerText || "").slice(0, 4000);
    var clues = [/请登录/, /扫码登录/, /扫码支付/, /二维码/, /手机验证/, /验证码/, /登录淘宝/, /登录后/, /未登录/, /安全验证/, /login/i, /passport\\./i, /qr.*login/i, /account\\.yiwugo/i, /trademanager/i, /安全认证/];
    for (var i = 0; i < clues.length; i++) {
      if (clues[i].test(body)) { hint = true; break; }
    }
    if (hint) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: "LOGIN_WALL", payload: { url: location.href } }));
    }
    return true;
  } catch (e) { return true; }
})(); true;`;

// Detect page has NO real content (blocked / blank / error)
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

// ---------------------------------------------------------------------------
// 5. LOW-RISK MARKET NAV CLEANUP
//   Some marketplace mobile sites render their own fixed bottom tab bar.
//   We hide only elements explicitly named as bottom/tab navigation.
// ---------------------------------------------------------------------------
export const HIDE_MARKET_NAV_SCRIPT = `(function () {
  try {
    var selectors = [
      "[class*='bottom-nav' i]",
      "[class*='bottom_nav' i]",
      "[class*='bottom-tab' i]",
      "[class*='bottom_tab' i]",
      "[class*='tabbar' i]",
      "[class*='tab-bar' i]",
      "[class*='fixed-bottom' i]",
      "nav[class*='bottom' i]"
    ];
    function hideKnownBars() {
      var nodes = document.querySelectorAll(selectors.join(","));
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (!el || el.getAttribute("data-cs-market-nav") === "1") continue;
        var rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        if (!rect || rect.height > 120 || rect.width < window.innerWidth * 0.55) continue;
        el.setAttribute("data-cs-market-nav", "1");
        el.style.setProperty("display", "none", "important");
      }
    }
    hideKnownBars();
    if (!window.__csMarketNavObserver) {
      window.__csMarketNavObserver = new MutationObserver(hideKnownBars);
      window.__csMarketNavObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
    return true;
  } catch (e) { return true; }
})(); true;`;

