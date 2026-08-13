import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
  TextInput,
  FlatList,
  Image,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  ArrowLeft,
  Undo2,
  Redo2,
  RefreshCw,
  ExternalLink,
  Languages,
  ShoppingCart,
  Plus,
  X,
  TrendingUp,
  Minimize2,
  Maximize2,
  Wifi,
  WifiOff,
} from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { whatsappOrderLink } from "@/lib/utils";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import SmartProductForm, { type CapturedListing } from "@/components/marketplace/SmartProductForm";
import {
  TRANSLATE_SCRIPT,
  PRODUCT_CAPTURE_SCRIPT,
  LOGIN_WALL_SCRIPT,
  BLANK_PAGE_SCRIPT,
  HIDE_MARKET_NAV_SCRIPT,
} from "@/lib/webviewScripts";
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
  alibaba: { name: "Alibaba.com", home: "https://m.alibaba.com", loginWalled: false },
  chinagoods: { name: "ChinaGoods", home: "https://www.chinagoods.com", loginWalled: false },
  jd: { name: "JD.com", home: "https://m.jd.com", loginWalled: false },
};

// Brand colors + short marks for blocked-state logos
const PLATFORM_BRAND_COLOR: Record<string, string> = {
  "1688": "#FF5000",
  taobao: "#FF6A00",
  yiwugo: "#1A8CFF",
  alibaba: "#FF6A00",
  chinagoods: "#E60012",
  jd: "#E1251B",
};
const PLATFORM_MARK: Record<string, string> = {
  "1688": "1688",
  taobao: "淘",
  yiwugo: "YWG",
  alibaba: "A",
  chinagoods: "CG",
  jd: "JD",
};

const TL_KEY = "chinasuuq-webview-translate";
const TL_OPTIONS = ["en", "so"];
const TL_LABEL: Record<string, string> = { en: "English", so: "Somali" };

export default function MarketplaceBrowser() {
  const { marketplace } = useLocalSearchParams<{ marketplace: string }>();
  const router = useRouter();
  const meta = MARKETPLACES[marketplace] ?? MARKETPLACES["1688"];
  const [url, setUrl] = useState(meta.home);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(true);
  const [translateLang, setTranslateLang] = useState<null | string>(null); // null = off
  const [rateUsd, setRateUsd] = useState(7.25);
  const [currentListing, setCurrentListing] = useState<CapturedListing | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [loginWall, setLoginWall] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [cnylist, setCnylist] = useState<number[]>([]);
  const [captureFormVisible, setCaptureFormVisible] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [accountCookieScript, setAccountCookieScript] = useState("");
  const [curatedProducts, setCuratedProducts] = useState<Product[]>([]);
  const [curatedLoading, setCuratedLoading] = useState(false);
  const [showCurated, setShowCurated] = useState(false);
  const webRef = useRef<any>(null);

  // restore translation pref
  useEffect(() => {
    (async () => {
      try {
        const s = await AsyncStorage.getItem(TL_KEY);
        if (s) setTranslateLang(JSON.parse(s));
        setRateUsd(await getCnyPerUsd()); // warm the cache so price chip has a rate
      } catch {}
    })();
  }, []);

  // Fetch shared marketplace account & curated products on mount
  useEffect(() => {
    (async () => {
      try {
        // 1. Try to get shared cookies for auto-fill
        const account = await getMarketplaceAccount(marketplace || "1688");
        if (account?.cookies) {
          setAccountCookieScript(cookieInjectScript(account.cookies));
        }

        // 2. Fetch curated products as a fallback catalog
        setCuratedLoading(true);
        const products = await getMarketplaceProducts(marketplace || "1688");
        setCuratedProducts(products);
      } catch {
        // silent — curated products will be empty, WebView still works
      } finally {
        setCuratedLoading(false);
      }
    })();
  }, [marketplace]);

  // re-run scripts on navigation completes (bundled into one bridge call for perf)
  const runPerPageScripts = useCallback(
    (webview: any) => {
      const post = () => {
        try {
          // Build one combined script so the WebView only makes 1 round-trip
          const parts: string[] = [];
          if (accountCookieScript) parts.push(accountCookieScript);
          parts.push(LOGIN_WALL_SCRIPT);
          parts.push(BLANK_PAGE_SCRIPT);
          parts.push(PRODUCT_CAPTURE_SCRIPT);
          parts.push(HIDE_MARKET_NAV_SCRIPT);
          if (translateLang) {
            parts.push(`window.__CS_TL=${JSON.stringify(translateLang)};${TRANSLATE_SCRIPT}`);
          }
          const combined = `(function(){${parts.join("\n")}})();true;`;
          webview?.injectJavaScript?.(combined);
        } catch {}
      };
      // slight delay so SPA content settles
      setTimeout(post, 1200);
    },
    [translateLang, accountCookieScript]
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const { type, payload } = JSON.parse(event.nativeEvent.data);
        if (type === "LOGIN_WALL") {
          if (meta.loginWalled && !loginWall) {
            setLoginWall(true);
            // Auto-show curated catalog if we have products
            if (curatedProducts.length > 0) setShowCurated(true);
          }
        } else if (type === "BLANK") {
          // page rendered no content — likely blocked (Taobao/YiwuGo guests)
          if (meta.loginWalled) {
            setBlocked(true);
            // Auto-show curated catalog if we have products
            if (curatedProducts.length > 0) setShowCurated(true);
          }
        } else if (type === "CAPTURE") {
          setCaptureBusy(false);
          setBlocked(false);
          setShowCurated(false);
          const p = payload || {};
          // Always push the detected price (even 0) so an incomplete capture
          // still shows the editable price field instead of a stale one.
          setCnylist((prev) => [...prev.slice(-4), Number(p.price) || 0]);
          const srcId =
            (p.url || "").match(/id[/=]([\d]+)/)?.[1] ||
            (p.url || "").match(/[\d]{5,}/)?.[0] ||
            `${Date.now()}`;
          setCurrentListing({
            title: p.title || "Detected product",
            price: Number(p.price) || 0,
            image: p.image || "",
            url: p.url || url,
            brand: p.brand || "",
            platform: marketplace || "1688",
            sourceId: srcId,
          });
        }
      } catch {}
    },
    [marketplace, url, meta.loginWalled, loginWall, curatedProducts.length]
  );

  const goBack = useCallback(() => webRef.current?.goBack(), []);
  const goForward = useCallback(() => webRef.current?.goForward(), []);
  const reload = useCallback(() => webRef.current?.reload(), []);
  const openExternal = useCallback(() => {
    Linking.openURL(url).catch(() => Alert.alert("Error", "Could not open this link."));
  }, [url]);

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

  const cycleTranslate = useCallback(async () => {
    Haptics.selectionAsync();
    const next = translateLang ? TL_OPTIONS[(TL_OPTIONS.indexOf(translateLang) + 1) % TL_OPTIONS.length] : TL_OPTIONS[0];
    await AsyncStorage.setItem(TL_KEY, JSON.stringify(next));
    setTranslateLang(next);
    if (webRef.current) {
      webRef.current.injectJavaScript(
        `window.__CS_TL=${JSON.stringify(next)};${TRANSLATE_SCRIPT}`
      );
    }
  }, [translateLang]);

  const localListing: CapturedListing = currentListing ?? {
    title: "Detected product",
    price: cnylist.length ? cnylist[cnylist.length - 1] : 0,
    image: "",
    url,
    brand: "",
    platform: marketplace || "1688",
    sourceId: `${Date.now()}`,
  };

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container} edges={["top"]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerAccent} />
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <ArrowLeft size={22} color={COLORS.black} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>{meta.name}</Text>
            <Text style={styles.headerSubtitle}>Browse inside ChinaSuuq</Text>
          </View>
          <TouchableOpacity onPress={tapCapture} style={[styles.headerBtn, captureBusy && styles.headerBtnDisabled]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            {captureBusy ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <ShoppingCart size={20} color={COLORS.primary} />
            )}
          </TouchableOpacity>
        </View>

        {/* URL bar */}
        {controlsVisible && <View style={styles.urlBar}>
          <View style={styles.urlInputWrap}>
            <TextInput
              style={styles.urlInput}
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onSubmitEditing={() => {
                const target = url.startsWith("http") ? url : `https://${url}`;
                if (target) webRef.current?.injectJavaScript(`window.location.href = ${JSON.stringify(target)}; true;`);
              }}
            />
          </View>
          <TouchableOpacity
            onPress={() => {
              if (!translateLang) {
                // confirm turning ON translation
                Alert.alert(
                  "Translate to " + TL_LABEL["en"],
                  "Turn on live translation for this page? Tap the globe again to switch to Somali.",
                  [
                    { text: "No", style: "cancel" },
                    { text: "Translate", onPress: () => cycleTranslate() },
                  ]
                );
              } else {
                cycleTranslate();
              }
            }}
            style={[styles.translateBtn, !!translateLang && styles.translateBtnActive]}
          >
            <Languages size={16} color={translateLang ? COLORS.white : COLORS.primary} />
            <Text style={[styles.translateText, !!translateLang && styles.translateTextActive]}>
              {translateLang ? TL_LABEL[translateLang] : "EN/SO"}
            </Text>
          </TouchableOpacity>
        </View>}

        {/* Live currency + rate strip */}
        {controlsVisible && <View style={styles.usdStrip}>
          <TrendingUp size={14} color={COLORS.primaryDark} />
          <Text style={styles.usdText}>
            {localListing.price > 0
              ? `Detected ¥${localListing.price.toFixed(2)} ≈ $${(localListing.price / rateUsd).toFixed(2)} USD (live rate). Tap + to add with full specs.`
              : "Prices on this page start in CNY. Tap the + button below to detect & convert the item you're viewing."}
          </Text>
        </View>}

        {/* WebView */}
        <View style={styles.webWrap}>
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
            onShouldStartLoadWithRequest={(req) => {
              // Open external schemes outside the WebView
              const u = req.url || "";
              if (/^(intent|itms|itms-apps|market|fb|messenger|whatsapp|tg|mailto|tel):/i.test(u)) {
                Linking.openURL(u).catch(() => {});
                return false;
              }
              if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("chinasuuq://")) {
                return true;
              }
              return false;
            }}
            onLoadStart={() => { setLoading(true); setCurrentListing(null); setCnylist([]); setLoginWall(false); setBlocked(false); }}
            onLoadEnd={() => { setLoading(false); if (webRef.current) runPerPageScripts(webRef.current); }}
            onError={() => {
              setLoading(false);
            }}
            startInLoadingState
            javaScriptEnabled
            domStorageEnabled
            cacheEnabled
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
            <View style={styles.loading} pointerEvents="none">
              <View style={styles.loadingCard}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.loadingText}>Loading {meta.name}...</Text>
              </View>
            </View>
          )}

          {/* Branded blocked-state → curated catalog fallback */}
          {(blocked || showCurated) && (
            <View style={styles.blockedOverlay}>
              <TouchableOpacity onPress={() => { setBlocked(false); setShowCurated(false); }} style={styles.blockedClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={16} color={COLORS.gray500} />
              </TouchableOpacity>
              <View style={[styles.blockedLogo, { backgroundColor: PLATFORM_BRAND_COLOR[marketplace ?? "1688"] || "#FF5000" }]}>
                <Text style={styles.blockedLogoText}>
                  {PLATFORM_MARK[marketplace ?? "1688"] || "CS"}
                </Text>
              </View>
              <Text style={styles.blockedTitle}>
                {meta.name} {blocked ? "needs a sign-in" : "— curated picks"}
              </Text>
              <Text style={styles.blockedBody}>
                {blocked
                  ? `${meta.name} blocks in-app browsing for guests. Below are verified products from ${meta.name} you can add to your cart right away.`
                  : `Verified products sourced from ${meta.name} — tap to view details and add to cart.`}
              </Text>

              {/* Curated product grid */}
              {curatedLoading ? (
                <View style={styles.curatedLoader}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.curatedLoaderText}>Loading deals...</Text>
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
                      <Text style={styles.curatedPrice}>${item.price_usd_estimated.toFixed(2)}</Text>
                    </TouchableOpacity>
                  )}
                />
              ) : (
                <Text style={styles.curatedEmpty}>No curated products yet for {meta.name}.</Text>
              )}

              {/* Action buttons */}
              <View style={styles.blockedActions}>
                {blocked && (
                  <TouchableOpacity style={styles.blockedPrimaryBtn} onPress={openExternal} activeOpacity={0.85}>
                    <ExternalLink size={18} color={COLORS.white} />
                    <Text style={styles.blockedPrimaryText}>Sign in / open {meta.name}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.blockedSecondaryBtn} onPress={() => router.push("/(tabs)/home")} activeOpacity={0.7}>
                  <ShoppingCart size={16} color={COLORS.primary} />
                  <Text style={styles.blockedSecondaryText}>Browse ChinaSuuq Deals</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.blockedHint}>Tip: paste any product link into the URL bar above to capture it.</Text>
            </View>
          )}

          {/* Login wall banner (Taobao / YiwuGo) */}
          {loginWall && !showCurated && (
            <View style={styles.loginBanner}>
              <View style={{ flex: 1 }}>
                <Text style={styles.loginBannerTitle}>Login required on {meta.name}</Text>
                <Text style={styles.loginBannerBody}>
                  {meta.name} blocks embedded browsing for guests. Browse curated ChinaSuuq Deals from {meta.name} below, or open in your browser to sign in.
                </Text>
                <View style={styles.loginBannerBtns}>
                  <TouchableOpacity style={styles.bannerExternalBtn} onPress={openExternal}>
                    <ExternalLink size={14} color={COLORS.primary} />
                    <Text style={styles.bannerExternalText}>Open in browser</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.bannerDealsBtn} onPress={() => setShowCurated(true)}>
                    <Text style={styles.bannerDealsText}>Show Curated Picks</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity onPress={dismissLoginWall} style={styles.loginBannerClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={16} color={COLORS.white} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Compact controls: keep the web page dominant without destroying navigation. */}
        <TouchableOpacity
          style={styles.floatingToggle}
          onPress={() => setControlsVisible((visible) => !visible)}
          activeOpacity={0.85}
        >
          {controlsVisible ? <Minimize2 size={17} color={COLORS.white} /> : <Maximize2 size={17} color={COLORS.white} />}
        </TouchableOpacity>

        {/* Sticky "Add to ChinaSuuq" dock — always visible, matches app design */}
        {controlsVisible && <TouchableOpacity
          style={styles.captureDock}
          activeOpacity={0.85}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setCaptureFormVisible(true);
          }}
        >
          <View style={styles.captureDockIcon}>
            <Plus size={18} color={COLORS.white} strokeWidth={3} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.captureDockTitle}>Add to ChinaSuuq cart</Text>
            <Text style={styles.captureDockSub}>Smart-capture this product → convert & configure specs</Text>
          </View>
        </TouchableOpacity>}

        {/* Bottom action bar */}
        {controlsVisible && <View style={styles.actionBar}>
          <TouchableOpacity style={styles.navBtn} onPress={goBack} disabled={!canGoBack} activeOpacity={0.7}>
            <Undo2 size={20} color={canGoBack ? COLORS.black : COLORS.gray300} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={goForward} disabled={!canGoForward} activeOpacity={0.7}>
            <Redo2 size={20} color={canGoForward ? COLORS.black : COLORS.gray300} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={reload} activeOpacity={0.7}>
            <RefreshCw size={20} color={COLORS.black} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={openExternal} activeOpacity={0.7}>
            <ExternalLink size={20} color={COLORS.black} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.whatsappBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Linking.openURL(whatsappOrderLink(`from ${meta.name} (via ChinaSuuq)`)).catch(() =>
                Alert.alert("Error", "WhatsApp is not available.")
              );
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.whatsappText}>WhatsApp</Text>
          </TouchableOpacity>
        </View>}

        {/* Smart capture form */}
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: COLORS.primary },
  headerBtn: { minWidth: 40, minHeight: 44, justifyContent: "center", alignItems: "center" },
  floatingToggle: { position: "absolute", top: SPACING.md, right: SPACING.md, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(25,25,25,0.82)", alignItems: "center", justifyContent: "center", zIndex: 30, shadowColor: COLORS.black, shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 6 },
  headerBtnDisabled: { opacity: 0.5 },
  headerTitleWrap: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.black },
  headerSubtitle: { fontSize: 11, color: COLORS.textSecondary },
  urlBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.warmWhite,
  },
  urlInputWrap: { flex: 1, marginRight: SPACING.sm },
  urlInput: {
    height: 40,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    fontSize: 13,
    color: COLORS.black,
  },
  translateBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.sm,
    height: 40,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  translateBtnActive: { backgroundColor: COLORS.primary },
  translateText: { fontSize: 11, fontFamily: FONTS.semibold, color: COLORS.primary, marginLeft: 4 },
  translateTextActive: { color: COLORS.white },
  usdStrip: {
    backgroundColor: COLORS.softOrange,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  usdText: { fontSize: 11, color: COLORS.primaryDark, fontFamily: FONTS.medium, flex: 1 },
  webWrap: { flex: 1, position: "relative" },
  web: { flex: 1, backgroundColor: "#fff" },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  loadingCard: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.white, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderWidth: 1, borderColor: COLORS.border, shadowColor: COLORS.black, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  loadingText: { fontSize: 13, fontFamily: FONTS.semibold, color: COLORS.textSecondary },
  // login wall banner
  loginBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    backgroundColor: COLORS.darkSurface,
    padding: SPACING.md,
    zIndex: 20,
  },
  loginBannerTitle: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.white },
  loginBannerBody: { fontSize: 12, color: COLORS.gray300, marginTop: 4, lineHeight: 17 },
  loginBannerBtns: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md },
  bannerExternalBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: COLORS.primary, paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: RADIUS.md },
  bannerExternalText: { fontSize: 13, fontFamily: FONTS.semibold, color: COLORS.primary },
  bannerDealsBtn: { backgroundColor: COLORS.primary, paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: RADIUS.md, justifyContent: "center" },
  bannerDealsText: { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.white },
  loginBannerClose: { width: 28, alignItems: "flex-end" },
  // capture dock
  captureDock: {
    position: "absolute",
    left: SPACING.md,
    right: SPACING.md,
    bottom: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    backgroundColor: COLORS.darkSurface,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    zIndex: 15,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 12,
  },
  captureDockIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  captureDockTitle: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.white },
  captureDockSub: { fontSize: 11, color: COLORS.gray400, marginTop: 1 },
  // bottom bar
  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingBottom: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.white,
    gap: SPACING.sm,
  },
  navBtn: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.gray50,
    alignItems: "center",
    justifyContent: "center",
  },
  whatsappBtn: {
    flex: 1,
    height: 42,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.whatsapp,
    alignItems: "center",
    justifyContent: "center",
  },
  whatsappText: { color: COLORS.white, fontSize: 13, fontFamily: FONTS.bold },

  // blocked-state overlay / curated catalog
  blockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.warmWhite,
    alignItems: "center",
    paddingHorizontal: SPACING.xxxl,
    paddingTop: 80,
    paddingBottom: 80,
    zIndex: 5,
  },
  blockedClose: {
    position: "absolute",
    top: SPACING.lg,
    right: SPACING.lg,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  blockedLogo: {
    width: 84,
    height: 84,
    borderRadius: RADIUS.xl,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  blockedLogoText: { color: COLORS.white, fontSize: 34, fontFamily: FONTS.bold },
  blockedTitle: { fontSize: 20, fontFamily: FONTS.bold, color: COLORS.black, marginTop: SPACING.xl },
  blockedBody: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginTop: SPACING.md,
  },
  blockedPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    height: 50,
    width: "100%",
    marginTop: SPACING.xl,
  },
  blockedPrimaryText: { color: COLORS.white, fontSize: 15, fontFamily: FONTS.bold },
  blockedSecondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    height: 48,
    width: "100%",
    marginTop: SPACING.md,
  },
  blockedSecondaryText: { color: COLORS.primary, fontSize: 14, fontFamily: FONTS.semibold },
  blockedHint: { fontSize: 12, color: COLORS.textMuted, textAlign: "center", marginTop: SPACING.lg },
  blockedActions: { width: "100%", marginTop: SPACING.md },
  // curated products grid
  curatedList: { paddingVertical: SPACING.md, paddingHorizontal: SPACING.xs },
  curatedCard: {
    width: 140,
    marginRight: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.sm,
  },
  curatedImg: { width: 124, height: 124, borderRadius: RADIUS.md, backgroundColor: COLORS.gray100 },
  curatedImgFallback: { alignItems: "center", justifyContent: "center" },
  curatedImgFallbackText: { fontSize: 28, fontFamily: FONTS.bold, color: COLORS.primary },
  curatedName: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.black, marginTop: SPACING.sm, lineHeight: 16 },
  curatedPrice: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.primary, marginTop: 4 },
  curatedLoader: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.lg },
  curatedLoaderText: { fontSize: 13, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  curatedEmpty: { fontSize: 13, color: COLORS.textMuted, textAlign: "center", paddingVertical: SPACING.lg },
});
