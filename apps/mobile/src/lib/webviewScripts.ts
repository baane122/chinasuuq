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
  var MAX_REQUESTS = 60;     // raised: long product pages + SPA streams
  var GROUP_SIZE = 60;       // half the round-trips per page
  var INTERVAL_MS = 600;     // was 700 — catch SPA content sooner
  var NODE_CAP = 240;        // was 120 per pass — drain a big page in one pass

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
    var node; var cap = NODE_CAP;
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
      // Drain the rest of the page in back-to-back waves so a 240-node page
      // finishes in 60*4=4 passes instead of waiting on the 600ms interval.
      setTimeout(function drain() {
        if (state.requests >= MAX_REQUESTS) return;
        var more = collect();
        if (!more.length) return;
        state.requests++;
        translateAndApply(more);
        setTimeout(drain, 60);
      }, 60);
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
  // Fast burst: immediately + 80ms + 250ms + 600ms so SPA content
  // that mounts over the first half-second gets caught fast, and
  // 2 parallel lanes drain the queue twice as fast.
  kick();
  setTimeout(kick, 80);
  setTimeout(kick, 250);
  setTimeout(kick, 600);
  setTimeout(kick, 1000);

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
    var out = { title: "", price: 0, currency: "CNY", image: "", url: location.href, brand: "", moqText: "" };

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

    // MOQ EVIDENCE — the minimum-order wording, handed to the parser in
    // src/lib/moqIngest.ts. A WebView cannot read 1688's structured MOQ field,
    // and posting all of innerText on every capture would be wasteful and
    // pointless, so only the lines that could carry a rule are shipped.
    var moqLines = [];
    var moqRe = /起批|起订|最小|moq|min\\.?\\s*order|minimum\\s*order|每箱|装箱|整箱|混批|[≥>]\\s*\\d|件以上|[¥￥]\\s*\\d/i;
    var rawLines = String((document.body && document.body.innerText) || "").split("\\n");
    var seenLine = {};
    for (var b = 0; b < rawLines.length && moqLines.length < 40; b++) {
      var ln = rawLines[b].replace(/\\s+/g, " ").trim();
      if (!ln || ln.length > 160 || seenLine[ln] || !moqRe.test(ln)) continue;
      seenLine[ln] = 1;
      moqLines.push(ln);
    }
    out.moqText = moqLines.join("\\n").slice(0, 4000);

    // IMAGE — broad selectors to cover all marketplaces, not just 1688/Taobao
    var og = document.querySelector("meta[property='og:image']");
    out.image = og ? og.content : "";
    if (!out.image) {
      // Try the largest image on the page that looks like a product photo.
      // 1) Known marketplace selectors (1688/Taobao/YiwuGo/ChinaGoods)
      var imgSelectors = [
        // 1688
        "#J_ImgBooth", ".tb-booth img", "img[class*='mainpic' i]",
        // Taobao detail
        ".detail-main img", ".PicGallery--mainImage--3CiGq5P img",
        "img[src*='taobaocdn'][class*='main']",
        // YiwuGo
        ".product-gallery img", ".goods-pic img", ".swiper-slide img",
        // ChinaGoods
        ".product-image img", ".goods-img img", ".item-img img",
        // 1$ Dollar Store (huolangjun666 SPA)
        ".goods-img img", ".van-image img", ".van-swipe img",
        "img[class*='goods'] img", ".commodity-img img",
        // Generic patterns
        "article img", ".product img", "[class*='product'] img",
        "[class*='goods'] img", "[class*='detail'] img"
      ];
      for (var si = 0; si < imgSelectors.length; si++) {
        var el = document.querySelector(imgSelectors[si]);
        if (el && el.src && el.src.indexOf("data:") !== 0) { out.image = el.src; break; }
      }
      // 2) CDN-specific src patterns (covers any marketplace using Alibaba CDN, etc.)
      if (!out.image) {
        var cdnImg = document.querySelector("img[src*='alicdn'], img[src*='taobaocdn'], img[src*='chinagoods'], img[src*='yiwugo'], img[src*='cbu01.alicdn'], img[src*='img.alicdn'], img[src*='huolangjun666']");
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
// 6. AUTO-LOGIN — fills a detected login form with the shared account
//   credentials (from admin marketplace_accounts) and submits it.
//   Safe-by-design: only runs when a password field exists, only fills once
//   per page (data-cs-autolog marker), never touches 2FA/QR/verify screens.
// ---------------------------------------------------------------------------
export function autoLoginScript(username: string, password: string): string {
  const safeUser = JSON.stringify(username || "");
  const safePass = JSON.stringify(password || "");
  return `(function () {
  try {
    if (document.querySelector('[data-cs-autolog="1"]')) return true;
    var pwd = document.querySelector('input[type="password"]');
    if (!pwd || !pwd.offsetParent) return true;
    // Never auto-fill on 2FA / verification screens
    var bodyTxt = (document.body && document.body.innerText || "").slice(0, 2000);
    if (/验证码|扫码|qr/i.test(bodyTxt)) return true;
    // Find the account/phone input: the text/tel input nearest above the password field
    var inputs = Array.prototype.slice.call(document.querySelectorAll('input[type="text"], input[type="tel"], input:not([type])'));
    var userInput = null, bestDist = Infinity;
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i] === pwd || !inputs[i].offsetParent) continue;
      var dist = Math.abs((inputs[i].getBoundingClientRect().top || 0) - (pwd.getBoundingClientRect().top || 0));
      if (dist < bestDist) { bestDist = dist; userInput = inputs[i]; }
    }
    if (!userInput) return true;
    function setVal(el, val) {
      var proto = Object.getPrototypeOf(el);
      var desc = Object.getOwnPropertyDescriptor(proto, "value");
      if (desc && desc.set) desc.set.call(el, val); else el.value = val;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setVal(userInput, ${safeUser});
    setVal(pwd, ${safePass});
    pwd.setAttribute("data-cs-autolog", "1");
    // Find the submit button: nearest clickable below the password field
    setTimeout(function () {
      try {
        var btns = Array.prototype.slice.call(document.querySelectorAll('button, [role="button"], .btn, a'));
        var btn = null, best = Infinity;
        for (var j = 0; j < btns.length; j++) {
          var b = btns[j];
          var r = b.getBoundingClientRect ? b.getBoundingClientRect() : null;
          if (!r) continue;
          var d = (r.top || 0) - (pwd.getBoundingClientRect().top || 0);
          if (d < 0) continue;
          var txt = (b.innerText || "").replace(/\\s+/g, "");
          var hit = /登录|登陆|login|signin/i.test(txt) || b.getAttribute("type") === "submit";
          if (hit && d < best) { best = d; btn = b; }
        }
        if (btn) btn.click();
      } catch (e) {}
    }, 350);
    return true;
  } catch (e) { return true; }
})(); true;`;
}

// ---------------------------------------------------------------------------
// 4. (kept numbering) LOW-RISK MARKET NAV CLEANUP
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
      "[class*='bottombar' i]",
      "[class*='bottom-bar' i]",
      "[class*='tabbar' i]",
      "[class*='tab-bar' i]",
      "[class*='tab-bar-container' i]",
      "[class*='navbar-bottom' i]",
      "[class*='footer-nav' i]",
      "[class*='fixed-bottom' i]",
      "[class*='fixed_bottom' i]",
      "[class*='float-btn' i]",
      "[class*='floatBtn' i]",
      "[class*='floating-btn' i]",
      "[class*='float-bar' i]",
      "[class*='floatbar' i]",
      "[class*='suspend' i]",
      "[class*='smart-btn' i]",
      "[class*='cart-float' i]",
      "[class*='quick-nav' i]",
      "[class*='toolbar-bottom' i]",
      "[class*='action-bar' i]",
      "[class*='actionbar' i]",
      "[class*='detail-bottom' i]",
      "[class*='detail-bar' i]",
      "[class*='buy-bar' i]",
      "[class*='sku-bar' i]",
      "[class*='goods-bar' i]",
      "[class*='operate-bar' i]",
      "[class*='btn-bar' i]",
      "[class*='dock' i]",
      "[class*='side-bar' i]",
      "[class*='sidebar' i]",
      "[id*='bottom-nav' i]",
      "[id*='bottomBar' i]",
      "[id*='tabbar' i]",
      "[id*='float' i]",
      "[id*='suspend' i]",
      "[id*='footerBar' i]"
    ];
    // Marketplace action words — ANY fixed bottom element containing these is
    // marketplace chrome the customer must never see (their cart/chat/buy).
    var dockText = /(我的|进货|进货单|购物车|加入进货单|代发|开团|推|客服|联系卖家|收藏|分享|立即下单|立即购买|店铺|首页|分类|消息|下载|打开App|APP下载|客户端)/;
    // Never hide ChinaSuuq's own bottom bar (rendered in native layer, not DOM,
    // so this guard is for safety on any page that mimics our labels).
    function isCsOwn(el) {
      while (el) {
        if (el.getAttribute && el.getAttribute("data-chinasuuq") === "1") return true;
        el = el.parentElement;
      }
      return false;
    }
    function hideKnownBars() {
      // 1) Class/id-pattern bottom bars — kill regardless of size
      var nodes = document.querySelectorAll(selectors.join(","));
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (!el || el.getAttribute("data-cs-market-nav") === "1") continue;
        if (isCsOwn(el)) continue;
        var rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        // Fixed bars are typically 40-160px tall; still catch shorter strips
        if (rect && (rect.height > 220 || rect.width < window.innerWidth * 0.4)) continue;
        el.setAttribute("data-cs-market-nav", "1");
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("visibility", "hidden", "important");
        el.style.setProperty("pointer-events", "none", "important");
      }
      // 2) Text-labeled fixed elements in the bottom 40% of the screen
      var anchors = document.querySelectorAll("a, div, li, span, button");
      for (var j = 0; j < anchors.length; j++) {
        var el2 = anchors[j];
        if (!el2 || el2.getAttribute("data-cs-market-nav") === "1") continue;
        if (isCsOwn(el2)) continue;
        var txt = (el2.innerText || "").trim();
        if (!txt || txt.length > 60) continue;
        var r = el2.getBoundingClientRect ? el2.getBoundingClientRect() : null;
        if (!r || r.height < 24 || r.height > 180) continue;
        if (r.top < window.innerHeight * 0.60) continue; // bottom region only
        if (!dockText.test(txt)) continue;
        if (r.width > window.innerWidth * 0.9 && el2.children.length > 10) continue;
        el2.setAttribute("data-cs-market-nav", "1");
        el2.style.setProperty("display", "none", "important");
        el2.style.setProperty("visibility", "hidden", "important");
        el2.style.setProperty("pointer-events", "none", "important");
        // Collapse empty parent shells so no dead space remains
        var p = el2.parentElement;
        var depth = 0;
        while (p && depth < 3) {
          var pTxt = (p.innerText || "").trim();
          if (pTxt.length <= 60 && p.getBoundingClientRect && p.getBoundingClientRect().top >= window.innerHeight * 0.55 && p.scrollHeight <= 200) {
            p.setAttribute("data-cs-market-nav", "1");
            p.style.setProperty("display", "none", "important");
          } else break;
          p = p.parentElement;
          depth++;
        }
      }
      // 3) position:fixed/sticky elements anchored to the bottom edge —
      //    catch-all for bars with unpredictable class names.
      var all = document.querySelectorAll("div, section, footer");
      for (var k = 0; k < all.length; k++) {
        var el3 = all[k];
        if (!el3 || el3.getAttribute("data-cs-market-nav") === "1") continue;
        if (isCsOwn(el3)) continue;
        var cs = getComputedStyle(el3);
        if (cs.position !== "fixed" && cs.position !== "sticky") continue;
        var r3 = el3.getBoundingClientRect();
        if (r3.height < 30 || r3.height > 200) continue;
        // Sits flush with (or overlapping) the bottom edge of the viewport
        if (r3.bottom < window.innerHeight - 8) continue;
        var t3 = (el3.innerText || "").trim();
        // If it has marketplace action words or is a wide bar → hide
        if (dockText.test(t3) || (r3.width >= window.innerWidth * 0.6 && el3.children.length >= 2)) {
          el3.setAttribute("data-cs-market-nav", "1");
          el3.style.setProperty("display", "none", "important");
          el3.style.setProperty("visibility", "hidden", "important");
          el3.style.setProperty("pointer-events", "none", "important");
        }
      }
    }
    hideKnownBars();
    if (!window.__csMarketNavObserver) {
      var moTimer = null;
      window.__csMarketNavObserver = new MutationObserver(function () {
        if (moTimer) return;
        moTimer = setTimeout(function () { moTimer = null; hideKnownBars(); }, 250);
      });
      window.__csMarketNavObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
    return true;
  } catch (e) { return true; }
})(); true;`;

