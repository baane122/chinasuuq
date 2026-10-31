/**
 * A stable, opaque identifier for THIS installation.
 *
 * What "one device at a time" needs is an identity that survives app restarts
 * and OTA updates but changes when the app is reinstalled or the data is
 * cleared. Nothing more: this value is not a hardware fingerprint, it is not
 * used for advertising, and it never leaves the account's own `user_devices`
 * rows.
 *
 * Implementation notes:
 *  - AsyncStorage, not SecureStore. SecureStore has per-item size limits and,
 *    more importantly, a keychain entry can survive an app uninstall on iOS —
 *    which would make a reinstalled app reuse a device identity the server had
 *    already revoked.
 *  - Generated once, then cached in memory for the lifetime of the JS runtime.
 *    Two concurrent callers (the sign-in path and the resume check) must not
 *    race each other into writing two different ids.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const DEVICE_KEY = "chinasuuq-device-id";

let cached: string | null = null;
let inFlight: Promise<string> | null = null;

/** RFC4122-ish v4. Hermes ships `crypto.randomUUID` only on newer builds, and
 *  `expo-crypto` is not a dependency, so this is a local generator. */
function randomId(): string {
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 32; i += 1) {
    out += hex[Math.floor(Math.random() * 16)];
  }
  // Version 4 + RFC 4122 variant nibbles, so the value is a well-formed uuid
  // if it ever has to be stored in a uuid column.
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-4${out.slice(13, 16)}-a${out.slice(17, 20)}-${out.slice(20, 32)}`;
}

/**
 * `Constants.sessionId` is created per app *launch*, so it is deliberately NOT
 * part of the id — using it would mint a new device on every cold start and
 * silently defeat the whole feature.
 */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const stored = await AsyncStorage.getItem(DEVICE_KEY);
      if (stored && stored.length >= 8) {
        cached = stored;
        return stored;
      }
      const fresh = randomId();
      await AsyncStorage.setItem(DEVICE_KEY, fresh);
      cached = fresh;
      return fresh;
    } catch (e) {
      // Storage unavailable: still return a usable id for this runtime so the
      // guard degrades to "not persisted" instead of blocking sign-in.
      console.warn("[device] could not persist device id", e);
      cached = cached ?? randomId();
      return cached;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Human-readable device label for the staff/customer device list. */
export function deviceLabel(): string {
  const name = Constants.deviceName;
  if (name && name.trim()) return name.trim();
  return `${process.env.EXPO_OS === "ios" ? "iPhone" : "Android phone"}`;
}

export function devicePlatform(): string {
  return process.env.EXPO_OS ?? "unknown";
}
