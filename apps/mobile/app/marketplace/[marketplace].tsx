import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
  FlatList,
  Image,
  Animated,
  BackHandler,
  Platform,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  ArrowLeft,
  ExternalLink,
  Languages,
  MessageCircle,
  ShoppingCart,
  MoreHorizontal,
  X,
  ShieldAlert,
  RefreshCw,
  Home,
} from "lucide-react-native";
import { COLORS } from "@/lib/theme";
import { whatsappOrderLink } from "@/lib/utils";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import SmartProductForm, { type CapturedListing } from "@/components/marketplace/SmartProductForm";
import { useI18n } from "@/lib/i18n";
import { useCartStore } from "@/store/cart";
import { useAuthStore } from "@/store/auth";
import { supabase } from "@/lib/supabase";
import {
  PRODUCT_CAPTURE_SCRIPT,
  LOGIN_WALL_SCRIPT,
  BLANK_PAGE_SCRIPT,
  HIDE_MARKET_NAV_SCRIPT,
  NAV_WATCH_SCRIPT,
} from "@/lib/webviewScripts";
import { AI_TRANSLATE_SCRIPT } from "@/lib/webviewScripts.ai";
import { usdPriceScript } from "@/lib/webviewUsd";
import {
  RISK_WATCH_SCRIPT,
  VISION_SNAPSHOT_SCRIPT,
} from "@/lib/webviewScripts.risk";
import { aiVisionScanListing } from "@/lib/aiVision";
import { captureRef } from "react-native-view-shot";
import { useFx } from "@/lib/exchange";
import { marketplaceBySlug } from "@/config/marketplaceRegistry";
import { getMarketplaceProducts } from "@/db";
import type { Product } from "@/types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getMarketplaceSession, syncMarketplaceSession, cookieInjectScript } from "@/lib/supabase";

// Real marketplace base URLs
const MARKETPLACES: Record<string, { name: string; home: string; loginWalled: boolean }> = {
  "1688": { name: "1688.com", home: "https://m.1688.com", loginWalled: false },
  taobao: { name: "Taobao", home: "https://m.taobao.com", loginWalled: true },
  yiwugo: { name: "YiwuGo", home: "https://www.yiwugo.com", loginWalled: true },
  chinagoods: { name: "ChinaGoods", home: "https://www.chinagoods.com", loginWalled: false },
  dollarstore: { name: "1$ Dollar Store", home: "https://www.huolangjun666.com/#/home", loginWalled: false },
};

// Brand colors + short marks for blocked-state logos
const PLATFORM_BRAND_COLOR: Record<string, string> = {
  "1688": "#FF5000",
  taobao: "#FF6A00",
  yiwugo: "#1A8CFF",
  chinagoods: "#E60012",
  dollarstore: "#FF5A0A",
};
const PLATFORM_MARK: Record<string, string> = {
  "1688": "1688",
  taobao: "TB",
  yiwugo: "YWG",
  chinagoods: "CG",
  dollarstore: "$1",
};

const TL_KEY = "chinasuuq-webview-translate";
const TIP_KEY = "chinasuuq-browser-tip-v1";

// ---- Cookie domain families (staff session sync) ----
// Derived from the MARKETPLACES home URLs above: the registrable domain is
// the family we keep cookies for (e.g. m.1688.com → 1688.com). Probe URLs
// are what we hand to the native cookie store — iOS/Android return the
// cookies that WOULD be sent to that URL (including httpOnly ones like
// 1688's `cookie2`, which document.cookie can never see).
function marketplaceCookieFamily(id: string): string {
  const home = MARKETPLACES[id]?.home ?? MARKETPLACES["1688"].home;
  const host = home.replace(/^https?:\/\//, "").split(/[/?#]/)[0];
  const labels = host.split(".");
  return labels.slice(-2).join(".");
}

function marketplaceCookieProbes(id: string): string[] {
  const family = marketplaceCookieFamily(id);
  const home = MARKETPLACES[id]?.home ?? MARKETPLACES["1688"].home;
  const homeOrigin = home.replace(/^((?:https?:)?\/\/[^/?#]+).*$/, "$1");
  const probes = new Set<string>([
    homeOrigin,
    `https://${family}`,
    `https://www.${family}`,
    `https://m.${family}`,
    `https://login.${family}`,
  ]);
  return Array.from(probes);
}

function cookieDomainInFamily(domain: string | undefined, family: string): boolean {
  const d = String(domain ?? "").toLowerCase().replace(/^\.+/, "");
  if (!d) return false;
  return d === family || d.endsWith("." + family);
}

// Restore the page's original text after AI translation ("show original").
// The AI layer (webviewScripts.ai.ts) stamps each translated node's parent
// with data-cs-orig (the original Chinese) + data-cs-tr="1", and keeps its
// 3s schedule in window.__csAiTrState.timer — so restoring means: undo every
// stamped node from its original, strip the marks, and STOP + reset the AI
// state so no timer keeps posting requests into a screen that shows zh.
const RESTORE_SCRIPT =
  "(function(){try{" +
  "var s=window.__csAiTrState;" +
  "if(s){if(s.timer){clearTimeout(s.timer);s.timer=0;}}" +
  "if(window.__csAiTimer){clearTimeout(window.__csAiTimer);window.__csAiTimer=0;}" +
  "var els=document.querySelectorAll('[data-cs-orig]');" +
  "for(var i=0;i<els.length;i++){var p=els[i];" +
  "var orig=p.getAttribute('data-cs-orig');" +
  "for(var n=0;n<p.childNodes.length;n++){var c=p.childNodes[n];" +
  "if(c&&c.nodeType===3){c.nodeValue=orig;break;}}" +
  "p.removeAttribute('data-cs-tr');p.removeAttribute('data-cs-orig');}" +
  "var marked=document.querySelectorAll('[data-cs-tr=' + String.fromCharCode(34) + '1' + String.fromCharCode(34) + ']');" +
  "for(var m=0;m<marked.length;m++){marked[m].removeAttribute('data-cs-tr');}" +
  "if(s){s.target=null;s.installed=false;s.done={};s.pending={};s.results={};s.map={};s.requests=0;s.idle=0;}" +
  "}catch(e){}})();true;";

export default function MarketplaceBrowser() {
  const { marketplace } = useLocalSearchParams<{ marketplace: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();
  const cartCount = useCartStore((s) => s.items.length);
  const tt = (en: string, so: string) => (locale === "en" ? en : so);

  const meta = MARKETPLACES[marketplace] ?? MARKETPLACES["1688"];
  // Currency the store actually prints. Only the 1$ Dollar Store uses dollars;
  // the registry is the single answer for that, and it decides whether a
  // captured price has to be converted to yuan before it enters the app.
  const usdNative = marketplaceBySlug(marketplace)?.currency === "USD";
  const authUser = useAuthStore((s) => s.user);
  const [url, setUrl] = useState(meta.home);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [translateLang, setTranslateLang] = useState<null | string>(null); // null = original
  const [usdOn, setUsdOn] = useState(true); // ChinaSuuq selling point: prices in USD
  const { cnyPerUsd: fxRate } = useFx(); // live rate from the shared FX store
  // Cached catalog rows carry a `price_usd_estimated` frozen at the moment they
  // were fetched (sometimes at the cold-start default). Everywhere the app shows
  // a dollar price it is re-derived from the yuan figure at the live rate, so a
  // rate change in Admin → Settings reaches every screen on the next render.
  const usdFromCny = useCallback(
    (priceCny: number, storedUsd: number) =>
      priceCny > 0 && fxRate > 0 ? priceCny / fxRate : storedUsd || 0,
    [fxRate]
  );
  const [currentListing, setCurrentListing] = useState<CapturedListing | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [loginWall, setLoginWall] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [cnylist, setCnylist] = useState<number[]>([]);
  const [captureFormVisible, setCaptureFormVisible] = useState(false);
  const [sessionCookieScript, setSessionCookieScript] = useState("");
  const [isStaff, setIsStaff] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [curatedProducts, setCuratedProducts] = useState<Product[]>([]);
  const [curatedLoading, setCuratedLoading] = useState(false);
  const [showCurated, setShowCurated] = useState(false);
  const [tipDismissed, setTipDismissed] = useState(true); // hidden until known
  const [punish, setPunish] = useState<{
    present: boolean;
    hard: boolean;
    /** true when a slider/verification frame is on screen and MUST be touched. */
    interactive: boolean;
  } | null>(null);
  // Mirror of `punish.interactive` for the injection path: while a slide
  // captcha is live, the mutating scripts (translate, USD overlay, capture,
  // nav cleanup) are withheld so nothing rewrites the DOM the risk engine is
  // fingerprinting, and no React layer may cover the widget.
  const riskActiveRef = useRef(false);
  const [aiScanning, setAiScanning] = useState(false);
  // Single write-path for captured listings: keeps the ref-mirror (used by
  // openCaptureForm's fast DOM path) in sync with the state.
  const applyListing = useCallback((listing: CapturedListing | null) => {
    currentListingRef.current = listing;
    setCurrentListing(listing);
  }, []);
  const visionSnapshotRef = useRef<any>(null);
  const visionResolveRef = useRef<((v: any) => void) | null>(null);
  const visionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref-mirror of currentListing so the DOM-capture wait in openCaptureForm
  // sees the fresh value instead of a stale closure.
  const currentListingRef = useRef<CapturedListing | null>(null);
  const webRef = useRef<any>(null);
  // Last URL observed from inside the page (NAV) or a real navigation. Used
  // to (a) ignore duplicate NAV pings and (b) avoid feeding a URL back into
  // `source={{ uri }}` that the WebView is already showing (reload loop).
  const navUrlRef = useRef<string>("");
  // Leading+trailing throttle for the NAV-triggered script suite re-injection:
  // fast SPA users can fire NAV every few hundred ms, and each ping used to
  // re-inject the whole suite (100ms after load + 60ms after every NAV =
  // injection storms). 800ms keeps the page responsive without re-scan churn.
  const navThrottleRef = useRef<{ last: number; timer: ReturnType<typeof setTimeout> | null }>({
    last: 0,
    timer: null,
  });

  // ---- UX polish: Android hardware back = WebView back; progress bar ----
  const [progress, setProgress] = useState(0); // 0..1, 1 = done
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) {
        webRef.current?.goBack();
        return true; // consumed — stay inside the browser
      }
      return false; // let router pop back to markets list
    });
    return () => sub.remove();
  }, [canGoBack]);

  // Branded skeleton shimmer: gentle infinite opacity pulse while loading
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  // restore translation pref + one-time tip state + warm FX cache
  useEffect(() => {
    (async () => {
      try {
        const s = await AsyncStorage.getItem(TL_KEY);
        // Instant English: default to EN translation on first launch instead
        // of raw Chinese. Users can still switch to SO or original.
        if (s === null) {
          // AUTO-SET translation to English immediately for faster experience
          setTranslateLang("en");
          await AsyncStorage.setItem(TL_KEY, JSON.stringify("en"));
        } else {
          setTranslateLang(JSON.parse(s));
        }
        const tip = await AsyncStorage.getItem(TIP_KEY);
        setTipDismissed(tip === "1");
      } catch {}
    })();
  }, []);

  // Fetch the shared marketplace SESSION (cookies only — no credentials in
  // the customer app anymore) and curated products on mount.
  useEffect(() => {
    (async () => {
      try {
        const session = await getMarketplaceSession(marketplace || "1688");
        if (session?.cookies) {
          setSessionCookieScript(cookieInjectScript(session.cookies));
        }
        setCuratedLoading(true);
        const products = await getMarketplaceProducts(marketplace || "1688");
        setCuratedProducts(products);
      } catch {
        // silent - curated products will be empty, WebView still works
      } finally {
        setCuratedLoading(false);
      }
    })();
  }, [marketplace]);

  // Staff gate for the "Sync session" header button: profiles.role is the
  // coarse server-side role; only staff/super_admin may push a session.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!authUser?.id) {
        if (alive) setIsStaff(false);
        return;
      }
      try {
        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", authUser.id)
          .maybeSingle();
        const role = String((data as any)?.role ?? "");
        if (alive) setIsStaff(role === "staff" || role === "super_admin");
      } catch {
        if (alive) setIsStaff(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [authUser?.id]);

  // ---- Staff: read this WebView's native cookies and push them server-side.
  // httpOnly cookies (1688's `cookie2` etc.) are ONLY readable through the
  // native cookie store — never via document.cookie — which is why we use
  // @react-native-cookies/cookies. In Expo Go / web the native module is
  // absent, so require() throws and we show a clear message instead.
  const syncSession = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const title = t("browser.syncSession");
    try {
      let CookieManager: any = null;
      
      // Check if we're in Expo Go (native modules not available)
      if (typeof require !== 'undefined' && Platform.OS !== "web") {
        try {
          const mod = require("@react-native-cookies/cookies");
          CookieManager = mod?.default ?? mod;
        } catch (e) {
          CookieManager = null;
        }
      }
      
      if (!CookieManager) {
        // Gracefully handle missing native module - show info instead of crash
        console.log("[SyncSession] Native cookie module not available - using WebView directly");
        // Don't crash, just return - the WebView will still work
        return;
      }
      const id = marketplace || "1688";
      const family = marketplaceCookieFamily(id);
      const found: Record<string, string> = {};
      for (const probe of marketplaceCookieProbes(id)) {
        try {
          const jar = await CookieManager.get(probe, false);
          Object.entries<any>(jar ?? {}).forEach(([name, c]) => {
            // c is a Cookie object ({name, value, domain…}); fall back to string maps
            const value = typeof c === "string" ? c : c?.value;
            const domain = typeof c === "string" ? undefined : c?.domain;
            if (!value) return;
            if (domain && !cookieDomainInFamily(domain, family)) return;
            found[name] = value;
          });
        } catch {
          // one probe failing (e.g. unsupported sub-API) must not kill the sync
        }
      }
      const pairs = Object.keys(found).map((k) => `${k}=${found[k]}`);
      if (pairs.length === 0) {
        Alert.alert(
          title,
          tt(
            "No " + meta.name + " cookies found on this device yet. Sign in to " + meta.name + " inside this screen first, then sync.",
            "Ma jiraan cookies " + meta.name + " ah. Marka hore " + meta.name + " ka gal shaashaddan, kadib isku xir."
          )
        );
        return;
      }
      const res = await syncMarketplaceSession(id, pairs.join("; "));
      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          title,
          tt(
            "Session synced — " + pairs.length + " cookies saved for " + meta.name + ".",
            "Fadhiga la isku xiray — " + pairs.length + " cookies ayaa la kaydiyay " + meta.name + "."
          )
        );
      } else {
        Alert.alert(
          title,
          tt(
            "Sync failed: " + (res.error || "unknown error"),
            "Isku xirku wuu fashilmay: " + (res.error || "khalad aan la aqoon")
          )
        );
      }
    } finally {
      setSyncing(false);
    }
  }, [syncing, marketplace, meta.name, locale, t]);

  // Re-run per-page scripts after navigation completes (one bridge call).
  const runPerPageScripts = useCallback(
    (webview: any, delay = 0) => {
      const post = () => {
        try {
          // A live slide-captcha is the one page we do not touch: no text
          // rewriting, no price overlay, no chrome hiding. Watcher + route
          // sentinel only, so the verification widget keeps its own DOM.
          if (riskActiveRef.current) {
            webview?.injectJavaScript?.(
              "(function(){" + [NAV_WATCH_SCRIPT, RISK_WATCH_SCRIPT].join(";") + "})();true;"
            );
            return;
          }
          const parts: string[] = [];
          // Route sentinel first: must be installed even if a later script
          // throws, so SPA page types keep getting the full suite.
          parts.push(NAV_WATCH_SCRIPT);
          // NOTE: the session cookie script is injected ONLY via
          // injectedJavaScriptBeforeContentLoaded — pushing it here too was a
          // double inject (document.cookie writes per cookie, twice per page).
          parts.push(LOGIN_WALL_SCRIPT);
          parts.push(BLANK_PAGE_SCRIPT);
          parts.push(RISK_WATCH_SCRIPT);
          parts.push(PRODUCT_CAPTURE_SCRIPT);
          parts.push(HIDE_MARKET_NAV_SCRIPT);
          // USD prices: ChinaSuuq selling point — never show RMB, but only while the
          // live rate is plausible; outside its band usdPriceScript() returns "" and
          // the page keeps the yuan prices it printed itself.
          const usdScript = usdOn ? usdPriceScript(fxRate) : "";
          if (usdScript) {
            parts.push("window.__CS_RATE=" + fxRate + ";" + usdScript);
          }
          // AI translation: only while the user actually has a target language.
          // translateLang === null means "show original" was chosen — forcing
          // "en" back in here used to silently undo that on every SPA route.
          if (translateLang) {
            parts.push("window.__CS_TL=" + JSON.stringify(translateLang) + ";" + AI_TRANSLATE_SCRIPT);
          }
          const combined = "(function(){" + parts.join(";") + "})();true;";
          webview?.injectJavaScript?.(combined);
        } catch {}
      };
      setTimeout(post, delay);
    },
    [translateLang, usdOn, fxRate]
  );

  // NAV-ping-driven suite run, throttled leading+trailing (~800ms). Real
  // navigations (onLoadEnd) still run unthrottled.
  const runPerPageScriptsThrottled = useCallback(() => {
    const th = navThrottleRef.current;
    const now = Date.now();
    const wait = 800 - (now - th.last);
    if (wait <= 0) {
      if (th.timer) { clearTimeout(th.timer); th.timer = null; }
      th.last = now;
      runPerPageScripts(webRef.current, 60);
    } else if (!th.timer) {
      th.timer = setTimeout(() => {
        th.timer = null;
        th.last = Date.now();
        runPerPageScripts(webRef.current, 0);
      }, wait);
    }
  }, [runPerPageScripts]);

  useEffect(() => {
    const th = navThrottleRef.current;
    return () => {
      if (th.timer) clearTimeout(th.timer);
    };
  }, []);

  // Listen for translation requests from WebView. The page script has already
  // stamped data-cs-orig/data-cs-tr on every requested node's parent and keeps
  // live node refs in window.__csAiTrState.map, keyed by TRIMMED original text.
  // All DOM application lives in the script (single source) — the app only
  // answers with window.__csApplyTranslations(originals, translated).
  const handleTranslateRequest = useCallback(async (data: any) => {
    const texts = Array.isArray(data?.texts) ? data.texts : null;
    if (!texts || texts.length === 0) return;
    const targetLang = String(data?.targetLang || "en");

    try {
      const { translateTexts } = await import("@/api/translate");
      const translations = await translateTexts(texts, targetLang);
      // translateTexts keys by the TRIMMED source string — request with the
      // same key the page stamped so lookups can't miss on whitespace.
      const originals = texts.map((t: string) => String(t || "").trim());
      const translated = originals.map((t: string) => translations[t] || t);

      webRef.current?.injectJavaScript?.(
        "window.__csApplyTranslations && window.__csApplyTranslations(" +
          JSON.stringify(originals) +
          "," +
          JSON.stringify(translated) +
          ");true;"
      );
    } catch (error) {
      console.error("[CS] Translation failed:", error);
    }
  }, []);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        let parsed: any = {};
        try {
          parsed = JSON.parse(event.nativeEvent.data);
        } catch (e) {
          return;
        }
        
        const { type, payload } = parsed;

        // Handle AI translation requests. The page posts a FLAT message
        // ({type, texts, targetLang}); accept both shapes so a future
        // payload-wrapped variant keeps working — reading only `payload`
        // is what silently dropped every request before.
        if (type === "TRANSLATE_REQUEST") {
          handleTranslateRequest({
            texts: parsed.texts ?? payload?.texts,
            targetLang: parsed.targetLang ?? payload?.targetLang,
          });
          return;
        }

        if (type === "NAV") {
          // SPA route change inside the same document (home → search results
          // → product detail without a reload). Mirror what onLoadStart does
          // for real navigations, then re-run the per-page suite (throttled)
          // so translation, USD prices, capture and risk detection behave
          // identically on every in-marketplace page type.
          const next = String(payload?.url || "");
          if (!next || navUrlRef.current === next) return;
          navUrlRef.current = next;
          setUrl(next);
          applyListing(null);
          setCaptureBusy(false);
          setShowCurated(false);
          runPerPageScriptsThrottled();
        } else if (type === "LOGIN_WALL") {
          if (meta.loginWalled && !loginWall) {
            setLoginWall(true);
            if (curatedProducts.length > 0) setShowCurated(true);
          }
        } else if (type === "BLANK") {
          if (meta.loginWalled) {
            setBlocked(true);
            if (curatedProducts.length > 0) setShowCurated(true);
          }
        } else if (type === "PUNISH") {
          // Live risk-wall state from RISK_WATCH_SCRIPT. `interactive` means a
          // slider or verification frame is on screen: the app must then show
          // NOTHING over the WebView and must stop mutating the page.
          const present = !!payload?.present;
          const interactive = !!payload?.interactive;
          const wasActive = riskActiveRef.current;
          riskActiveRef.current = present;
          setPunish(
            present
              ? { present: true, hard: !!payload?.hard, interactive }
              : null
          );
          // Wall just cleared → put translation / USD / capture back.
          if (wasActive && !present) {
            runPerPageScripts(webRef.current, 120);
          }
        } else if (type === "VISION_SCAN") {
          // Resolve the pending runAiScan promise with the DOM hints — without
          // this the scan always waited out the 1200ms timeout with null,
          // losing DOM hints, MOQ authority and the price-replaced-by-DOM path.
          const snap = payload || null;
          visionSnapshotRef.current = snap;
          if (visionResolveRef.current) {
            visionResolveRef.current(snap);
          }
        } else if (type === "CAPTURE") {
          setCaptureBusy(false);
          setBlocked(false);
          setShowCurated(false);
          const p = payload || {};
          const raw = Number(p.price) || 0;
          // The 1$ Dollar Store prints DOLLARS, yet every field downstream
          // (`listing.price` → price_cny, cart, order) is yuan, and the capture
          // script is currency-blind once its ¥ regex misses and the JSON blob
          // fallback supplies the number. Converting at this boundary keeps the
          // phone and the server (ai-vision / product-enrich apply the same
          // usd-native guard) in agreement: $5 becomes ¥33.40, and dividing that
          // back gives $5 — not the $0.75 an unconverted dollar figure would.
          const priceCny =
            usdNative && raw > 0
              ? Math.round(raw * fxRate * 100) / 100
              : raw;
          setCnylist((prev) => [...prev.slice(-4), priceCny]);
          const idMatch = (p.url || "").match(/id[/=]([0-9]+)/);
          const numMatch = (p.url || "").match(/[0-9]{5,}/);
          const srcId = idMatch?.[1] || numMatch?.[0] || String(Date.now());
          applyListing({
            title: p.title || "Detected product",
            price: priceCny,
            image: p.image || "",
            url: p.url || url,
            brand: p.brand || "",
            platform: marketplace || "1688",
            sourceId: srcId,
            // The MOQ wording scraped off the page (PRODUCT_CAPTURE_SCRIPT).
            // Dropping it here is what left the review sheet blind to "10件起批".
            moqText: typeof p.moqText === "string" ? p.moqText : "",
          });
        }
      } catch {}
    },
    [marketplace, url, meta.loginWalled, loginWall, curatedProducts.length, applyListing, runPerPageScripts, runPerPageScriptsThrottled, handleTranslateRequest, fxRate, usdNative]
  );

  // ---- AI Vision scan: screenshot + DOM hints → structured listing ----------
  // PERF: snapshot and screenshot run in PARALLEL; upload downscaled.
  const runAiScan = useCallback(async () => {
    if (aiScanning) return;
    setAiScanning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      // 1+2. Grab DOM hints AND screenshot in PARALLEL (was sequential)
      const snapshotPromise: Promise<any> = new Promise((resolve) => {
        // Wrapper resolves ONCE and kills the fallback timer, so a real
        // VISION_SCAN reply arriving late can't be beaten by the timeout.
        const settle = (v: any) => {
          if (visionTimeoutRef.current) {
            clearTimeout(visionTimeoutRef.current);
            visionTimeoutRef.current = null;
          }
          visionResolveRef.current = null;
          resolve(v);
        };
        visionResolveRef.current = settle;
        visionSnapshotRef.current = null;
        try {
          webRef.current?.injectJavaScript(VISION_SNAPSHOT_SCRIPT);
        } catch {
          settle(null);
          return;
        }
        // hints normally arrive in <500ms; hard stop at 1200ms
        visionTimeoutRef.current = setTimeout(() => settle(null), 800);
      });
      const shotPromise = captureRef(webRef.current, {
        format: "jpg",
        quality: 0.35, // downscaled upload: 2-4x faster on mobile data
        result: "base64",
      }).catch(() => null);

      const [snapshot, shot] = await Promise.all([snapshotPromise, shotPromise]);
      const shotB64 = typeof shot === "string" ? shot : null;

      // 3. FAST PATH: if DOM hints already have title + price, skip the
      //    screenshot upload entirely — pure-text vision call (2-3s total).
      //    Screenshot only attached when hints are incomplete OR no MOQ
      //    evidence was scraped — the model reads MOQ off the image when the
      //    page text gave us nothing.
      const snapshotOk = snapshot && snapshot.title && Number(snapshot.price) > 0;
      const hasMoqEvidence = !!(snapshot && snapshot.moqText && snapshot.moqText.trim());
      const vision = await aiVisionScanListing({
        marketplace,
        screenshotBase64: snapshotOk && hasMoqEvidence ? null : shotB64,
        snapshot: snapshot
          ? {
              title: snapshot.title,
              price: snapshot.price,
              priceMax: snapshot.priceMax,
              moqText: snapshot.moqText,
              images: snapshot.images,
              url: snapshot.url || url,
            }
          : { url },
      });

      if (vision) {
        const idMatch = (vision.title + url).match(/([0-9]{5,})/);
        // DOM-scraped MOQ text is more trustworthy than anything the vision
        // model read off a compressed screenshot — prefer it.
        const domMoq = snapshot?.moqText || "";
        applyListing({
          title: vision.title,
          price: vision.price_cny,
          image: (snapshot?.images && snapshot.images[0]) || "",
          url: snapshot?.url || url,
          brand: vision.category || "",
          platform: marketplace || "1688",
          sourceId: idMatch?.[1] || "ai-" + Date.now(),
          moqText: domMoq || vision.moq_text || (vision.moq ? `${vision.moq}件起批` : ""),
          // AI-read variants (Color/Size/…) + category — SmartProductForm
          // renders these as tappable chips with a free-text fallback.
          aiVariants: vision.variants ?? [],
          aiCategory: vision.category ?? null,
        });
        setCaptureFormVisible(true);
      } else {
        Alert.alert(
          tt("AI Scan", "AI Scan"),
          tt(
            "Couldn't read this page automatically. Open the product, scroll it into view, and try again — or add details manually.",
            "Lama akhriyin bogga si toos ah. Fur alaabta, muuji shaashadda, oo isku day mar kale."
          )
        );
      }
    } finally {
      setAiScanning(false);
    }
  }, [aiScanning, marketplace, url, tt]);

  // ---- Punish-page recovery -------------------------------------------------
  const goBack = useCallback(() => webRef.current?.goBack(), []);
  const reload = useCallback(() => {
    setPunish(null);
    // A reload is a fresh document: let the full suite back in, the watcher
    // re-declares the wall within 700ms if 1688 shows it again.
    riskActiveRef.current = false;
    webRef.current?.reload();
  }, []);
  const openExternal = useCallback(() => {
    Linking.openURL(url).catch(() =>
      Alert.alert(tt("Error", "Khalad"), tt("Could not open this link.", "Lama furin kara bogga."))
    );
  }, [url, locale]);

  // ---- Language control (Translate to English / Somali / Original) ----
  // EN/SO now go through the AI path (same as the auto-translated suite):
  // re-injecting AI_TRANSLATE_SCRIPT with a new window.__CS_TL makes the page
  // script itself restore the previous target's originals and re-translate.
  // The Google TRANSLATE_SCRIPT is gone — its blocked-in-China fetch endpoints
  // (translate.googleapis.com / api.mymemory) were the source of the slowness.
  const setLanguage = useCallback(
    async (next: string | null) => {
      Haptics.selectionAsync();
      try {
        await AsyncStorage.setItem(TL_KEY, JSON.stringify(next));
      } catch {}
      setTranslateLang(next);
      if (webRef.current) {
        if (next) {
          webRef.current.injectJavaScript(
            "window.__CS_TL=" + JSON.stringify(next) + ";" + AI_TRANSLATE_SCRIPT
          );
        } else {
          webRef.current.injectJavaScript(RESTORE_SCRIPT);
        }
      }
    },
    []
  );

  const showLanguageMenu = useCallback(() => {
    Haptics.selectionAsync();
    Alert.alert(
      tt("Translation", "Turjumaad"),
      tt("Choose the language for this marketplace page.", "Dooro luqadda bogga suuqa."),
      [
        { text: "English", onPress: () => setLanguage("en") },
        { text: "Soomaali", onPress: () => setLanguage("so") },
        { text: tt("Show original", "Muuji asalka"), onPress: () => setLanguage(null) },
        { text: t("common.cancel"), style: "cancel" },
      ]
    );
  }, [setLanguage, locale, t]);

  // ---- Overflow menu: source details, open externally, reload, help ----
  const showOverflowMenu = useCallback(() => {
    Haptics.selectionAsync();
    Alert.alert(meta.name, undefined as any, [
      {
        text: t("browser.sourceDetails"),
        onPress: () =>
          Alert.alert(
            t("browser.sourceDetails"),
            url.length > 220 ? url.slice(0, 220) + "..." : url
          ),
      },
      { text: tt("Open in browser", "Fur biraawsarka"), onPress: openExternal },
      { text: tt("Reload page", "Dib u cusboonaysii"), onPress: reload },
      {
        text: t("browser.help") + " - WhatsApp",
        onPress: () => {
          Linking.openURL(whatsappOrderLink("from " + meta.name + " (via ChinaSuuq)")).catch(() =>
            Alert.alert(tt("Error", "Khalad"), tt("WhatsApp is not available.", "WhatsApp lama heli karo."))
          );
        },
      },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }, [url, meta.name, openExternal, reload, locale, t]);

  const dismissTip = useCallback(() => {
    setTipDismissed(true);
    AsyncStorage.setItem(TIP_KEY, "1").catch(() => {});
  }, []);

  const requestSourcing = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(whatsappOrderLink("from " + meta.name + " (via ChinaSuuq)")).catch(() =>
      Alert.alert(tt("Error", "Khalad"), tt("WhatsApp is not available.", "WhatsApp lama heli karo."))
    );
  }, [meta.name, locale]);

  const dismissLoginWall = useCallback(() => setLoginWall(false), []);

  // Manual capture: bypass PRODUCT_CAPTURE_SCRIPT's run-once guard so the
  // user can always re-scrape the page they're looking at, even when the
  // auto-capture on page load already ran for this exact href.
  const tapCapture = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCaptureBusy(true);
    setCurrentListing(null);
    setTimeout(() => {
      try {
        webRef.current?.injectJavaScript?.(
          "try{window.__csCapForce=location.href;}catch(e){};" + PRODUCT_CAPTURE_SCRIPT
        );
      } catch {}
    }, 200);
  }, []);

  // Open the review sheet. Without a captured listing, run the product-capture
  // script first; if DOM capture yields nothing useful, AI Vision reads the
  // screen for any signed-in user (customer or staff). Guests never reach
  // here — the bar routes them to sign in first.
  const openCaptureForm = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (currentListing && currentListing.price > 0) {
      setCaptureFormVisible(true);
      return;
    }
    // Try silent DOM capture first
    tapCapture();
    // Poll the ref-mirror — the CAPTURE message updates it synchronously via
    // the message handler, so we return the moment the DOM script succeeds
    // (fast path) instead of always waiting the full 1.4s.
    for (let i = 0; i < 7; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const cur = currentListingRef.current;
      if (cur && cur.price > 0) {
        setCaptureFormVisible(true);
        return;
      }
    }
    // DOM capture failed → AI Vision (screenshot + edge scan) reads the page.
    // Available to every SIGNED-IN user: the ai-vision edge function already
    // admits the customer role, and a customer who cannot scrape a page has
    // nowhere else to get a title/price from. Guests never reach this button
    // (the bar sends them to sign in), and if the scan itself comes back
    // empty runAiScan already opens nothing, so fall through to the manual
    // form rather than leaving the tap dead.
    if (authUser) {
      const before = currentListingRef.current;
      await runAiScan();
      if (!currentListingRef.current || currentListingRef.current === before) {
        setCaptureFormVisible(true);
      }
    } else {
      setCaptureFormVisible(true);
    }
  }, [currentListing, tapCapture, runAiScan, authUser]);

  // ---- Context-aware bottom bar state ----
  // (pageState was removed: nothing rendered from it)

  const localListing: CapturedListing = currentListing ?? {
    title: "Detected product",
    price: cnylist.length ? cnylist[cnylist.length - 1] : 0,
    image: "",
    url,
    brand: "",
    platform: marketplace || "1688",
    sourceId: String(Date.now()),
    // Nothing has been scraped yet — the sheet then honestly says "no minimum found".
    moqText: "",
  };

  const requestCheckout = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const label = (localListing.title || "Product") + (localListing.price > 0 ? " - CNY " + localListing.price : "");
    Linking.openURL(whatsappOrderLink(label)).catch(() =>
      Alert.alert(tt("Error", "Khalad"), tt("WhatsApp is not available.", "WhatsApp lama heli karo."))
    );
  }, [localListing, locale]);

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container} edges={["top"]}>
        {/* Clean header — back (WebView-history aware), marketplace identity, actions */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => (canGoBack ? webRef.current?.goBack() : router.back())}
            style={styles.headerBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft size={20} color={COLORS.black} strokeWidth={2.2} />
          </TouchableOpacity>

          {/* Marketplace icon + title */}
          <View style={styles.headerTitleWrap}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.headerIconWrap, { backgroundColor: (PLATFORM_BRAND_COLOR[marketplace ?? "1688"] || "#FF5000") + "14" }]}>
                <Text style={[styles.headerIconText, { color: PLATFORM_BRAND_COLOR[marketplace ?? "1688"] || "#FF5000" }]}>
                  {PLATFORM_MARK[marketplace ?? "1688"]}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle} numberOfLines={1}>{meta.name}</Text>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {t("browser.shoppingThroughChinaSuuq")}
                </Text>
              </View>
            </View>
          </View>

          {/* 2 essential buttons: jump to market home + cart */}
          {isStaff && (
            <TouchableOpacity
              onPress={() => { syncSession().catch(() => {}); }}
              style={styles.headerBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={t("browser.syncSession")}
            >
              {syncing ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <RefreshCw size={17} color={COLORS.primary} strokeWidth={2.2} />
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => {
              if (url !== meta.home) {
                setUrl(meta.home);
              }
            }}
            style={styles.headerBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Home size={18} color={COLORS.gray600} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push("/cart")}
            style={styles.headerBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ShoppingCart size={18} color={COLORS.gray600} strokeWidth={2} />
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount > 9 ? "9+" : cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={showOverflowMenu}
            style={styles.headerBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MoreHorizontal size={18} color={COLORS.gray600} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Slim loading progress bar */}
        {loading && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(progress * 100, 12)}%` }]} />
          </View>
        )}

        {/* Compact language control — hidden entirely when punish overlay active */}
        {!punish && (
        <View style={styles.langBar}>
          <TouchableOpacity
            onPress={showLanguageMenu}
            style={[styles.langPill, !!translateLang && styles.langPillActive]}
            activeOpacity={0.8}
          >
            <Languages size={14} color={translateLang ? COLORS.white : COLORS.primary} />
            <Text style={[styles.langPillText, !!translateLang && styles.langPillTextActive]}>
              {translateLang === "so"
                ? t("browser.translateToSomali")
                : t("browser.translateToEnglish")}
            </Text>
            <Text style={[styles.langCaret, !!translateLang && styles.langPillTextActive]}>▾</Text>
          </TouchableOpacity>
          {!!translateLang && (
            <TouchableOpacity
              onPress={() => setLanguage(null)}
              style={styles.langReset}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.langResetText}>{t("browser.showOriginal")}</Text>
            </TouchableOpacity>
          )}
          {/* USD/CNY toggle — ChinaSuuq shows dollars by default */}
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              const next = !usdOn;
              setUsdOn(next);
              try {
                if (next) {
                  const usdScript = usdPriceScript(fxRate);
                  // "" = the rate is outside the plausible band: leave the page's
                  // own ¥ prices on screen instead of injecting a wrong rewrite.
                  if (usdScript) {
                    webRef.current?.injectJavaScript(
                      "window.__CS_RATE=" + fxRate + ";" + usdScript
                    );
                  }
                } else {
                  webRef.current?.injectJavaScript("window.__csUsdRestore && window.__csUsdRestore(); true;");
                }
              } catch {}
            }}
            style={[styles.usdPill, usdOn && styles.usdPillActive]}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.usdPillText, usdOn && styles.usdPillTextActive]}>$</Text>
          </TouchableOpacity>
        </View>
        )}

        {/* Marketplace page gets the rest of the screen */}
        <View style={styles.webWrap} collapsable={false}>
          <WebView
            ref={webRef}
            source={{ uri: url }}
            style={styles.web}
            onMessage={onMessage}
            onNavigationStateChange={(nav: any) => {
              navUrlRef.current = nav.url || "";
              setUrl(nav.url);
              setCanGoBack(nav.canGoBack);
            }}
            onProgress={(e: any) => setProgress(e.nativeEvent.progress)}
            onShouldStartLoadWithRequest={(req) => {
              const u = req.url || "";
              const scheme = u.split(":")[0]?.toLowerCase();
              // App-awakening deep links try to open native apps - block them
              // so the customer stays inside ChinaSuuq instead of erroring.
              const BLOCKED_APP_SCHEMES = new Set([
                "wireless1688", "tbopen", "openapp", "openapp.jdmobile",
                "alipay", "alipays", "aliopen", "taobao", "tmall", "jd",
                "weixin", "wechat", "snssdk", "sinaweibo",
              ]);
              if (BLOCKED_APP_SCHEMES.has(scheme)) {
                return false;
              }
              // Real intents / app store links open outside (rare; just block)
              if (/^(intent|itms|itms-apps|market|fb|messenger|tg|mailto|tel):/i.test(u)) {
                Linking.openURL(u).catch(() => {});
                return false;
              }
              if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("chinasuuq://")) {
                return true;
              }
              return false;
            }}
            onLoadStart={() => {
              setLoading(true);
              applyListing(null);
              setCnylist([]);
              setLoginWall(false);
              setBlocked(false);
              setCaptureBusy(false);
              setPunish(null);
              riskActiveRef.current = false;
            }}
            onLoadEnd={() => {
              // Fast path: hide loader immediately for perceived performance
              setLoading(false);
              if (webRef.current) {
                // Inject scripts with minimal delay for faster rendering
                runPerPageScripts(webRef.current, 100);
              }
            }}
            onError={() => {
              setLoading(false);
            }}
            startInLoadingState
            javaScriptEnabled
            domStorageEnabled
            cacheEnabled
            // Session hygiene: keep 3rd-party cookies (login sessions persist
            // across visits) and present a stable device profile to risk engines.
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            // Device profile must MATCH the engine. This used to be a fixed
            // "Android 13; Pixel 7 / Chrome 120" string on every platform, so
            // on iPhone the UA said Android while navigator.platform, the
            // touch points, the GPU renderer and the vendor all said Apple —
            // and Alibaba's slide-captcha answered "验证失败 (error:WAMR4)"
            // before the handle could be dragged. An honest per-platform UA
            // gets the slider to validate; the Android string also drops the
            // default WebView's "; wv)" tell.
            userAgent={
              Platform.OS === "ios"
                ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1"
                : "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
            }
            setBuiltInZoomControls={false}
            setSupportMultipleWindows={false}
            javaScriptCanOpenWindowsAutomatically={false}
            allowsInlineMediaPlayback
            allowsBackForwardNavigationGestures
            mixedContentMode="compatibility"
            // session cookies are set per-host via injectedJavaScriptBeforeContentLoaded
            injectedJavaScriptBeforeContentLoaded={sessionCookieScript || undefined}
            enableZoomControls={false}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            overScrollMode="never"
            keyboardDisplayRequiresUserAction={false}
          />
          {loading && (
            <View style={styles.skeletonOverlay} pointerEvents="none">
              <Animated.View style={[styles.skeletonBody, { opacity: pulse }]}>
                <View style={styles.skeletonBrand}>
                  <View style={[styles.skeletonLogo, { backgroundColor: PLATFORM_BRAND_COLOR[marketplace ?? "1688"] || "#FF5000" }]}>
                    <Text style={styles.skeletonLogoText}>
                      {PLATFORM_MARK[marketplace ?? "1688"] || "CS"}
                    </Text>
                  </View>
                  <View style={styles.skeletonBrandText}>
                    <View style={[styles.skeletonLine, styles.skeletonLineBrand, { backgroundColor: (PLATFORM_BRAND_COLOR[marketplace ?? "1688"] || "#FF5000") + "2E" }]} />
                    <Text style={styles.skeletonName}>{meta.name}</Text>
                    <View style={[styles.skeletonLine, styles.skeletonLineSub, { backgroundColor: COLORS.border }]} />
                  </View>
                </View>
                <View style={[styles.skeletonImage, { backgroundColor: (PLATFORM_BRAND_COLOR[marketplace ?? "1688"] || "#FF5000") + "16" }]} />
                <View style={styles.skeletonTextBlock}>
                  <View style={[styles.skeletonLine, styles.skeletonLineWide, { backgroundColor: COLORS.border }]} />
                  <View style={[styles.skeletonLine, styles.skeletonLineMid, { backgroundColor: COLORS.border }]} />
                  <View style={[styles.skeletonLine, styles.skeletonLineShort, { backgroundColor: COLORS.border }]} />
                </View>
              </Animated.View>
            </View>
          )}

          {/* Branded blocked-state: curated catalog fallback */}
          {(blocked || showCurated) && (
            <View style={styles.blockedOverlay}>
              <TouchableOpacity
                onPress={() => { setBlocked(false); setShowCurated(false); }}
                style={styles.blockedClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={16} color={COLORS.gray500} />
              </TouchableOpacity>
              <View style={[styles.blockedLogo, { backgroundColor: PLATFORM_BRAND_COLOR[marketplace ?? "1688"] || "#FF5000" }]}>
                <Text style={styles.blockedLogoText}>
                  {PLATFORM_MARK[marketplace ?? "1688"] || "CS"}
                </Text>
              </View>
              <Text style={styles.blockedTitle}>
                {meta.name} {blocked ? tt("needs a sign-in", "waxay u baahan tahay galin") : tt("- curated picks", "- xulasho la doortay")}
              </Text>
              <Text style={styles.blockedBody}>
                {blocked
                  ? tt(
                      meta.name + " blocks in-app browsing for guests. Below are products from " + meta.name + " you can add to your cart right away.",
                      meta.name + " wuu xannaynayaa gelinta bogagga. Hoos waxaa jira alaabta " + meta.name + " ee aad hadda ku darsan karto gaadhigaaga."
                    )
                  : tt(
                      "Products sourced from " + meta.name + " - tap to view details and add to cart.",
                      "Alaabta laga soo qaaday " + meta.name + " - taabo si aad u arag faahfaahinta."
                    )}
              </Text>

              {curatedLoading ? (
                <View style={styles.curatedLoader}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.curatedLoaderText}>{t("common.loading")}</Text>
                </View>
              ) : curatedProducts.length > 0 ? (
                <FlatList
                  data={curatedProducts}
                  keyExtractor={(item) => item.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.curatedList}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.curatedCard}
                      activeOpacity={0.85}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push({ pathname: "/product/[id]", params: { id: item.id } });
                      }}
                    >
                      {item.images?.[0] ? (
                        <Image source={{ uri: item.images[0] }} style={styles.curatedImg} resizeMode="cover" />
                      ) : (
                        <View style={[styles.curatedImg, styles.curatedImgFallback]}>
                          <Text style={styles.curatedImgFallbackText}>{item.title_english.slice(0, 1)}</Text>
                        </View>
                      )}
                      <Text style={styles.curatedName} numberOfLines={2}>{item.title_english}</Text>
                      <Text style={styles.curatedPrice}>{"$" + usdFromCny(Number(item.price_cny_min) || 0, Number(item.price_usd_estimated) || 0).toFixed(2)}</Text>
                    </TouchableOpacity>
                  )}
                />
              ) : (
                <Text style={styles.curatedEmpty}>
                  {tt("No curated products yet for", "Weli ma jiraan xulasho ugu")} {meta.name}.
                </Text>
              )}

              <View style={styles.blockedActions}>
                {blocked && (
                  <TouchableOpacity style={styles.blockedPrimaryBtn} onPress={openExternal} activeOpacity={0.85}>
                    <ExternalLink size={18} color={COLORS.white} />
                    <Text style={styles.blockedPrimaryText}>{t("browser.signInToMarketplace")}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.blockedSecondaryBtn} onPress={() => router.push("/(tabs)/home")} activeOpacity={0.7}>
                  <ShoppingCart size={16} color={COLORS.primary} />
                  <Text style={styles.blockedSecondaryText}>{tt("Browse ChinaSuuq Deals", "Fiiri Qiimayasha ChinaSuuq")}</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.blockedHint}>
                {tt("Open a product page, then tap the action below to review it.", "Fur bogga alaabta, kadib taabo tallaabada hoose si aad u baarato.")}
              </Text>
            </View>
          )}

          {/* Punish / security-check recovery overlay */}
          {punish && !showCurated && punish.interactive && (
            // A slider is on screen: this pill must never eat the drag. Both
            // layers are pointerEvents="box-none", so only the button itself
            // takes touches, and it sits at the TOP of the web area.
            // box-none (not none): the pill and its text pass touches through to
            // the page underneath, while the "Browser" button stays tappable.
            <View style={styles.riskPillWrap} pointerEvents="box-none">
              <View style={styles.riskPill} pointerEvents="box-none">
                <ShieldAlert size={15} color={COLORS.white} />
                <Text style={styles.riskPillText} numberOfLines={2}>
                  {tt(
                    "1688 needs a quick check — drag the slider on the page",
                    "1688 waxay rabtaa hubin — jiid slider-ka bogga"
                  )}
                </Text>
                <TouchableOpacity
                  onPress={openExternal}
                  style={styles.riskPillBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <ExternalLink size={12} color={COLORS.white} />
                  <Text style={styles.riskPillBtnText}>{tt("Browser", "Browser")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {punish && !showCurated && !punish.interactive && (
            <View style={styles.punishOverlay}>
              <View style={styles.punishCard}>
                <View style={styles.punishIconWrap}>
                  <ShieldAlert size={30} color={COLORS.primary} />
                </View>
                <Text style={styles.punishTitle}>
                  {tt("Quick security check", "Hubin degdeg ah")}
                </Text>
                <Text style={styles.punishBody}>
                  {tt(
                    "The marketplace flagged this visit and showed no slider to solve. Retry with your saved session, open it in the browser, or go back and pick another product.",
                    "Suqaddu way calaamadeysay booqashadan mana jirto slider la xaliyo. Isku day session-kaaga, fur browser-ka, ama dib ugu noqo."
                  )}
                </Text>
                <TouchableOpacity style={styles.punishPrimary} onPress={reload} activeOpacity={0.85}>
                  <RefreshCw size={15} color={COLORS.white} />
                  <Text style={styles.punishPrimaryText}>
                    {tt("Retry this page", "Isku day mar kale")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.punishSecondary} onPress={openExternal} activeOpacity={0.7}>
                  <Text style={styles.punishSecondaryText}>{tt("Open in browser", "Fur browser-ka")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.punishSecondary} onPress={goBack} activeOpacity={0.7}>
                  <Text style={styles.punishSecondaryText}>{tt("Go back", "Dib ugu noqo")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Login wall banner (Taobao / YiwuGo). Suppressed while a risk wall
              is up: this banner is a solid card over the web area and would
              cover the slider the user has to drag. */}
          {loginWall && !showCurated && !punish && (
            <View style={styles.loginBanner}>
              <View style={{ flex: 1 }}>
                <Text style={styles.loginBannerTitle}>
                  {tt("Login required on", "Galin loo baahan yahay")} {meta.name}
                </Text>
                <Text style={styles.loginBannerBody}>
                  {tt(
                    meta.name + " blocks embedded browsing for guests. Browse curated ChinaSuuq picks below, or open in your browser to sign in.",
                    meta.name + " wuu xannaynayaa bogagga. Fiiri xulashada ChinaSuuq hoose, ama fur biraawsarka si aad u galo."
                  )}
                </Text>
                <View style={styles.loginBannerBtns}>
                  <TouchableOpacity style={styles.bannerExternalBtn} onPress={openExternal}>
                    <ExternalLink size={14} color={COLORS.primary} />
                    <Text style={styles.bannerExternalText}>{tt("Open in browser", "Fur biraawsarka")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.bannerDealsBtn} onPress={() => setShowCurated(true)}>
                    <Text style={styles.bannerDealsText}>{tt("Show Curated Picks", "Muuji Xulashada")}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity onPress={dismissLoginWall} style={styles.loginBannerClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={16} color={COLORS.white} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Clean bottom bar — always two buttons, no distraction.
            Audience gating: guests get a "Sign in to add" affordance instead
            of the capture/Add-to-Cart entry (no anonymous sourcing); every
            signed-in user, customer or staff, gets DOM capture with AI Vision
            as the fallback. "Sync session" in the header stays staff-only. */}
        <View style={[styles.bottomBar, { paddingBottom: 12 + insets.bottom }]}>
          {authUser ? (
            <TouchableOpacity style={styles.btnPrimary} onPress={() => { openCaptureForm().catch(() => {}); }} activeOpacity={0.85}>
              <ShoppingCart size={18} color={COLORS.white} />
              <Text style={styles.btnPrimaryText}>
                {aiScanning
                  ? tt("Reading product…", "Alaab la akhriyo…")
                  : tt("Add to Cart", "Ku Dar Gaariga")}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => {
                Haptics.selectionAsync();
                router.push("/(auth)/login");
              }}
              activeOpacity={0.85}
            >
              <ShoppingCart size={18} color={COLORS.white} />
              <Text style={styles.btnPrimaryText}>
                {tt("Sign in to add to cart", "Gal si aad gaadhiga u darto")}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.btnWhats} onPress={requestCheckout} activeOpacity={0.8}>
            <MessageCircle size={18} color={COLORS.white} />
            <Text style={styles.btnWhatsText}>{tt("WhatsApp Order", "Dalab WhatsApp")}</Text>
          </TouchableOpacity>
        </View>

        {/* Smart product form — opens when user taps Add to Cart */}
        <SmartProductForm
          visible={captureFormVisible}
          listing={localListing}
          onClose={() => setCaptureFormVisible(false)}
        />
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },

  // ---- Enhanced header ----
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  headerTitleWrap: {
    flex: 1,
    marginHorizontal: 6,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerIconText: {
    fontSize: 12,
    fontWeight: "800",
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.black,
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  cartBadge: {
    position: "absolute",
    top: 2,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  cartBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: COLORS.white,
  },

  // ---- Language control ----
  langBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.warmWhite,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  langPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.softOrange,
    borderRadius: 14,
    paddingHorizontal: 10,
    height: 28,
  },
  langPillActive: {
    backgroundColor: COLORS.primary,
  },
  langPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.primaryDark,
    marginLeft: 5,
  },
  langPillTextActive: {
    color: COLORS.white,
  },
  langCaret: {
    fontSize: 10,
    color: COLORS.primaryDark,
    marginLeft: 3,
  },
  langReset: {
    marginLeft: 10,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  langResetText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
    textDecorationLine: "underline",
  },

  // ---- WebView ----
  webWrap: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  web: { flex: 1 },

  // ---- Skeleton ----
  skeletonOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: COLORS.warmWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  skeletonBody: {
    width: "78%",
    alignItems: "center",
  },
  skeletonBrand: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginBottom: 18,
  },
  skeletonLogo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  skeletonLogoText: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.white,
  },
  skeletonBrandText: {
    marginLeft: 10,
  },
  skeletonLine: {
    height: 10,
    borderRadius: 5,
  },
  skeletonLineBrand: {
    width: 90,
    marginBottom: 6,
  },
  skeletonLineSub: {
    width: 60,
  },
  skeletonName: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.black,
    marginBottom: 6,
  },
  skeletonImage: {
    width: "100%",
    height: 190,
    borderRadius: 16,
    marginBottom: 16,
  },
  skeletonTextBlock: {
    width: "100%",
  },
  skeletonLineWide: { width: "100%", marginBottom: 8 },
  skeletonLineMid: { width: "72%", marginBottom: 8 },
  skeletonLineShort: { width: "45%" },

  // ---- Blocked overlay + curated ----
  blockedOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: COLORS.warmWhite,
    paddingTop: 46,
    paddingHorizontal: 16,
  },
  blockedClose: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  blockedLogo: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 10,
  },
  blockedLogoText: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.white,
  },
  blockedTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.black,
    textAlign: "center",
    marginBottom: 6,
  },
  blockedBody: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 18,
  },
  curatedLoader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  curatedLoaderText: {
    marginLeft: 8,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  curatedList: {
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  curatedCard: {
    width: 128,
    marginRight: 10,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  curatedImg: {
    width: "100%",
    height: 96,
    borderRadius: 8,
    backgroundColor: COLORS.gray100,
  },
  curatedImgFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.softOrange,
  },
  curatedImgFallbackText: {
    fontSize: 26,
    fontWeight: "800",
    color: COLORS.primary,
  },
  curatedName: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.black,
    marginTop: 6,
    minHeight: 30,
  },
  curatedPrice: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.primaryDark,
    marginTop: 2,
  },
  curatedEmpty: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: "center",
    paddingVertical: 20,
  },
  blockedActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  blockedPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primaryDark,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    gap: 6,
  },
  blockedPrimaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.white,
  },
  blockedSecondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.softOrange,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    gap: 6,
  },
  blockedSecondaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.primaryDark,
  },
  blockedHint: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: 10,
  },

  // ---- Login wall banner ----
  loginBanner: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: "row",
    backgroundColor: COLORS.darkSurface,
    borderRadius: 14,
    padding: 12,
    alignItems: "flex-start",
  },
  loginBannerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.white,
    marginBottom: 4,
  },
  loginBannerBody: {
    fontSize: 12,
    color: "#D4D4D4",
    lineHeight: 17,
    marginBottom: 8,
  },
  loginBannerBtns: {
    flexDirection: "row",
    gap: 8,
  },
  bannerExternalBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: 9,
    paddingHorizontal: 10,
    height: 32,
    gap: 5,
  },
  bannerExternalText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.black,
  },
  bannerDealsBtn: {
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    borderRadius: 9,
    paddingHorizontal: 10,
    height: 32,
  },
  bannerDealsText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.white,
  },
  loginBannerClose: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#3A3A3A",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },

  // ---- Clean bottom bar ----
  bottomBar: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  btnPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    height: 50,
    gap: 8,
  },
  btnPrimaryText: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.white,
  },
  btnWhats: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.whatsapp,
    borderRadius: 14,
    height: 50,
    gap: 8,
  },
  btnWhatsText: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.white,
  },

  // ---- Punish / security-check recovery overlay ----
  // Non-blocking pill used while a slide-captcha is on screen: pinned to the
  // top of the web area, transparent outside the pill itself.
  riskPillWrap: {
    position: "absolute",
    top: 8,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 12,
    zIndex: 40,
  },
  riskPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: 420,
    backgroundColor: "rgba(17,17,17,0.82)",
    borderRadius: 999,
    paddingVertical: 7,
    paddingLeft: 12,
    paddingRight: 6,
  },
  riskPillText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.white,
    fontWeight: "600",
  },
  riskPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  riskPillBtnText: { fontSize: 11, fontWeight: "700", color: COLORS.white },

  punishOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(17,17,17,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    zIndex: 50,
  },
  punishCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
  },
  punishIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary + "14",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  punishTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.black,
    marginBottom: 6,
  },
  punishBody: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: 16,
  },
  punishPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    width: "100%",
    justifyContent: "center",
    marginBottom: 8,
  },
  punishPrimaryText: { fontSize: 14, fontWeight: "700", color: COLORS.white },
  punishSecondary: { paddingVertical: 6, paddingHorizontal: 12 },
  punishSecondaryText: { fontSize: 13, color: COLORS.textSecondary },

  // ---- USD pill ----
  usdPill: {
    marginLeft: 6,
    minWidth: 30,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
  },
  usdPillActive: { backgroundColor: COLORS.primary },
  usdPillText: { fontSize: 12, fontWeight: "800", color: COLORS.primary },
  usdPillTextActive: { color: COLORS.white },

  // ---- Slim loading progress bar ----
  progressTrack: {
    height: 2.5,
    width: "100%",
    backgroundColor: COLORS.border,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
});


