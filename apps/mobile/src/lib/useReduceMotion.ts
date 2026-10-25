// Device-level "reduce motion" flag for press/entry animations.
//
// AccessibilityInfo.isReduceMotionEnabled() is async and the event listener
// API differs across platforms/versions, so every card subscribing its own
// promise is wasteful and racy. One module-level subscription, one hook: cards
// start animated (the flag defaults false, which is the vast majority of
// devices), and the very first check landing on `true` disables subsequent
// press animations. Cheap to call from a memoized list cell.

import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

let cached: boolean | null = null;
const listeners = new Set<(v: boolean) => void>();
let subscribed = false;

function ensureSubscription(): void {
  if (subscribed) return;
  subscribed = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then((v) => {
      cached = v;
      listeners.forEach((l) => l(v));
    })
    .catch(() => {
      /* keep the default (animate) if the device cannot answer */
    });
  try {
    AccessibilityInfo.addEventListener("reduceMotionChanged", (v: boolean) => {
      cached = v;
      listeners.forEach((l) => l(v));
    });
  } catch {
    /* older platforms without the event — the one-shot check still applies */
  }
}

/** True when the device asks for reduced motion; false until proven otherwise. */
export function usePrefersReduceMotion(): boolean {
  ensureSubscription();
  const [reduce, setReduce] = useState(cached === true);
  useEffect(() => {
    const l = (v: boolean) => setReduce(v);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return reduce;
}

/** Non-hook read for imperative code paths (press handlers). */
export function prefersReduceMotion(): boolean {
  ensureSubscription();
  return cached === true;
}
