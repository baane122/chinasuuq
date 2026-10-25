// Translation backend for the mobile app.
//
// DECISION (owner, 2026-10): product text and marketplace pages are a commodity
// lookup, so translation goes to Google's free `gtx` endpoint straight from the
// device and NOT through the paid `ai-translate` edge function. Nothing in
// apps/mobile invokes ai-translate for translation any more: this file is the
// only translation network path in the client, and fetch() is the only transport
// it uses. The edge function stays deployed for other callers (apps/web) with
// its existing contract untouched.
//
// WHAT DID NOT CHANGE: the exported surface (`translateTexts`,
// `translateTextsDetailed`, `TranslationMap`, `TranslationOutcome`), the
// <=40-per-request batching, the in-memory LRU + AsyncStorage mirror, the
// in-flight de-duplication, the 9s time-box, the 429/503 parking, and the
// best-effort contract — an untranslated string maps to itself, it never
// renders blank and nothing here throws.
//
// WHY THIS IS NOT THE SCRIPT THAT WAS DELETED IN d75318c: that Google path died
// because of its *architecture* (a permanent 600ms interval + MutationObserver
// whose hanging 5s fetches stalled every page) and because it fetched from
// inside the third-party page. Here the network lives in RN, one batch is in
// flight at a time, every attempt is time-boxed, and a circuit breaker stops
// asking for the rest of the session once the endpoint proves unreachable, so a
// blocked network costs three failed attempts and then nothing.

import AsyncStorage from "@react-native-async-storage/async-storage";

/** Item cap per request. Kept <= the cap the old paid path used so callers
 *  that assumed 40-sized batches keep making the same number of calls. */
const MAX_BATCH = 40;
/** A single string longer than this is not sent at all (it maps to itself). */
const MAX_CHARS = 2000;
/**
 * gtx is a GET: the whole batch rides in the query string. 40 x 2000-char
 * strings would be an ~80 KB URL the endpoint refuses, so a batch is cut at the
 * item cap AND at this joined-character budget.
 */
const MAX_BATCH_CHARS = 4500;

const GTX_ENDPOINT = "https://translate.googleapis.com/translate_a/single";
/** One socket attempt. The device is on the customer's network, not ours. */
const HTTP_TIMEOUT_MS = 6000;
/** One batch, retries and split-retry included. Nothing may hang past this. */
const REQUEST_TIMEOUT_MS = 9000;
/** 429 parks the queue (unchanged policy, asserted by verify:translate). */
const RATE_LIMIT_PARK_MS = 20000;
/** 5xx/503: the endpoint blipped, so a much shorter pause. */
const TRANSIENT_PARK_MS = 8000;
/** Bounded 429 retry: one extra attempt after this long, never more. */
const RETRY_AFTER_429_MS = 1500;
const MAX_429_RETRIES = 1;
/**
 * Circuit breaker. Three consecutive *unreachability* failures (socket error,
 * timeout, or a response whose shape we cannot parse) stop all translation for
 * the rest of the JS session. A quota refusal (429) or a server blip (5xx) is
 * deliberately NOT counted: those are the endpoint answering us, and parking
 * already handles them. Without this, a network that blackholes
 * translate.googleapis.com pays 6s per batch forever.
 */
const BREAKER_TRIP_AFTER = 3;

/**
 * A batch rides as ONE query string, and the items are separated by \n.
 *
 * Newline is not an arbitrary choice: the gtx path that shipped in this repo
 * before d75318c joined items with "\n" and recorded that the endpoint returns
 * them "newline-joined in the same order, 1:1", and every segment of its
 * response is concatenated back on the same delimiter. A control character such
 * as \x00 is not safe, because the endpoint is free to strip it — that silently
 * collapses N items into 1 result and desyncs the whole batch. batchSafe()
 * removes the only way an item can contain the delimiter in the first place.
 */
const BATCH_DELIMITER = "\n";

/**
 * Google's language codes are not our app's codes. Somali has been in Google
 * Translate since the 2023 expansion and is `so`; Simplified Chinese is `zh-CN`,
 * not `zh`. Anything unmapped is passed through as its ISO-639-1 base, which is
 * what Google accepts for the rest.
 */
const GOOGLE_LANG_CODES: Record<string, string> = {
  en: "en",
  so: "so",
  ar: "ar",
  sw: "sw",
  zh: "zh-CN",
  "zh-cn": "zh-CN",
  "zh-hans": "zh-CN",
};

/**
 * Targets that fall back to another language before giving up. Google added
 * Somali late and a `so` miss must degrade to English rather than leaving a
 * Somali-speaking customer reading Chinese.
 */
const DEGRADE_TARGET: Record<string, string> = { so: "en" };

export type TranslationMap = Record<string, string>;

const STORE_KEY = "chinasuuq-translate-cache";
const MAX_ENTRIES = 400;

// Insertion order doubles as recency: re-reads delete+set, eviction drops the
// first key. One Map, no dependency.
const cache = new Map<string, string>();
let loaded = false;

const cacheKey = (lang: string, text: string) => `${lang}\u0000${text}`;

function recall(key: string): string | undefined {
  const value = cache.get(key);
  if (value === undefined) return undefined;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function remember(key: string, value: string): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

async function loadFromStorage(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (!raw) return;
    const entries = JSON.parse(raw) as [string, string][];
    if (!Array.isArray(entries)) return;
    for (const [key, value] of entries) {
      if (typeof key === "string" && typeof value === "string") remember(key, value);
    }
  } catch {
    /* corrupt or unreadable cache: start empty */
  }
}

function saveToStorage(): void {
  if (!loaded) return;
  AsyncStorage.setItem(STORE_KEY, JSON.stringify([...cache.entries()])).catch(() => {
    /* storage failures must not lose the translations already in memory */
  });
}

/**
 * Fold anything that could be mistaken for the batch delimiter (or that the
 * endpoint is free to drop) into a single space, so splitting the answer on
 * BATCH_DELIMITER gives back exactly one part per sent item.
 */
function batchSafe(text: string): string {
  return text
    .replace(/[\r\n\t\u0000-\u001f\u007f]/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

function googleLang(targetLang: string): string {
  const key = String(targetLang || "")
    .trim()
    .toLowerCase();
  if (GOOGLE_LANG_CODES[key]) return GOOGLE_LANG_CODES[key];
  // An unmapped code is passed through as its ISO-639-1 base, which is what
  // Google accepts for everything outside the table above. A blank one would ask
  // the endpoint for `tl=`, so it is refused here rather than at the wire.
  const base = key.split("-")[0];
  return GOOGLE_LANG_CODES[base] || base || "en";
}

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;

/**
 * "Google answered with the input, unchanged" is a failure when the input was
 * Chinese and the target cannot be Chinese — it is what the endpoint does for a
 * language it will not serve. Numbers, URLs and brand names legitimately come
 * back unchanged, which is why this only fires for a CJK source, and why a
 * Chinese target is exempt.
 */
function didNotMove(source: string, translated: string, fetchLang: string): boolean {
  if (translated.trim() !== source.trim()) return false;
  if (fetchLang.startsWith("zh")) return false;
  return CJK_RE.test(source);
}

// ── rate limit / circuit breaker state ─────────────────────────────────────────
let parkUntil = 0;
let consecutiveHardFailures = 0;
let breakerOpen = false;
const inFlight = new Map<string, Promise<string[] | null>>();

function cooldownRemaining(): number {
  return Math.max(0, parkUntil - Date.now());
}

function parkFor(ms: number): void {
  parkUntil = Math.max(parkUntil, Date.now() + ms);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms | 0)));
}

/** Exposed for diagnostics/screens: is translation off for this session? */
export function isTranslationDisabled(): boolean {
  return breakerOpen;
}

function noteHardFailure(context: string, detail: unknown): void {
  consecutiveHardFailures += 1;
  console.warn(
    `[translate] ${context} (${consecutiveHuman(consecutiveHardFailures)}); ${String(detail ?? "")}`
  );
  if (!breakerOpen && consecutiveHardFailures >= BREAKER_TRIP_AFTER) {
    breakerOpen = true;
    console.warn(
      `[translate] circuit open after ${consecutiveHardFailures} consecutive failures; ` +
        `translation is off for the rest of this session`
    );
  }
}

function consecutiveHuman(n: number): string {
  return n === 1 ? "1 consecutive failure" : `${n} consecutive failures`;
}

function noteSuccess(): void {
  consecutiveHardFailures = 0;
}

// ── the gtx request ─────────────────────────────────────────────────────────────

type GtxOutcome =
  | { kind: "ok"; results: string[] }
  | { kind: "rate_limited" }
  | { kind: "server" }
  | { kind: "network" }
  | { kind: "shape" };

interface SegmentPair {
  out: string;
  src: string;
}

/**
 * One segment of `data[0]`. The documented row is
 * [translatedText, originalChunk, matchedSourceTranslation, errorLevel, probability]
 * and the real-world variants worth surviving are a bare string instead of an
 * array, and nulls in either text slot.
 */
function readSegment(seg: unknown): SegmentPair {
  if (typeof seg === "string") return { out: seg, src: "" };
  if (!Array.isArray(seg)) return { out: "", src: "" };
  const out = typeof seg[0] === "string" ? seg[0] : "";
  const src = typeof seg[1] === "string" ? seg[1] : "";
  return { out, src };
}

/**
 * Turn gtx's per-SENTENCE segments back into per-ITEM results.
 *
 * `data` is an array: [0] is the segment list, [2] the detected source language
 * — so `data[0]` is a list of `[translated, original, ...]` rows whose `out`
 * fields concatenate into the whole translation, with no separators of their
 * own. Nothing guarantees a segment boundary lands on an item boundary, so:
 *   1. one item  -> the concatenation IS the answer (no delimiter semantics);
 *   2. otherwise split the concatenated translation on the delimiter and accept
 *      it only when the count matches the count we sent (the documented 1:1
 *      newline-preserving case);
 *   3. otherwise group the SEGMENTS by the delimiters their source side carries
 *      — that recovers the case where Google prints the delimiter as its own
 *      row, or only on one side of the row. Accepted only when the source side
 *      shows exactly the item-1 boundaries we sent, so a batch whose delimiter
 *      Google swallowed is reported as unparseable instead of being guessed at:
 *      a wrong split would put one product's name on another one's page.
 * Returning null means "unparseable", which the caller turns into a split retry.
 */
function parseSegments(segments: unknown[], texts: string[]): string[] | null {
  let joinedOut = "";
  let joinedSrc = "";
  for (const seg of segments) {
    const pair = readSegment(seg);
    joinedOut += pair.out;
    joinedSrc += pair.src;
  }

  // A single item has no boundaries to find. This is also what makes the
  // split-retry converge: a chunk of one always parses.
  if (texts.length === 1) return [joinedOut.trim()];

  const parts = joinedOut.split(BATCH_DELIMITER).map((part) => part.trim());
  if (parts.length === texts.length) return parts;
  // Google sometimes prints the delimiter as a segment of its own, which shows
  // up as an empty part. Dropping those restores the 1:1 count.
  const collapsed = parts.filter((part) => part.length > 0);
  if (collapsed.length === texts.length) return collapsed;

  const boundaries = countDelimiter(joinedSrc);
  if (boundaries !== texts.length - 1) return null;

  const groups = texts.map(() => "");
  let index = 0;
  for (const seg of segments) {
    const pair = readSegment(seg);
    if (index >= texts.length) break;
    groups[index] += pair.out;
    index += countDelimiter(pair.src);
  }
  const grouped = groups.map((group) => group.trim());
  if (grouped.some((group) => group.length === 0)) return null;
  return grouped;
}

function countDelimiter(text: string): number {
  if (!text) return 0;
  let count = 0;
  let at = text.indexOf(BATCH_DELIMITER);
  while (at >= 0) {
    count++;
    at = text.indexOf(BATCH_DELIMITER, at + BATCH_DELIMITER.length);
  }
  return count;
}

function gtxUrl(texts: string[], tl: string): string {
  const params = [
    "client=gtx",
    "sl=auto",
    `tl=${encodeURIComponent(tl)}`,
    "dt=t",
    `q=${encodeURIComponent(texts.join(BATCH_DELIMITER))}`,
  ].join("&");
  return `${GTX_ENDPOINT}?${params}`;
}

/** One HTTP attempt. Never throws: every failure mode is a `kind`. */
async function gtxFetch(texts: string[], tl: string): Promise<GtxOutcome> {
  if (breakerOpen || texts.length === 0) return { kind: "network" };
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    controller = new AbortController();
    timer = setTimeout(() => controller?.abort(), HTTP_TIMEOUT_MS);
    const response = await fetch(gtxUrl(texts, tl), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (timer) clearTimeout(timer);
    timer = null;
    if (response.status === 429) return { kind: "rate_limited" };
    if (response.status === 503 || response.status >= 500) return { kind: "server" };
    if (!response.ok) {
      // 403/404/414: the endpoint refused the request itself. Treat it like an
      // unreachable endpoint so the breaker can learn from it.
      noteHardFailure("gtx refused the request", `HTTP ${response.status}`);
      return { kind: "network" };
    }
    const payload: unknown = await response.json();
    if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
      noteHardFailure("gtx response shape", "data[0] is not an array");
      return { kind: "shape" };
    }
    const results = parseSegments(payload[0] as unknown[], texts);
    if (!results) {
      // A desynced batch is not an unreachable endpoint: do not feed the breaker
      // for it, the split-retry below handles it.
      console.warn(`[translate] gtx batch of ${texts.length} → ${tl} did not split 1:1`);
      return { kind: "shape" };
    }
    noteSuccess();
    return { kind: "ok", results };
  } catch (error) {
    const aborted = (error as { name?: string })?.name === "AbortError";
    noteHardFailure(aborted ? `gtx timed out after ${HTTP_TIMEOUT_MS}ms` : "gtx fetch failed", String(
      (error as Error)?.message ?? error
    ));
    return { kind: "network" };
  } finally {
    if (timer) clearTimeout(timer);
    try {
      controller?.abort();
    } catch {
      /* already settled */
    }
  }
}

/**
 * Translate one batch, bounded retries only.
 *
 * 429 -> park the queue for RATE_LIMIT_PARK_MS and make ONE more attempt for
 * this batch after RETRY_AFTER_429_MS (Google's own limit is per-IP per-minute,
 * so a single short wait usually clears it). 5xx -> park TRANSIENT_PARK_MS, no
 * retry: the queue's own cooldown already handles it. Unparseable batch ->
 * split it into at most 4 chunks and parse each on its own, so one pathological
 * string cannot cost the whole page its translations; a chunk of one always
 * parses. Returns null when nothing in the batch could be served.
 */
async function gtxBatch(texts: string[], tl: string, allowSplit = true): Promise<string[] | null> {
  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    const outcome = await gtxFetch(texts, tl);
    if (outcome.kind === "ok") return outcome.results;
    if (outcome.kind === "rate_limited") {
      parkFor(RATE_LIMIT_PARK_MS);
      console.warn(`[translate] gtx rate limited; parking ${RATE_LIMIT_PARK_MS / 1000}s`);
      if (attempt < MAX_429_RETRIES) {
        await sleep(RETRY_AFTER_429_MS);
        continue;
      }
      return null;
    }
    if (outcome.kind === "server") {
      parkFor(TRANSIENT_PARK_MS);
      console.warn(`[translate] gtx unavailable; pausing ${TRANSIENT_PARK_MS / 1000}s`);
      return null;
    }
    if (outcome.kind === "network") return null;
    if (outcome.kind === "shape") {
      if (!allowSplit || texts.length < 2) return null;
      const chunkSize = Math.ceil(texts.length / 4);
      const merged: string[] = [];
      for (let i = 0; i < texts.length; i += chunkSize) {
        const chunk = texts.slice(i, i + chunkSize);
        const part = chunk.length === 1 ? await gtxSingle(chunk[0], tl) : await gtxBatch(chunk, tl, false);
        if (!part) return null;
        merged.push(...part);
      }
      return merged.length === texts.length ? merged : null;
    }
  }
  return null;
}

/** One item, no delimiter semantics at all. Used by the split retry. */
async function gtxSingle(text: string, tl: string): Promise<string[] | null> {
  const outcome = await gtxFetch([text], tl);
  if (outcome.kind === "ok") return outcome.results;
  if (outcome.kind === "rate_limited") parkFor(RATE_LIMIT_PARK_MS);
  else if (outcome.kind === "server") parkFor(TRANSIENT_PARK_MS);
  return null;
}

/**
 * One network call for one batch, de-duplicated and time-boxed. Identical
 * in-flight batches share one promise, and a slow one is abandoned at
 * REQUEST_TIMEOUT_MS so a hung request cannot stall every later batch in the
 * loop. Returns null when the batch could not be served.
 */
function requestBatch(batch: string[], tl: string): Promise<string[] | null> {
  const key = `${tl}\u0000${batch.join("\u0001")}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const call = (async (): Promise<string[] | null> => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      if (breakerOpen) return null;
      // batchSafe() is what guarantees no item can contain the delimiter. The
      // sent list stays index-aligned with `batch` so every answer maps back to
      // the key the caller used; a slot that sanitized to nothing keeps its own
      // text and is recognised as unmoved.
      const sent: string[] = [];
      const slots: number[] = [];
      batch.forEach((text, index) => {
        const safe = batchSafe(text);
        if (!safe) return;
        sent.push(safe);
        slots.push(index);
      });
      if (sent.length === 0) return null;
      const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), REQUEST_TIMEOUT_MS);
      });
      const raced = await Promise.race([gtxBatch(sent, tl), timeout]);
      if (raced === "timeout") {
        noteHardFailure(`gtx batch of ${sent.length} abandoned at ${REQUEST_TIMEOUT_MS}ms`, "time-box");
        return null;
      }
      const answers = raced as string[] | null;
      if (!answers) return null;
      const aligned: string[] = batch.slice();
      slots.forEach((batchIndex, i) => {
        aligned[batchIndex] = answers[i] ?? batch[batchIndex];
      });
      return aligned;
    } catch (error) {
      console.warn("[translate] batch threw", error);
      return null;
    } finally {
      if (timer) clearTimeout(timer);
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, call);
  return call;
}

/** Cut the miss list into requests that respect BOTH the item and byte caps. */
function planBatches(items: string[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let chars = 0;
  for (const text of items) {
    const cost = text.length + BATCH_DELIMITER.length;
    if (current.length > 0 && (current.length >= MAX_BATCH || chars + cost > MAX_BATCH_CHARS)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(text);
    chars += cost;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

async function waitForTranslateWindow(): Promise<void> {
  const remaining = cooldownRemaining();
  if (remaining <= 0) return;
  await sleep(remaining);
}

export interface TranslationOutcome {
  map: TranslationMap;
  /**
   * Sources whose batch never made it back (network, timeout, rate limit,
   * malformed response). The WebView pipeline needs this to un-stamp the DOM
   * nodes it reserved for them — otherwise one failed request leaves that
   * text Chinese for the rest of the page's life.
   */
  failed: string[];
}

/**
 * Resolve `texts` for one language: cache first, then gtx for what is missing.
 * Answers are written to `out` (keyed by the trimmed source) and mirrored into
 * the `writeAs` language's cache so a degraded answer is remembered as the
 * language the caller actually asked for.
 */
async function resolveLanguage(
  texts: string[],
  fetchLang: string,
  writeAs: string,
  out: TranslationMap,
  failed: string[]
): Promise<void> {
  const misses: string[] = [];
  for (const text of texts) {
    if (out[text] !== undefined) continue;
    const hit = recall(cacheKey(fetchLang, text));
    if (hit !== undefined) {
      out[text] = hit;
      if (writeAs !== fetchLang) remember(cacheKey(writeAs, text), hit);
      continue;
    }
    if (text.length > MAX_CHARS) {
      // The endpoint would refuse it (and the URL would be absurd). Not a
      // failure — this string is simply served as-is.
      out[text] = text;
      continue;
    }
    misses.push(text);
  }
  if (misses.length === 0) return;

  for (const batch of planBatches(misses)) {
    try {
      // A 429 on an earlier batch parks the rest of this loop instead of
      // spending the remaining quota on calls that would also be refused.
      await waitForTranslateWindow();
      if (breakerOpen) {
        for (const text of batch) {
          if (out[text] === undefined) {
            out[text] = text;
            failed.push(text);
          }
        }
        continue;
      }
      const results = await requestBatch(batch, fetchLang);
      if (!results) {
        // The contract is "every requested string has a map entry" — a caller
        // that does `map[t] || t` hides the gap, but one that reads map[t]
        // directly would render undefined. Keep the original text in the map
        // and record the string as failed so the WebView can un-stamp its nodes.
        for (const text of batch) {
          if (out[text] === undefined) {
            out[text] = text;
            failed.push(text);
          }
        }
        continue;
      }
      for (let i = 0; i < batch.length; i++) {
        const source = batch[i];
        const raw = results[i];
        const translated = typeof raw === "string" && raw.trim() ? raw.trim() : source;
        if (didNotMove(source, translated, fetchLang)) {
          // The endpoint handed the Chinese back: not an answer, so it is a
          // failure (and the Somali path degrades to English below).
          out[source] = source;
          failed.push(source);
          continue;
        }
        out[source] = translated;
        remember(cacheKey(fetchLang, source), translated);
        if (writeAs !== fetchLang) remember(cacheKey(writeAs, source), translated);
      }
      // Anything the batch did not answer for keeps its original text.
      for (const text of batch) {
        if (out[text] === undefined) {
          out[text] = text;
          failed.push(text);
        }
      }
      saveToStorage();
    } catch (error) {
      console.warn(`[translate] batch of ${batch.length} → ${fetchLang} threw`, error);
      for (const text of batch) {
        if (out[text] === undefined) {
          out[text] = text;
          failed.push(text);
        }
      }
    }
  }
}

/** Same as translateTexts, but also reports which strings could not be served. */
export async function translateTextsDetailed(
  texts: string[],
  targetLang: string
): Promise<TranslationOutcome> {
  const out: TranslationMap = {};
  const failed: string[] = [];
  const lang = (targetLang || "").trim();
  if (!lang) return { map: out, failed };

  const wanted: string[] = [];
  for (const text of texts || []) {
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed || wanted.includes(trimmed)) continue;
    wanted.push(trimmed);
  }
  if (wanted.length === 0) return { map: out, failed };

  await loadFromStorage();
  const fetchLang = googleLang(lang);

  try {
    await resolveLanguage(wanted, fetchLang, lang, out, failed);

    // Degradation, not silence: a language Google will not serve falls back to
    // English instead of leaving the customer reading Chinese.
    const degradeTo = DEGRADE_TARGET[fetchLang] ?? DEGRADE_TARGET[lang.toLowerCase()] ?? null;
    if (degradeTo && failed.length > 0) {
      const retry = failed.splice(0, failed.length);
      for (const text of retry) delete out[text];
      const secondaryFailed: string[] = [];
      await resolveLanguage(retry, degradeTo, lang, out, secondaryFailed);
      // Whatever English could not serve either is genuinely unavailable.
      for (const text of secondaryFailed) {
        if (out[text] === undefined) out[text] = text;
      }
      failed.push(...secondaryFailed);
      saveToStorage();
    }
  } catch (error) {
    console.warn(`[translate] ${lang} pass threw`, error);
    for (const text of wanted) {
      if (out[text] === undefined) out[text] = text;
      if (!failed.includes(text)) failed.push(text);
    }
  }

  return { map: out, failed };
}

/**
 * Translate `texts` into `targetLang`, reusing every cached string.
 * Returns a map keyed by the trimmed source string; anything that could not be
 * translated maps to itself.
 */
export async function translateTexts(texts: string[], targetLang: string): Promise<TranslationMap> {
  return (await translateTextsDetailed(texts, targetLang)).map;
}
