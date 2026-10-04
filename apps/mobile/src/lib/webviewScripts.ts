import { RISK_INSIDE_FN } from "./webviewScripts.risk";

// JavaScript injection scripts for the marketplace WebView.
// These run INSIDE the third-party Chinese marketplace page.
//
// TRANSLATION: the old self-contained Google translator (TRANSLATE_SCRIPT,
// translate.googleapis.com + api.mymemory.translated.net) has been REMOVED.
// Both endpoints are blocked/slow in China, and the script self-installed a
// permanent 600ms interval + MutationObserver + drain loop whose hanging 5s
// fetches are what made every page crawl. Translation now runs exclusively
// through the AI path (webviewScripts.ai.ts): the page posts TRIMMED text
// batches to RN, the app's ai-translate edge function answers, and the page
// itself applies them via window.__csApplyTranslations. Originals are kept
// on parent elements as data-cs-orig (with data-cs-tr="1") so language
// switches and "show original" can undo in place.

// ---------------------------------------------------------------------------
// 1. SMART PRODUCT CAPTURE — best-effort scraper for title / price / image / url
//   posts a JSON message back to RN via postMessage({type:"CAPTURE",payload})
// ---------------------------------------------------------------------------
export const PRODUCT_CAPTURE_SCRIPT = `(function () {
  // Run-once guard (per document+href): the app re-injects the full suite on
  // every onLoadEnd AND every SPA NAV ping; without this each ping re-ran the
  // whole scrape (title selectors, price regexes over 20k chars of innerText,
  // every <img>). The MutationObserver-free one-shot is only needed once per
  // page. A manual "Add to Cart" tap sets window.__csCapForce for the current
  // href before injecting, so user-triggered captures always run.
  try {
    if (window.__csCapHref === location.href && window.__csCapForce !== location.href) return true;
    window.__csCapHref = location.href;
  } catch (e) {}
  try {
    var out = { title: "", price: 0, currency: "CNY", image: "", url: location.href, brand: "", moqText: "" };

    // TITLE
    // Class-name patterns carry the weight here: YiwuGo, ChinaGoods and the
    // 1$ store all render the product name in a hashed/webpacked class, so an
    // exact selector rots faster than a substring match.
    var titleSel = ["h1", ".title", ".item-title", ".tb-detail-hd h1", ".d-title", ".sku-name", ".detail-title", ".product-name", ".goods-detail h1", "[class*='goods-title' i]", "[class*='product-title' i]", "[class*='commodity-title' i]", "[class*='goods-name' i]", "[class*='product-name' i]", ".detail-name"];
    for (var i = 0; i < titleSel.length; i++) {
      var el = document.querySelector(titleSel[i]);
      if (el && el.textContent) {
        var tx = el.textContent.replace(/\\s+/g, " ").trim();
        if (tx.length > 8) { out.title = tx.slice(0, 160); break; }
      }
    }
    if (!out.title && document.title) {
      out.title = document.title.replace(/[-_|].*(1688|taobao|yiwugo|chinagoods).*$/gi, "").trim().slice(0, 160);
    }

    // PRICE (CNY). Shipping lines ("Express: ¥5.00起") must never win: they are
    // excluded by keyword here, and the DOM pass prefers the FIRST plausible
    // product price over the biggest number, because the biggest ¥ on a detail
    // page is usually a shipping fee or an old-price strikethrough.
    var priceRe = /(?:¥|￥|RMB|CNY)\\s?([\\d,]+(?:\\.\\d{1,2})?)/gi;
    var shipRe = /运费|快递|物流|邮费|express|shipping|freight|delivery/i;
    var best = 0;
    var priceNodes = document.querySelectorAll(".price, .price-text, .p-price, .tb-rmb-num, .sku-price, .detail-price, [class*='price' i]");
    for (var p = 0; p < priceNodes.length; p++) {
      var txt = priceNodes[p].textContent || "";
      if (shipRe.test(txt)) continue;
      var m = priceRe.exec(txt);
      while (m) {
        var v = parseFloat(m[1].replace(/,/g, ""));
        if (!isNaN(v) && v > 0 && v < 100000000) { if (v > best) best = v; }
        m = priceRe.exec(txt);
      }
    }
    if (!best) {
      var bodyText = (document.body && document.body.innerText || "").slice(0, 20000);
      var mm;
      // priceRe is a shared /gi regex: its lastIndex survives the node loop
      // above, and scanning without a reset would silently skip the top of the
      // page — which is exactly where the price sits.
      priceRe.lastIndex = 0;
      while ((mm = priceRe.exec(bodyText)) !== null) {
        // Reject prices glued to a shipping keyword ("¥5.00起" after "Express:").
        var lineStart = bodyText.lastIndexOf("\\n", mm.index) + 1;
        var lineEnd = bodyText.indexOf("\\n", mm.index);
        if (lineEnd < 0) lineEnd = bodyText.length;
        var lineCtxt = bodyText.slice(lineStart, lineEnd);
        if (shipRe.test(lineCtxt) || /起\\s*$/.test(lineCtxt.trim())) continue;
        var bv = parseFloat(mm[1].replace(/,/g, ""));
        if (!isNaN(bv) && bv > 0 && bv < 100000000) { best = bv; break; }
      }
    }
    // The USD overlay (webviewUsd) REWRITES ¥ prices to $ and blanks the
    // original spans, keeping them in data-cs-usd-orig. Once it has run, the
    // DOM holds no ¥ at all — read the originals back before giving up.
    if (!best) {
      try {
        var usdEls = document.querySelectorAll("[data-cs-usd-orig]");
        for (var ue = 0; ue < usdEls.length && !best; ue++) {
          var utx = usdEls[ue].getAttribute("data-cs-usd-orig") || "";
          if (shipRe.test(utx)) continue;
          priceRe.lastIndex = 0;
          var um = priceRe.exec(utx);
          if (um) {
            var uv = parseFloat(um[1].replace(/,/g, ""));
            if (!isNaN(uv) && uv > 0 && uv < 100000000) best = uv;
          }
        }
      } catch (_) {}
    }
    out.price = best;

    // MOQ EVIDENCE — the minimum-order wording, handed to the parser in
    // src/lib/moqIngest.ts. A WebView cannot read 1688's structured MOQ field,
    // and posting all of innerText on every capture would be wasteful and
    // pointless, so only the lines that could carry a rule are shipped.
    // The English forms matter as much as the Chinese ones: the app's own
    // translation layer rewrites the page before capture, and "360 minimum
    // purchase" is what YiwuGo's 件起购 becomes. Number-first shapes are kept
    // because the parser has a rule for them ("360 minimum purchase").
    var moqLines = [];
    var moqRe = /起批|起订|起购|最小|moq|min\\.?\\s*order|min\\.?\\s*purchas|minimum\\s*(?:order|purchas|qty|quantity)|每箱|装箱|整箱|混批|[≥>]\\s*\\d|件以上|[¥￥]\\s*\\d|\\d+\\s*(?:pcs|pieces?|units?)\\s*minimum/i;
    var moqReNum = /\\b\\d{1,6}\\s*(?:minimum|min\\b)\\b/i;
    var rawLines = String((document.body && document.body.innerText) || "").split("\\n");
    var seenLine = {};
    for (var b = 0; b < rawLines.length && moqLines.length < 40; b++) {
      var ln = rawLines[b].replace(/\\s+/g, " ").trim();
      if (!ln || ln.length > 160 || seenLine[ln] || !(moqRe.test(ln) || moqReNum.test(ln))) continue;
      seenLine[ln] = 1;
      moqLines.push(ln);
    }
    // Translated pages keep their original Chinese in data-cs-orig (set by the
    // translate layer). The original often carries a stronger rule than the
    // translation ("360件起购" vs "360 minimum purchase"), so harvest it too.
    try {
      var origEls = document.querySelectorAll("[data-cs-orig]");
      for (var oe = 0; oe < origEls.length && moqLines.length < 60; oe++) {
        var otx = (origEls[oe].getAttribute("data-cs-orig") || "").replace(/\\s+/g, " ").trim();
        if (!otx || otx.length > 160 || seenLine[otx]) continue;
        if (moqRe.test(otx)) { seenLine[otx] = 1; moqLines.push(otx); }
      }
    } catch (_) {}
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
        // 1$ Dollar Store (huolangjun666 SPA) — Vant puts the class on the
        // <img> itself (img.van-image), not on a wrapper.
        ".goods-img img", "img.van-image", ".van-swipe img",
        "img[class*='goods']", ".commodity-img img",
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
// 5. NAV WATCH — SPA route-change sentinel.
//   Marketplace sites (1688 m-site search, dollarstore #/ hash router,
//   chinagoods) frequently change pages WITHOUT a document reload, so the
//   app never gets onLoadStart/onLoadEnd and its per-page suite (translation,
//   USD overlay, capture, risk detection) would only ever run on the entry
//   page. This tiny watcher posts a NAV message the moment location.href
//   changes (poll + popstate/hashchange listeners for immediacy); the app
//   then clears any stale captured product and re-runs the full suite, so
//   home, search results and product detail all behave identically.
// ---------------------------------------------------------------------------
export const NAV_WATCH_SCRIPT = `(function () {
  try {
    var post = function () {
      try {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "NAV", payload: { url: location.href }
        }));
      } catch (e) {}
    };
    if (!window.__csNavLast) window.__csNavLast = location.href;
    if (!window.__csNavWatch) {
      window.__csNavWatch = setInterval(function () {
        try {
          var h = location.href;
          if (h !== window.__csNavLast) { window.__csNavLast = h; post(); }
        } catch (e) {}
      }, 500);
      try {
        window.addEventListener("popstate", function () { window.__csNavLast = location.href; post(); });
        window.addEventListener("hashchange", function () { window.__csNavLast = location.href; post(); });
      } catch (e) {}
    }
    return true;
  } catch (e) { return true; }
})(); true;`;

// ---------------------------------------------------------------------------
// 4. LOW-RISK MARKET NAV CLEANUP
//   Some marketplace mobile sites render their own fixed bottom tab bar.
//   We hide only elements explicitly named as bottom/tab navigation.
// ---------------------------------------------------------------------------
export const HIDE_MARKET_NAV_SCRIPT = `(function () {
  // Install-once guard (per document+href): every re-inject on the SAME page
  // used to re-run the full three-pass DOM sweep (querySelectorAll over 40+
  // selectors, plus a getComputedStyle loop over every div/section/footer).
  // The MutationObserver below keeps hiding late-mounted bars, and SPA route
  // changes carry a new href, so they legitimately re-scan.
  try {
    if (window.__csHideNavInstalled && window.__csHideNavHref === location.href) return true;
    window.__csHideNavInstalled = true;
    window.__csHideNavHref = location.href;
  } catch (e) {}
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
    ${RISK_INSIDE_FN}
    // The verification widget is never "marketplace chrome" — hiding it is how
    // staff ended up with a captcha they could not drag.
    function isRiskArea(el) { return __csInRisk(el); }
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
        if (isCsOwn(el) || isRiskArea(el)) continue;
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
        if (isCsOwn(el2) || isRiskArea(el2)) continue;
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
        if (isCsOwn(el3) || isRiskArea(el3)) continue;
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

