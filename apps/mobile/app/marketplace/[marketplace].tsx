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
import {
  TRANSLATE_SCRIPT,
  PRODUCT_CAPTURE_SCRIPT,
  LOGIN_WALL_SCRIPT,
  BLANK_PAGE_SCRIPT,
  HIDE_MARKET_NAV_SCRIPT,
  autoLoginScript,
} from "@/lib/webviewScripts";
import { usdPriceScript } from "@/lib/webviewUsd";
import {
  PUNISH_SCRIPT,
  HIDE_RISK_SCRIPT,
  VISION_SNAPSHOT_SCRIPT,
} from "@/lib/webviewScripts.risk";
import { aiVisionScanListing } from "@/lib/aiVision";
import { captureRef } from "react-native-view-shot";
import { getCnyPerUsd } from "@/lib/exchange";
import { getMarketplaceProducts } from "@/db";
import type { Product } from "@/types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getMarketplaceAccount, cookieInjectScript } from "@/lib/supabase";

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

// Restore the page's original text after machine translation.
// Mirrors the restore pass inside TRANSLATE_SCRIPT: originals are kept on the
// parent element as data-cs-orig; the first text child node was replaced.
const RESTORE_SCRIPT =
  "(function(){try{" +
  "var els=document.querySelectorAll('[data-cs-orig]');" +
  "for(var i=0;i<els.length;i++){var p=els[i];" +
  "for(var n=0;n<p.childNodes.length;n++){var c=p.childNodes[n];" +
  "if(c&&c.nodeType===3){c.nodeValue=p.getAttribute('data-cs-orig');break;}}}" +
  "var marked=document.querySelectorAll('[data-cs-tr=' + String.fromCharCode(34) + '1' + String.fromCharCode(34) + ']');" +
  "for(var m=0;m<marked.length;m++){marked[m].removeAttribute('data-cs-tr');}" +
  "if(window.__csTrState){window.__csTrState.target=null;" +
  "window.__csTrState.done={};window.__csTrState.requests=0;}" +
  "}catch(e){}})();true;";

// Bottom bar states - the action must always match the page context.
type PageState = "login" | "reading" | "review" | "incomplete" | "browse";

export default function MarketplaceBrowser() {
  const { marketplace } = useLocalSearchParams<{ marketplace: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();
  const cartCount = useCartStore((s) => s.items.length);
  const tt = (en: string, so: string) => (locale === "en" ? en : so);

  const meta = MARKETPLACES[marketplace] ?? MARKETPLACES["1688"];
  const [url, setUrl] = useState(meta.home);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(true);
  const [translateLang, setTranslateLang] = useState<null | string>(null); // null = original
  const [usdOn, setUsdOn] = useState(true); // ChinaSuuq selling point: prices in USD
  const [fxRate, setFxRate] = useState(7.25); // CNY per USD
  const [currentListing, setCurrentListing] = useState<CapturedListing | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [loginWall, setLoginWall] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [cnylist, setCnylist] = useState<number[]>([]);
  const [captureFormVisible, setCaptureFormVisible] = useState(false);
  const [accountCookieScript, setAccountCookieScript] = useState("");
  const [accountCreds, setAccountCreds] = useState<{ username: string; password: string } | null>(null);
  const [curatedProducts, setCuratedProducts] = useState<Product[]>([]);
  const [curatedLoading, setCuratedLoading] = useState(false);
  const [showCurated, setShowCurated] = useState(false);
  const [tipDismissed, setTipDismissed] = useState(true); // hidden until known
  const [punish, setPunish] = useState<{ hard: boolean; slide: boolean } | null>(null);
  const [aiScanning, setAiScanning] = useState(false);
  // Single write-path for captured listings: keeps the ref-mirror (used by
  // openCaptureForm's fast DOM path) in sync with the state.
  const applyListing = useCallback((listing: CapturedListing | null) => {
    currentListingRef.current = listing;
    setCurrentListing(listing);
  }, []);
  const visionSnapshotRef = useRef<any>(null);
  const visionResolveRef = useRef<((v: any) => void) | null>(null);
  // Ref-mirror of currentListing so the DOM-capture wait in openCaptureForm
  // sees the fresh value instead of a stale closure.
  const currentListingRef = useRef<CapturedListing | null>(null);
  const webRef = useRef<any>(null);

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
          setTranslateLang("en");
          await AsyncStorage.setItem(TL_KEY, JSON.stringify("en"));
        } else {
          setTranslateLang(JSON.parse(s));
        }
        const tip = await AsyncStorage.getItem(TIP_KEY);
        setTipDismissed(tip === "1");
        const rate = await getCnyPerUsd();
        setFxRate(rate);
      } catch {}
    })();
  }, []);

  // Fetch shared marketplace account & curated products on mount
  useEffect(() => {
    (async () => {
      try {
        const account = await getMarketplaceAccount(marketplace || "1688");
        if (account?.cookies) {
          setAccountCookieScript(cookieInjectScript(account.cookies));
        }
        if (account?.username && account?.password) {
          setAccountCreds({ username: account.username, password: account.password });
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

  // Re-run per-page scripts after navigation completes (one bridge call).
  const runPerPageScripts = useCallback(
    (webview: any, delay = 0) => {
      const post = () => {
        try {
          const parts: string[] = [];
          if (accountCookieScript) parts.push(accountCookieScript);
          if (accountCreds) parts.push(autoLoginScript(accountCreds.username, accountCreds.password));
          parts.push(LOGIN_WALL_SCRIPT);
          parts.push(BLANK_PAGE_SCRIPT);
          parts.push(PUNISH_SCRIPT);
          parts.push(HIDE_RISK_SCRIPT);
          parts.push(PRODUCT_CAPTURE_SCRIPT);
          parts.push(HIDE_MARKET_NAV_SCRIPT);
          // USD prices: ChinaSuuq selling point — never show RMB
          if (usdOn) {
            parts.push("window.__CS_RATE=" + fxRate + ";" + usdPriceScript(fxRate));
          }
          if (translateLang) {
            parts.push("window.__CS_TL=" + JSON.stringify(translateLang) + ";" + TRANSLATE_SCRIPT);
          }
          const combined = "(function(){" + parts.join(";") + "})();true;";
          webview?.injectJavaScript?.(combined);
        } catch {}
      };
      setTimeout(post, delay);
    },
    [translateLang, usdOn, fxRate, accountCookieScript, accountCreds]
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const { type, payload } = JSON.parse(event.nativeEvent.data);
        if (type === "LOGIN_WALL") {
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
          // 1688/Taobao risk wall — friendly recovery overlay instead of dead page
          setPunish({ hard: !!payload?.hard, slide: !!payload?.slide });
        } else if (type === "VISION_SCAN") {
          // handled in runAiScan via pending snapshot ref
          visionSnapshotRef.current = payload || null;
        } else if (type === "CAPTURE") {
          setCaptureBusy(false);
          setBlocked(false);
          setShowCurated(false);
          const p = payload || {};
          setCnylist((prev) => [...prev.slice(-4), Number(p.price) || 0]);
          const idMatch = (p.url || "").match(/id[/=]([0-9]+)/);
          const numMatch = (p.url || "").match(/[0-9]{5,}/);
          const srcId = idMatch?.[1] || numMatch?.[0] || String(Date.now());
          applyListing({
            title: p.title || "Detected product",
            price: Number(p.price) || 0,
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
    [marketplace, url, meta.loginWalled, loginWall, curatedProducts.length]
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
        visionResolveRef.current = resolve;
        visionSnapshotRef.current = null;
        try {
          webRef.current?.injectJavaScript(VISION_SNAPSHOT_SCRIPT);
        } catch {
          resolve(null);
        }
        // hints normally arrive in <500ms; hard stop at 1200ms
        setTimeout(() => {
          if (visionResolveRef.current) {
            visionResolveRef.current(null);
            visionResolveRef.current = null;
          }
        }, 1200);
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
      //    Screenshot only attached when hints are incomplete.
      const snapshotOk = snapshot && snapshot.title && Number(snapshot.price) > 0;
      const vision = await aiVisionScanListing({
        screenshotBase64: snapshotOk ? null : shotB64,
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
  const dismissPunish = useCallback(() => {
    setPunish(null);
  }, []);

  const goBack = useCallback(() => webRef.current?.goBack(), []);
  const goForward = useCallback(() => webRef.current?.goForward(), []);
  const reload = useCallback(() => {
    setPunish(null);
    webRef.current?.reload();
  }, []);
  const openExternal = useCallback(() => {
    Linking.openURL(url).catch(() =>
      Alert.alert(tt("Error", "Khalad"), tt("Could not open this link.", "Lama furin kara bogga."))
    );
  }, [url, locale]);

  // ---- Language control (Translate to English / Somali / Original) ----
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
            "window.__CS_TL=" + JSON.stringify(next) + ";" + TRANSLATE_SCRIPT
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

  const tapCapture = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCaptureBusy(true);
    setCurrentListing(null);
    setTimeout(() => {
      try {
        webRef.current?.injectJavaScript?.(PRODUCT_CAPTURE_SCRIPT);
      } catch {}
    }, 200);
  }, []);

  // Open the review sheet. Without a captured listing, run the product-capture
  // script first; if DOM capture yields nothing useful, fall back to AI Vision
  // automatically — the customer should never see a blank form.
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
    // DOM capture failed → AI Vision fallback (no customer friction)
    await runAiScan();
  }, [currentListing, tapCapture, runAiScan]);

  // ---- Context-aware bottom bar state ----
  const pageState: PageState =
    loginWall || blocked
      ? "login"
      : captureBusy
        ? "reading"
        : currentListing && currentListing.price > 0
          ? "review"
          : currentListing
            ? "incomplete"
            : "browse";

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
                  webRef.current?.injectJavaScript(
                    "window.__CS_RATE=" + fxRate + ";" + usdPriceScript(fxRate)
                  );
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
              setUrl(nav.url);
              setCanGoBack(nav.canGoBack);
              setCanGoForward(nav.canGoForward);
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
            }}
            onLoadEnd={() => {
              setLoading(false);
              if (webRef.current) {
                // Fast: kick off scripts immediately so capture/translate start ASAP.
                runPerPageScripts(webRef.current, 10);
                // Follow-ups: re-run everything as SPA content streams in.
                [600, 1800, 3500].forEach((ms) => {
                  setTimeout(() => {
                    if (webRef.current) runPerPageScripts(webRef.current, 0);
                  }, ms);
                });
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
            userAgent={
              "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
            }
            setBuiltInZoomControls={false}
            setSupportMultipleWindows={false}
            javaScriptCanOpenWindowsAutomatically={false}
            allowsInlineMediaPlayback
            allowsBackForwardNavigationGestures
            mixedContentMode="compatibility"
            // cookies are set per-host via injectedJavaScriptBeforeContentLoaded
            injectedJavaScriptBeforeContentLoaded={accountCookieScript || undefined}
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
                      <Text style={styles.curatedPrice}>{"$" + item.price_usd_estimated.toFixed(2)}</Text>
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
          {punish && !showCurated && (
            <View style={styles.punishOverlay}>
              <View style={styles.punishCard}>
                <View style={styles.punishIconWrap}>
                  <ShieldAlert size={30} color={COLORS.primary} />
                </View>
                <Text style={styles.punishTitle}>
                  {tt("Quick security check", "Hubin degdeg ah")}
                </Text>
                <Text style={styles.punishBody}>
                  {punish.slide
                    ? tt(
                        "The marketplace wants to verify you. Solve the slider/check below — it takes 5 seconds and unlocks browsing.",
                        "Suqadda waxay rabtaa inay xaqiijiso. Dhammeeji lugta hoose — 5 ilbiriqsi ayay noqonaysaa."
                      )
                    : tt(
                        "The marketplace flagged this visit. We'll retry with your saved session — or go back and pick another product.",
                        "Suqaddu way calaamadeysay. Waxaan isku daynaynaa session-kaaga — ama dib ugu noqo."
                      )}
                </Text>
                <TouchableOpacity style={styles.punishPrimary} onPress={dismissPunish} activeOpacity={0.85}>
                  <RefreshCw size={15} color={COLORS.white} />
                  <Text style={styles.punishPrimaryText}>
                    {tt("I solved it — continue", "Waan dhammaystiray — sii wad")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.punishSecondary} onPress={goBack} activeOpacity={0.7}>
                  <Text style={styles.punishSecondaryText}>{tt("Go back", "Dib ugu noqo")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Login wall banner (Taobao / YiwuGo) */}
          {loginWall && !showCurated && (
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

        {/* Clean bottom bar — always two buttons, no distraction */}
        <View style={[styles.bottomBar, { paddingBottom: 12 + insets.bottom }]}>
          <TouchableOpacity style={styles.btnPrimary} onPress={() => { openCaptureForm().catch(() => {}); }} activeOpacity={0.85}>
            <ShoppingCart size={18} color={COLORS.white} />
            <Text style={styles.btnPrimaryText}>
              {aiScanning ? tt("Reading product…", "Alaab la akhriyo…") : tt("Add to Cart", "Ku Dar Gaariga")}
            </Text>
          </TouchableOpacity>
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


