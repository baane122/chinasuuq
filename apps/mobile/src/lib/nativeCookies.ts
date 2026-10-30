// Native-cookie reader for staff session sync — the ONE place that touches
// @react-native-cookies/cookies.
//
// WHY THIS FILE EXISTS: that package throws at MODULE EVALUATION time. Its
// index.js does this at the top level:
//
//   const RNCookieManagerIOS = NativeModules.RNCookieManagerIOS;
//   if (Platform.OS === 'ios') {
//     invariant(RNCookieManagerIOS, 'Add RNCookieManagerIOS.h …');
//     CookieManager = RNCookieManagerIOS;
//   }
//
// `invariant` throws while Metro is evaluating the module, so a try/catch
// around `await import(...)` does NOT contain it — the throw happens inside the
// module registry, before the catch frame exists. That produced an app-level
// "Uncaught Error" red screen in Expo Go on iOS the moment a marketplace screen
// loaded.
//
// THE FIX: the invariant tests exactly one thing — whether the native module is
// registered. `NativeModules.RNCookieManagerIOS` / `RNCookieManagerAndroid` read
// as `undefined` (never throw) when it is not. So we test the SAME condition the
// invariant tests, and only import when it will pass. Reading NativeModules is
// safe on every platform and in every runtime, including Expo Go and web.
//
// PLATFORM REALITY, stated plainly:
//  - Android release/preview builds: module linked → native reads work.
//  - iOS builds that include the pod: module linked → works.
//  - Expo Go (either platform): no custom native modules by design → null here,
//    callers degrade, nothing crashes.
//  - Web: null.
// This is deliberately not a `Platform.OS === 'android'` check: that would
// disable a real iOS build where the module IS present.
//
// CONSEQUENCE when unavailable: staff session sync cannot capture httpOnly
// cookies (1688's `cookie2`, Taobao's login token). The WebView still holds its
// own session natively via `sharedCookiesEnabled` + `thirdPartyCookiesEnabled`,
// and the customer experience is unaffected — this only gates the staff
// "push cookies to the server" feature. Do not paper over it by weakening the
// guard: a button that appears to work and throws is worse than one that
// reports it is unavailable.

import { NativeModules, Platform } from "react-native";

export type NativeCookieJar = Record<string, { value?: string; [k: string]: any }>;

export interface NativeCookieManager {
  get(url: string, useWebKit?: boolean): Promise<NativeCookieJar>;
  getAll?(useWebKit?: boolean): Promise<NativeCookieJar>;
  clearAll?(useWebKit?: boolean): Promise<void>;
}

let cached: NativeCookieManager | null | undefined;

/**
 * The exact condition @react-native-cookies/cookies asserts. Mirrors its
 * platform dispatch so we can answer without importing it.
 */
function nativeCookieModuleRegistered(): boolean {
  try {
    if (Platform.OS === "ios") return !!NativeModules?.RNCookieManagerIOS;
    if (Platform.OS === "android") return !!NativeModules?.RNCookieManagerAndroid;
    // web / anything else: the library asserts "Invalid platform", so there is
    // no valid import to attempt.
    return false;
  } catch {
    return false;
  }
}

/**
 * Resolve the native cookie manager, or null where it is not available.
 * Never throws.
 */
export async function getNativeCookieManager(): Promise<NativeCookieManager | null> {
  if (cached !== undefined) return cached;

  if (!nativeCookieModuleRegistered()) {
    cached = null;
    return cached;
  }

  try {
    const mod: any = await import("@react-native-cookies/cookies");
    const mgr: any = mod?.default ?? mod;
    cached = typeof mgr?.get === "function" ? (mgr as NativeCookieManager) : null;
  } catch {
    // The invariant passed the NativeModules check but something else failed
    // (a build mismatch, a linking change). Degrade, never crash.
    cached = null;
  }
  return cached;
}

/** True when native cookie reads are possible in this build. */
export async function nativeCookiesAvailable(): Promise<boolean> {
  return (await getNativeCookieManager()) !== null;
}

/** Synchronous availability check for rendering (no import, cannot throw). */
export function nativeCookiesLikelyAvailable(): boolean {
  return nativeCookieModuleRegistered();
}

/** Test seam: forget the memoised result (used by the verify suite). */
export function __resetNativeCookieCache(): void {
  cached = undefined;
}
